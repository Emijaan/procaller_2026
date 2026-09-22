from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import is_super_admin, scoped_calls
from campaigns.models import Campaign
from crm.models import Contact

from .modes import clamp_ratio, current_mode, mode_totals, set_agent_mode
from .models import AgentModeSession, AgentSession, Call
from .recordings import (
    apply_recording_filters,
    file_response,
    recordings_qs,
    require_logs,
    save_recording,
    zip_recordings,
)
from .serializers import CallSerializer
from .services import (
    end_session,
    hangup_call,
    mark_ringing,
    originate_manual,
    originate_preview_batch,
    save_disposition,
    set_call_flag,
    start_session,
)


class SessionStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        campaign = None
        campaign_id = request.data.get("campaign_id")
        if campaign_id:
            campaign = get_object_or_404(Campaign, pk=campaign_id)
        session, payload = start_session(request.user, campaign)
        return Response({"session": {"id": session.id, "room_id": session.room_id, "status": session.status}, **payload})


class SessionEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        end_session(request.user)
        return Response({"ok": True})


class CallListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = scoped_calls(
            request.user,
            Call.objects.select_related("agent", "agent__organization", "contact", "campaign", "campaign__agency"),
        )
        q = request.query_params.get("q")
        if q:
            from django.db.models import Q

            qs = qs.filter(Q(phone_number__icontains=q) | Q(contact__name__icontains=q))
        return Response(CallSerializer(qs[:200], many=True).data)

    def post(self, request):
        phone = request.data.get("phone_number") or request.data.get("phone") or ""
        contact = None
        campaign = None
        if request.data.get("contact_id"):
            contact = get_object_or_404(Contact, pk=request.data["contact_id"])
            phone = phone or contact.phone
        if request.data.get("campaign_id"):
            campaign = get_object_or_404(Campaign, pk=request.data["campaign_id"])
        session = AgentSession.objects.filter(user=request.user, ended_at__isnull=True).order_by("-id").first()
        client_dial = bool(request.data.get("client_dial"))
        preview = bool(request.data.get("preview"))
        try:
            call = originate_manual(
                request.user,
                phone,
                contact=contact,
                campaign=campaign,
                session=session,
                client_dial=client_dial,
                preview=preview,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)


class PreviewBatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        campaign = None
        if request.data.get("campaign_id"):
            campaign = get_object_or_404(Campaign, pk=request.data["campaign_id"])
        session = AgentSession.objects.filter(user=request.user, ended_at__isnull=True).order_by("-id").first()
        try:
            calls, conference, ratio = originate_preview_batch(
                request.user,
                campaign=campaign,
                ratio=request.data.get("ratio") or request.data.get("dial_ratio"),
                session=session,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(
            {
                "calls": CallSerializer(calls, many=True).data,
                "conference": conference,
                "ratio": ratio,
            },
            status=status.HTTP_201_CREATED,
        )


class ActiveCallView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        live = list(
            Call.objects.select_related("agent", "contact", "campaign")
            .filter(agent=request.user, state__in=["initiating", "ringing", "connected", "on_hold"])
            .order_by("id")
        )
        if not live:
            return Response({"call": None, "calls": []})
        preferred = next((row for row in live if row.state in ("connected", "on_hold")), live[0])
        return Response({"call": CallSerializer(preferred).data, "calls": CallSerializer(live, many=True).data})


class CallHangupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_object_or_404(Call, pk=pk, agent=request.user)
        hangup_call(call)
        return Response(CallSerializer(call).data)


class CallControlView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_object_or_404(Call, pk=pk, agent=request.user)
        muted = request.data.get("muted")
        on_hold = request.data.get("on_hold")
        set_call_flag(call, muted=muted, on_hold=on_hold)
        return Response(CallSerializer(call).data)


class CallRingingView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_object_or_404(Call, pk=pk, agent=request.user)
        mark_ringing(call)
        return Response(CallSerializer(call).data)


class CallAnswerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        from .services import mark_answered

        call = get_object_or_404(Call, pk=pk)
        if call.agent_id != request.user.id and request.user.role == "agent":
            return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        mark_answered(call)
        return Response(CallSerializer(call).data)


class CallDispositionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_object_or_404(Call, pk=pk, agent=request.user)
        disposition = (request.data.get("disposition") or "").strip()
        if not disposition:
            return Response({"detail": "Disposition is required"}, status=status.HTTP_400_BAD_REQUEST)
        follow_up_at = None
        raw = request.data.get("follow_up_at")
        if raw:
            follow_up_at = parse_datetime(raw)
        save_disposition(
            call,
            disposition,
            notes=request.data.get("notes") or "",
            follow_up_at=follow_up_at,
            follow_up_reason=request.data.get("follow_up_reason") or "",
        )
        return Response(CallSerializer(call).data)


class CallRecordingUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        call = get_object_or_404(Call, pk=pk)
        if call.agent_id != request.user.id and not is_super_admin(request.user):
            return Response({"detail": "Not allowed"}, status=status.HTTP_403_FORBIDDEN)
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Recording file is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            save_recording(call, upload)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(CallSerializer(call).data)


class RecordingListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_logs(request.user)
        qs = apply_recording_filters(recordings_qs(request.user), request.query_params, request.user)
        rows = CallSerializer(qs[:500], many=True).data
        return Response({"count": qs.count(), "results": rows})


class RecordingFileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        require_logs(request.user)
        call = recordings_qs(request.user).filter(pk=pk).first()
        if not call:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return file_response(call, download=request.query_params.get("download") in {"1", "true", "yes"})


class RecordingExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        require_logs(request.user)
        ids = request.data.get("ids") or []
        qs = recordings_qs(request.user)
        if ids:
            qs = qs.filter(pk__in=ids)
        else:
            qs = apply_recording_filters(qs, request.data, request.user)
        return zip_recordings(qs)


class AgentModeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        campaign = None
        live = AgentModeSession.objects.filter(user=request.user, ended_at__isnull=True).select_related("campaign").first()
        if live and live.campaign_id:
            campaign = live.campaign
        data = mode_totals(request.user)
        data["wrap_up_seconds"] = campaign.wrap_up_seconds if campaign else 30
        data["dial_ratio"] = live.dial_ratio if live else 1
        return Response(data)

    def post(self, request):
        mode = (request.data.get("mode") or "").strip().lower()
        campaign = None
        if request.data.get("campaign_id"):
            campaign = Campaign.objects.filter(pk=request.data.get("campaign_id")).first()
        live = AgentModeSession.objects.filter(user=request.user, ended_at__isnull=True).order_by("-id").first()
        try:
            if mode:
                row = set_agent_mode(
                    request.user,
                    mode,
                    request=request,
                    campaign=campaign,
                    dial_ratio=request.data.get("dial_ratio"),
                )
            elif live and request.data.get("dial_ratio") is not None:
                live.dial_ratio = clamp_ratio(request.data.get("dial_ratio"), live.dial_ratio or 1)
                if campaign:
                    live.campaign = campaign
                live.save()
                row = live
            else:
                return Response({"detail": "Mode or dial_ratio is required"}, status=status.HTTP_400_BAD_REQUEST)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        data = mode_totals(request.user)
        data["wrap_up_seconds"] = (campaign.wrap_up_seconds if campaign else None) or 30
        data["dial_ratio"] = row.dial_ratio
        data["session_id"] = row.id
        return Response(data)


class AgentTodayView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(mode_totals(request.user))
