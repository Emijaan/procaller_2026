from datetime import datetime, time as dtime, timedelta
from io import BytesIO

from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from openpyxl import Workbook
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import has_perm, is_super_admin, require_perm, scoped_calls, scoped_campaigns, scoped_users
from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import AgentModeSession, Call
from telephony.modes import day_bounds, mode_totals
from telephony.utils import format_duration


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


def _scoped_report_calls(user, params):
    qs = scoped_calls(user, Call.objects.select_related("agent", "campaign", "contact", "campaign__agency"))
    start, end = _parse_range(params)
    qs = qs.filter(started_at__gte=start, started_at__lt=end)
    if params.get("campaign"):
        qs = qs.filter(campaign_id=params.get("campaign"))
    if params.get("user"):
        qs = qs.filter(agent_id=params.get("user"))
    if params.get("agency") and is_super_admin(user):
        qs = qs.filter(Q(agent__organization_id=params.get("agency")) | Q(campaign__agency_id=params.get("agency")))
    if params.get("outcome"):
        qs = qs.filter(Q(outcome__iexact=params.get("outcome")) | Q(hangup_cause__iexact=params.get("outcome")))
    if params.get("disposition"):
        qs = qs.filter(disposition__iexact=params.get("disposition"))
    role = getattr(user, "normalized_role", user.role)
    if role in {"user", "agent"}:
        qs = qs.filter(agent=user)
    return qs, start, end


def _agent_rows(user, params):
    qs, start, end = _scoped_report_calls(user, params)
    agents = scoped_users(user)
    if params.get("user"):
        agents = agents.filter(pk=params.get("user"))
    role = getattr(user, "normalized_role", user.role)
    if role in {"user", "agent"}:
        agents = agents.filter(pk=user.pk)
    rows = []
    for agent in agents.order_by("first_name", "email"):
        times = mode_totals(agent, start, end)
        calls = qs.filter(agent=agent)
        answered = calls.filter(Q(hangup_cause="ANSWERED") | Q(outcome="Connected")).count()
        rows.append(
            {
                "user_id": agent.id,
                "agent": agent.display_name,
                "mode": times["mode"],
                "login_at": times["login_at"],
                "logout_at": times["logout_at"],
                "online": times["online"],
                "manual": times["manual"],
                "preview": times["preview"],
                "break": times["break"],
                "total_calls": calls.count(),
                "answered": answered,
                "unanswered": calls.count() - answered,
                "busy": calls.filter(Q(outcome="Busy") | Q(hangup_cause="BUSY")).count(),
                "no_answer": calls.filter(Q(hangup_cause="RINGING_NO_ANSWER") | Q(outcome="No Answer")).count(),
                "failed": calls.filter(Q(outcome="Failed") | Q(hangup_cause="FAILED")).count(),
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
        answered = qs.filter(Q(hangup_cause="ANSWERED") | Q(outcome="Connected")).count()
        return Response(
            {
                "from": start,
                "to": end,
                "totals": {
                    "calls": qs.count(),
                    "answered": answered,
                    "unanswered": qs.count() - answered,
                    "talk_seconds": qs.aggregate(total=Sum("duration_seconds"))["total"] or 0,
                    "hold_seconds": qs.aggregate(total=Sum("hold_seconds"))["total"] or 0,
                },
                "agents": rows,
            }
        )


class CampaignReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _can_report(request.user)
        camps = scoped_campaigns(request.user, Campaign.objects.all())
        if request.query_params.get("campaign"):
            camps = camps.filter(pk=request.query_params.get("campaign"))
        qs, start, end = _scoped_report_calls(request.user, request.query_params)
        rows = []
        for camp in camps.order_by("name"):
            leads = Contact.objects.filter(campaign=camp)
            calls = qs.filter(campaign=camp)
            answered = calls.filter(Q(hangup_cause="ANSWERED") | Q(outcome="Connected")).count()
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
                    "busy": calls.filter(hangup_cause="BUSY").count(),
                    "no_answer": calls.filter(hangup_cause="RINGING_NO_ANSWER").count(),
                    "failed": calls.filter(hangup_cause="FAILED").count(),
                    "connected_pct": round(100.0 * answered / total, 1) if calls.count() else 0,
                }
            )
        return Response({"from": start, "to": end, "campaigns": rows})


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
            headers = ["name", "code", "total_leads", "processed", "pending", "attempted", "answered", "unanswered", "busy", "no_answer", "failed", "connected_pct"]
            records = data["campaigns"]
            filename = "campaign-report"
        else:
            rows, _qs, _start, _end = _agent_rows(request.user, request.query_params)
            headers = ["agent", "online", "manual", "preview", "break", "total_calls", "answered", "unanswered", "busy", "no_answer", "failed", "talk_seconds", "hold_seconds"]
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
        lines = [",".join(headers)]
        for row in records:
            lines.append(",".join(str(row.get(key, "")).replace(",", " ") for key in headers))
        response = HttpResponse("\n".join(lines), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}.csv"'
        return response


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
        from accounts.services import write_audit

        action = (request.data.get("action") or "listen").lower()
        if action not in {"listen", "whisper", "barge"}:
            return Response({"detail": "Unknown action"}, status=400)
        write_audit(
            request.user,
            action.upper(),
            "call",
            request.data.get("call_id") or request.data.get("agent_id") or "",
            request,
            {"note": "Supervisor action logged. Live ChanSpy is not available on the 1:1 GSM path."},
        )
        return Response({"ok": True, "supported": False, "detail": "Live listen/whisper/barge is logged. Audio join is not available on this trunk."})
