from django.db import models


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RUNNING = "running", "Running"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    class DialMethod(models.TextChoices):
        MANUAL = "manual", "Manual"
        PREVIEW = "preview", "Preview"
        PROGRESSIVE = "progressive", "Progressive"
        RATIO = "ratio", "Ratio"

    name = models.CharField(max_length=160)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RUNNING)
    dial_method = models.CharField(max_length=20, choices=DialMethod.choices, default=DialMethod.MANUAL)
    caller_id = models.CharField(max_length=32, blank=True, default="")
    caller_id_name = models.CharField(max_length=80, blank=True, default="ProCaller")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name
