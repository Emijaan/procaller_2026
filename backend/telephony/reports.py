import csv
from datetime import datetime, time as dtime, timedelta
from io import BytesIO, StringIO

from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from openpyxl import Workbook
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import (
    agency_of,
    descendant_ids,
    has_perm,
    is_super_admin,
    require_perm,
    role_of,
    scoped_calls,
    scoped_campaigns,
    scoped_leads,
    scoped_users,
)
from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import AgentModeSession, Call
from telephony.modes import day_bounds, mode_totals
from telephony.causes import LEGACY_CODES, announcement, canonical_code, disposition_codes
from telephony.utils import format_duration

CALL_STATES = {"initiating", "ringing", "connected", "on_hold", "ended"}
ROLE_FILTERS = {
    "super_admin": ["super_admin"],
    "agency": ["agency"],
    "manager": ["manager", "supervisor"],
    "admin": ["admin"],
    "user": ["user", "agent"],
}
CONNECTED_Q = Q(disposition__in=["Connected", "CONNECTED"]) | (
    Q(hangup_cause__in=["ANSWERED", "CONNECTED"]) & Q(answered_at__isnull=False) & Q(disposition__in=["", "Connected", "CONNECTED"])
)


def _param_id(params, key):
    raw = params.get(key)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return False


def _can_report(user):
    if has_perm(user, "view_reports") or has_perm(user, "view_call_logs"):
        return
    require_perm(user, "view_reports")


def _parse_range(params, default_today=True):
    """Return (start, end). None means that side is open. Both None means every date."""
    if str(params.get("dates") or "").lower() == "all":
        return None, None
    raw_from = params.get("from")
    raw_to = params.get("to")
    if not raw_from and not raw_to:
        return day_bounds() if default_today else (None, None)
    start = end = None
    if raw_from:
        day = parse_date(str(raw_from)[:10])
        if day:
            start = timezone.make_aware(datetime.combine(day, dtime.min))
    if raw_to:
        day = parse_date(str(raw_to)[:10])
        if day:
            end = timezone.make_aware(datetime.combine(day, dtime.min)) + timedelta(days=1)
    return start, end


def _bounds_or_all(start, end):
    if start is None:
        start = timezone.make_aware(datetime(2000, 1, 1))
    if end is None:
        end = timezone.now() + timedelta(days=1)
    return start, end


def _wanted_dispositions(params):
    raw_values = []
    getter = getattr(params, "getlist", None)
    if getter:
        raw_values.extend(getter("disposition"))
    else:
        raw_values.append(params.get("disposition") or "")
    codes = []
    seen = set()
    for raw in raw_values:
        for piece in str(raw or "").split(","):
            text = piece.strip()
            if not text:
                continue
            code = canonical_code(text)
            if code and code not in seen:
                seen.add(code)
                codes.append(code)
    return codes


def _alias_values(code):
    values = {code}
    for legacy, mapped in LEGACY_CODES.items():
        if mapped == code:
            values.add(legacy)
    return values


def _apply_disposition(qs, codes):
    if not codes:
        return qs
    query = Q()
    for code in codes:
        values = _alias_values(code)
        part = Q(disposition__in=values) | Q(outcome__in=values) | Q(hangup_cause__in=values)
        if code == "CONNECTED":
            part &= Q(answered_at__isnull=False)
        elif code == "UNKNOWN_UNCLASSIFIED":
            part |= Q(disposition__in=["Connected", "CONNECTED"], answered_at__isnull=True)
        query |= part
    return qs.filter(query)


def _report_files(user):
    from crm.models import ImportJob

    qs = ImportJob.objects.filter(status=ImportJob.Status.DONE).select_related("campaign")
    if is_super_admin(user):
        return qs.order_by("-id")
    org = agency_of(user)
    if not org:
        return qs.none()
    qs = qs.filter(Q(agency=org) | Q(campaign__agency=org))
    if role_of(user) in {User.Role.AGENCY, User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPERVISOR}:
        return qs.order_by("-id")
    return qs.filter(campaign__assigned_users=user).distinct().order_by("-id")


def _scoped_person(user, person_id, roles):
    if person_id is False:
        return None
    if not person_id:
        return None
    person = scoped_users(user).filter(pk=person_id, role__in=roles).first()
    return person


