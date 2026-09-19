import threading

from django.utils import timezone

from telephony.realtime import broadcast_call, broadcast_user
from telephony.utils import normalize_phone

from .base import TelephonyBackend


class SandboxTelephony(TelephonyBackend):
    name = "sandbox"

    def session_payload(self, user, session):
        return {
            "mode": "sandbox",
            "ice_servers": [{"urls": "stun:stun.l.google.com:19302"}],
            "sip": None,
        }

    def originate(self, call):
        from accounts.models import User
        from telephony.models import AgentSession

        dest = normalize_phone(call.phone_number)
        peer = (
            User.objects.filter(extension=dest, presence__in=["available", "paused", "on_call"])
            .exclude(pk=call.agent_id)
            .first()
        )
        if peer:
            peer_session = AgentSession.objects.filter(user=peer, ended_at__isnull=True).first()
            if peer_session:
                call.media_mode = "webrtc-peer"
                call.save(update_fields=["media_mode"])
                broadcast_user(
                    peer.id,
                    {
                        "type": "incoming_call",
                        "call": {
                            "id": call.id,
                            "from_name": call.agent.display_name,
                            "from_extension": call.agent.extension,
                            "phone_number": call.phone_number,
                        },
                    },
                )
                self._later(0.4, lambda: self._set_ringing(call.id))
                return {"peer_user_id": peer.id}

        self._later(0.6, lambda: self._set_ringing(call.id))
        self._later(2.8, lambda: self._set_answered(call.id))
        return {"peer_user_id": None}

    def hangup(self, call):
        return {"ok": True}

    def _set_ringing(self, call_id):
        from telephony.models import Call

        call = Call.objects.filter(pk=call_id).first()
        if not call or call.state in (Call.State.ENDED, Call.State.CONNECTED):
            return
        call.state = Call.State.RINGING
        call.ringing_at = timezone.now()
        call.save(update_fields=["state", "ringing_at"])
        broadcast_call(call, "call.ringing")

    def _set_answered(self, call_id):
        from telephony.models import Call
        from telephony.services import mark_answered

        call = Call.objects.filter(pk=call_id).first()
        if not call or call.state == Call.State.ENDED:
            return
        mark_answered(call)

    def _later(self, seconds, fn):
        timer = threading.Timer(seconds, fn)
        timer.daemon = True
        timer.start()
