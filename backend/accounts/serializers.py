from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Organization, User


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ("id", "name", "product_name", "timezone")


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)
    organization = OrganizationSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "team",
            "extension",
            "presence",
            "avatar_initials",
            "organization",
        )


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
