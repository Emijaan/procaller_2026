import uuid

from django.db import transaction
from django.utils import timezone

from accounts.models import User
from crm.models import Contact, FollowUp

from .backends import get_telephony
from .models import AgentSession, Call
from .realtime import broadcast_call
from .utils import make_callerid_token, normalize_phone


def start_session(user, campaign=None):
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


@transaction.atomic
def originate_manual(user, phone_number, contact=None, campaign=None, session=None, client_dial=False):
    live = Call.objects.filter(agent=user, state__in=["initiating", "ringing", "connected", "on_hold"])
    if live.exists():
        raise ValueError("You already have an active call")

    number = normalize_phone(phone_number)
    if not number or len(number) < 3:
        raise ValueError("Enter a valid phone number")

    if contact is None:
        contact = Contact.objects.filter(phone__icontains=number[-10:]).first()

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
    )
    # token uniqueness uses call id after save
    call.callerid_token = make_callerid_token(call.id)
    call.save(update_fields=["callerid_token"])

    user.presence = User.Presence.ON_CALL
    user.save(update_fields=["presence"])
    if session:
        session.status = AgentSession.Status.INCALL
        session.save(update_fields=["status"])

    if not client_dial:
        get_telephony().originate(call)
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
    broadcast_call(call, "call.answered")
    return call


def hangup_call(call, outcome=""):
    if call.state != Call.State.ENDED:
        try:
            get_telephony().hangup(call)
        except Exception:
            pass
        call.mark_ended(outcome=outcome)
    call.agent.presence = User.Presence.WRAP_UP
    call.agent.save(update_fields=["presence"])
    if call.session_id:
        call.session.status = AgentSession.Status.READY
        call.session.save(update_fields=["status"])
    broadcast_call(call, "call.ended")
    return call


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
            try:
                get_telephony().hold(call, True)
            except Exception:
                pass
        else:
            try:
                get_telephony().hold(call, False)
            except Exception:
                pass
    if fields:
        call.save(update_fields=list(dict.fromkeys(fields)))
        broadcast_call(call, "call.updated")
    return call


def save_disposition(call, disposition, notes="", follow_up_at=None, follow_up_reason=""):
    call.disposition = disposition
    if notes:
        call.notes = notes
    call.save(update_fields=["disposition", "notes"])
    if call.contact_id:
        call.contact.last_disposition = disposition
        call.contact.last_contact_at = timezone.now()
        if notes:
            call.contact.comments = notes
        call.contact.save(update_fields=["last_disposition", "last_contact_at", "comments"])
        if follow_up_at:
            FollowUp.objects.create(
                contact=call.contact,
                agent=call.agent,
                reason=follow_up_reason or notes or disposition,
                due_at=follow_up_at,
                status=FollowUp.Status.UPCOMING,
            )
    call.agent.presence = User.Presence.AVAILABLE
    call.agent.save(update_fields=["presence"])
    return call
