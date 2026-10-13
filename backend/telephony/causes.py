"""Map a real network result to an Indian IVR disposition code.

A code is used only when the announcement text, a specific Q.850 cause, or a
DialStatus names that result. Connected is used only after the far end
answered. Cause 20 and 27 stay unclassified: they do not say which
announcement was played.
"""

CONNECTED = "CONNECTED"

# code, announcement, phrases that identify it. Longer phrases are tried first.
ANNOUNCEMENTS = (
    ("SWITCHED_OFF", "The number you are calling is switched off.", ("switched off", "switch off", "power off")),
    ("NOT_REACHABLE", "The number you are calling is not reachable.", ("not reachable", "unreachable")),
    ("OUT_OF_COVERAGE", "The subscriber is currently out of network coverage.", ("out of network coverage", "out of coverage", "out of service area")),
    ("INCOMING_NOT_AVAILABLE", "Incoming calls are not available on this number.", ("incoming calls are not available", "incoming not available", "incoming calls not available")),
    ("INCOMING_BARRED", "Incoming calls are barred on this number.", ("incoming calls are barred", "incoming barred", "incoming calls barred")),
    ("INCOMING_NOT_ALLOWED", "Incoming calls are not allowed on this number.", ("incoming calls are not allowed", "incoming calls not allowed", "incoming not allowed")),
    ("OUTGOING_NOT_ALLOWED", "Outgoing calls are not allowed from this number.", ("outgoing calls are not allowed", "outgoing not allowed", "outgoing calls not allowed")),
    ("TEMPORARILY_OUT_OF_SERVICE", "The number you have dialled is temporarily out of service.", ("temporarily out of service",)),
    ("NUMBER_NOT_IN_SERVICE", "The number you have dialled is not in service.", ("not in service", "number not in service")),
    ("NUMBER_DISCONNECTED", "This number is no longer in service.", ("no longer in service", "number disconnected", "no longer exists")),
    ("INVALID_NUMBER", "You have dialled an incorrect number.", ("incorrect number", "invalid number", "not a working number")),
    ("NUMBER_DOES_NOT_EXIST", "The number you have dialled does not exist.", ("does not exist", "number does not exist", "unallocated")),
    ("NUMBER_NOT_ACTIVE", "The number you have dialled is not active.", ("not active", "number not active")),
    ("TEMPORARILY_UNAVAILABLE", "The subscriber is temporarily unavailable.", ("temporarily unavailable", "temporary unavailable", "temporarily not available")),
    ("SUBSCRIBER_UNAVAILABLE", "The person you are calling is not available at present.", ("not available at present", "subscriber unavailable", "currently unavailable")),
    ("LINE_BUSY", "The line you are calling is busy.", ("line is busy", "line you are calling is busy", "the line is busy")),
    ("BUSY", "The person you are calling is currently busy.", ("currently busy", "user busy", "subscriber busy", "on another call", "person you are calling is busy")),
    ("NO_ANSWER", "The call is ringing but not answered.", ("not answered", "no answer", "unanswered", "not answering", "did not answer", "no user responding")),
    ("CALL_REJECTED", "The recipient rejected the call.", ("rejected the call", "call rejected", "call reject")),
    ("CALL_NOT_COMPLETED", "Your call could not be completed.", ("could not be completed", "call not completed")),
    ("CALL_CANNOT_BE_CONNECTED", "Your call cannot be connected at this time.", ("cannot be connected",)),
    ("CALL_FAILED", "Your call could not be connected.", ("could not be connected", "call failed", "could not connect")),
    ("NETWORK_CONGESTION", "All lines are busy. Please try again later.", ("all lines are busy", "all circuits are busy", "network congestion", "network busy")),
    ("NETWORK_FAILURE", "There is a network problem. Please try again later.", ("network problem", "network failure", "network out of order")),
    ("NETWORK_ERROR", "Your call cannot be completed at this time.", ("cannot be completed", "temporary failure", "network error")),
    ("SERVICE_TEMPORARILY_SUSPENDED", "Services on this number have been temporarily suspended.", ("temporarily suspended", "service suspended", "services on this number")),
    ("SERVICE_NOT_AVAILABLE", "This service is currently not available.", ("service is currently not available", "service not available", "service is not available")),
    ("VALIDITY_EXPIRED", "Your service validity has expired.", ("validity has expired", "validity expired")),
    ("ROAMING_UNAVAILABLE", "The subscriber is currently unavailable while roaming.", ("while roaming", "roaming unavailable", "unavailable while roaming")),
    ("CALL_FORWARDING", "Your call is being forwarded.", ("being forwarded", "call forwarding", "call is forwarded")),
    ("VOICEMAIL", "Please leave your message after the tone.", ("after the tone", "leave your message", "voicemail", "voice mail")),
    ("DO_NOT_DISTURB", "The subscriber may not be accepting calls.", ("do not disturb", "not be accepting calls", "not accepting calls")),
    ("SWITCHED_OFF_HI", "आप जिस नंबर पर कॉल कर रहे हैं, वह स्विच ऑफ है।", ("स्विच ऑफ",)),
    ("NOT_REACHABLE_HI", "आप जिस नंबर पर कॉल कर रहे हैं, वह अभी पहुँच से बाहर है।", ("पहुँच से बाहर", "पहुंच से बाहर")),
    ("OUT_OF_COVERAGE_HI", "ग्राहक फिलहाल नेटवर्क कवरेज से बाहर है।", ("कवरेज से बाहर",)),
    ("INCOMING_NOT_AVAILABLE_HI", "इस नंबर पर इनकमिंग कॉल की सुविधा उपलब्ध नहीं है।", ("इनकमिंग कॉल की सुविधा उपलब्ध नहीं",)),
    ("INCOMING_NOT_ALLOWED_HI", "इस नंबर पर इनकमिंग कॉल की अनुमति नहीं है।", ("इनकमिंग कॉल की अनुमति नहीं",)),
    ("OUT_OF_SERVICE_HI", "आपके द्वारा डायल किया गया नंबर फिलहाल सेवा में उपलब्ध नहीं है।", ("सेवा में उपलब्ध नहीं",)),
    ("INVALID_NUMBER_HI", "कृपया सही नंबर डायल करें।", ("सही नंबर डायल करें",)),
    ("BUSY_HI", "आप जिस व्यक्ति से बात करना चाहते हैं, वह अभी व्यस्त है।", ("अभी व्यस्त",)),
    ("TEMPORARILY_UNAVAILABLE_HI", "आप जिस ग्राहक से संपर्क करना चाहते हैं, वह अभी उपलब्ध नहीं है।", ("अभी उपलब्ध नहीं",)),
    ("NETWORK_ERROR_HI", "आपकी कॉल इस समय कनेक्ट नहीं हो पा रही है। कृपया बाद में प्रयास करें।", ("कनेक्ट नहीं हो पा रही",)),
    ("CALL_FAILED_HI", "आपकी कॉल कनेक्ट नहीं हो सकी।", ("कनेक्ट नहीं हो सकी",)),
    ("UNKNOWN_ANNOUNCEMENT_HI", "नेटवर्क द्वारा सुनाई गई घोषणा की पहचान नहीं हो सकी।", ("पहचान नहीं हो सकी",)),
)

