import logging

from django.conf import settings

from telephony import ami, ari_client
from telephony.utils import normalize_phone

from .base import TelephonyBackend

logger = logging.getLogger(__name__)


def ice_servers_for_browser():
    servers = [{"urls": "stun:stun.l.google.com:19302"}]
    ast = settings.ASTERISK
    if ast.get("TURN_URL"):
        servers.append({
            "urls": ast["TURN_URL"],
            "username": ast.get("TURN_USER") or "",
            "credential": ast.get("TURN_PASSWORD") or "",
        })
    return servers


class AsteriskTelephony(TelephonyBackend):
    name = "asterisk"

    def session_payload(self, user, session):
        from telephony.sip_provision import sip_login_for

        sip_user, sip_password = sip_login_for(user)
        conference = f"pc{session.id}"
        ice_servers = ice_servers_for_browser()
        return {
            "mode": "asterisk",
            "ice_servers": ice_servers,
            "sip": {
                "ice_servers": ice_servers,
                "uri": f"sip:{sip_user}@{settings.ASTERISK['SIP_DOMAIN']}",
                "password": sip_password,
                "ws_url": settings.ASTERISK["SIP_WS"],
                "display_name": user.display_name,
                "conference": conference,
            },
        }

    def _dial_number(self, call):
        from telephony.channels import dial_prefix_for

        number = normalize_phone(call.phone_number)
        strip = settings.ASTERISK.get("STRIP_COUNTRY_CODE") or ""
        if strip and number.startswith(strip) and len(number) > len(strip) + 7:
            number = number[len(strip) :]
        return number, dial_prefix_for(call)

    def originate(self, call):
        number, prefix = self._dial_number(call)
        conference = f"pc{call.session_id}" if call.session_id else f"pc{call.id}"
        try:
            payload = ari_client.originate_to_conference(
                number=f"{prefix}{number}",
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
                dial_prefix=prefix,
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

    def originate_prompt(self, call):
        number, prefix = self._dial_number(call)
        audio = call.contact.tts_audio if call.contact_id else None
        if not audio:
            raise ValueError("Generate the Piper prompt before dialing")
        call.media_mode = "asterisk"
        call.save(update_fields=["media_mode"])
        return ami.originate_playback(
            number,
            audio.path,
            call.callerid_token,
            call.id,
            dial_prefix=prefix,
        )

    def hangup(self, call):
        if call.asterisk_channel:
            ari_client.hangup_channel(call.asterisk_channel)
            try:
                ami.hangup_channel(call.asterisk_channel)
            except Exception:
                pass
        return {"ok": True}
