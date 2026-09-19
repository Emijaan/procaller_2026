import json
import logging
import threading
import time

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _cfg():
    ast = settings.ASTERISK
    return ast["ARI_URL"].rstrip("/"), (ast["ARI_USER"], ast["ARI_PASSWORD"])


def originate_to_conference(number, conference, callerid_token, timeout=60):
    base, auth = _cfg()
    # Same path VICIdial uses: Local/33 + pad + 10digit @default
    # ${EXTEN:3} on _33X. strips "331" and dials SIP/gsm222/<10digit>
    local_exten = f"331{number}" if len(number) == 10 else number
    endpoint = (
        f"Local/{local_exten}@default"
        if len(number) == 10
        else f"Local/{number}@procaller-outbound"
    )
    response = requests.post(
        f"{base}/ari/channels",
        auth=auth,
        params={
            "endpoint": endpoint,
            "context": "procaller-agent",
            "extension": conference,
            "priority": 1,
            "callerId": f"{number}",
            "timeout": int(timeout),
        },
        timeout=10,
    )
    if not response.ok:
        raise RuntimeError(f"ARI originate failed: {response.status_code} {response.text}")
    return response.json() if response.content else {}


def get_channel(channel_id):
    base, auth = _cfg()
    response = requests.get(f"{base}/ari/channels/{channel_id}", auth=auth, timeout=5)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def watch_call(call_id, channel_id):
    def _run():
        from telephony.models import Call
        from telephony.realtime import broadcast_call
        from telephony.services import hangup_call, mark_answered
        from django.utils import timezone

        saw_ring = False
        for _ in range(90):
            time.sleep(1)
            call = Call.objects.filter(pk=call_id).first()
            if not call or call.state == Call.State.ENDED:
                return
            try:
                info = get_channel(channel_id)
            except Exception:
                continue
            if info is None:
                if call.state != Call.State.ENDED:
                    outcome = Call.Outcome.BUSY if not call.answered_at else ""
                    hangup_call(call, outcome=outcome)
                return
            state = (info.get("state") or "").lower()
            if state in {"ring", "ringing"} and call.state == Call.State.INITIATING:
                call.state = Call.State.RINGING
                call.ringing_at = timezone.now()
                call.save(update_fields=["state", "ringing_at"])
                broadcast_call(call, "call.ringing")
                saw_ring = True
            elif state == "up" and not call.answered_at:
                mark_answered(call)
        if not saw_ring:
            logger.info("ARI watch finished for call %s", call_id)

    threading.Thread(target=_run, daemon=True).start()


def hangup_channel(channel_id):
    if not channel_id:
        return
    base, auth = _cfg()
    try:
        requests.delete(f"{base}/ari/channels/{channel_id}", auth=auth, timeout=5)
    except Exception:
        logger.exception("ARI hangup failed")


def _channel_dest(channel):
    if not isinstance(channel, dict):
        return ""
    connected = (channel.get("connected") or {}).get("number") or ""
    dialplan = (channel.get("dialplan") or {}).get("exten") or ""
    caller = (channel.get("caller") or {}).get("number") or ""
    return connected or dialplan or caller


def _find_live_call(number):
    from telephony.models import Call
    from telephony.utils import normalize_phone

    dest = normalize_phone(number or "")
    if not dest:
        return None
    live = Call.objects.filter(state__in=["initiating", "ringing", "connected", "on_hold"]).order_by("-id")
    for call in live:
        phone = normalize_phone(call.phone_number)
        if phone == dest or dest.endswith(phone[-10:]) or phone.endswith(dest[-10:]):
            return call
    return None


def _handle_ari_event(event):
    from telephony.services import hangup_call, mark_answered, mark_ringing

    etype = event.get("type") or ""
    channel = event.get("channel") or event.get("peer") or {}
    name = (channel.get("name") or "") if isinstance(channel, dict) else ""
    if "gsm222" not in name:
        return
    dest = _channel_dest(channel)
    call = _find_live_call(dest)
    if not call:
        return
    state = (channel.get("state") or "").lower()
    if etype == "ChannelStateChange" and state in {"ring", "ringing"}:
        mark_ringing(call)
    elif etype in {"ChannelStateChange", "Dial"} and (
        state == "up" or (event.get("dialstatus") or "").upper() == "ANSWER"
    ):
        if not call.answered_at:
            mark_answered(call)
    elif etype in {"ChannelDestroyed", "StasisEnd"} and call.state != call.State.ENDED:
        hangup_call(call)


def start_event_listener():
    def _run():
        base, auth = _cfg()
        while True:
            try:
                response = requests.get(
                    f"{base}/ari/events",
                    auth=auth,
                    params={"app": "procaller", "subscribeAll": "true"},
                    stream=True,
                    timeout=90,
                )
                if not response.ok:
                    logger.warning("ARI events HTTP %s", response.status_code)
                    time.sleep(3)
                    continue
                logger.info("ARI event stream connected")
                for raw in response.iter_lines():
                    if not raw:
                        continue
                    try:
                        event = json.loads(raw)
                    except Exception:
                        continue
                    if isinstance(event, dict):
                        try:
                            _handle_ari_event(event)
                        except Exception:
                            logger.exception("ARI event handler failed")
            except Exception:
                logger.warning("ARI event stream disconnected")
                time.sleep(3)

    threading.Thread(target=_run, daemon=True).start()
