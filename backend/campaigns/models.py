import uuid

from django.conf import settings
from django.db import models


def hold_audio_upload_to(instance, filename):
    return f"hold_audio/{instance.id or 'new'}/{uuid.uuid4().hex}.mp3"


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        RUNNING = "running", "Running"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    class DialMethod(models.TextChoices):
        MANUAL = "manual", "Manual"
        PREVIEW = "preview", "Preview"
        PROGRESSIVE = "progressive", "Progressive"
        POWER = "power", "Power"
        PREDICTIVE = "predictive", "Predictive"
        RATIO = "ratio", "Ratio"

    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    dial_method = models.CharField(max_length=20, choices=DialMethod.choices, default=DialMethod.MANUAL)
    caller_id = models.CharField(max_length=32, blank=True, default="")
    caller_id_name = models.CharField(max_length=80, blank=True, default="ProCaller")
    active = models.BooleanField(default=True)
    agency = models.ForeignKey(
        "accounts.Organization", null=True, blank=True, on_delete=models.CASCADE, related_name="campaigns"
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="managed_campaigns"
    )
    admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="admin_campaigns"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_campaigns"
    )
    assigned_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="assigned_campaigns"
    )
    hold_audio = models.FileField(upload_to=hold_audio_upload_to, blank=True, null=True)
    code = models.CharField(max_length=32, blank=True, default="")
    wrap_up_seconds = models.PositiveIntegerField(default=30)
    dial_ratio = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
