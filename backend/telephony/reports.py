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
    descendant_ids,
    has_perm,
    is_super_admin,
    require_perm,
    role_of,
    scoped_calls,
    scoped_campaigns,
    scoped_users,
)
from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import AgentModeSession, Call
from telephony.modes import day_bounds, mode_totals
from telephony.utils import format_duration

CALL_STATES = {"initiating", "ringing", "connected", "on_hold", "ended"}
ROLE_FILTERS = {
    "super_admin": ["super_admin"],
    "agency": ["agency"],
    "manager": ["manager", "supervisor"],
    "admin": ["admin"],
    "user": ["user", "agent"],
}
DISPOSITION_CHOICES = [
    "Connected",
    "Busy",
    "No Answer",
    "Failed",
    "Cancelled",
    "Switch Off",
    "Not Reachable",
    "Out of Service Area",
    "Incoming Calls Not Allowed",
    "Unknown",
]
CONNECTED_Q = Q(disposition="Connected") | (
    Q(hangup_cause="ANSWERED") & Q(answered_at__isnull=False) & Q(disposition__in=["", "Connected"])
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


def _parse_range(params):
    start, end = day_bounds()
    raw_from = params.get("from")
    raw_to = params.get("to")
    if raw_from:
        day = parse_date(str(raw_from)[:10])
        if day:
            start = timezone.make_aware(datetime.combine(day, dtime.min))
    if raw_to:
        day = parse_date(str(raw_to)[:10])
        if day:
            end = timezone.make_aware(datetime.combine(day, dtime.min)) + timedelta(days=1)
    return start, end


def _scoped_person(user, person_id, roles):
    if person_id is False:
        return None
    if not person_id:
        return None
    person = scoped_users(user).filter(pk=person_id, role__in=roles).first()
    return person


def _scoped_report_calls(user, params):
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
        ),
    )
    start, end = _parse_range(params)
    qs = qs.filter(started_at__gte=start, started_at__lt=end)
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
    if params.get("disposition"):
        qs = qs.filter(disposition__iexact=params.get("disposition"))
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
        "busy": count("Busy", causes=("BUSY",), outcomes=("Busy",)),
        "no_answer": count("No Answer", causes=("NO_ANSWER", "RINGING_NO_ANSWER"), outcomes=("No Answer",)),
        "failed": count("Failed", causes=("FAILED",), outcomes=("Failed",)),
        "switch_off": count("Switch Off"),
        "not_reachable": count("Not Reachable"),
        "out_of_service": count("Out of Service Area"),
        "incoming_not_allowed": count("Incoming Calls Not Allowed"),
        "unknown": count("Unknown", causes=("UNKNOWN",), outcomes=("Unknown",)),
    }


def _agent_rows(user, params):
    qs, start, end = _scoped_report_calls(user, params)
    agents = _filtered_agents(user, params)
    rows = []
    for agent in agents.order_by("first_name", "email"):
        times = mode_totals(agent, start, end)
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
    return rows, qs, start, end


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


def ibr_report_rows(user, campaign_id):
    """One row per IBR attempt, with the uploaded columns repeated on every attempt."""
    camps = scoped_campaigns(user, Campaign.objects.filter(campaign_type=Campaign.CampaignType.IBR))
    requested = campaign_id not in (None, "")
    if requested:
        parsed = _param_id({"campaign": campaign_id}, "campaign")
        camps = camps.filter(pk=parsed) if isinstance(parsed, int) else camps.none()
    camp_ids = list(camps.values_list("id", flat=True))
    fixed = [
        "campaign", "lead_id", "phone", "name", "audio_status", "audio_error", "attempt",
        "started_at", "duration_seconds", "state", "outcome", "disposition", "hangup_cause",
        "cause_code", "cause_text",
    ]
    if not camp_ids:
        return fixed, [], False
    leads = list(Contact.objects.filter(campaign_id__in=camp_ids).select_related("campaign").order_by("campaign_id", "id"))
    history = {}
    for call in Call.objects.filter(campaign_id__in=camp_ids).order_by("contact_id", "id"):
        history.setdefault(call.contact_id, []).append(call)
    extra_keys = []
    used_sources = set()
    for lead in leads:
        for key in lead.extra_data or {}:
            source = str(key)
            if source in used_sources:
                continue
            used_sources.add(source)
            label = source if source not in fixed else f"column_{source}"
            extra_keys.append((source, label))
    headers = fixed + [label for _key, label in extra_keys]
    rows = []
    for lead in leads:
        attempts = history.get(lead.id) or [None]
        for index, call in enumerate(attempts, start=1):
            disposition = ""
            outcome = ""
            if call:
                disposition = call.disposition or ""
                outcome = call.outcome or ""
                if (disposition == "Connected" or outcome == "Connected") and not call.answered_at:
                    disposition = "Unknown"
                    outcome = "Unknown"
            row = {
                "campaign": lead.campaign.name if lead.campaign_id else "",
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
            }
            for key, label in extra_keys:
                value = (lead.extra_data or {}).get(key, "")
                row[label] = "" if value is None else value
            rows.append(row)
    return headers, rows, True


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
            headers, records, found = ibr_report_rows(request.user, request.query_params.get("campaign"))
            if request.query_params.get("campaign") and not found:
                return Response({"detail": "Not found"}, status=404)
            filename = "ibr-report"
        elif kind == "calls":
            headers = [
                "id", "lead_id", "phone", "campaign", "agency", "agent", "agent_role", "manager",
                "started_at", "duration_seconds", "state", "outcome", "disposition", "hangup_cause",
                "cause_code", "cause_text", "attempt", "audio_status",
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
    return {
        "id": call.id,
        "lead_id": call.contact_id or "",
        "phone": call.phone_number,
        "campaign": campaign.name if campaign else "",
        "agency": agency,
        "agent": agent.display_name if agent else "",
        "agent_role": role_of(agent) if agent else "",
        "manager": manager,
        "started_at": call.started_at.isoformat() if call.started_at else "",
        "duration_seconds": call.duration_seconds,
        "state": call.state,
        "outcome": call.outcome,
        "disposition": call.disposition,
        "hangup_cause": call.hangup_cause,
        "cause_code": call.cause_code,
        "cause_text": call.cause_text,
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
                    {"id": row.id, "name": row.name, "code": row.code}
                    for row in scoped_campaigns(user, Campaign.objects.all()).order_by("name")
                ],
                "roles": visible_roles,
                "dispositions": DISPOSITION_CHOICES,
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
