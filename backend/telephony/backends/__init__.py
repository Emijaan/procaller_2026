from django.conf import settings

from .asterisk import AsteriskTelephony
from .sandbox import SandboxTelephony


def get_telephony():
    backend = (getattr(settings, "TELEPHONY_BACKEND", "sandbox") or "sandbox").lower()
    if backend == "asterisk":
        return AsteriskTelephony()
    return SandboxTelephony()
