from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from campaigns.models import Campaign
from crm.models import Contact

from .models import AgentSession, Call
from .serializers import CallSerializer
from .services import (
    end_session,
    hangup_call,
    mark_ringing,
    originate_manual,
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
        qs = Call.objects.select_related("agent", "contact", "campaign").filter(agent=request.user)
        if request.user.role in ("admin", "supervisor"):
            qs = Call.objects.select_related("agent", "contact", "campaign").all()
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(phone_number__icontains=q) | qs.filter(contact__name__icontains=q)
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
        try:
            call = originate_manual(
                request.user,
                phone,
                contact=contact,
                campaign=campaign,
                session=session,
                client_dial=client_dial,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)


class ActiveCallView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        call = (
            Call.objects.select_related("agent", "contact", "campaign")
            .filter(agent=request.user, state__in=["initiating", "ringing", "connected", "on_hold"])
            .first()
        )
        if not call:
            return Response({"call": None})
        return Response({"call": CallSerializer(call).data})


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
