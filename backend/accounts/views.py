from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import Call

from .access import agency_of, has_perm, is_super_admin, require_perm, role_of, scoped_campaigns, scoped_leads, scoped_users
from .models import AuditLog, Organization, User
from .serializers import (
    AuditLogSerializer,
    EmailTokenObtainPairSerializer,
    OrganizationSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .services import create_account, usage_for_agency, write_audit


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
        for field in ("max_managers", "max_admins", "max_users"):
            if field in request.data:
                setattr(org, field, int(request.data[field]))
        org.save()
        write_audit(request.user, "agency_update", "agency", org.id, request)
        data = OrganizationSerializer(org).data
        data.update(usage_for_agency(org))
        return Response(data)


class StaffListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request.query_params.get("role")
        qs = scoped_users(request.user)
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
        perm_map = {
            User.Role.MANAGER: "create_manager",
            User.Role.ADMIN: "create_admin",
            User.Role.USER: "create_user",
            User.Role.AGENCY: "create_agency",
        }
        require_perm(request.user, perm_map.get(role, "manage_user"))
        org = None
        if request.data.get("organization"):
            org = Organization.objects.filter(pk=request.data["organization"]).first()
        reports_to = None
        if request.data.get("reports_to"):
            reports_to = scoped_users(request.user).filter(pk=request.data["reports_to"]).first()
        try:
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
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        write_audit(request.user, "user_create", "user", user.id, request, {"role": role})
        return Response(UserSerializer(user).data, status=201)


class StaffDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        target = scoped_users(request.user).filter(pk=pk).first()
        if not target:
            return Response({"detail": "Not found"}, status=404)
        require_perm(request.user, "manage_user")
        serializer = UserWriteSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        password = serializer.validated_data.pop("password", None)
        user = serializer.save()
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        write_audit(request.user, "user_update", "user", user.id, request)
        return Response(UserSerializer(user).data)


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = scoped_users(request.user)
        campaigns = scoped_campaigns(request.user, Campaign.objects.all())
        leads = scoped_leads(request.user, Contact.objects.all())
        calls = Call.objects.all()
        if not is_super_admin(request.user):
            org = agency_of(request.user)
            if org:
                calls = calls.filter(Q(agent__organization=org) | Q(campaign__agency=org))
            else:
                calls = calls.filter(agent=request.user)
            if role_of(request.user) == User.Role.USER:
                calls = calls.filter(agent=request.user)
                leads = leads.filter(owner=request.user)
        usage = usage_for_agency(agency_of(request.user)) if agency_of(request.user) else None
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
