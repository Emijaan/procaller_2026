import logging
import socket
import threading
import time
import uuid

from django.conf import settings

from telephony.pstn import ami_pstn_channel

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_client = None


def _cfg():
    ast = settings.ASTERISK
    return {
        "host": ast.get("AMI_HOST") or ast.get("SIP_DOMAIN") or "127.0.0.1",
        "port": int(ast.get("AMI_PORT") or 5038),
        "user": ast.get("AMI_USER") or "procaller",
        "secret": ast.get("AMI_SECRET") or ast.get("ARI_PASSWORD") or "",
    }


class AmiClient:
    def __init__(self):
        self.sock = None
        self._write_lock = threading.Lock()
        self._alive = False
        self._pending = {}
        self._on_event = None

    def connect(self):
        cfg = _cfg()
        self.sock = socket.create_connection((cfg["host"], cfg["port"]), timeout=8)
        self.sock.settimeout(8.0)
        self._read_until(b"\r\n")
        action_id = uuid.uuid4().hex
        login = (
            f"Action: Login\r\nUsername: {cfg['user']}\r\nSecret: {cfg['secret']}\r\n"
            f"Events: on\r\nActionID: {action_id}\r\n\r\n"
        )
        self.sock.sendall(login.encode("utf-8"))
        block, leftover = self._read_until(b"\r\n\r\n")
        reply = self._parse(block.decode("utf-8", "replace"))
        if reply.get("Response") != "Success":
            raise RuntimeError(f"AMI login failed: {reply.get('Message') or reply.get('Response')}")
        self.sock.settimeout(1.0)
        self._alive = True
        thread = threading.Thread(target=self._listen, args=(leftover,), daemon=True)
        thread.start()
        logger.info("AMI connected to %s:%s", cfg["host"], cfg["port"])

    def send(self, fields, wait=True, timeout=8):
        action_id = fields.setdefault("ActionID", uuid.uuid4().hex)
        waiter = threading.Event()
        box = {}
        if wait:
            self._pending[action_id] = (waiter, box)
        payload = "".join(f"{k}: {v}\r\n" for k, v in fields.items()) + "\r\n"
        with self._write_lock:
            self.sock.sendall(payload.encode("utf-8"))
        if not wait:
            return {}
        if not waiter.wait(timeout):
            self._pending.pop(action_id, None)
            raise TimeoutError(f"AMI timeout waiting for {fields.get('Action')}")
        return box.get("msg", {})

    def _read_until(self, marker):
        data = b""
        while marker not in data:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("AMI closed")
            data += chunk
        head, tail = data.split(marker, 1)
        return head + marker, tail

    def _read_block(self):
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("AMI closed")
            data += chunk
        text = data.decode("utf-8", "replace")
        return self._parse(text)

    def _parse(self, text):
        msg = {}
        for line in text.split("\r\n"):
            if ":" in line:
                key, val = line.split(":", 1)
                key, val = key.strip(), val.strip()
                if key in msg:
                    prev = msg[key]
                    if isinstance(prev, list):
                        prev.append(val)
                    else:
                        msg[key] = [prev, val]
                else:
                    msg[key] = val
        return msg

    def _listen(self, buf=b""):
        while self._alive:
            try:
                chunk = self.sock.recv(4096)
            except socket.timeout:
                continue
            except Exception:
                logger.exception("AMI listener stopped")
                self._alive = False
                return
            if not chunk:
                self._alive = False
                return
            buf += chunk
            while b"\r\n\r\n" in buf:
                raw, buf = buf.split(b"\r\n\r\n", 1)
                msg = self._parse(raw.decode("utf-8", "replace"))
                action_id = msg.get("ActionID")
                if action_id in self._pending:
                    waiter, box = self._pending.pop(action_id)
                    box["msg"] = msg
                    waiter.set()
                elif self._on_event and msg.get("Event"):
                    try:
                        self._on_event(msg)
                    except Exception:
                        logger.exception("AMI event handler failed")


def get_ami():
    global _client
    with _lock:
        if _client and _client._alive:
            return _client
        client = AmiClient()
        client.connect()
        client._on_event = _handle_event
        _client = client
        return _client


def cli_output(command, timeout=8):
    ami = get_ami()
    reply = ami.send({"Action": "Command", "Command": command}, timeout=timeout)
    output = reply.get("Output")
    if isinstance(output, list):
        return "\n".join(output)
    return output or reply.get("Message") or ""


def originate_playback(number, wav_path, callerid_token, call_id, dial_prefix="", timeout=60):
    """Dial the customer. Playback runs only after answer, then Asterisk hangs the call up."""
    stem = str(wav_path)
    if stem.lower().endswith(".wav"):
        stem = stem[:-4]
    ami = get_ami()
    reply = ami.send(
        {
            "Action": "Originate",
            "Channel": ami_pstn_channel(number, dial_prefix=dial_prefix),
            "Application": "Playback",
            "Data": stem,
            "CallerID": f'"{callerid_token}" <{number}>',
            "Timeout": str(int(timeout) * 1000),
            "Async": "true",
            "ActionID": f"ibr-{call_id}",
            "Variable": f"PROCALLER_ID={call_id}",
        }
    )
    if reply.get("Response") == "Error":
        raise RuntimeError(reply.get("Message") or "AMI playback originate failed")
    return reply


def originate_to_conference(number, conference, callerid_token, call_id, timeout=60, dial_prefix=""):
    ami = get_ami()
    reply = ami.send(
        {
            "Action": "Originate",
            "Channel": ami_pstn_channel(number, dial_prefix=dial_prefix),
            "Context": "procaller-agent",
            "Exten": conference,
            "Priority": "1",
            "CallerID": f'"{callerid_token}" <{number}>',
            "Timeout": str(int(timeout) * 1000),
            "Async": "true",
            "Variable": f"PROCALLER_ID={call_id}",
        }
    )
    if reply.get("Response") == "Error":
        raise RuntimeError(reply.get("Message") or "AMI originate failed")
    return reply


