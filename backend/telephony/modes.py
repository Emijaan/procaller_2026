from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from accounts.services import write_audit
from crm.models import Contact

from .models import AgentModeSession, Call

MAX_DIAL_RATIO = 32


def clamp_ratio(value, default=1):
    try:
        return max(1, min(MAX_DIAL_RATIO, int(value)))
    except (TypeError, ValueError):
        return default


def current_mode(user):
    row = AgentModeSession.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    return row.mode if row else AgentModeSession.Mode.OFFLINE


def close_open_modes(user):
    now = timezone.now()
    open_rows = AgentModeSession.objects.filter(user=user, ended_at__isnull=True)
    for row in open_rows:
        row.ended_at = now
        row.duration_seconds = max(0, int((now - row.started_at).total_seconds()))
        row.save(update_fields=["ended_at", "duration_seconds"])


def release_agent_reservations(user):
    live = Call.objects.filter(agent=user, state__in=["initiating", "ringing", "connected", "on_hold"]).exists()
    if live:
        return
    for lead in Contact.objects.filter(reserved_by=user):
        if lead.lead_status == Contact.LeadStatus.CALLING:
            lead.lead_status = Contact.LeadStatus.ASSIGNED if lead.owner_id else Contact.LeadStatus.NEW
        lead.reserved_by = None
        lead.reserved_until = None
        lead.save(update_fields=["lead_status", "reserved_by", "reserved_until", "updated_at"])


def set_agent_mode(user, mode, request=None, campaign=None, dial_ratio=None):
    allowed = {choice[0] for choice in AgentModeSession.Mode.choices}
    if mode not in allowed:
        raise ValueError("Mode must be manual, preview, break, or offline")
    previous = current_mode(user)
    close_open_modes(user)
    ip = None
    ua = ""
    if request:
        ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR")
        ua = (request.META.get("HTTP_USER_AGENT") or "")[:255]
    ratio = clamp_ratio(
        dial_ratio,
        getattr(campaign, "dial_ratio", None) or 1,
    )
    row = AgentModeSession.objects.create(
        user=user, mode=mode, campaign=campaign, ip_address=ip, user_agent=ua, dial_ratio=ratio
    )
    if mode == AgentModeSession.Mode.BREAK:
        user.presence = User.Presence.PAUSED
    elif mode == AgentModeSession.Mode.OFFLINE:
        user.presence = User.Presence.OFFLINE
    elif user.presence not in {User.Presence.ON_CALL, User.Presence.WRAP_UP}:
        user.presence = User.Presence.AVAILABLE
    user.save(update_fields=["presence"])
    if mode != AgentModeSession.Mode.PREVIEW:
        release_agent_reservations(user)
    write_audit(user, "MODE_CHANGE", "agent_mode", row.id, request, {"from": previous, "to": mode})
    return row


def day_bounds(when=None):
    local = timezone.localtime(when or timezone.now())
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def mode_totals(user, start=None, end=None):
    if start is None or end is None:
        start, end = day_bounds()
    now = timezone.now()
    rows = AgentModeSession.objects.filter(user=user, started_at__lt=end).filter(Q(ended_at__gte=start) | Q(ended_at__isnull=True))
    totals = {"manual": 0, "preview": 0, "break": 0, "offline": 0, "online": 0}
    for row in rows:
        begin = max(row.started_at, start)
        finish = min(row.ended_at or now, end)
        secs = max(0, int((finish - begin).total_seconds()))
        totals[row.mode] = totals.get(row.mode, 0) + secs
        if row.mode != AgentModeSession.Mode.OFFLINE:
            totals["online"] += secs
    first = AgentModeSession.objects.filter(user=user, started_at__gte=start, started_at__lt=end).order_by("started_at").first()
    last = AgentModeSession.objects.filter(user=user, started_at__lt=end).filter(Q(ended_at__gte=start) | Q(ended_at__isnull=True)).order_by("-id").first()
    live = AgentModeSession.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    return {
        **totals,
        "mode": current_mode(user),
        "dial_ratio": live.dial_ratio if live else 1,
        "login_at": first.started_at if first else None,
        "logout_at": last.ended_at if last and last.mode == AgentModeSession.Mode.OFFLINE else None,
        "mode_changes": AgentModeSession.objects.filter(user=user, started_at__gte=start, started_at__lt=end).count(),
        "wrap_up_seconds": 30,
    }
