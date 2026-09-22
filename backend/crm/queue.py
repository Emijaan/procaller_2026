from datetime import timedelta
import re

from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from accounts.access import scoped_leads
from campaigns.models import Campaign

from .models import Contact

RESERVE_SECONDS = 45
CALLABLE = ["new", "assigned", "not_connected", "busy", "no_answer"]


def release_stale_reservations():
    now = timezone.now()
    expired = Contact.objects.filter(reserved_until__lt=now).exclude(reserved_by=None)
    for lead in expired:
        if lead.lead_status == Contact.LeadStatus.CALLING:
            lead.lead_status = Contact.LeadStatus.ASSIGNED if lead.owner_id else Contact.LeadStatus.NEW
        lead.reserved_by = None
        lead.reserved_until = None
        lead.save(update_fields=["lead_status", "reserved_by", "reserved_until", "updated_at"])


def release_lead(lead, status=None):
    if not lead:
        return
    lead.reserved_by = None
    lead.reserved_until = None
    fields = ["reserved_by", "reserved_until", "updated_at"]
    if status:
        lead.lead_status = status
        fields.append("lead_status")
    lead.save(update_fields=fields)


def reserve_next_lead(user, campaign_id=None, exclude_ids=None):
    release_stale_reservations()
    now = timezone.now()
    skip = {int(pk) for pk in (exclude_ids or []) if pk}
    qs = scoped_leads(user, Contact.objects.filter(dnc=False, status=Contact.Status.ACTIVE))
    if skip:
        qs = qs.exclude(pk__in=skip)
    if campaign_id:
        camp = Campaign.objects.filter(pk=campaign_id).first()
        if not camp:
            raise ValueError("Campaign not found")
        if not camp.active and camp.status not in {Campaign.Status.ACTIVE, Campaign.Status.RUNNING}:
            raise ValueError("Campaign is not active")
        qs = qs.filter(campaign_id=campaign_id)
        if getattr(user, "normalized_role", user.role) == "user":
            assigned = camp.assigned_users.filter(pk=user.id).exists()
            if not assigned and camp.assigned_users.exists():
                raise ValueError("You are not assigned to this campaign")
    if getattr(user, "normalized_role", user.role) == "user":
        qs = qs.filter(Q(owner=user) | Q(owner__isnull=True) | Q(campaign__assigned_users=user))

    due_ids = list(
        qs.filter(lead_status=Contact.LeadStatus.CALLBACK, next_callback_at__lte=now)
        .order_by("next_callback_at")
        .values_list("id", flat=True)[:25]
    )
    pool_ids = list(
        qs.filter(
            Q(lead_status__in=CALLABLE)
            | Q(lead_status=Contact.LeadStatus.CALLING, reserved_until__lt=now)
            | Q(lead_status=Contact.LeadStatus.CALLING, reserved_by=user)
        )
        .order_by("call_count", "id")
        .values_list("id", flat=True)[:50]
    )
    ordered = due_ids + [pk for pk in pool_ids if pk not in due_ids]

    with transaction.atomic():
        for pk in ordered:
            if pk in skip:
                continue
            locked = Contact.objects.filter(pk=pk)
            if connection.features.has_select_for_update_skip_locked:
                locked = locked.select_for_update(skip_locked=True)
            elif connection.features.has_select_for_update:
                locked = locked.select_for_update()
            lead = locked.first()
            if not lead or lead.dnc:
                continue
            if lead.reserved_by_id and lead.reserved_by_id != user.id and lead.reserved_until and lead.reserved_until > now:
                continue
            lead.reserved_by = user
            lead.reserved_until = now + timedelta(seconds=RESERVE_SECONDS)
            if not lead.owner_id:
                lead.owner = user
            lead.lead_status = Contact.LeadStatus.CALLING
            lead.save(update_fields=["reserved_by", "reserved_until", "owner", "lead_status", "updated_at"])
            return lead
    return None


def _phone_digits(value):
    return re.sub(r"\D+", "", value or "")


def lookup_lead_by_phone(user, phone, campaign_id=None):
    raw = _phone_digits(phone)
    if raw.startswith("91") and len(raw) == 12:
        raw = raw[2:]
    if raw.startswith("0") and len(raw) == 11:
        raw = raw[1:]
    if len(raw) < 8:
        return None
    tail = raw[-10:]
    hint = tail[-7:]
    qs = scoped_leads(user, Contact.objects.select_related("campaign", "owner")).filter(dnc=False)
    candidates = list(qs.filter(phone__icontains=hint)[:80])

    def stored_digits(lead):
        digits = _phone_digits(lead.phone)
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        return digits

    def phones_match(lead):
        digits = stored_digits(lead)
        if len(digits) < 8:
            return False
        last = digits[-10:]
        return last == tail or tail.endswith(last) or last.endswith(tail)

    matches = [lead for lead in candidates if phones_match(lead)]
    if not matches:
        return None

    def rank(lead):
        camp = 0 if campaign_id and str(lead.campaign_id) == str(campaign_id) else 1
        return (camp, lead.id)

    return sorted(matches, key=rank)[0]
