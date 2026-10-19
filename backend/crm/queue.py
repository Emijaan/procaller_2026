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


def set_leads_callable(qs, active):
    """Turn auto-dial on or off. A live call is left alone; it will not be dialed again."""
    from telephony.models import Call

    ids = list(qs.values_list("id", flat=True))
    if not ids:
        return 0
    if active:
        Contact.objects.filter(pk__in=ids).update(status=Contact.Status.ACTIVE)
        return len(ids)
    live = Call.objects.filter(
        contact_id__in=ids, state__in=["initiating", "ringing", "connected", "on_hold"]
    ).values_list("contact_id", flat=True)
    Contact.objects.filter(pk__in=ids).update(status=Contact.Status.INACTIVE)
    quiet = Contact.objects.filter(pk__in=ids).exclude(pk__in=live)
    quiet.update(reserved_by=None, reserved_until=None)
    quiet.filter(lead_status=Contact.LeadStatus.CALLING, owner__isnull=False).update(
        lead_status=Contact.LeadStatus.ASSIGNED
    )
    quiet.filter(lead_status=Contact.LeadStatus.CALLING, owner__isnull=True).update(
        lead_status=Contact.LeadStatus.NEW
    )
    return len(ids)


def contacts_for_import_job(job):
    """Leads that belong to an upload.

    Newer imports store the file on each lead. An older upload did not, so when
    that file is the only one on the campaign, the campaign's unlinked leads are
    that file.
    """
    from .models import ImportJob

    linked = Contact.objects.filter(import_job=job)
    if not job.campaign_id:
        return linked
    others = ImportJob.objects.filter(campaign_id=job.campaign_id, status=ImportJob.Status.DONE).exclude(pk=job.pk)
    if others.exists():
        return linked
    return Contact.objects.filter(campaign_id=job.campaign_id).filter(Q(import_job=job) | Q(import_job__isnull=True))


def delete_leads(qs):
    """Remove leads completely. A lead on a live call is left in place. Call history stays."""
    from telephony.models import Call

    from .models import FollowUp

    ids = list(qs.values_list("id", flat=True))
    if not ids:
        return {"deleted": 0, "skipped": 0}
    live = set(
        Call.objects.filter(contact_id__in=ids, state__in=["initiating", "ringing", "connected", "on_hold"]).values_list(
            "contact_id", flat=True
        )
    )
    removed = 0
    for lead in Contact.objects.filter(pk__in=ids).exclude(pk__in=live):
        if lead.tts_audio:
            lead.tts_audio.delete(save=False)
        FollowUp.objects.filter(contact_id=lead.id).delete()
        Call.objects.filter(contact_id=lead.id).update(contact=None)
        lead.delete()
        removed += 1
    return {"deleted": removed, "skipped": len(live)}


RELOAD_SKIP = {"NOT_DIALED", "DIALING"}
LIVE_CALL_STATES = ["initiating", "ringing", "connected", "on_hold"]


def reload_disposition_choices():
    from telephony.causes import announcement, disposition_codes

    return [
        {"code": code, "label": announcement(code) or code}
        for code in disposition_codes()
        if code not in RELOAD_SKIP
    ]


def reload_leads_for_dispositions(user, codes, leads=None):
    """Put leads with the chosen dispositions back into auto-dial. Call history stays."""
    from django.db.models import OuterRef, Subquery

    from telephony.causes import canonical_code, lead_disposition
    from telephony.models import Call

    from .models import Contact

    wanted = set()
    for code in codes or []:
        cleaned = canonical_code(code) or str(code or "").strip()
        if cleaned and cleaned not in RELOAD_SKIP:
            wanted.add(cleaned)
    if not wanted:
        raise ValueError("Select at least one disposition")

    qs = scoped_leads(user, Contact.objects.all())
    if leads is not None:
        qs = qs.filter(pk__in=leads.values("id"))

    latest = Call.objects.filter(contact_id=OuterRef("pk")).order_by("-id")
    qs = qs.annotate(
        latest_call_state=Subquery(latest.values("state")[:1]),
        latest_call_disposition=Subquery(latest.values("disposition")[:1]),
    )
    matched = []
    skipped = 0
    for lead in qs.iterator():
        if lead_disposition(lead)["disposition_code"] not in wanted:
            continue
        if lead.dnc or (lead.latest_call_state or "") in LIVE_CALL_STATES:
            skipped += 1
            continue
        matched.append(lead.id)
    if not matched:
        return {"reloaded": 0, "skipped": skipped}
    live = set(
        Call.objects.filter(contact_id__in=matched, state__in=LIVE_CALL_STATES).values_list("contact_id", flat=True)
    )
    skipped += len(live)
    ids = [pk for pk in matched if pk not in live]
    Contact.objects.filter(pk__in=ids, owner__isnull=False).update(
        status=Contact.Status.ACTIVE,
        lead_status=Contact.LeadStatus.ASSIGNED,
        reserved_by=None,
        reserved_until=None,
    )
    Contact.objects.filter(pk__in=ids, owner__isnull=True).update(
        status=Contact.Status.ACTIVE,
        lead_status=Contact.LeadStatus.NEW,
        reserved_by=None,
        reserved_until=None,
    )
    return {"reloaded": len(ids), "skipped": skipped}


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


def reserve_next_lead(user, campaign_id=None, exclude_ids=None, tts_ready=False):
    release_stale_reservations()
    now = timezone.now()
    skip = {int(pk) for pk in (exclude_ids or []) if pk}
    qs = scoped_leads(user, Contact.objects.filter(dnc=False, status=Contact.Status.ACTIVE))
    if tts_ready:
        qs = qs.filter(tts_status="ready").exclude(tts_audio="")
    if skip:
        qs = qs.exclude(pk__in=skip)
    from accounts.access import assert_can_use_campaign, is_calling_agent

    if is_calling_agent(user) and not campaign_id:
        raise ValueError("Select a campaign before calling")
    if campaign_id:
        camp = Campaign.objects.filter(pk=campaign_id).first()
        if not camp:
            raise ValueError("Campaign not found")
        assert_can_use_campaign(user, camp)
        qs = qs.filter(campaign_id=campaign_id)
    if is_calling_agent(user):
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
            if not lead or lead.dnc or lead.status != Contact.Status.ACTIVE:
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