def _scoped_report_calls(user, params, default_today=True):
    qs = scoped_calls(
        user,
        Call.objects.select_related(
            "agent",
            "agent__organization",
            "agent__reports_to",
            "campaign",
            "campaign__agency",
            "campaign__manager",
            "contact",
            "contact__import_job",
        ),
    )
    start, end = _parse_range(params, default_today=default_today)
    if start is not None:
        qs = qs.filter(started_at__gte=start)
    if end is not None:
        qs = qs.filter(started_at__lt=end)
    campaign_id = _param_id(params, "campaign")
    if campaign_id is False or (
        campaign_id and not scoped_campaigns(user, Campaign.objects.filter(pk=campaign_id)).exists()
    ):
        qs = qs.none()
    elif campaign_id:
        qs = qs.filter(campaign_id=campaign_id)
    user_id = _param_id(params, "user")
    if user_id is False or (user_id and not scoped_users(user).filter(pk=user_id).exists()):
        qs = qs.none()
    elif user_id:
        qs = qs.filter(agent_id=user_id)
    agency_id = _param_id(params, "agency")
    if agency_id is False:
        qs = qs.none()
    elif agency_id and is_super_admin(user):
        qs = qs.filter(Q(agent__organization_id=agency_id) | Q(campaign__agency_id=agency_id))
    manager = _scoped_person(user, _param_id(params, "manager"), ("manager", "supervisor"))
    if _param_id(params, "manager") is False or (_param_id(params, "manager") and not manager):
        qs = qs.none()
    elif manager:
        tree = descendant_ids(manager)
        qs = qs.filter(Q(agent_id__in=tree) | Q(campaign__manager_id=manager.id))
    admin = _scoped_person(user, _param_id(params, "admin"), ("admin",))
    if _param_id(params, "admin") is False or (_param_id(params, "admin") and not admin):
        qs = qs.none()
    elif admin:
        qs = qs.filter(Q(agent_id=admin.id) | Q(agent__reports_to=admin) | Q(campaign__admin_id=admin.id))
    wanted_role = (params.get("role") or "").strip().lower()
    if wanted_role:
        roles = ROLE_FILTERS.get(wanted_role)
        if not roles:
            qs = qs.none()
        else:
            qs = qs.filter(agent__role__in=roles)
    if params.get("outcome"):
        qs = qs.filter(Q(outcome__iexact=params.get("outcome")) | Q(hangup_cause__iexact=params.get("outcome")))
    qs = _apply_disposition(qs, _wanted_dispositions(params))
    file_id = _param_id(params, "import_job")
    if file_id is False or (file_id and not _report_files(user).filter(pk=file_id).exists()):
        qs = qs.none()
    elif file_id:
        qs = qs.filter(contact__import_job_id=file_id)
    status = (params.get("status") or "").strip()
    if status.lower() in CALL_STATES:
        qs = qs.filter(state=status.lower())
    elif status:
        qs = qs.filter(Q(disposition__iexact=status) | Q(outcome__iexact=status) | Q(hangup_cause__iexact=status))
    phone = (params.get("phone") or "").strip()
    if phone:
        qs = qs.filter(phone_number__icontains=phone)
    role = role_of(user)
    if role in {"user", "agent"}:
        qs = qs.filter(agent=user)
    return qs, start, end


def _filtered_agents(user, params):
    agents = scoped_users(user)
    if role_of(user) in {"user", "agent"}:
        agents = agents.filter(pk=user.pk)
    user_id = _param_id(params, "user")
    if user_id is False:
        return agents.none()
    if user_id:
        agents = agents.filter(pk=user_id)
    agency_id = _param_id(params, "agency")
    if agency_id is False:
        return agents.none()
    if agency_id and is_super_admin(user):
        agents = agents.filter(organization_id=agency_id)
    manager = _scoped_person(user, _param_id(params, "manager"), ("manager", "supervisor"))
    if _param_id(params, "manager") is False or (_param_id(params, "manager") and not manager):
        return agents.none()
    if manager:
        agents = agents.filter(pk__in=descendant_ids(manager))
    admin = _scoped_person(user, _param_id(params, "admin"), ("admin",))
    if _param_id(params, "admin") is False or (_param_id(params, "admin") and not admin):
        return agents.none()
    if admin:
        agents = agents.filter(Q(pk=admin.id) | Q(reports_to=admin))
    wanted_role = (params.get("role") or "").strip().lower()
    if wanted_role:
        roles = ROLE_FILTERS.get(wanted_role)
        agents = agents.filter(role__in=roles) if roles else agents.none()
    return agents


