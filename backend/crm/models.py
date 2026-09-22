from django.conf import settings
from django.db import models


class Contact(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    class LeadStatus(models.TextChoices):
        NEW = "new", "New"
        ASSIGNED = "assigned", "Assigned"
        CALLING = "calling", "Calling"
        CONNECTED = "connected", "Connected"
        NOT_CONNECTED = "not_connected", "Not Connected"
        BUSY = "busy", "Busy"
        NO_ANSWER = "no_answer", "No Answer"
        WRONG_NUMBER = "wrong_number", "Wrong Number"
        INTERESTED = "interested", "Interested"
        NOT_INTERESTED = "not_interested", "Not Interested"
        CALLBACK = "callback", "Callback"
        PROMISE_TO_PAY = "promise_to_pay", "Promise To Pay"
        PAID = "paid", "Paid"
        COMPLETED = "completed", "Completed"
        DNC = "dnc", "DNC/Blocked"

    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=32, db_index=True)
    email = models.EmailField(blank=True, default="")
    company = models.CharField(max_length=160, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    lead_status = models.CharField(max_length=32, choices=LeadStatus.choices, default=LeadStatus.NEW, db_index=True)
    extra_data = models.JSONField(default=dict, blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts"
    )
    assigned_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="admin_leads"
    )
    agency = models.ForeignKey(
        "accounts.Organization", null=True, blank=True, on_delete=models.CASCADE, related_name="leads"
    )
    campaign = models.ForeignKey(
        "campaigns.Campaign", null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts"
    )
    next_callback_at = models.DateTimeField(null=True, blank=True, db_index=True)
    call_count = models.PositiveIntegerField(default=0)
    dnc = models.BooleanField(default=False)
    tags = models.JSONField(default=list, blank=True)
    lead_score = models.PositiveSmallIntegerField(default=50)
    comments = models.TextField(blank=True, default="")
    last_disposition = models.CharField(max_length=64, blank=True, default="")
    last_contact_at = models.DateTimeField(null=True, blank=True)
    reserved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="reserved_leads"
    )
    reserved_until = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["agency", "campaign", "lead_status"]),
            models.Index(fields=["agency", "phone"]),
            models.Index(fields=["owner", "lead_status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.phone})"


class ImportJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PREVIEW = "preview", "Preview"
        IMPORTING = "importing", "Importing"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"

    agency = models.ForeignKey("accounts.Organization", null=True, blank=True, on_delete=models.CASCADE)
    campaign = models.ForeignKey("campaigns.Campaign", on_delete=models.CASCADE, related_name="import_jobs")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    file_name = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    mapping = models.JSONField(default=dict, blank=True)
    total_rows = models.PositiveIntegerField(default=0)
    valid_rows = models.PositiveIntegerField(default=0)
    invalid_rows = models.PositiveIntegerField(default=0)
    duplicate_rows = models.PositiveIntegerField(default=0)
    imported_rows = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


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