_SENTENCE = {code: sentence for code, sentence, _phrases in ANNOUNCEMENTS}
_SENTENCE.update(
    {
        "CONNECTED": "The call was answered and connected.",
        "UNKNOWN_ANNOUNCEMENT": "An unrecognized network announcement was detected.",
        "UNKNOWN_UNCLASSIFIED": "The call outcome could not be determined reliably.",
        "CANCELLED": "The call was cancelled before an announcement.",
        "NOT_DIALED": "Not dialed",
        "DIALING": "Dialing",
    }
)

_PHRASES = []
for code, _sentence, phrases in ANNOUNCEMENTS:
    for phrase in phrases:
        _PHRASES.append((phrase.casefold(), code))
_PHRASES.sort(key=lambda item: len(item[0]), reverse=True)

# Asterisk cause text that does not name an announcement.
_IGNORE_TEXT = {
    "normal clearing",
    "normal call clearing",
    "subscriber absent",
    "destination out of order",
    "interworking",
    "unspecified",
}

# Q.850 codes with one meaning in this list. 20 and 27 are not here.
_Q850 = {
    "1": "NUMBER_DOES_NOT_EXIST",
    "2": "NETWORK_FAILURE",
    "3": "NETWORK_FAILURE",
    "17": "BUSY",
    "21": "CALL_REJECTED",
    "28": "INVALID_NUMBER",
    "34": "NETWORK_CONGESTION",
    "38": "NETWORK_FAILURE",
    "41": "NETWORK_ERROR",
    "42": "NETWORK_CONGESTION",
    "44": "NETWORK_ERROR",
    "47": "NETWORK_FAILURE",
}

_DIALSTATUS = {
    "BUSY": "BUSY",
    "NOANSWER": "NO_ANSWER",
    "CANCEL": "CANCELLED",
    "CHANUNAVAIL": "CALL_FAILED",
    "CONGESTION": "NETWORK_CONGESTION",
}

_ORIGINATE_REASON = {
    "0": "CALL_FAILED",
    "1": "NO_ANSWER",
    "5": "BUSY",
    "8": "CALL_FAILED",
}

LEGACY_CODES = {
    "Switch Off": "SWITCHED_OFF",
    "SWITCH_OFF": "SWITCHED_OFF",
    "Not Reachable": "NOT_REACHABLE",
    "NOT_REACHABLE": "NOT_REACHABLE",
    "Out of Service Area": "OUT_OF_COVERAGE",
    "OUT_OF_SERVICE": "OUT_OF_COVERAGE",
    "Incoming Calls Not Allowed": "INCOMING_NOT_ALLOWED",
    "Invalid Number": "INVALID_NUMBER",
    "Temporarily Unavailable": "TEMPORARILY_UNAVAILABLE",
    "Network Congestion": "NETWORK_CONGESTION",
    "Connected": "CONNECTED",
    "ANSWERED": "CONNECTED",
    "Busy": "BUSY",
    "No Answer": "NO_ANSWER",
    "RINGING_NO_ANSWER": "NO_ANSWER",
    "Failed": "CALL_FAILED",
    "FAILED": "CALL_FAILED",
    "Cancelled": "CANCELLED",
    "CANCELLED": "CANCELLED",
    "Unknown": "UNKNOWN_UNCLASSIFIED",
    "UNKNOWN": "UNKNOWN_UNCLASSIFIED",
}

