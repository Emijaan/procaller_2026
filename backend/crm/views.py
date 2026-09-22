from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import agency_of, require_perm, scoped_leads, scoped_users
from accounts.services import write_audit

from .models import Contact, FollowUp
from .serializers import ContactSerializer, FollowUpSerializer


class ContactListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = scoped_leads(request.user, Contact.objects.select_related("owner", "campaign", "agency"))
        q = request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q) | Q(company__icontains=q))
        campaign = request.query_params.get("campaign")
        if campaign:
            qs = qs.filter(campaign_id=campaign)
        status_filter = request.query_params.get("status") or request.query_params.get("lead_status")
        if status_filter:
            qs = qs.filter(lead_status=status_filter)
        owner = request.query_params.get("owner")
        if owner:
            qs = qs.filter(owner_id=owner)
        return Response(ContactSerializer(qs[:500], many=True).data)

    def post(self, request):
        phone = (request.data.get("phone") or request.data.get("mobile") or "").strip()
        if not phone:
            return Response({"detail": "Mobile is required"}, status=400)
        contact = Contact.objects.create(
            name=request.data.get("name") or phone,
            phone=phone,
            email=request.data.get("email") or "",
            company=request.data.get("company") or "",
            extra_data=request.data.get("extra_data") or {},
            campaign_id=request.data.get("campaign") or None,
            owner_id=request.data.get("owner") or None,
            agency=agency_of(request.user),
            lead_status=request.data.get("lead_status") or Contact.LeadStatus.NEW,
            comments=request.data.get("comments") or "",
        )
        return Response(ContactSerializer(contact).data, status=201)


class ContactDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        contact = scoped_leads(request.user, Contact.objects.all()).filter(pk=pk).first()
        if not contact:
            return Response({"detail": "Not found"}, status=404)
        return Response(ContactSerializer(contact).data)

    def patch(self, request, pk):
        contact = scoped_leads(request.user, Contact.objects.all()).filter(pk=pk).first()
        if not contact:
            return Response({"detail": "Not found"}, status=404)
        for field in ("name", "phone", "email", "company", "comments", "lead_status", "last_disposition"):
            if field in request.data:
                setattr(contact, field, request.data[field])
        if "owner" in request.data:
            require_perm(request.user, "assign_leads")
            owner = scoped_users(request.user).filter(pk=request.data["owner"]).first()
            contact.owner = owner
            if owner:
                contact.lead_status = Contact.LeadStatus.ASSIGNED
        if "extra_data" in request.data and isinstance(request.data["extra_data"], dict):
            contact.extra_data = request.data["extra_data"]
        if "next_callback_at" in request.data:
            contact.next_callback_at = parse_datetime(request.data["next_callback_at"]) if request.data["next_callback_at"] else None
            if contact.next_callback_at:
                contact.lead_status = Contact.LeadStatus.CALLBACK
        if request.data.get("dnc"):
            contact.dnc = True
            contact.lead_status = Contact.LeadStatus.DNC
        contact.save()
        return Response(ContactSerializer(contact).data)


class LookupLeadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .queue import lookup_lead_by_phone

        phone = request.query_params.get("phone") or request.query_params.get("q") or ""
        campaign = request.query_params.get("campaign") or request.query_params.get("campaign_id")
        lead = lookup_lead_by_phone(request.user, phone, campaign_id=campaign or None)
        if not lead:
            return Response({"detail": "No matching lead"}, status=404)
        return Response(ContactSerializer(lead).data)


class NextLeadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return self._reserve(request)

    def post(self, request):
        return self._reserve(request)

    def _reserve(self, request):
        require_perm(request.user, "preview_auto_dial")
        from telephony.modes import current_mode
        from telephony.models import AgentModeSession
        from .queue import reserve_next_lead

        campaign = request.query_params.get("campaign") or (request.data.get("campaign") if hasattr(request, "data") else None) or (request.data.get("campaign_id") if hasattr(request, "data") else None)
        if current_mode(request.user) != AgentModeSession.Mode.PREVIEW:
            return Response({"detail": "Switch to Preview Auto before taking a queue lead"}, status=400)
        try:
            nxt = reserve_next_lead(request.user, campaign_id=campaign)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        if not nxt:
            return Response({"detail": "No leads available"}, status=404)
        return Response(ContactSerializer(nxt).data)


class ReleaseLeadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from telephony.modes import release_agent_reservations

        release_agent_reservations(request.user)
        return Response({"ok": True})
