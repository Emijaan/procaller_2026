import uuid

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from crm.models import Contact, FollowUp

from .backends import get_telephony
from .models import AgentSession, Call
from .modes import current_mode
from .realtime import broadcast_call
from .utils import make_callerid_token, normalize_phone


def start_session(user, campaign=None):
    from accounts.access import scoped_campaigns
    from campaigns.models import Campaign
    from telephony.sip_provision import ensure_sip_identity

    if campaign and not scoped_campaigns(user, Campaign.objects.filter(pk=campaign.pk)).exists():
        raise ValueError("You cannot use this campaign")
    ensure_sip_identity(user)
    session = AgentSession.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    if not session:
        session = AgentSession.objects.create(
            user=user,
            campaign=campaign,
            room_id=f"{user.id}-{uuid.uuid4().hex[:10]}",
            status=AgentSession.Status.READY,
        )
    user.presence = User.Presence.AVAILABLE
    user.save(update_fields=["presence"])
    backend = get_telephony()
    payload = backend.session_payload(user, session)
    payload.update(
        {
            "session_id": session.id,
            "room_id": session.room_id,
            "extension": user.extension,
            "backend": backend.name,
        }
    )
    return session, payload


def end_session(user):
    AgentSession.objects.filter(user=user, ended_at__isnull=True).update(
        status=AgentSession.Status.ENDED, ended_at=timezone.now()
    )
    user.presence = User.Presence.OFFLINE
    user.save(update_fields=["presence"])
    from .modes import close_open_modes, current_mode, release_agent_reservations
    from .models import AgentModeSession

    if current_mode(user) != AgentModeSession.Mode.OFFLINE:
        close_open_modes(user)
        AgentModeSession.objects.create(user=user, mode=AgentModeSession.Mode.OFFLINE)
    release_agent_reservations(user)


def release_live_calls(user):
    live = list(
        Call.objects.select_related("agent", "session").filter(
            agent=user, state__in=["initiating", "ringing", "connected", "on_hold"]
        )
    )
    for call in live:
        outcome = Call.Outcome.NO_ANSWER if not call.answered_at else Call.Outcome.CANCELLED
        hangup_call(call, outcome=outcome)
    return live


def originate_manual(user, phone_number, contact=None, campaign=None, session=None, client_dial=False, preview=False, skip_release=False, dial_batch=""):
    from accounts.access import assert_can_use_campaign

    campaign = campaign or (session.campaign if session else None)
    assert_can_use_campaign(user, campaign)
    if preview:
        from telephony.models import AgentModeSession

        if current_mode(user) != AgentModeSession.Mode.PREVIEW:
            raise ValueError("Switch to Preview Auto before auto-dialing")
        if not contact:
            raise ValueError("A reserved lead is required for preview dialing")
        now = timezone.now()
        if contact.reserved_by_id != user.id or (contact.reserved_until and contact.reserved_until < now):
            raise ValueError("Lead is not reserved for you")
    if not skip_release:
        release_live_calls(user)
    call = _originate_manual(user, phone_number, contact, campaign, session, client_dial)
    if dial_batch:
        call.dial_batch = dial_batch
        call.save(update_fields=["dial_batch"])
    return call


@transaction.atomic
def _originate_manual(user, phone_number, contact=None, campaign=None, session=None, client_dial=False):

    number = normalize_phone(phone_number)
    if not number or len(number) < 3:
        raise ValueError("Enter a valid phone number")

    if contact is not None:
        from accounts.access import scoped_leads

        if not scoped_leads(user, Contact.objects.filter(pk=contact.pk)).exists():
            raise ValueError("You cannot use this lead")
    elif contact is None:
        from crm.queue import lookup_lead_by_phone

        contact = lookup_lead_by_phone(user, number, campaign_id=getattr(campaign, "id", None))

    from telephony.channels import port_for_user

    port = port_for_user(user)
    session = session or AgentSession.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    call = Call.objects.create(
        agent=user,
        contact=contact,
        campaign=campaign or (session.campaign if session else None),
        session=session,
        phone_number=phone_number.strip() or number,
        callerid_token=make_callerid_token(user.id),
        media_mode=get_telephony().name,
        recording=True,
        gsm_port=port,
    )
    # token uniqueness uses call id after save
    call.callerid_token = make_callerid_token(call.id)
    call.save(update_fields=["callerid_token"])
    if contact:
        contact.reserved_by = user
        contact.reserved_until = timezone.now() + timedelta(minutes=10)
        contact.lead_status = Contact.LeadStatus.CALLING
        contact.save(update_fields=["reserved_by", "reserved_until", "lead_status", "updated_at"])

    user.presence = User.Presence.ON_CALL
    user.save(update_fields=["presence"])
    if session:
        session.status = AgentSession.Status.INCALL
        session.save(update_fields=["status"])

    if not client_dial:
        get_telephony().originate(call)
    else:
        from telephony.ari_client import watch_gateway

        watch_gateway(call.id, number)
    broadcast_call(call, "call.started")
    return call


