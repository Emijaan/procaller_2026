from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .access import role_of
from .catalog import PERMISSION_LABELS, ROLE_PERMISSIONS
from .models import AuditLog, Organization, User


class OrganizationSerializer(serializers.ModelSerializer):
    managers_used = serializers.IntegerField(read_only=True, default=0)
    admins_used = serializers.IntegerField(read_only=True, default=0)
    users_used = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "product_name",
            "timezone",
            "is_active",
            "subscription_status",
            "max_managers",
            "max_admins",
            "max_users",
            "managers_used",
            "admins_used",
            "users_used",
            "created_at",
        )


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    organization = OrganizationSerializer(read_only=True)
    role_normalized = serializers.CharField(source="normalized_role", read_only=True)
    permissions = serializers.SerializerMethodField()
    reports_to_name = serializers.CharField(source="reports_to.display_name", read_only=True, default="")

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "role_normalized",
            "team",
            "extension",
            "presence",
            "avatar_initials",
            "organization",
            "reports_to",
            "reports_to_name",
            "extra_permissions",
            "denied_permissions",
            "permissions",
            "max_admins",
            "max_users",
            "is_active",
        )

    def get_permissions(self, obj):
        codes = set(ROLE_PERMISSIONS.get(role_of(obj), []))
        codes.update(obj.extra_permissions or [])
        codes.difference_update(obj.denied_permissions or [])
        if obj.is_superuser or role_of(obj) == User.Role.SUPER_ADMIN:
            codes.update(PERMISSION_LABELS.keys())
        return sorted(codes)


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "email",
            "password",
            "first_name",
            "last_name",
            "role",
            "team",
            "extension",
            "sip_username",
            "sip_password",
            "organization",
            "reports_to",
            "extra_permissions",
            "denied_permissions",
            "max_admins",
            "max_users",
            "is_active",
        )


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True, default="")
    agency_name = serializers.CharField(source="agency.name", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "user",
            "user_name",
            "agency",
            "agency_name",
            "action",
            "object_type",
            "object_id",
            "ip_address",
            "metadata",
            "created_at",
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
