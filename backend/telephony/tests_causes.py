from django.test import SimpleTestCase

from telephony.causes import classify_hangup


class IvrDispositionTests(SimpleTestCase):
    def test_each_announcement_maps_to_its_code(self):
        samples = {
            "The number you are calling is switched off.": "SWITCHED_OFF",
            "The number you are calling is not reachable.": "NOT_REACHABLE",
            "The subscriber is currently out of network coverage.": "OUT_OF_COVERAGE",
            "Incoming calls are not available on this number.": "INCOMING_NOT_AVAILABLE",
            "Incoming calls are barred on this number.": "INCOMING_BARRED",
            "Incoming calls are not allowed on this number.": "INCOMING_NOT_ALLOWED",
            "Outgoing calls are not allowed from this number.": "OUTGOING_NOT_ALLOWED",
            "The number you have dialled is temporarily out of service.": "TEMPORARILY_OUT_OF_SERVICE",
            "The number you have dialled is not in service.": "NUMBER_NOT_IN_SERVICE",
            "You have dialled an incorrect number.": "INVALID_NUMBER",
            "The number you have dialled does not exist.": "NUMBER_DOES_NOT_EXIST",
            "The number you have dialled is not active.": "NUMBER_NOT_ACTIVE",
            "This number is no longer in service.": "NUMBER_DISCONNECTED",
            "The subscriber is temporarily unavailable.": "TEMPORARILY_UNAVAILABLE",
            "The person you are calling is not available at present.": "SUBSCRIBER_UNAVAILABLE",
            "The person you are calling is currently busy.": "BUSY",
            "The line you are calling is busy.": "LINE_BUSY",
            "The call is ringing but not answered.": "NO_ANSWER",
            "The recipient rejected the call.": "CALL_REJECTED",
            "Your call could not be connected.": "CALL_FAILED",
            "Your call cannot be completed at this time.": "NETWORK_ERROR",
            "All lines are busy. Please try again later.": "NETWORK_CONGESTION",
            "There is a network problem. Please try again later.": "NETWORK_FAILURE",
            "Your call could not be completed.": "CALL_NOT_COMPLETED",
            "Your call cannot be connected at this time.": "CALL_CANNOT_BE_CONNECTED",
            "Services on this number have been temporarily suspended.": "SERVICE_TEMPORARILY_SUSPENDED",
            "This service is currently not available.": "SERVICE_NOT_AVAILABLE",
            "Your service validity has expired.": "VALIDITY_EXPIRED",
            "The subscriber is currently unavailable while roaming.": "ROAMING_UNAVAILABLE",
            "Your call is being forwarded.": "CALL_FORWARDING",
            "Please leave your message after the tone.": "VOICEMAIL",
            "The subscriber may not be accepting calls.": "DO_NOT_DISTURB",
            "आप जिस नंबर पर कॉल कर रहे हैं, वह स्विच ऑफ है।": "SWITCHED_OFF_HI",
            "आप जिस नंबर पर कॉल कर रहे हैं, वह अभी पहुँच से बाहर है।": "NOT_REACHABLE_HI",
            "ग्राहक फिलहाल नेटवर्क कवरेज से बाहर है।": "OUT_OF_COVERAGE_HI",
            "इस नंबर पर इनकमिंग कॉल की सुविधा उपलब्ध नहीं है।": "INCOMING_NOT_AVAILABLE_HI",
            "इस नंबर पर इनकमिंग कॉल की अनुमति नहीं है।": "INCOMING_NOT_ALLOWED_HI",
            "आपके द्वारा डायल किया गया नंबर फिलहाल सेवा में उपलब्ध नहीं है।": "OUT_OF_SERVICE_HI",
            "कृपया सही नंबर डायल करें।": "INVALID_NUMBER_HI",
            "आप जिस व्यक्ति से बात करना चाहते हैं, वह अभी व्यस्त है।": "BUSY_HI",
            "आप जिस ग्राहक से संपर्क करना चाहते हैं, वह अभी उपलब्ध नहीं है।": "TEMPORARILY_UNAVAILABLE_HI",
            "आपकी कॉल इस समय कनेक्ट नहीं हो पा रही है। कृपया बाद में प्रयास करें।": "NETWORK_ERROR_HI",
            "आपकी कॉल कनेक्ट नहीं हो सकी।": "CALL_FAILED_HI",
            "नेटवर्क द्वारा सुनाई गई घोषणा की पहचान नहीं हो सकी।": "UNKNOWN_ANNOUNCEMENT_HI",
        }
        for text, code in samples.items():
            outcome, cause, disposition = classify_hangup(cause_text=text)
            self.assertEqual((outcome, cause, disposition), (code, code, code), text)

    def test_unreliable_causes_stay_unclassified_and_answer_connects(self):
        self.assertEqual(classify_hangup(cause_code="20", cause_text="Subscriber absent")[2], "UNKNOWN_UNCLASSIFIED")
        self.assertEqual(classify_hangup(cause_code="27")[2], "UNKNOWN_UNCLASSIFIED")
        self.assertEqual(classify_hangup(cause_code="16", answered=False, cause_text="Normal Clearing")[2], "UNKNOWN_UNCLASSIFIED")
        self.assertEqual(classify_hangup(cause_code="16", answered=True, cause_text="Normal Clearing")[2], "CONNECTED")
        self.assertEqual(classify_hangup(cause_code="17", cause_text="User busy")[2], "BUSY")
        self.assertEqual(classify_hangup(cause_code="21", cause_text="Call Rejected")[2], "CALL_REJECTED")
        self.assertEqual(classify_hangup(cause_text="Please deposit fifty rupees")[2], "UNKNOWN_ANNOUNCEMENT")
