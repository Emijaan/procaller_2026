from django.conf import settings
from django.db import models


class Contact(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=32, db_index=True)
    email = models.EmailField(blank=True, default="")
    company = models.CharField(max_length=160, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts"
    )
    campaign = models.ForeignKey(
        "campaigns.Campaign", null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts"
    )
    tags = models.JSONField(default=list, blank=True)
    lead_score = models.PositiveSmallIntegerField(default=50)
    comments = models.TextField(blank=True, default="")
    last_disposition = models.CharField(max_length=64, blank=True, default="")
    last_contact_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class FollowUp(models.Model):
    class Status(models.TextChoices):
        DUE = "due", "Due"
        UPCOMING = "upcoming", "Upcoming"
        OVERDUE = "overdue", "Overdue"
        DONE = "done", "Done"

    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="followups")
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="followups")
    reason = models.CharField(max_length=255)
    due_at = models.DateTimeField()
    priority = models.CharField(max_length=16, default="Medium")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPCOMING)
    created_at = models.DateTimeField(auto_now_add=True)
