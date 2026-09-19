import logging

from django.conf import settings

from telephony import ami, ari_client
from telephony.utils import normalize_phone

from .base import TelephonyBackend

logger = logging.getLogger(__name__)


class AsteriskTelephony(TelephonyBackend):
    name = "asterisk"

    def session_payload(self, user, session):
        sip_user = user.sip_username or user.extension or f"210{user.id}"
        conference = f"pc{session.id}"
        return {
            "mode": "asterisk",
            "ice_servers": [{"urls": "stun:stun.l.google.com:19302"}],
            "sip": {
                "uri": f"sip:{sip_user}@{settings.ASTERISK['SIP_DOMAIN']}",
                "password": user.sip_password or sip_user,
                "ws_url": settings.ASTERISK["SIP_WS"],
                "display_name": user.display_name,
                "conference": conference,
            },
        }

    def originate(self, call):
        number = normalize_phone(call.phone_number)
        strip = settings.ASTERISK.get("STRIP_COUNTRY_CODE") or ""
        if strip and number.startswith(strip) and len(number) > len(strip) + 7:
            number = number[len(strip) :]
        conference = f"pc{call.session_id}" if call.session_id else f"pc{call.id}"
        try:
            payload = ari_client.originate_to_conference(
                number=number,
                conference=conference,
                callerid_token=call.callerid_token,
            )
        except Exception:
            logger.exception("ARI originate failed, trying AMI")
            payload = ami.originate_to_conference(
                number=number,
                conference=conference,
                callerid_token=call.callerid_token,
                call_id=call.id,
            )
        channel_id = ""
        if isinstance(payload, dict):
            channel_id = payload.get("id") or ""
        call.media_mode = "asterisk"
        if channel_id:
            call.asterisk_channel = channel_id
            call.save(update_fields=["asterisk_channel", "media_mode"])
            ari_client.watch_call(call.id, channel_id)
        else:
            call.save(update_fields=["media_mode"])
        return payload

    def hangup(self, call):
        if call.asterisk_channel:
            ari_client.hangup_channel(call.asterisk_channel)
            try:
                ami.hangup_channel(call.asterisk_channel)
            except Exception:
                pass
        return {"ok": True}
