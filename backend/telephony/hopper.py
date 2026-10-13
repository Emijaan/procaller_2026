import logging
import threading
import time
from datetime import timedelta

from django.db import close_old_connections
from django.utils import timezone

from accounts.models import User
from campaigns.models import Campaign
from crm.queue import release_lead, reserve_next_lead

from .models import AgentModeSession, AgentSession, Call
from .modes import clamp_ratio
from .channels import free_broadcast_port
from .services import originate_broadcast, originate_manual

logger = logging.getLogger(__name__)

LIVE = ["initiating", "ringing", "connected", "on_hold"]
_tick_lock = threading.Lock()
_started = False


def _wrap_finished(user, campaign):
    if user.presence != User.Presence.WRAP_UP:
        return user.presence == User.Presence.AVAILABLE
    last = Call.objects.filter(agent=user, campaign=campaign).order_by("-id").first()
    if not last or not last.ended_at:
        return False
    wait = int(campaign.wrap_up_seconds or 0)
    if timezone.now() < last.ended_at + timedelta(seconds=wait):
        return False
    user.presence = User.Presence.AVAILABLE
    user.save(update_fields=["presence"])
    return True


def ready_agents(campaign):
    """Users seated in this campaign on Preview Auto, with a phone session, and no live call."""
    mode_rows = AgentModeSession.objects.filter(
        ended_at__isnull=True,
        mode=AgentModeSession.Mode.PREVIEW,
        campaign=campaign,
        user__in=campaign.assigned_users.all(),
        user__is_active=True,
    ).select_related("user")
    users = [row.user for row in mode_rows]
    if not users:
        return []
    ids = [user.id for user in users]
    busy = set(
        Call.objects.filter(agent_id__in=ids, state__in=LIVE).values_list("agent_id", flat=True)
    )
    sessions = {
        row.user_id: row
        for row in AgentSession.objects.filter(user_id__in=ids, ended_at__isnull=True)
    }
    ready = []
    for user in users:
        if user.id in busy or user.id not in sessions:
            continue
        if user.presence in {User.Presence.OFFLINE, User.Presence.PAUSED, User.Presence.ON_CALL}:
            continue
        if not _wrap_finished(user, campaign):
            continue
        ready.append((user, sessions[user.id]))
    return ready


def fill_ibr(campaign):
    """Dial ready Piper prompts up to dial_ratio. No agent is bridged into the call."""
    if not campaign or not campaign.auto_running or not campaign.active:
        return []
    if campaign.status not in {Campaign.Status.ACTIVE, Campaign.Status.RUNNING}:
        return []
    threads = clamp_ratio(campaign.dial_ratio, 1)
    live = Call.objects.filter(campaign=campaign, state__in=LIVE).count()
    room = max(0, threads - live)
    placed = []
    skipped = set()
    while len(placed) < room:
        try:
            port = free_broadcast_port(campaign)
        except ValueError:
            break
        user = port.assigned_user if port and port.assigned_user_id else campaign.created_by
        if not user:
            break
        lead = reserve_next_lead(user, campaign.id, exclude_ids=skipped, tts_ready=True)
        if not lead:
            break
        try:
            call = originate_broadcast(campaign, lead, port=port)
        except Exception:
            logger.exception("IBR originate failed for campaign %s lead %s", campaign.id, lead.id)
            release_lead(lead, status="assigned" if lead.owner_id else "new")
            skipped.add(lead.id)
            continue
        placed.append(call)
    return placed


def fill_campaign(campaign):
    """Place up to dial_ratio calls, one per seated user. Answered calls land on that user."""
    if not campaign or not campaign.auto_running or not campaign.active:
        return []
    if getattr(campaign, "campaign_type", "live") == Campaign.CampaignType.IBR:
        return []
    if campaign.status not in {Campaign.Status.ACTIVE, Campaign.Status.RUNNING}:
        return []
    threads = clamp_ratio(campaign.dial_ratio, 1)
    live = Call.objects.filter(campaign=campaign, state__in=LIVE, dial_batch__startswith=f"hopper-{campaign.id}-").count()
    room = max(0, threads - live)
    if room <= 0:
        return []
    placed = []
    for user, session in ready_agents(campaign)[:room]:
        lead = reserve_next_lead(user, campaign.id)
        if not lead:
            break
        try:
            call = originate_manual(
                user,
                lead.phone,
                contact=lead,
                campaign=campaign,
                session=session,
                client_dial=False,
                preview=False,
                skip_release=True,
                dial_batch=f"hopper-{campaign.id}-{user.id}",
            )
        except Exception:
            logger.exception("Hopper originate failed for campaign %s user %s", campaign.id, user.id)
            release_lead(lead, status="assigned" if lead.owner_id else "new")
            break
        placed.append(call)
    return placed


def tick():
    if not _tick_lock.acquire(blocking=False):
        return
    try:
        close_old_connections()
        camps = Campaign.objects.filter(
            auto_running=True,
            active=True,
            status__in=[Campaign.Status.ACTIVE, Campaign.Status.RUNNING],
        )
        for camp in camps:
            try:
                if camp.campaign_type == Campaign.CampaignType.IBR:
                    fill_ibr(camp)
                else:
                    fill_campaign(camp)
            except Exception:
                logger.exception("Hopper failed for campaign %s", camp.id)
    finally:
        _tick_lock.release()


def start_hopper():
    global _started
    if _started:
        return
    _started = True

    def _loop():
        while True:
            time.sleep(2)
            try:
                tick()
            except Exception:
                logger.exception("Hopper tick failed")

    threading.Thread(target=_loop, name="procaller-hopper", daemon=True).start()
