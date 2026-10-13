"""Map Asterisk facts to a call disposition.

A result is recorded only when Asterisk reports a Q.850 cause, a DialStatus,
an Originate failure reason, or cause text that names the outcome. Spoken
carrier announcements that never arrive as one of those facts stay Unknown.
Connected is used only after the far end answered and no non-answer cause
contradicts it. Cause 20 (subscriber absent), 21 (call rejected), and 27
(destination out of order) are not split into Switch Off, Not Reachable,
Out of Service Area, or Incoming Calls Not Allowed, because those codes do
not identify which announcement the caller heard.
"""

UNKNOWN = ("Unknown", "UNKNOWN", "Unknown")
CONNECTED = ("Connected", "ANSWERED", "Connected")

_TEXT_RULES = (
    (("switched off", "switch off", "power off"), ("Switch Off", "SWITCH_OFF", "Switch Off")),
    (("not reachable", "unreachable"), ("Not Reachable", "NOT_REACHABLE", "Not Reachable")),
    (("out of service", "out of coverage"), ("Out of Service Area", "OUT_OF_SERVICE", "Out of Service Area")),
    (
        ("incoming calls not allowed", "incoming barred", "incoming not allowed", "calls not allowed"),
        ("Incoming Calls Not Allowed", "INCOMING_NOT_ALLOWED", "Incoming Calls Not Allowed"),
    ),
    (("user busy",), ("Busy", "BUSY", "Busy")),
    (("no user responding", "no answer"), ("No Answer", "NO_ANSWER", "No Answer")),
)

# ITU-T Q.850 codes whose meaning is the disposition itself.
_Q850 = {
    "1": ("Failed", "FAILED", "Failed"),
    "2": ("Failed", "FAILED", "Failed"),
    "3": ("Failed", "FAILED", "Failed"),
    "17": ("Busy", "BUSY", "Busy"),
    "19": ("No Answer", "NO_ANSWER", "No Answer"),
    "22": ("Failed", "FAILED", "Failed"),
    "28": ("Failed", "FAILED", "Failed"),
    "34": ("Failed", "FAILED", "Failed"),
    "38": ("Failed", "FAILED", "Failed"),
    "41": ("Failed", "FAILED", "Failed"),
    "42": ("Failed", "FAILED", "Failed"),
    "44": ("Failed", "FAILED", "Failed"),
    "47": ("Failed", "FAILED", "Failed"),
    "102": ("Failed", "FAILED", "Failed"),
}

# Present on the wire, but not specific enough to name an announcement.
_AMBIGUOUS_Q850 = {"20", "21", "27", "31"}

_DIALSTATUS = {
    "BUSY": ("Busy", "BUSY", "Busy"),
    "NOANSWER": ("No Answer", "NO_ANSWER", "No Answer"),
    "CANCEL": ("Cancelled", "CANCELLED", "Cancelled"),
    "CHANUNAVAIL": ("Failed", "FAILED", "Failed"),
    "CONGESTION": ("Failed", "FAILED", "Failed"),
}

# Asterisk OriginateResponse Reason for a failed originate.
_ORIGINATE_REASON = {
    "0": ("Failed", "FAILED", "Failed"),
    "1": ("No Answer", "NO_ANSWER", "No Answer"),
    "5": ("Busy", "BUSY", "Busy"),
    "8": ("Failed", "FAILED", "Failed"),
}

_EXPLICIT_OUTCOME = {
    "connected": CONNECTED,
    "busy": ("Busy", "BUSY", "Busy"),
    "no answer": ("No Answer", "NO_ANSWER", "No Answer"),
    "failed": ("Failed", "FAILED", "Failed"),
    "cancelled": ("Cancelled", "CANCELLED", "Cancelled"),
    "unknown": UNKNOWN,
}

NETWORK_DISPOSITIONS = {
    "Connected",
    "Busy",
    "No Answer",
    "Failed",
    "Cancelled",
    "Unknown",
    "Switch Off",
    "Not Reachable",
    "Out of Service Area",
    "Incoming Calls Not Allowed",
}

UNREACHED_DISPOSITIONS = NETWORK_DISPOSITIONS - {"Connected", "Cancelled"}


def _norm_code(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.lower().startswith("originate:"):
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return digits


def _from_text(cause_text):
    text = (cause_text or "").strip().lower()
    if not text or text in {"normal clearing", "subscriber absent", "call rejected", "destination out of order"}:
        return None
    for phrases, result in _TEXT_RULES:
        if any(phrase in text for phrase in phrases):
            return result
    return None


def classify_hangup(
    *,
    answered=False,
    ringing=False,
    outcome="",
    cause_code="",
    cause_text="",
    dial_status="",
    originate_reason="",
):
    """Return (outcome, hangup_cause, disposition)."""
    text_hit = _from_text(cause_text)
    if text_hit:
        return text_hit

    code = _norm_code(cause_code)
    if code in _Q850:
        return _Q850[code]
    if code == "18":
        return ("No Answer", "NO_ANSWER", "No Answer") if ringing else UNKNOWN
    if code == "16":
        return CONNECTED if answered else UNKNOWN
    if code in _AMBIGUOUS_Q850:
        return UNKNOWN

    status = (dial_status or "").strip().upper()
    if status == "ANSWER":
        return CONNECTED
    if status in _DIALSTATUS:
        return _DIALSTATUS[status]

    reason = str(originate_reason or "").strip()
    if reason in _ORIGINATE_REASON:
        return _ORIGINATE_REASON[reason]

    explicit = _EXPLICIT_OUTCOME.get((outcome or "").strip().lower())
    if explicit:
        if explicit is CONNECTED and not answered:
            return UNKNOWN
        return explicit

    if answered:
        return CONNECTED
    return UNKNOWN