def originate_broadcast(campaign, contact, port=None):
    """Place one IBR attempt. The prompt plays only after the customer answers."""
    if campaign.campaign_type != "ibr":
        raise ValueError("This campaign is not an IBR broadcast")
    if not contact or not contact.tts_audio or contact.tts_status != "ready":
        raise ValueError("Generate the Piper prompt before dialing")
    user = port.assigned_user if port and port.assigned_user_id else campaign.created_by
    if not user:
        raise ValueError("IBR needs a user on the GSM channel")
    call = Call.objects.create(
        agent=user,
        contact=contact,
        campaign=campaign,
        phone_number=contact.phone,
        callerid_token=make_callerid_token(contact.id),
        media_mode=get_telephony().name,
        recording=False,
        gsm_port=port,
    )
    call.callerid_token = make_callerid_token(call.id)
    call.save(update_fields=["callerid_token"])
    contact.lead_status = Contact.LeadStatus.CALLING
    contact.save(update_fields=["lead_status", "updated_at"])
    get_telephony().originate_prompt(call)
    broadcast_call(call, "call.started")
    return call


def mark_ringing(call):
    if call.state in (Call.State.ENDED, Call.State.CONNECTED, Call.State.ON_HOLD):
        return call
    call.state = Call.State.RINGING
    fields = ["state"]
    if not call.ringing_at:
        call.ringing_at = timezone.now()
        fields.append("ringing_at")
    call.save(update_fields=fields)
    broadcast_call(call, "call.ringing")
    return call


def mark_answered(call):
    if call.state == Call.State.ENDED:
        return call
    call.state = Call.State.CONNECTED
    call.answered_at = timezone.now()
    call.outcome = Call.Outcome.CONNECTED
    call.save(update_fields=["state", "answered_at", "outcome"])
    if call.contact_id:
        call.contact.lead_status = Contact.LeadStatus.CONNECTED
        call.contact.save(update_fields=["lead_status", "updated_at"])
    drop_parallel_legs(call)
    broadcast_call(call, "call.answered")
    return call


def _agent_has_other_live(call):
    qs = Call.objects.filter(
        agent_id=call.agent_id,
        state__in=["initiating", "ringing", "connected", "on_hold"],
    ).exclude(pk=call.pk)
    return qs.exists()


def drop_parallel_legs(winner):
    if not winner.dial_batch:
        return
    siblings = Call.objects.filter(
        agent_id=winner.agent_id,
        dial_batch=winner.dial_batch,
        state__in=["initiating", "ringing"],
    ).exclude(pk=winner.pk)
    for sibling in siblings:
        hangup_call(sibling, outcome=Call.Outcome.CANCELLED)


def _remember_network(call, cause_code="", cause_text=""):
    fields = []
    if cause_code and not call.cause_code:
        call.cause_code = str(cause_code)[:16]
        fields.append("cause_code")
    if cause_text and not call.cause_text:
        call.cause_text = str(cause_text)[:120]
        fields.append("cause_text")
    if fields:
        call.save(update_fields=fields)


