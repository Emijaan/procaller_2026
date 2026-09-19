import logging
import socket
import threading
import time
import uuid

from django.conf import settings

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
        self._read_block()
        reply = self.send({"Action": "Login", "Username": cfg["user"], "Secret": cfg["secret"], "Events": "on"})
        if reply.get("Response") != "Success":
            raise RuntimeError(f"AMI login failed: {reply}")
        self.sock.settimeout(1.0)
        self._alive = True
        thread = threading.Thread(target=self._listen, daemon=True)
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
                msg[key.strip()] = val.strip()
        return msg

    def _listen(self):
        buf = b""
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


def originate_to_conference(number, conference, callerid_token, call_id, timeout=60):
    ami = get_ami()
    reply = ami.send(
        {
            "Action": "Originate",
            "Channel": f"Local/{number}@procaller-outbound",
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


def _handle_event(msg):
    event = msg.get("Event")
    if event not in {"Newstate", "Hangup", "OriginateResponse"}:
        return
    from telephony.models import Call
    from telephony.realtime import broadcast_call
    from telephony.services import hangup_call, mark_answered
    from django.utils import timezone

    call = None
    token = msg.get("CallerIDName") or msg.get("ConnectedLineName") or ""
    var = msg.get("Variable") or msg.get("ChanVariable(PROCALLER_ID)") or ""
    if token.startswith("P"):
        call = Call.objects.filter(callerid_token=token).order_by("-id").first()
    if not call and msg.get("Channel"):
        call = Call.objects.filter(asterisk_channel=msg["Channel"]).first()
    if event == "OriginateResponse" and msg.get("Uniqueid"):
        # Uniqueid matching is weak; store channel when we have ActionID later
        pass
    if not call:
        return

    channel = msg.get("Channel") or ""
    if channel and "procaller-outbound" in channel and not call.asterisk_channel:
        call.asterisk_channel = channel
        call.save(update_fields=["asterisk_channel"])

    state = msg.get("ChannelStateDesc") or msg.get("ChannelState") or ""
    if event == "Newstate" and state == "Ringing" and call.state == Call.State.INITIATING:
        call.state = Call.State.RINGING
        call.ringing_at = timezone.now()
        call.save(update_fields=["state", "ringing_at"])
        broadcast_call(call, "call.ringing")
    elif event == "Newstate" and state == "Up" and call.state != Call.State.ENDED:
        if not call.answered_at:
            mark_answered(call)
    elif event == "Hangup" and "procaller-outbound" in channel and call.state != Call.State.ENDED:
        hangup_call(call)
    elif event == "OriginateResponse" and msg.get("Response") == "Failure" and call.state != Call.State.ENDED:
        hangup_call(call, outcome=Call.Outcome.FAILED)


def start_listener():
    if (getattr(settings, "TELEPHONY_BACKEND", "") or "").lower() != "asterisk":
        return

    def _retry():
        for attempt in range(6):
            try:
                get_ami()
                return
            except Exception:
                logger.warning("AMI connect attempt %s failed", attempt + 1)
                time.sleep(3)

    threading.Thread(target=_retry, daemon=True).start()
