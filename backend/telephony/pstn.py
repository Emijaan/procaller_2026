from django.conf import settings


def _trunk():
    return settings.ASTERISK.get("TRUNK") or "gsm222"


def _tech():
    return (settings.ASTERISK.get("CHANNEL_TECH") or "sip").strip().lower()


def _style():
    return (settings.ASTERISK.get("ORIGINATE_STYLE") or "vicibox").strip().lower()


def ari_pstn_endpoint(number):
    trunk = _trunk()
    if _style() == "vicibox" and len(number) == 10:
        return f"Local/331{number}@default"
    if _tech() == "pjsip":
        return f"PJSIP/{number}@{trunk}"
    return f"SIP/{trunk}/{number}"


def ami_pstn_channel(number, dial_prefix=""):
    dialed = f"{dial_prefix or ''}{number}"
    if _style() == "vicibox" and len(number) == 10 and not dial_prefix:
        return f"Local/{number}@procaller-outbound"
    if _tech() == "pjsip":
        return f"PJSIP/{dialed}@{_trunk()}"
    return f"SIP/{_trunk()}/{dialed}"