def _apply_detected_disposition(call):
    if not call.contact_id or not call.disposition:
        return
    contact = call.contact
    fields = []
    from telephony.causes import BUSY_CODES, NETWORK_DISPOSITIONS, NO_ANSWER_CODES

    if not contact.last_disposition or contact.last_disposition in NETWORK_DISPOSITIONS:
        contact.last_disposition = call.disposition
        fields.append("last_disposition")
    if not call.answered_at and contact.lead_status == Contact.LeadStatus.CALLING:
        if call.disposition in BUSY_CODES:
            contact.lead_status = Contact.LeadStatus.BUSY
        elif call.disposition in NO_ANSWER_CODES:
            contact.lead_status = Contact.LeadStatus.NO_ANSWER
        else:
            contact.lead_status = Contact.LeadStatus.NOT_CONNECTED
        contact.reserved_by = None
        contact.reserved_until = None
        fields.extend(["lead_status", "reserved_by", "reserved_until"])
    if fields:
        fields.append("updated_at")
        contact.save(update_fields=fields)


def _refine_ended_call(call, outcome, hangup_cause, disposition, cause_code="", cause_text=""):
    from telephony.causes import NETWORK_DISPOSITIONS, UNREACHED_DISPOSITIONS

    if call.disposition and call.disposition not in NETWORK_DISPOSITIONS:
        _remember_network(call, cause_code, cause_text)
        return call
    if disposition in {"Unknown", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT", "UNKNOWN_ANNOUNCEMENT_HI"} and call.disposition:
        _remember_network(call, cause_code, cause_text)
        return call
    replace = call.disposition in {"", "Unknown", "UNKNOWN_UNCLASSIFIED", "Cancelled", "CANCELLED"} or (
        disposition in UNREACHED_DISPOSITIONS and call.disposition in {"Connected", "CONNECTED"}
    )
    if not replace and call.disposition == disposition:
        _remember_network(call, cause_code, cause_text)
        return call
    if not replace:
        _remember_network(call, cause_code, cause_text)
        return call
    call.outcome = outcome
    call.hangup_cause = hangup_cause
    call.disposition = disposition
    if cause_code:
        call.cause_code = str(cause_code)[:16]
    if cause_text:
        call.cause_text = str(cause_text)[:120]
    if disposition in UNREACHED_DISPOSITIONS:
        call.answered_at = None
    call.save()
    _apply_detected_disposition(call)
    return call


def hangup_call(call, outcome="", cause_code="", cause_text="", dial_status="", originate_reason=""):
    from telephony.causes import classify_hangup

    detected = classify_hangup(
        answered=bool(call.answered_at),
        ringing=bool(call.ringing_at),
        outcome=outcome,
        cause_code=cause_code,
        cause_text=cause_text,
        dial_status=dial_status,
        originate_reason=originate_reason,
    )
    detected_outcome, detected_cause, detected_disposition = detected
    from telephony.causes import UNREACHED_DISPOSITIONS

    if detected_disposition in UNREACHED_DISPOSITIONS:
        call.answered_at = None
    elif detected_disposition == "CONNECTED" and not call.answered_at:
        call.answered_at = timezone.now()
    from_network = bool(cause_code or cause_text or dial_status or originate_reason)
    wrap = not _agent_has_other_live(call)
    if call.state == Call.State.ENDED:
        if from_network:
            _refine_ended_call(
                call,
                detected_outcome,
                detected_cause,
                detected_disposition,
                cause_code=cause_code,
                cause_text=cause_text,
            )
        return call
    if call.state != Call.State.ENDED:
        try:
            get_telephony().hangup(call)
        except Exception:
            pass
        call.mark_ended(
            outcome=detected_outcome,
            hangup_cause=detected_cause,
            disposition=detected_disposition,
            cause_code=cause_code,
            cause_text=cause_text,
        )
        _apply_detected_disposition(call)
    if wrap:
        call.agent.presence = User.Presence.WRAP_UP
        call.agent.save(update_fields=["presence"])
        if call.session_id:
            call.session.status = AgentSession.Status.READY
            call.session.save(update_fields=["status"])
        broadcast_call(call, "call.ended")
    else:
        broadcast_call(call, "call.dropped")
    return call


def originate_preview_batch(user, campaign=None, ratio=None, session=None):
    from crm.queue import reserve_next_lead
    from telephony.modes import current_mode, ratio_for_actor
    from telephony.models import AgentModeSession as ModeRow

    if current_mode(user) != ModeRow.Mode.PREVIEW:
        raise ValueError("Switch to Preview Auto before auto-dialing")
    live = ModeRow.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    campaign = campaign or (live.campaign if live else None)
    from accounts.access import assert_can_use_campaign

    assert_can_use_campaign(user, campaign)
    ratio = ratio_for_actor(
        user,
        campaign,
        ratio,
        (live.dial_ratio if live else None) or getattr(campaign, "dial_ratio", 1) or 1,
    )
    if live and live.dial_ratio != ratio:
        live.dial_ratio = ratio
        live.save(update_fields=["dial_ratio"])
    session = session or AgentSession.objects.filter(user=user, ended_at__isnull=True).order_by("-id").first()
    if not session:
        session, _ = start_session(user, campaign)
    if Call.objects.filter(agent=user, state__in=["connected", "on_hold"]).exists():
        raise ValueError("Finish the live call first")
    release_live_calls(user)
    batch = uuid.uuid4().hex[:32]
    calls = []
    seen = set()
    for _ in range(ratio):
        lead = reserve_next_lead(user, getattr(campaign, "id", None), exclude_ids=seen)
        if not lead or lead.id in seen:
            break
        seen.add(lead.id)
        call = originate_manual(
            user,
            lead.phone,
            contact=lead,
            campaign=campaign,
            session=session,
            client_dial=False,
            preview=True,
            skip_release=True,
            dial_batch=batch,
        )
        calls.append(call)
    if not calls:
        raise ValueError("No leads available")
    conference = f"pc{session.id}" if session else f"pc{calls[0].id}"
    return calls, conference, ratio


def set_call_flag(call, muted=None, on_hold=None):
    fields = []
    if muted is not None:
        call.muted = muted
        fields.append("muted")
    if on_hold is not None:
        call.on_hold = on_hold
        call.state = Call.State.ON_HOLD if on_hold else Call.State.CONNECTED
        fields.extend(["on_hold", "state"])
        if on_hold:
            call.hold_started_at = timezone.now()
            fields.append("hold_started_at")
            try:
                get_telephony().hold(call, True)
            except Exception:
                pass
        else:
            if call.hold_started_at:
                call.hold_seconds += max(0, int((timezone.now() - call.hold_started_at).total_seconds()))
                call.hold_started_at = None
                fields.extend(["hold_seconds", "hold_started_at"])
            try:
                get_telephony().hold(call, False)
            except Exception:
                pass
    if fields:
        call.save(update_fields=list(dict.fromkeys(fields)))
        broadcast_call(call, "call.updated")
    return call


LEAD_STATUS_FROM_DISPOSITION = {
    "interested": "interested",
    "callback requested": "callback",
    "callback": "callback",
    "not interested": "not_interested",
    "no answer": "no_answer",
    "voicemail": "no_answer",
    "wrong number": "wrong_number",
    "busy": "busy",
    "converted": "completed",
}


def save_disposition(call, disposition, notes="", follow_up_at=None, follow_up_reason=""):
    call.disposition = disposition
    if notes:
        call.notes = notes
    call.save(update_fields=["disposition", "notes"])
    if call.contact_id:
        contact = call.contact
        contact.last_disposition = disposition
        contact.last_contact_at = timezone.now()
        contact.call_count = (contact.call_count or 0) + 1
        contact.lead_status = LEAD_STATUS_FROM_DISPOSITION.get((disposition or "").strip().lower(), contact.lead_status)
        if notes:
            contact.comments = notes
        if follow_up_at:
            contact.next_callback_at = follow_up_at
            contact.lead_status = Contact.LeadStatus.CALLBACK
        contact.save()
        if follow_up_at:
            FollowUp.objects.create(
                contact=contact,
                agent=call.agent,
                reason=follow_up_reason or notes or disposition,
                due_at=follow_up_at,
                status=FollowUp.Status.UPCOMING,
            )
        contact.reserved_by = None
        contact.reserved_until = None
        contact.save(update_fields=["reserved_by", "reserved_until", "updated_at"])
    call.agent.presence = User.Presence.AVAILABLE
    call.agent.save(update_fields=["presence"])
    return call
