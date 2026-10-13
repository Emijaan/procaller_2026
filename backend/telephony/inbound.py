from telephony.models import Call, GsmPort
from telephony.utils import normalize_phone


def resolve_inbound(caller, did):
    """Return the extension of the user who last dialed this caller on this SIM.

    An empty string means the gateway did not identify a port, or this caller
    was never dialed from that port. The call is not sent to a guessed user.
    """
    caller_n = normalize_phone(caller or "")
    if len(caller_n) < 7:
        return ""
    did_n = normalize_phone(did or "")
    if len(did_n) < 7:
        return ""
    port = (
        GsmPort.objects.filter(is_active=True, assigned_user__isnull=False, caller_id__endswith=did_n[-10:])
        .select_related("assigned_user")
        .order_by("id")
        .first()
    )
    if not port:
        return ""
    spoke = Call.objects.filter(
        gsm_port=port,
        direction=Call.Direction.OUTBOUND,
        phone_number__endswith=caller_n[-10:],
    ).exists()
    if not spoke:
        return ""
    extension = (port.assigned_user.extension or port.assigned_user.sip_username or "").strip()
    return extension if extension.isdigit() else ""
