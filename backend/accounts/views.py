from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import Call

from .access import (
    agency_of,
    has_perm,
    is_super_admin,
    require_perm,
    role_of,
    scoped_calls,
    scoped_campaigns,
    scoped_leads,
    scoped_users,
    staff_create_code,
    staff_manage_code,
)
from .models import AuditLog, Organization, User
from .serializers import (
    AuditLogSerializer,
    EmailTokenObtainPairSerializer,
    OrganizationSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .services import (
    assign_staff_campaigns,
    campaign_ids_from_payload,
    create_account,
    guard_staff_write,
    require_calling_campaigns,
    usage_for_agency,
    write_audit,
)


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            actor = User.objects.filter(email=request.data.get("email")).first()
            write_audit(actor, "login", request=request)
        return response


class RefreshView(TokenRefreshView):
    pass


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        write_audit(request.user, "logout", request=request)
        return Response({"ok": True})


class AgencyListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_perm(request.user, "manage_agency")
        qs = Organization.objects.all().order_by("name")
        if not is_super_admin(request.user):
            org = agency_of(request.user)
            qs = qs.filter(pk=org.pk) if org else qs.none()
        rows = []
        for org in qs:
            data = OrganizationSerializer(org).data
            data.update(usage_for_agency(org))
            data["managers_used"] = data["managers"]
            data["admins_used"] = data["admins"]
            data["users_used"] = data["users"]
            rows.append(data)
        return Response(rows)

    def post(self, request):
        require_perm(request.user, "create_agency")
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"detail": "Agency name is required"}, status=400)
        org = Organization.objects.create(
            name=name,
            timezone=request.data.get("timezone") or "Asia/Kolkata",
            max_managers=int(request.data.get("max_managers") or 10),
            max_admins=int(request.data.get("max_admins") or 30),
            max_users=int(request.data.get("max_users") or 300),
            subscription_status=request.data.get("subscription_status") or Organization.Subscription.ACTIVE,
        )
        email = (request.data.get("email") or "").strip()
        if email:
            create_account(
                request.user,
                email=email,
                password=request.data.get("password") or "ProCaller@2026",
                role=User.Role.AGENCY,
                organization=org,
                first_name=request.data.get("first_name") or name,
            )
        write_audit(request.user, "agency_create", "agency", org.id, request)
        data = OrganizationSerializer(org).data
        data.update(usage_for_agency(org))
        return Response(data, status=201)


class AgencyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get(self, request, pk):
        org = Organization.objects.filter(pk=pk).first()
        if not org:
            return None
        if not is_super_admin(request.user) and agency_of(request.user) != org:
            return False
        return org

    def get(self, request, pk):
        require_perm(request.user, "manage_agency")
        org = self._get(request, pk)
        if org is None:
            return Response({"detail": "Not found"}, status=404)
        if org is False:
            return Response({"detail": "Not allowed"}, status=403)
        data = OrganizationSerializer(org).data
        data.update(usage_for_agency(org))
        data["managers_used"] = data["managers"]
        data["admins_used"] = data["admins"]
        data["users_used"] = data["users"]
        return Response(data)

    def patch(self, request, pk):
        require_perm(request.user, "manage_agency")
        org = self._get(request, pk)
        if org is None:
            return Response({"detail": "Not found"}, status=404)
        if org is False:
            return Response({"detail": "Not allowed"}, status=403)
        for field in ("name", "timezone", "subscription_status", "is_active"):
            if field in request.data:
                setattr(org, field, request.data[field])
        if "ibr_enabled" in request.data or "port_group" in request.data:
            if not is_super_admin(request.user):
                return Response({"detail": "Only Super Admin can change IBR or GSM ports"}, status=403)
        if "ibr_enabled" in request.data:
            value = request.data.get("ibr_enabled")
            org.ibr_enabled = value.lower() in {"1", "true", "yes"} if isinstance(value, str) else bool(value)
        if "port_group" in request.data:
            from telephony.models import PortGroup

            raw = request.data.get("port_group")
            PortGroup.objects.filter(agency=org).update(agency=None)
            if raw:
                group = PortGroup.objects.filter(pk=raw, is_active=True).first()
                if not group:
                    return Response({"detail": "Port group not found"}, status=400)
                if group.agency_id and group.agency_id != org.id:
                    return Response({"detail": "Port group is assigned to another agency"}, status=400)
                group.agency = org
                group.save(update_fields=["agency"])
        for field in ("max_managers", "max_admins", "max_users"):
            if field in request.data:
                setattr(org, field, int(request.data[field]))
        org.save()
        write_audit(request.user, "agency_update", "agency", org.id, request)
        data = OrganizationSerializer(org).data
        data.update(usage_for_agency(org))
        return Response(data)

    def delete(self, request, pk):
        require_perm(request.user, "manage_agency")
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can delete an agency."}, status=403)
        org = self._get(request, pk)
        if org is None:
            return Response({"detail": "Not found"}, status=404)
        if org is False:
            return Response({"detail": "Not allowed"}, status=403)
        hard = str(request.query_params.get("hard") or request.data.get("hard") or "").lower() in {"1", "true", "yes"}
        if not hard and (org.members.exists() or org.campaigns.exists() or org.leads.exists()):
            org.is_active = False
            org.subscription_status = Organization.Subscription.SUSPENDED
            org.save(update_fields=["is_active", "subscription_status", "updated_at"])
            org.members.exclude(role=User.Role.SUPER_ADMIN).update(is_active=False)
            write_audit(request.user, "agency_deactivate", "agency", org.id, request)
            return Response(
                {
                    "ok": True,
                    "deactivated": True,
                    "detail": "Agency has team or campaigns, so it was deactivated instead of deleted.",
                }
            )
        org_id = org.id
        org.delete()
        write_audit(request.user, "agency_delete", "agency", org_id, request)
        return Response({"ok": True, "deleted": True})


class StaffListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request.query_params.get("role")
        qs = scoped_users(request.user).prefetch_related("assigned_campaigns")
        if role:
            aliases = [role]
            if role == "manager":
                aliases.append("supervisor")
            if role == "user":
                aliases.append("agent")
            qs = qs.filter(role__in=aliases)
        return Response(UserSerializer(qs.order_by("first_name", "email"), many=True).data)

    def post(self, request):
        role = request.data.get("role") or User.Role.USER
        require_perm(request.user, staff_create_code(role))
        org = None
        if request.data.get("organization"):
            org = Organization.objects.filter(pk=request.data["organization"]).first()
            own = agency_of(request.user)
            if not is_super_admin(request.user) and (not own or not org or org.id != own.id):
                return Response({"detail": "Cannot create accounts in another agency"}, status=403)
        reports_to = None
        if request.data.get("reports_to"):
            reports_to = scoped_users(request.user).filter(pk=request.data["reports_to"]).first()
            if not reports_to:
                return Response({"detail": "Manager is not in your agency"}, status=403)
        campaign_ids = campaign_ids_from_payload(request.data) or []
        try:
            require_calling_campaigns(role, campaign_ids)
            user = create_account(
                request.user,
                email=request.data.get("email"),
                password=request.data.get("password") or "ProCaller@2026",
                role=role,
                organization=org,
                reports_to=reports_to,
                first_name=request.data.get("first_name") or "",
                last_name=request.data.get("last_name") or "",
                team=request.data.get("team") or "",
                extension=request.data.get("extension") or "",
                sip_username=request.data.get("sip_username") or request.data.get("extension") or "",
                sip_password=request.data.get("sip_password") or request.data.get("extension") or "",
                max_admins=int(request.data.get("max_admins") or 5),
                max_users=int(request.data.get("max_users") or 50),
            )
            assign_staff_campaigns(request.user, user, campaign_ids, required=role in {User.Role.USER, User.Role.AGENT})
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        try:
            from telephony.channels import assign_user_port

            assign_user_port(user, request.data.get("gsm_port"))
        except ValueError as exc:
            user.delete()
            return Response({"detail": str(exc)}, status=400)
        write_audit(request.user, "user_create", "user", user.id, request, {"role": role})
        return Response(UserSerializer(user).data, status=201)


class StaffDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _target(self, request, pk):
        return scoped_users(request.user).filter(pk=pk).first()

    def get(self, request, pk):
        target = self._target(request, pk)
        if not target:
            return Response({"detail": "Not found"}, status=404)
        return Response(UserSerializer(target).data)

    def patch(self, request, pk):
        target = self._target(request, pk)
        if not target:
            return Response({"detail": "Not found"}, status=404)
        require_perm(request.user, staff_manage_code(target.role))
        new_role = request.data.get("role")
        if new_role:
            require_perm(request.user, staff_manage_code(new_role))
        if target.pk == request.user.pk and request.data.get("is_active") is False:
            return Response({"detail": "You cannot deactivate your own account."}, status=400)
        if is_super_admin(target) and request.data.get("role") and request.data.get("role") != User.Role.SUPER_ADMIN:
            remaining = User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True).exclude(pk=target.pk).count()
            if remaining < 1:
                return Response({"detail": "Cannot demote the last Super Admin."}, status=400)
        serializer = UserWriteSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data.pop("password", None)
        try:
            guard_staff_write(request.user, target, serializer.validated_data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=403)
        user = serializer.save()
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        campaign_ids = campaign_ids_from_payload(request.data)
        try:
            next_role = user.role
            if campaign_ids is not None:
                require_calling_campaigns(next_role, campaign_ids)
                assign_staff_campaigns(request.user, user, campaign_ids, required=next_role in {User.Role.USER, User.Role.AGENT})
            if "gsm_port" in request.data:
                from telephony.channels import assign_user_port

                assign_user_port(user, request.data.get("gsm_port"))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        write_audit(request.user, "user_update", "user", user.id, request, {"role": user.role})
        return Response(UserSerializer(user).data)

    def delete(self, request, pk):
        target = self._target(request, pk)
        if not target:
            return Response({"detail": "Not found"}, status=404)
        require_perm(request.user, staff_manage_code(target.role))
        if target.pk == request.user.pk:
            return Response({"detail": "You cannot delete your own account."}, status=400)
        if is_super_admin(target):
            remaining = User.objects.filter(role=User.Role.SUPER_ADMIN, is_active=True).exclude(pk=target.pk).count()
            if remaining < 1:
                return Response({"detail": "Cannot delete the last Super Admin."}, status=400)
        hard = str(request.query_params.get("hard") or request.data.get("hard") or "").lower() in {"1", "true", "yes"}
        if not hard and target.calls.exists():
            target.is_active = False
            target.save(update_fields=["is_active"])
            write_audit(request.user, "user_deactivate", "user", target.id, request)
            return Response(
                {
                    "ok": True,
                    "deactivated": True,
                    "detail": "Account has call history, so it was deactivated instead of deleted.",
                }
            )
        user_id = target.id
        target.delete()
        write_audit(request.user, "user_delete", "user", user_id, request)
        return Response({"ok": True, "deleted": True})


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = scoped_users(request.user)
        campaigns = scoped_campaigns(request.user, Campaign.objects.all())
        leads = scoped_leads(request.user, Contact.objects.all())
        calls = scoped_calls(request.user, Call.objects.all())
        if role_of(request.user) == User.Role.USER:
            leads = leads.filter(owner=request.user)
        usage = usage_for_agency(agency_of(request.user)) if agency_of(request.user) else None
        from telephony.models import AgentModeSession

        open_modes = AgentModeSession.objects.filter(ended_at__isnull=True, user_id__in=users.values("id"))
        return Response(
            {
                "role": role_of(request.user),
                "agencies": Organization.objects.count() if is_super_admin(request.user) else 1,
                "active_agencies": Organization.objects.filter(is_active=True).count() if is_super_admin(request.user) else int(bool(agency_of(request.user))),
                "managers": users.filter(role__in=["manager", "supervisor"]).count(),
                "admins": users.filter(role="admin").exclude(is_superuser=True).count(),
                "users": users.filter(role__in=["user", "agent"]).count(),
                "campaigns": campaigns.count(),
                "leads": leads.count(),
                "assigned_leads": leads.exclude(owner=None).count(),
                "pending_leads": leads.filter(lead_status__in=["new", "assigned", "callback"]).count(),
                "calls": calls.count(),
                "connected_calls": calls.filter(outcome="Connected").count(),
                "callbacks": leads.filter(lead_status="callback").count(),
                "online_agents": open_modes.exclude(mode="offline").count(),
                "preview_agents": open_modes.filter(mode="preview").count(),
                "manual_agents": open_modes.filter(mode="manual").count(),
                "break_agents": open_modes.filter(mode="break").count(),
                "usage": usage,
            }
        )


class AuditListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_perm(request.user, "view_audit_logs")
        qs = AuditLog.objects.select_related("user", "agency")
        if not is_super_admin(request.user):
            org = agency_of(request.user)
            qs = qs.filter(agency=org) if org else qs.filter(user=request.user)
        return Response(AuditLogSerializer(qs[:200], many=True).data)
