import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def call_recording_upload_to(instance, filename):
    ext = (filename.rsplit(".", 1)[-1] if "." in (filename or "") else "webm").lower()
    if ext not in {"webm", "ogg", "wav", "mp3", "m4a"}:
        ext = "webm"
    day = timezone.now().strftime("%Y/%m/%d")
    return f"recordings/{day}/{instance.id or uuid.uuid4().hex}.{ext}"


class AgentSession(models.Model):
    class Status(models.TextChoices):
        READY = "ready", "Ready"
        PAUSED = "paused", "Paused"
        INCALL = "incall", "In Call"
        ENDED = "ended", "Ended"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="agent_sessions")
    campaign = models.ForeignKey("campaigns.Campaign", null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.READY)
    room_id = models.CharField(max_length=64, unique=True)
    started_at = models.DateTimeField(auto_now_add=True)
    last_heartbeat = models.DateTimeField(auto_now=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]


class Call(models.Model):
    class Direction(models.TextChoices):
        OUTBOUND = "Outbound", "Outbound"
        INBOUND = "Inbound", "Inbound"

    class State(models.TextChoices):
        INITIATING = "initiating", "Initiating"
        RINGING = "ringing", "Ringing"
        CONNECTED = "connected", "Connected"
        ON_HOLD = "on_hold", "On Hold"
        ENDED = "ended", "Ended"

    class Outcome(models.TextChoices):
        CONNECTED = "Connected", "Connected"
        NO_ANSWER = "No Answer", "No Answer"
        BUSY = "Busy", "Busy"
        FAILED = "Failed", "Failed"
        CANCELLED = "Cancelled", "Cancelled"

    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calls")
    contact = models.ForeignKey("crm.Contact", null=True, blank=True, on_delete=models.SET_NULL, related_name="calls")
    campaign = models.ForeignKey("campaigns.Campaign", null=True, blank=True, on_delete=models.SET_NULL)
    session = models.ForeignKey(AgentSession, null=True, blank=True, on_delete=models.SET_NULL)
    phone_number = models.CharField(max_length=32)
    direction = models.CharField(max_length=16, choices=Direction.choices, default=Direction.OUTBOUND)
    state = models.CharField(max_length=16, choices=State.choices, default=State.INITIATING)
    outcome = models.CharField(max_length=20, choices=Outcome.choices, blank=True, default="")
    disposition = models.CharField(max_length=64, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    muted = models.BooleanField(default=False)
    on_hold = models.BooleanField(default=False)
    recording = models.BooleanField(default=False)
    recording_file = models.FileField(upload_to=call_recording_upload_to, blank=True, null=True)
    recording_bytes = models.PositiveIntegerField(default=0)
    recording_mime = models.CharField(max_length=64, blank=True, default="")
    callerid_token = models.CharField(max_length=40, unique=True)
    asterisk_channel = models.CharField(max_length=128, blank=True, default="")
    media_mode = models.CharField(max_length=20, default="sandbox")
    started_at = models.DateTimeField(auto_now_add=True)
    ringing_at = models.DateTimeField(null=True, blank=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    hangup_cause = models.CharField(max_length=32, blank=True, default="")
    hold_seconds = models.PositiveIntegerField(default=0)
    hold_started_at = models.DateTimeField(null=True, blank=True)
    dial_batch = models.CharField(max_length=40, blank=True, default="", db_index=True)

    class Meta:
        ordering = ["-started_at"]

    @property
    def customer_name(self):
        return self.contact.name if self.contact_id else self.phone_number

    def mark_ended(self, outcome=""):
        self.state = self.State.ENDED
        if outcome:
            self.outcome = outcome
        elif not self.outcome:
            self.outcome = self.Outcome.CONNECTED if self.answered_at else self.Outcome.CANCELLED
        self.ended_at = timezone.now()
        start = self.answered_at or self.started_at
        self.duration_seconds = max(0, int((self.ended_at - start).total_seconds()))
        if self.hold_started_at:
            self.hold_seconds += max(0, int((self.ended_at - self.hold_started_at).total_seconds()))
            self.hold_started_at = None
        if not self.hangup_cause:
            if self.answered_at or self.outcome == self.Outcome.CONNECTED:
                self.hangup_cause = "ANSWERED"
            elif self.outcome == self.Outcome.BUSY:
                self.hangup_cause = "BUSY"
            elif self.outcome == self.Outcome.FAILED:
                self.hangup_cause = "FAILED"
            elif self.outcome == self.Outcome.NO_ANSWER:
                self.hangup_cause = "RINGING_NO_ANSWER"
            else:
                self.hangup_cause = "CANCELLED" if not self.ringing_at else "RINGING_NO_ANSWER"
                if not self.outcome:
                    self.outcome = self.Outcome.NO_ANSWER if self.ringing_at else self.Outcome.CANCELLED
        self.save()


class AgentModeSession(models.Model):
    class Mode(models.TextChoices):
        MANUAL = "manual", "Manual"
        PREVIEW = "preview", "Preview Auto"
        BREAK = "break", "Break"
        OFFLINE = "offline", "Offline"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mode_sessions")
    campaign = models.ForeignKey("campaigns.Campaign", null=True, blank=True, on_delete=models.SET_NULL)
    mode = models.CharField(max_length=16, choices=Mode.choices, default=Mode.OFFLINE)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default="")
    dial_ratio = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["user", "ended_at"]),
            models.Index(fields=["mode", "ended_at"]),
        ]
