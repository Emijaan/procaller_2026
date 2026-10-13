from django.conf import settings

from accounts.access import is_strictly_below, scoped_users
from accounts.models import User
from accounts.services import write_audit

from .models import Call


SPY_PREFIX = {
    "listen": "*551",
    "whisper": "*552",
    "barge": "*553",
}
LIVE_STATES = ["initiating", "ringing", "connected", "on_hold"]


def _below(actor, target):
    if not target or not scoped_users(actor).filter(pk=target.pk).exists():
        return False
    return is_strictly_below(actor, target)


def force_logout(actor, target, request=None):
    if not _below(actor, target):
        raise PermissionError("You can only log out people below your level")
    from telephony.realtime import broadcast_user
    from telephony.services import end_session

    end_session(target)
    target.auth_epoch = int(target.auth_epoch or 0) + 1
    target.presence = User.Presence.OFFLINE
    target.save(update_fields=["auth_epoch", "presence"])
    broadcast_user(target.id, {"type": "force_logout", "by": actor.display_name})
    write_audit(actor, "FORCE_LOGOUT", "user", target.id, request, {"email": target.email})
    return target


def supervisor_spy(actor, target, action, request=None):
    action = (action or "").lower()
    if action not in SPY_PREFIX:
        raise ValueError("Unknown action")
    if not _below(actor, target):
        raise PermissionError("You can only monitor people below your level")
    live = (
        Call.objects.filter(agent=target, state__in=LIVE_STATES)
        .order_by("-id")
        .first()
    )
    if not live:
        raise ValueError("That user is not on a live call")
    ext = (target.extension or target.sip_username or "").strip()
    if not ext.isdigit() or len(ext) != 4:
        raise ValueError("That user has no phone extension")
    dial = f"{SPY_PREFIX[action]}{ext}"
    on_trunk = (getattr(settings, "TELEPHONY_BACKEND", "") or "").lower() == "asterisk"
    write_audit(
        actor,
        action.upper(),
        "call",
        live.id,
        request,
        {"agent_id": target.id, "extension": ext, "dial": dial},
    )
    detail = {
        "listen": "Listening. Only you hear the call.",
        "whisper": "Whisper. The user hears you. The customer does not.",
        "barge": "Interrupt. Both sides hear you.",
    }[action]
    if not on_trunk:
        detail = "Audio join needs the phone trunk. The action was checked and logged."
    return {
        "ok": True,
        "supported": on_trunk,
        "action": action,
        "dial": dial,
        "target_extension": ext,
        "call_id": live.id,
        "detail": detail,
    }