def _filtered_campaigns(user, params):
    camps = scoped_campaigns(user, Campaign.objects.all())
    campaign_id = _param_id(params, "campaign")
    if campaign_id is False:
        return camps.none()
    if campaign_id:
        camps = camps.filter(pk=campaign_id)
    agency_id = _param_id(params, "agency")
    if agency_id is False:
        return camps.none()
    if agency_id and is_super_admin(user):
        camps = camps.filter(agency_id=agency_id)
    manager = _scoped_person(user, _param_id(params, "manager"), ("manager", "supervisor"))
    if _param_id(params, "manager") is False or (_param_id(params, "manager") and not manager):
        return camps.none()
    if manager:
        tree = descendant_ids(manager)
        camps = camps.filter(Q(manager_id=manager.id) | Q(admin_id__in=tree) | Q(assigned_users__in=tree)).distinct()
    admin = _scoped_person(user, _param_id(params, "admin"), ("admin",))
    if _param_id(params, "admin") is False or (_param_id(params, "admin") and not admin):
        return camps.none()
    if admin:
        camps = camps.filter(Q(admin_id=admin.id) | Q(assigned_users=admin) | Q(assigned_users__reports_to=admin)).distinct()
    return camps


def _disposition_counts(calls):
    def count(*dispositions, causes=(), outcomes=()):
        query = Q()
        if dispositions:
            query |= Q(disposition__in=dispositions)
        if causes:
            query |= Q(hangup_cause__in=causes)
        if outcomes:
            query |= Q(outcome__in=outcomes)
        return calls.filter(query).count() if query else 0

    return {
        "answered": calls.filter(CONNECTED_Q).count(),
        "busy": count("Busy", "BUSY", "BUSY_HI", "LINE_BUSY", causes=("BUSY", "LINE_BUSY", "BUSY_HI"), outcomes=("Busy", "BUSY", "BUSY_HI", "LINE_BUSY")),
        "no_answer": count("No Answer", "NO_ANSWER", causes=("NO_ANSWER", "RINGING_NO_ANSWER"), outcomes=("No Answer", "NO_ANSWER")),
        "failed": count(
            "Failed", "CALL_FAILED", "CALL_FAILED_HI", "CALL_NOT_COMPLETED", "CALL_CANNOT_BE_CONNECTED",
            "NETWORK_ERROR", "NETWORK_ERROR_HI", "NETWORK_FAILURE", "NETWORK_CONGESTION",
            causes=("FAILED", "CALL_FAILED", "NETWORK_ERROR", "NETWORK_FAILURE", "NETWORK_CONGESTION"),
            outcomes=("Failed", "CALL_FAILED", "NETWORK_ERROR", "NETWORK_FAILURE", "NETWORK_CONGESTION"),
        ),
        "switch_off": count("Switch Off", "SWITCHED_OFF", "SWITCHED_OFF_HI", causes=("SWITCH_OFF", "SWITCHED_OFF", "SWITCHED_OFF_HI")),
        "not_reachable": count("Not Reachable", "NOT_REACHABLE", "NOT_REACHABLE_HI", causes=("NOT_REACHABLE", "NOT_REACHABLE_HI")),
        "out_of_service": count(
            "Out of Service Area", "OUT_OF_COVERAGE", "OUT_OF_COVERAGE_HI", "OUT_OF_SERVICE_HI",
            "TEMPORARILY_OUT_OF_SERVICE", "NUMBER_NOT_IN_SERVICE", "NUMBER_DISCONNECTED",
        ),
        "incoming_not_allowed": count(
            "Incoming Calls Not Allowed", "INCOMING_NOT_ALLOWED", "INCOMING_NOT_ALLOWED_HI",
            "INCOMING_BARRED", "INCOMING_NOT_AVAILABLE", "INCOMING_NOT_AVAILABLE_HI",
        ),
        "unknown": count(
            "Unknown", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT", "UNKNOWN_ANNOUNCEMENT_HI",
            causes=("UNKNOWN", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT"),
            outcomes=("Unknown", "UNKNOWN_UNCLASSIFIED", "UNKNOWN_ANNOUNCEMENT"),
        ),
    }


def _agent_rows(user, params):
    qs, start, end = _scoped_report_calls(user, params)
    span_start, span_end = _bounds_or_all(start, end)
    agents = _filtered_agents(user, params)
    rows = []
    for agent in agents.order_by("first_name", "email"):
        times = mode_totals(agent, span_start, span_end)
        calls = qs.filter(agent=agent)
        counts = _disposition_counts(calls)
        rows.append(
            {
                "user_id": agent.id,
                "agent": agent.display_name,
                "role": role_of(agent),
                "mode": times["mode"],
                "login_at": times["login_at"],
                "logout_at": times["logout_at"],
                "online": times["online"],
                "manual": times["manual"],
                "preview": times["preview"],
                "break": times["break"],
                "total_calls": calls.count(),
                "answered": counts["answered"],
                "unanswered": calls.count() - counts["answered"],
                "busy": counts["busy"],
                "no_answer": counts["no_answer"],
                "failed": counts["failed"],
                "switch_off": counts["switch_off"],
                "not_reachable": counts["not_reachable"],
                "out_of_service": counts["out_of_service"],
                "incoming_not_allowed": counts["incoming_not_allowed"],
                "unknown": counts["unknown"],
                "talk_seconds": calls.aggregate(total=Sum("duration_seconds"))["total"] or 0,
                "hold_seconds": calls.aggregate(total=Sum("hold_seconds"))["total"] or 0,
            }
        )
    return rows, qs, span_start, span_end


class DailyReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        rows, qs, start, end = _agent_rows(request.user, request.query_params)
        counts = _disposition_counts(qs)
        return Response(
            {
                "from": start,
                "to": end,
                "totals": {
                    "calls": qs.count(),
                    "answered": counts["answered"],
                    "unanswered": qs.count() - counts["answered"],
                    "talk_seconds": qs.aggregate(total=Sum("duration_seconds"))["total"] or 0,
                    "hold_seconds": qs.aggregate(total=Sum("hold_seconds"))["total"] or 0,
                    **counts,
                },
                "agents": rows,
            }
        )


class CampaignReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        camps = _filtered_campaigns(request.user, request.query_params)
        qs, start, end = _scoped_report_calls(request.user, request.query_params)
        rows = []
        for camp in camps.order_by("name"):
            leads = Contact.objects.filter(campaign=camp)
            calls = qs.filter(campaign=camp)
            counts = _disposition_counts(calls)
            answered = counts["answered"]
            total = calls.count() or 1
            rows.append(
                {
                    "id": camp.id,
                    "name": camp.name,
                    "code": camp.code,
                    "total_leads": leads.count(),
                    "processed": leads.exclude(lead_status__in=["new", "assigned"]).count(),
                    "pending": leads.filter(lead_status__in=["new", "assigned", "callback"]).count(),
                    "attempted": leads.filter(call_count__gt=0).count(),
                    "answered": answered,
                    "unanswered": calls.count() - answered,
                    "busy": counts["busy"],
                    "no_answer": counts["no_answer"],
                    "failed": counts["failed"],
                    "switch_off": counts["switch_off"],
                    "not_reachable": counts["not_reachable"],
                    "out_of_service": counts["out_of_service"],
                    "incoming_not_allowed": counts["incoming_not_allowed"],
                    "unknown": counts["unknown"],
                    "connected_pct": round(100.0 * answered / total, 1) if calls.count() else 0,
                }
            )
        return Response({"from": start, "to": end, "campaigns": rows})


def _call_codes(call):
    disposition = canonical_code(call.disposition or "")
    outcome = canonical_code(call.outcome or "") or disposition
    if disposition == "CONNECTED" and not call.answered_at:
        disposition = "UNKNOWN_UNCLASSIFIED"
    if outcome == "CONNECTED" and not call.answered_at:
        outcome = "UNKNOWN_UNCLASSIFIED"
    return outcome, disposition


def _extra_columns(leads, fixed):
    extra_keys = []
    used = set()
    for lead in leads:
        for key in lead.extra_data or {}:
            source = str(key)
            if source in used:
                continue
            used.add(source)
            extra_keys.append((source, source if source not in fixed else f"column_{source}"))
    return extra_keys


def _call_narrow(params):
    if _wanted_dispositions(params):
        return True
    return any(params.get(key) for key in ("from", "to", "user", "role", "status", "outcome", "phone"))


def ibr_report_rows(user, params):
    """One row per IBR attempt. Call filters keep only the matching attempts."""
    if not hasattr(params, "get"):
        params = {"campaign": params}
    requested = params.get("campaign") not in (None, "")
    file_id = _param_id(params, "import_job")
    camps = _filtered_campaigns(user, params).filter(campaign_type=Campaign.CampaignType.IBR)
    fixed = [
        "campaign", "import_file", "lead_id", "phone", "name", "audio_status", "audio_error", "attempt",
        "started_at", "duration_seconds", "state", "outcome", "disposition", "hangup_cause",
        "cause_code", "cause_text", "announcement",
    ]
    if file_id is False or (requested and _param_id(params, "campaign") is False):
        return fixed, [], False
    if file_id and not _report_files(user).filter(pk=file_id).exists():
        return fixed, [], False
    camp_ids = list(camps.values_list("id", flat=True))
    if requested and not camp_ids:
        return fixed, [], False
    leads = Contact.objects.filter(campaign_id__in=camp_ids).select_related("campaign", "import_job")
    if file_id:
        leads = leads.filter(import_job_id=file_id)
    phone = (params.get("phone") or "").strip()
    if phone:
        leads = leads.filter(phone__icontains=phone)
    leads = list(leads.order_by("campaign_id", "id"))
    allowed, _start, _end = _scoped_report_calls(user, params, default_today=False)
    allowed_ids = set(allowed.filter(campaign_id__in=camp_ids).values_list("id", flat=True))
    history = {}
    lead_ids = [lead.id for lead in leads]
    for call in Call.objects.filter(contact_id__in=lead_ids).order_by("contact_id", "id"):
        history.setdefault(call.contact_id, []).append(call)
    extra_keys = _extra_columns(leads, fixed)
    headers = fixed + [label for _key, label in extra_keys]
    narrow = _call_narrow(params)
    rows = []
    for lead in leads:
        attempts = [call for call in history.get(lead.id, []) if call.id in allowed_ids]
        if not attempts:
            if narrow:
                continue
            attempts = [None]
        for index, call in enumerate(attempts, start=1):
            outcome, disposition = _call_codes(call) if call else ("", "")
            file_name = lead.import_job.file_name if lead.import_job_id else ""
            row = {
                "campaign": lead.campaign.name if lead.campaign_id else "",
                "import_file": file_name,
                "lead_id": lead.id,
                "phone": lead.phone,
                "name": lead.name,
                "audio_status": lead.tts_status,
                "audio_error": lead.tts_error,
                "attempt": index if call else 0,
                "started_at": timezone.localtime(call.started_at).strftime("%Y-%m-%d %H:%M:%S") if call and call.started_at else "",
                "duration_seconds": call.duration_seconds if call else "",
                "state": call.state if call else "",
                "outcome": outcome,
                "disposition": disposition,
                "hangup_cause": call.hangup_cause if call else "",
                "cause_code": call.cause_code if call else "",
                "cause_text": call.cause_text if call else "",
                "announcement": announcement(disposition) if call else "",
            }
            for key, label in extra_keys:
                value = (lead.extra_data or {}).get(key, "")
                row[label] = "" if value is None else value
            rows.append(row)
    return headers, rows, True


def lead_file_rows(user, params):
    """One row per uploaded lead. Disposition is the latest matching attempt, or Not dialed."""
    from django.db.models import Count, OuterRef, Subquery

    from telephony.causes import lead_disposition

    fixed = [
        "import_file", "campaign", "lead_id", "phone", "name", "status", "disposition",
        "announcement", "attempts", "last_started_at",
    ]
    job_id = _param_id(params, "import_job")
    campaign_id = _param_id(params, "campaign")
    if job_id is False or campaign_id is False:
        return fixed, [], False
    jobs = _report_files(user)
    if job_id and not jobs.filter(pk=job_id).exists():
        return fixed, [], False
    camps = _filtered_campaigns(user, params)
    if campaign_id and not camps.filter(pk=campaign_id).exists():
        return fixed, [], False
    if job_id:
        jobs = jobs.filter(pk=job_id)
    jobs = jobs.filter(campaign__in=camps)
    leads = scoped_leads(user, Contact.objects.filter(import_job__in=jobs).select_related("campaign", "import_job"))
    phone = (params.get("phone") or "").strip()
    if phone:
        leads = leads.filter(phone__icontains=phone)
    start, end = _parse_range(params, default_today=False)
    latest = Call.objects.filter(contact_id=OuterRef("pk")).order_by("-id")
    attempt_filter = Q()
    if start is not None:
        latest = latest.filter(started_at__gte=start)
        attempt_filter &= Q(calls__started_at__gte=start)
    if end is not None:
        latest = latest.filter(started_at__lt=end)
        attempt_filter &= Q(calls__started_at__lt=end)
    if any(params.get(key) for key in ("user", "manager", "admin", "role", "status", "outcome")):
        matched, _start, _end = _scoped_report_calls(user, _without_disposition(params), default_today=False)
        leads = leads.filter(pk__in=matched.values("contact_id"))
    leads = leads.annotate(
        latest_call_state=Subquery(latest.values("state")[:1]),
        latest_call_disposition=Subquery(latest.values("disposition")[:1]),
        latest_answered_at=Subquery(latest.values("answered_at")[:1]),
        latest_started_at=Subquery(latest.values("started_at")[:1]),
        attempt_count=Count("calls", filter=attempt_filter) if attempt_filter else Count("calls"),
    ).order_by("import_job_id", "id")
    wanted = set(_wanted_dispositions(params))
    dated = start is not None or end is not None
    rows = []
    lead_list = list(leads)
    extra_keys = _extra_columns(lead_list, fixed)
    for lead in lead_list:
        info = lead_disposition(lead)
        code = info["disposition_code"]
        if code == "CONNECTED" and not lead.latest_answered_at:
            code = "UNKNOWN_UNCLASSIFIED"
        if dated and code == "NOT_DIALED" and "NOT_DIALED" not in wanted:
            continue
        if wanted and code not in wanted:
            continue
        started = ""
        if lead.latest_started_at:
            started = timezone.localtime(lead.latest_started_at).strftime("%Y-%m-%d %H:%M:%S")
        row = {
            "import_file": lead.import_job.file_name if lead.import_job_id else "",
            "campaign": lead.campaign.name if lead.campaign_id else "",
            "lead_id": lead.id,
            "phone": lead.phone,
            "name": lead.name,
            "status": lead.status,
            "disposition": code,
            "announcement": announcement(code),
            "attempts": lead.attempt_count or 0,
            "last_started_at": started,
        }
        for key, label in extra_keys:
            value = (lead.extra_data or {}).get(key, "")
            row[label] = "" if value is None else value
        rows.append(row)
    headers = fixed + [label for _key, label in extra_keys]
    return headers, rows, True


def _without_disposition(params):
    from django.http import QueryDict

    if isinstance(params, QueryDict):
        clone = params.copy()
        clone.pop("disposition", None)
        return clone
    return {key: value for key, value in params.items() if key != "disposition"}


class ReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        kind = request.query_params.get("kind") or "daily"
        fmt = (request.query_params.get("file") or request.query_params.get("export") or "csv").lower()
        if kind == "campaign":
            camps_view = CampaignReportView()
            camps_view.request = request
            data = camps_view.get(request).data
            headers = [
                "name", "code", "total_leads", "processed", "pending", "attempted", "answered", "unanswered",
                "busy", "no_answer", "failed", "switch_off", "not_reachable", "out_of_service",
                "incoming_not_allowed", "unknown", "connected_pct",
            ]
            records = data["campaigns"]
            filename = "campaign-report"
        elif kind == "ibr":
            if role_of(request.user) in {"user", "agent"}:
                return Response({"detail": "Users cannot run IBR"}, status=403)
            headers, records, found = ibr_report_rows(request.user, request.query_params)
            if (request.query_params.get("campaign") or request.query_params.get("import_job")) and not found:
                return Response({"detail": "Not found"}, status=404)
            filename = "ibr-report"
        elif kind == "leads":
            headers, records, found = lead_file_rows(request.user, request.query_params)
            if (request.query_params.get("import_job") or request.query_params.get("campaign")) and not found:
                return Response({"detail": "Not found"}, status=404)
            filename = "uploaded-file-report"
        elif kind == "calls":
            headers = [
                "id", "lead_id", "phone", "campaign", "import_file", "agency", "agent", "agent_role", "manager",
                "started_at", "duration_seconds", "state", "outcome", "disposition", "hangup_cause",
                "cause_code", "cause_text", "announcement", "attempt", "audio_status",
            ]
            records = list(_call_export_rows(request.user, request.query_params))
            filename = "call-report"
        else:
            rows, _qs, _start, _end = _agent_rows(request.user, request.query_params)
            headers = [
                "agent", "online", "manual", "preview", "break", "total_calls", "answered", "unanswered",
                "busy", "no_answer", "failed", "switch_off", "not_reachable", "out_of_service",
                "incoming_not_allowed", "unknown", "talk_seconds", "hold_seconds",
            ]
            records = rows
            filename = "daily-report"
        if fmt == "xlsx":
            book = Workbook()
            sheet = book.active
            sheet.append(headers)
            for row in records:
                sheet.append([row.get(key, "") for key in headers])
            buf = BytesIO()
            book.save(buf)
            buf.seek(0)
            response = HttpResponse(buf.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            response["Content-Disposition"] = f'attachment; filename="{filename}.xlsx"'
            return response
        buf = StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers)
        for row in records:
            writer.writerow([row.get(key, "") if isinstance(row, dict) else "" for key in headers])
        response = HttpResponse(buf.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
        return response


def _attempt_qs(qs):
    inner = (
        Call.objects.filter(contact_id=OuterRef("contact_id"), id__lte=OuterRef("id"))
        .order_by()
        .values("contact_id")
        .annotate(c=Count("id"))
        .values("c")
    )
    return qs.annotate(attempt=Coalesce(Subquery(inner, output_field=IntegerField()), Value(1)))


def _call_dict(call):
    agent = call.agent
    campaign = call.campaign
    agency = ""
    if campaign and campaign.agency_id:
        agency = campaign.agency.name
    elif agent and agent.organization_id:
        agency = agent.organization.name
    manager = ""
    if campaign and campaign.manager_id:
        manager = campaign.manager.display_name
    elif agent and agent.reports_to_id:
        manager = agent.reports_to.display_name
    outcome, disposition = _call_codes(call) if (call.disposition or call.outcome) else ("", "")
    if not disposition:
        disposition = canonical_code(call.disposition) or call.disposition
    import_file = ""
    if call.contact_id and getattr(call, "contact", None) and call.contact.import_job_id:
        import_file = call.contact.import_job.file_name
    return {
        "id": call.id,
        "lead_id": call.contact_id or "",
        "phone": call.phone_number,
        "campaign": campaign.name if campaign else "",
        "import_file": import_file,
        "agency": agency,
        "agent": agent.display_name if agent else "",
        "agent_role": role_of(agent) if agent else "",
        "manager": manager,
        "started_at": call.started_at.isoformat() if call.started_at else "",
        "duration_seconds": call.duration_seconds,
        "state": call.state,
        "outcome": outcome or call.outcome,
        "disposition": disposition,
        "hangup_cause": call.hangup_cause,
        "cause_code": call.cause_code,
        "cause_text": call.cause_text,
        "announcement": announcement(disposition),
        "attempt": getattr(call, "attempt", 1) or 1,
        "audio_status": call.contact.tts_status if call.contact_id else "",
    }


def _call_export_rows(user, params):
    qs, _start, _end = _scoped_report_calls(user, params)
    for call in _attempt_qs(qs).order_by("id").iterator(chunk_size=500):
        yield _call_dict(call)


def _person_option(person):
    return {"id": person.id, "name": person.display_name, "email": person.email, "role": role_of(person)}


class CallReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        qs, start, end = _scoped_report_calls(request.user, request.query_params)
        total = qs.count()
        try:
            limit = min(max(int(request.query_params.get("limit") or 50), 1), 200)
            page = max(int(request.query_params.get("page") or 1), 1)
        except (TypeError, ValueError):
            limit, page = 50, 1
        offset = (page - 1) * limit
        rows = [_call_dict(call) for call in _attempt_qs(qs).order_by("-started_at")[offset : offset + limit]]
        return Response({"from": start, "to": end, "total": total, "page": page, "limit": limit, "calls": rows})


class ReportFilterOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        user = request.user
        people = scoped_users(user)
        role = role_of(user)
        agencies = []
        if is_super_admin(user):
            agencies = [{"id": row.id, "name": row.name} for row in Organization.objects.order_by("name")]
        visible_roles = ["agency", "manager", "admin", "user"]
        if role == User.Role.AGENCY:
            visible_roles = ["manager", "admin", "user"]
        elif role == User.Role.MANAGER:
            visible_roles = ["admin", "user"]
        elif role == User.Role.ADMIN:
            visible_roles = ["user"]
        elif role in {User.Role.USER, User.Role.AGENT}:
            visible_roles = []
        return Response(
            {
                "agencies": agencies,
                "managers": [_person_option(row) for row in people.filter(role__in=["manager", "supervisor"]).order_by("first_name", "email")],
                "admins": [_person_option(row) for row in people.filter(role="admin").order_by("first_name", "email")],
                "users": [_person_option(row) for row in people.filter(role__in=["user", "agent"]).order_by("first_name", "email")],
                "campaigns": [
                    {"id": row.id, "name": row.name, "code": row.code, "campaign_type": row.campaign_type}
                    for row in scoped_campaigns(user, Campaign.objects.all()).order_by("name")
                ],
                "files": [
                    {
                        "id": row.id,
                        "name": row.file_name or f"File {row.id}",
                        "campaign_id": row.campaign_id,
                        "campaign_name": row.campaign.name if row.campaign_id else "",
                        "campaign_type": row.campaign.campaign_type if row.campaign_id else "",
                    }
                    for row in _report_files(user)[:200]
                ],
                "roles": visible_roles,
                "dispositions": disposition_codes(),
                "statuses": sorted(CALL_STATES),
            }
        )


class LiveAgentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_perm(request.user, "view_call_logs")
        users = scoped_users(request.user).select_related("organization")
        open_modes = {
            row.user_id: row
            for row in AgentModeSession.objects.filter(ended_at__isnull=True, user_id__in=users.values("id")).select_related("campaign")
        }
        live_calls = {
            call.agent_id: call
            for call in Call.objects.filter(
                agent_id__in=users.values("id"), state__in=["initiating", "ringing", "connected", "on_hold"]
            ).select_related("contact", "campaign")
        }
        start, end = day_bounds()
        today_counts = {
            row["agent"]: row["c"]
            for row in Call.objects.filter(agent_id__in=users.values("id"), started_at__gte=start, started_at__lt=end)
            .values("agent")
            .annotate(c=Count("id"))
        }
        rows = []
        now = timezone.now()
        for person in users.order_by("first_name", "email"):
            session = open_modes.get(person.id)
            call = live_calls.get(person.id)
            duration = 0
            if call:
                start_at = call.answered_at or call.started_at
                duration = max(0, int((now - start_at).total_seconds()))
            mode = session.mode if session else "offline"
            status = person.presence
            if call:
                status = call.state
            elif mode == "break":
                status = "break"
            rows.append(
                {
                    "id": person.id,
                    "name": person.display_name,
                    "avatar": person.avatar_initials or "?",
                    "team": person.team or (person.organization.name if person.organization_id else ""),
                    "mode": mode,
                    "presence": person.presence,
                    "status": status,
                    "campaign": (call.campaign.name if call and call.campaign_id else None)
                    or (session.campaign.name if session and session.campaign_id else ""),
                    "phone": call.phone_number if call else "",
                    "customer": call.contact.name if call and call.contact_id else (call.phone_number if call else ""),
                    "call_state": call.state if call else "",
                    "duration": format_duration(duration) if call else "",
                    "duration_seconds": duration,
                    "calls_today": today_counts.get(person.id, 0),
                }
            )
        return Response({"agents": rows})


class LiveActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        require_perm(request.user, "view_call_logs")
        from telephony.monitor import force_logout, supervisor_spy

        action = (request.data.get("action") or "listen").lower()
        target = scoped_users(request.user).filter(pk=request.data.get("agent_id") or request.data.get("user_id")).first()
        if not target:
            return Response({"detail": "User not found"}, status=404)
        try:
            if action == "logout":
                force_logout(request.user, target, request)
                return Response({"ok": True, "supported": True, "detail": f"{target.display_name} has been logged out"})
            if action not in {"listen", "whisper", "barge"}:
                return Response({"detail": "Unknown action"}, status=400)
            return Response(supervisor_spy(request.user, target, action, request))
        except PermissionError as exc:
            return Response({"detail": str(exc)}, status=403)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
