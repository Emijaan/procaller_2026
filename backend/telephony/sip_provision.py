import logging
import re
import threading
import time

from django.conf import settings

from accounts.models import User

logger = logging.getLogger(__name__)

FIRST_EXT = 2100
LAST_EXT = 2199
_live_cache = {"at": 0.0, "endpoints": None}
_live_lock = threading.Lock()


def next_extension():
    taken = set()
    for ext, sip in User.objects.values_list("extension", "sip_username"):
        for value in (ext, sip):
            digits = (value or "").strip()
            if digits.isdigit():
                taken.add(digits)
    for number in range(FIRST_EXT, LAST_EXT + 1):
        candidate = str(number)
        if candidate not in taken:
            return candidate
    raise ValueError("No free SIP extensions left (2100-2199)")


def ensure_sip_identity(user):
    """Give the user a 21xx WebRTC identity if they do not already have one."""
    if not user:
        return user
    ext = (user.extension or user.sip_username or "").strip()
    if ext:
        fields = []
        if not (user.extension or "").strip():
            user.extension = ext
            fields.append("extension")
        if not (user.sip_username or "").strip():
            user.sip_username = ext
            fields.append("sip_username")
        if not (user.sip_password or "").strip():
            user.sip_password = ext
            fields.append("sip_password")
        if fields:
            user.save(update_fields=fields)
        return user
    ext = next_extension()
    user.extension = ext
    user.sip_username = ext
    user.sip_password = ext
    user.save(update_fields=["extension", "sip_username", "sip_password"])
    logger.info("Assigned SIP extension %s to %s", ext, user.email)
    return user


def render_webrtc_endpoint(ext, password=None):
    password = password or ext
    return (
        f"[{ext}](procaller-webrtc)\n"
        f"auth={ext}\n"
        f"aors={ext}\n"
        f"[{ext}]\n"
        f"type=auth\n"
        f"auth_type=userpass\n"
        f"username={ext}\n"
        f"password={password}\n"
        f"[{ext}]\n"
        f"type=aor\n"
        f"max_contacts=3\n"
        f"remove_existing=yes\n"
    )


def configured_webrtc_endpoints():
    raw = (settings.ASTERISK.get("SIP_ENDPOINTS") or "").strip()
    if raw:
        return {item.strip() for item in raw.split(",") if item.strip()}
    return {str(n) for n in range(2100, 2103)}


def live_webrtc_endpoints():
    if (getattr(settings, "TELEPHONY_BACKEND", "") or "").lower() != "asterisk":
        return configured_webrtc_endpoints()
    now = time.time()
    with _live_lock:
        if _live_cache["endpoints"] is not None and now - _live_cache["at"] < 15:
            return _live_cache["endpoints"]
    found = set()
    try:
        from telephony.ami import cli_output

        text = cli_output("pjsip show endpoints")
        for match in re.finditer(r"Endpoint:\s+(21\d{2})\b", text or ""):
            found.add(match.group(1))
    except Exception:
        logger.warning("Could not list live PJSIP endpoints", exc_info=True)
    if not found:
        found = configured_webrtc_endpoints()
    with _live_lock:
        _live_cache["at"] = now
        _live_cache["endpoints"] = found
    return found


def sip_login_for(user):
    """Return a SIP username/password that Asterisk will actually accept."""
    ensure_sip_identity(user)
    username = (user.sip_username or user.extension or "").strip()
    password = (user.sip_password or username).strip()
    live = live_webrtc_endpoints()
    if username and username in live:
        return username, password
    fallback = next((ext for ext in ("2100", "2101", "2102") if ext in live), None) or next(iter(live), "2100")
    logger.warning(
        "Asterisk has no PJSIP endpoint for %s (%s); registering as %s so the call can proceed",
        user.email,
        username,
        fallback,
    )
    return fallback, fallback