def hangup_channel(channel):
    if not channel:
        return
    ami = get_ami()
    try:
        ami.send({"Action": "Hangup", "Channel": channel}, timeout=5)
    except Exception:
        logger.exception("AMI hangup failed for %s", channel)


def _event_token(msg):
    for key in ("Token", "CallerIDName", "ConnectedLineName"):
        token = msg.get(key) or ""
        if isinstance(token, list):
            token = token[0] if token else ""
        token = str(token).strip().strip('"')
        if token.startswith("P"):
            return token
    return ""


def _customer_channel(call, channel):
    if not channel:
        return False
    low = channel.lower()
    if "confbridge" in low:
        return False
    if "procaller-outbound" in low or "gsm" in low or low.startswith("local/"):
        return True
    phone = "".join(ch for ch in (call.phone_number or "") if ch.isdigit())[-10:]
    return bool(phone and phone in "".join(ch for ch in low if ch.isdigit()))


def _extension_from_channel(channel):
    import re

    match = re.search(r"PJSIP/(\d+)-", channel or "")
    return match.group(1) if match else ""


def _live_call_for_extension(extension):
    from django.db.models import Q

    from accounts.models import User
    from telephony.models import Call

    if not extension:
        return None
    user = User.objects.filter(Q(extension=extension) | Q(sip_username=extension)).order_by("-id").first()
    if not user:
        return None
    return (
        Call.objects.filter(agent=user, state__in=[Call.State.INITIATING, Call.State.RINGING])
        .order_by("-id")
        .first()
    )


def _find_call(msg):
    from telephony.models import Call

    action = str(msg.get("ActionID") or "")
    if action.startswith("ibr-"):
        try:
            call = Call.objects.filter(pk=int(action[4:])).order_by("-id").first()
        except ValueError:
            call = None
        if call:
            return call
    token = _event_token(msg)
    if token:
        call = Call.objects.filter(callerid_token=token).order_by("-id").first()
        if call:
            return call
    for key in ("Channel", "DestChannel"):
        channel = msg.get(key) or ""
        if channel:
            # Asterisk restarts its channel counter, so an ended call can share this name.
            call = (
                Call.objects.filter(asterisk_channel=channel)
                .exclude(state=Call.State.ENDED)
                .order_by("-id")
                .first()
            )
            if call:
                return call
    return None


def _handle_event(msg):
    event = msg.get("Event")
    if event == "UserEvent" and msg.get("UserEvent") != "ProCallerDial":
        return
    if event == "VarSet" and str(msg.get("Variable") or "") == "PROCALLER_ID":
        from telephony.models import Call

        try:
            call = Call.objects.filter(pk=int(msg.get("Value") or 0)).first()
        except ValueError:
            return
        channel = msg.get("Channel") or ""
        if call and channel and not call.asterisk_channel:
            call.asterisk_channel = channel
            call.save(update_fields=["asterisk_channel"])
        return
    if event not in {"Newstate", "Hangup", "OriginateResponse", "DialEnd", "UserEvent"}:
        return
    from telephony.models import Call
    from telephony.realtime import broadcast_call
    from telephony.services import hangup_call, mark_answered
    from django.utils import timezone

    call = _find_call(msg)
    if event == "DialEnd" and not call and "gsm" in str(msg.get("DestChannel") or "").lower():
        call = _live_call_for_extension(_extension_from_channel(msg.get("Channel") or ""))
    if not call:
        return

    channel = msg.get("DestChannel") or msg.get("Channel") or ""
    if channel and _customer_channel(call, channel) and not call.asterisk_channel:
        call.asterisk_channel = channel
        call.save(update_fields=["asterisk_channel"])

    state = msg.get("ChannelStateDesc") or msg.get("ChannelState") or ""
    if event == "Newstate" and state == "Ringing" and call.state == Call.State.INITIATING and _customer_channel(call, channel):
        call.state = Call.State.RINGING
        call.ringing_at = timezone.now()
        call.save(update_fields=["state", "ringing_at"])
        broadcast_call(call, "call.ringing")
    elif event == "Newstate" and state == "Up" and call.state != Call.State.ENDED and _customer_channel(call, channel):
        if not call.answered_at:
            mark_answered(call)
    elif event == "Hangup" and _customer_channel(call, channel):
        hangup_call(call, cause_code=msg.get("Cause") or "", cause_text=msg.get("Cause-txt") or "")
    elif event == "DialEnd":
        status = (msg.get("DialStatus") or "").upper()
        if status == "ANSWER" and call.state != Call.State.ENDED and not call.answered_at:
            mark_answered(call)
        elif status and status != "ANSWER":
            hangup_call(call, dial_status=status)
    elif event == "UserEvent":
        status = (msg.get("Status") or "").upper()
        cause = msg.get("Cause") or ""
        if status == "ANSWER" and not call.answered_at:
            mark_answered(call)
            call.refresh_from_db()
        hangup_call(call, cause_code=cause, dial_status=status)
    elif event == "OriginateResponse" and msg.get("Response") == "Failure":
        hangup_call(call, originate_reason=str(msg.get("Reason") or ""))


def start_listener():
    if (getattr(settings, "TELEPHONY_BACKEND", "") or "").lower() != "asterisk":
        return

    def _retry():
        for attempt in range(6):
            try:
                get_ami()
                return
            except Exception as exc:
                logger.warning("AMI connect attempt %s failed: %s", attempt + 1, exc)
                time.sleep(3)

    threading.Thread(target=_retry, daemon=True).start()
