from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import agency_of, has_perm, is_super_admin, require_perm, scoped_campaigns, scoped_leads, scoped_users
from accounts.services import write_audit

from .models import Contact, FollowUp, ImportJob
from .serializers import ContactSerializer, FollowUpSerializer, ImportJobSerializer


class ContactListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import OuterRef, Subquery

        from telephony.models import Call

        latest_call = Call.objects.filter(contact_id=OuterRef("pk")).order_by("-id")
        qs = scoped_leads(request.user, Contact.objects.select_related("owner", "campaign", "agency", "import_job")).annotate(
            latest_call_state=Subquery(latest_call.values("state")[:1]),
            latest_call_disposition=Subquery(latest_call.values("disposition")[:1]),
        )
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
        active = (request.query_params.get("active") or "").lower()
        if active in {"0", "false", "inactive"}:
            qs = qs.filter(status=Contact.Status.INACTIVE)
        elif active in {"1", "true", "active"}:
            qs = qs.filter(status=Contact.Status.ACTIVE)
        import_job = request.query_params.get("import_job")
        if import_job:
            qs = qs.filter(import_job_id=import_job)
        try:
            limit = min(5000, max(1, int(request.query_params.get("limit") or 1000)))
        except (TypeError, ValueError):
            limit = 1000
        return Response(ContactSerializer(qs.order_by("-id")[:limit], many=True).data)

    def post(self, request):
        phone = (request.data.get("phone") or request.data.get("mobile") or "").strip()
        if not phone:
            return Response({"detail": "Mobile is required"}, status=400)
        from campaigns.models import Campaign

        campaign = None
        if request.data.get("campaign"):
            campaign = scoped_campaigns(request.user, Campaign.objects.filter(pk=request.data["campaign"])).first()
            if not campaign:
                return Response({"detail": "Not found"}, status=404)
        owner = None
        if request.data.get("owner"):
            owner = scoped_users(request.user).filter(pk=request.data["owner"]).first()
            if not owner:
                return Response({"detail": "Not found"}, status=404)
        agency = agency_of(request.user)
        if is_super_admin(request.user) and campaign and campaign.agency_id:
            agency = campaign.agency
        if campaign and agency and campaign.agency_id and campaign.agency_id != agency.id:
            return Response({"detail": "Campaign is not in your agency"}, status=403)
        if owner and agency and owner.organization_id != agency.id:
            return Response({"detail": "User is not in your agency"}, status=403)
        contact = Contact.objects.create(
            name=request.data.get("name") or phone,
            phone=phone,
            email=request.data.get("email") or "",
            company=request.data.get("company") or "",
            extra_data=request.data.get("extra_data") or {},
            campaign=campaign,
            owner=owner,
            agency=agency,
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
            if request.data["owner"]:
                owner = scoped_users(request.user).filter(pk=request.data["owner"]).first()
                if not owner:
                    return Response({"detail": "Not found"}, status=404)
                contact.owner = owner
                contact.lead_status = Contact.LeadStatus.ASSIGNED
            else:
                contact.owner = None
        if "extra_data" in request.data and isinstance(request.data["extra_data"], dict):
            contact.extra_data = request.data["extra_data"]
        if "next_callback_at" in request.data:
            contact.next_callback_at = parse_datetime(request.data["next_callback_at"]) if request.data["next_callback_at"] else None
            if contact.next_callback_at:
                contact.lead_status = Contact.LeadStatus.CALLBACK
        if request.data.get("dnc"):
            contact.dnc = True
            contact.lead_status = Contact.LeadStatus.DNC
        turning = None
        if "status" in request.data:
            require_perm(request.user, "edit_campaign")
            value = request.data.get("status")
            if value not in {Contact.Status.ACTIVE, Contact.Status.INACTIVE}:
                return Response({"detail": "Status must be Active or Inactive"}, status=400)
            turning = value == Contact.Status.ACTIVE
            contact.status = value
        contact.save()
        if turning is not None:
            from .queue import set_leads_callable

            set_leads_callable(Contact.objects.filter(pk=contact.pk), turning)
            contact.refresh_from_db()
        return Response(ContactSerializer(contact).data)

    def delete(self, request, pk):
        require_perm(request.user, "edit_campaign")
        contact = scoped_leads(request.user, Contact.objects.all()).filter(pk=pk).first()
        if not contact:
            return Response({"detail": "Not found"}, status=404)
        from .queue import delete_leads

        result = delete_leads(Contact.objects.filter(pk=contact.pk))
        if result["deleted"] == 0:
            return Response({"detail": "This lead is on a live call"}, status=409)
        write_audit(request.user, "lead_delete", "contact", pk, request)
        return Response(result)


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


def _scoped_import_jobs(user):
    from django.db.models import Count, Q

    qs = (
        ImportJob.objects.filter(status=ImportJob.Status.DONE)
        .select_related("campaign", "created_by", "agency")
        .annotate(
            lead_count=Count("contacts"),
            inactive_count=Count("contacts", filter=Q(contacts__status=Contact.Status.INACTIVE)),
        )
        .order_by("-id")
    )
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if not org or not has_perm(user, "edit_campaign"):
        return qs.none()
    return qs.filter(Q(agency=org) | Q(campaign__agency=org))


class LeadFileListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_perm(request.user, "edit_campaign")
        return Response(ImportJobSerializer(_scoped_import_jobs(request.user)[:200], many=True).data)


class LeadFileDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        require_perm(request.user, "edit_campaign")
        job = _scoped_import_jobs(request.user).filter(pk=pk).first()
        if not job:
            return Response({"detail": "Not found"}, status=404)
        if "active" not in request.data:
            return Response({"detail": "active is required"}, status=400)
        active = request.data.get("active")
        if isinstance(active, str):
            active = active.lower() in {"1", "true", "yes"}
        else:
            active = bool(active)
        job.active = active
        job.save(update_fields=["active", "updated_at"])
        from .queue import set_leads_callable

        set_leads_callable(Contact.objects.filter(import_job=job), active)
        job = _scoped_import_jobs(request.user).filter(pk=pk).first()
        write_audit(request.user, "lead_file_active" if active else "lead_file_inactive", "import_job", job.id, request)
        return Response(ImportJobSerializer(job).data)

    def delete(self, request, pk):
        require_perm(request.user, "edit_campaign")
        job = _scoped_import_jobs(request.user).filter(pk=pk).first()
        if not job:
            return Response({"detail": "Not found"}, status=404)
        from .queue import delete_leads

        result = delete_leads(Contact.objects.filter(import_job=job))
        write_audit(request.user, "lead_file_delete", "import_job", job.id, request, result)
        return Response(result)


class LeadFileDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        require_perm(request.user, "edit_campaign")
        job = _scoped_import_jobs(request.user).filter(pk=pk).first()
        if not job or not job.source_file:
            return Response({"detail": "File not stored"}, status=404)
        from django.http import FileResponse

        name = job.file_name or job.source_file.name.rsplit("/", 1)[-1]
        lower = name.lower()
        if lower.endswith(".csv"):
            content_type = "text/csv"
        elif lower.endswith(".xls"):
            content_type = "application/vnd.ms-excel"
        else:
            content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return FileResponse(job.source_file.open("rb"), as_attachment=True, filename=name, content_type=content_type)


class ReleaseLeadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from telephony.modes import release_agent_reservations

        release_agent_reservations(request.user)
        return Response({"ok": True})
