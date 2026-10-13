import logging
import re
import threading
import time
from pathlib import Path

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


def next_pc_number():
    taken = set(User.objects.exclude(pc_number=None).values_list("pc_number", flat=True))
    number = 1
    while number in taken:
        number += 1
    return number


def ensure_sip_identity(user):
    """Assign a PC number and extension once. An existing number is left as it is."""
    if not user:
        return user
    fields = []
    ext = (user.extension or "").strip()
    if not ext:
        ext = next_extension()
        user.extension = ext
        fields.append("extension")
    if (user.sip_username or "").strip() != ext:
        user.sip_username = ext
        fields.append("sip_username")
    if not (user.sip_password or "").strip():
        user.sip_password = ext
        fields.append("sip_password")
    if not user.pc_number:
        user.pc_number = next_pc_number()
        fields.append("pc_number")
    if fields:
        user.save(update_fields=fields)
        logger.info("Locked PC %s extension %s on %s", user.pc_number, user.extension, user.email)
    publish_webrtc_endpoint(user.extension, user.sip_password or user.extension)
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


def _agent_config_path():
    return Path(settings.BASE_DIR) / "asterisk" / "pjsip_agents.conf"


def _static_webrtc_endpoints():
    path = Path("/etc/asterisk/pjsip_procaller.conf")
    try:
        text = path.read_text()
    except OSError:
        return {str(n) for n in range(FIRST_EXT, FIRST_EXT + 3)}
    return set(re.findall(r"^\[(21\d{2})\]\(procaller-webrtc\)", text, re.M))


def publish_webrtc_endpoint(ext, password):
    """Add this extension to the agent PJSIP file. A number already in use is not rewritten."""
    ext = (ext or "").strip()
    if not ext.isdigit() or (getattr(settings, "TELEPHONY_BACKEND", "") or "").lower() != "asterisk":
        return
    if ext in _static_webrtc_endpoints():
        return
    path = _agent_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    current = path.read_text() if path.exists() else "; ProCaller agent extensions. Numbers here do not change.\n"
    if re.search(rf"^\[{re.escape(ext)}\]\(procaller-webrtc\)", current, re.M):
        return
    path.write_text(current.rstrip() + "\n\n" + render_webrtc_endpoint(ext, password or ext))
    try:
        from telephony.ami import cli_output

        cli_output("module reload res_pjsip.so")
    except Exception:
        logger.warning("PJSIP reload did not run after adding extension %s", ext)


def sip_login_for(user):
    """Return this account's own extension. It is never replaced with another phone."""
    ensure_sip_identity(user)
    username = (user.extension or user.sip_username or "").strip()
    password = (user.sip_password or username).strip()
    publish_webrtc_endpoint(username, password)
    return username, password