NETWORK_DISPOSITIONS = set(_SENTENCE) | set(LEGACY_CODES) | {"CONNECTED", "CANCELLED", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT"}
UNREACHED_DISPOSITIONS = NETWORK_DISPOSITIONS - {"CONNECTED", "Connected", "CANCELLED", "Cancelled"}
BUSY_CODES = {"BUSY", "BUSY_HI", "LINE_BUSY", "Busy"}
NO_ANSWER_CODES = {"NO_ANSWER", "No Answer"}


def _norm_code(value):
    raw = str(value or "").strip()
    if not raw or raw.lower().startswith("originate:"):
        return ""
    return "".join(ch for ch in raw if ch.isdigit())


def _result(code):
    return (code, code, code)


def disposition_codes():
    """Every disposition code a report filter can select."""
    return sorted(_SENTENCE)


def announcement(code):
    mapped = canonical_code(code)
    return _SENTENCE.get(mapped, "")


def canonical_code(value):
    text = (value or "").strip()
    if not text:
        return ""
    if text in _SENTENCE or text in {"NOT_DIALED", "DIALING", "CANCELLED"}:
        return text
    return LEGACY_CODES.get(text, text)


def _from_text(cause_text):
    text = (cause_text or "").strip()
    if not text:
        return ""
    folded = text.casefold()
    if folded in _IGNORE_TEXT:
        return ""
    for phrase, code in _PHRASES:
        if phrase in folded:
            return code
    return ""


def _unrecognized(cause_text):
    text = (cause_text or "").strip()
    return bool(text) and text.casefold() not in _IGNORE_TEXT


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
    """Return (outcome, hangup_cause, disposition), each set to the disposition code."""
    named = _from_text(cause_text)
    if named:
        return _result(named)

    code = _norm_code(cause_code)
    if code in _Q850:
        return _result(_Q850[code])
    if code in {"18", "19", "102"}:
        return _result("NO_ANSWER" if ringing else "UNKNOWN_UNCLASSIFIED")
    if code == "16":
        return _result("CONNECTED" if answered else "UNKNOWN_UNCLASSIFIED")
    if code in {"20", "22", "27", "31"}:
        return _result("UNKNOWN_UNCLASSIFIED")

    status = (dial_status or "").strip().upper()
    if status == "ANSWER":
        return _result("CONNECTED")
    if status in _DIALSTATUS:
        return _result(_DIALSTATUS[status])

    reason = str(originate_reason or "").strip()
    if reason in _ORIGINATE_REASON:
        return _result(_ORIGINATE_REASON[reason])

    explicit = canonical_code(outcome)
    if explicit in _SENTENCE or explicit in {"CANCELLED", "CONNECTED", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT"}:
        if explicit == "CONNECTED" and not answered:
            return _result("UNKNOWN_UNCLASSIFIED")
        return _result(explicit)

    if answered:
        return _result("CONNECTED")
    if _unrecognized(cause_text):
        hindi = any("\u0900" <= ch <= "\u097f" for ch in cause_text or "")
        return _result("UNKNOWN_ANNOUNCEMENT_HI" if hindi else "UNKNOWN_ANNOUNCEMENT")
    return _result("UNKNOWN_UNCLASSIFIED")


def lead_disposition(contact):
    """Disposition code and announcement for a lead. A lead with no call is Not dialed."""
    annotated = "latest_call_state" in getattr(contact, "__dict__", {})
    if annotated:
        state = contact.latest_call_state or ""
        raw = (contact.latest_call_disposition or "").strip()
    else:
        call = contact.calls.order_by("-id").only("state", "disposition").first() if getattr(contact, "pk", None) else None
        state = call.state if call else ""
        raw = (call.disposition or "").strip() if call else ""
    if not state and not raw:
        return {"disposition_code": "NOT_DIALED", "disposition_label": "Not dialed"}
    if state in {"initiating", "ringing"} and not raw:
        return {"disposition_code": "DIALING", "disposition_label": "Dialing"}
    if state in {"connected", "on_hold"} and not raw:
        return {"disposition_code": "CONNECTED", "disposition_label": announcement("CONNECTED")}
    code = canonical_code(raw or getattr(contact, "last_disposition", ""))
    if not code:
        return {"disposition_code": "UNKNOWN_UNCLASSIFIED", "disposition_label": announcement("UNKNOWN_UNCLASSIFIED")}
    return {"disposition_code": code, "disposition_label": announcement(code) or code}
