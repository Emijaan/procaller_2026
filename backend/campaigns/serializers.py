from rest_framework import serializers

from .models import Campaign


class CampaignSerializer(serializers.ModelSerializer):
    agency_name = serializers.CharField(source="agency.name", read_only=True, default="")
    manager_name = serializers.CharField(source="manager.display_name", read_only=True, default="")
    admin_name = serializers.CharField(source="admin.display_name", read_only=True, default="")
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default="")
    lead_count = serializers.IntegerField(source="contacts.count", read_only=True)
    assigned_users = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    assigned_count = serializers.IntegerField(source="assigned_users.count", read_only=True)
    has_hold_audio = serializers.SerializerMethodField()
    hold_audio_name = serializers.SerializerMethodField()

    def get_has_hold_audio(self, obj):
        return bool(obj.hold_audio)

    def get_hold_audio_name(self, obj):
        if not obj.hold_audio:
            return ""
        return obj.hold_audio.name.rsplit("/", 1)[-1]

    class Meta:
        model = Campaign
        fields = (
            "id",
            "name",
            "description",
            "status",
            "dial_method",
            "caller_id",
            "caller_id_name",
            "active",
            "agency",
            "agency_name",
            "manager",
            "manager_name",
            "admin",
            "admin_name",
            "created_by",
            "created_by_name",
            "assigned_users",
            "assigned_count",
            "lead_count",
            "has_hold_audio",
            "hold_audio_name",
            "code",
            "wrap_up_seconds",
            "dial_ratio",
            "created_at",
            "updated_at",
        )
