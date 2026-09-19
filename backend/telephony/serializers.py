from rest_framework import serializers

from .models import AgentSession, Call
from .utils import format_duration, initials_from_name


class CallSerializer(serializers.ModelSerializer):
    customer = serializers.SerializerMethodField()
    agent_name = serializers.CharField(source="agent.display_name", read_only=True)
    campaign_name = serializers.SerializerMethodField()
    contact_name = serializers.SerializerMethodField()
    contact_company = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    contact_tags = serializers.SerializerMethodField()
    contact_score = serializers.SerializerMethodField()
    contact_status = serializers.SerializerMethodField()
    contact_comments = serializers.SerializerMethodField()
    last_disposition = serializers.SerializerMethodField()
    initials = serializers.SerializerMethodField()
    duration = serializers.SerializerMethodField()
    date = serializers.DateTimeField(source="started_at", read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Call
        fields = (
            "id",
            "phone_number",
            "customer",
            "agent_name",
            "campaign",
            "campaign_name",
            "contact",
            "contact_name",
            "contact_company",
            "contact_email",
            "contact_tags",
            "contact_score",
            "contact_status",
            "contact_comments",
            "last_disposition",
            "initials",
            "direction",
            "state",
            "status",
            "outcome",
            "disposition",
            "notes",
            "muted",
            "on_hold",
            "recording",
            "media_mode",
            "duration",
            "duration_seconds",
            "date",
            "started_at",
            "answered_at",
            "ended_at",
        )

    def _contact(self, obj):
        return obj.contact if obj.contact_id else None

    def get_customer(self, obj):
        contact = self._contact(obj)
        return contact.name if contact else obj.phone_number

    def get_campaign_name(self, obj):
        return obj.campaign.name if obj.campaign_id else ""

    def get_contact_name(self, obj):
        contact = self._contact(obj)
        return contact.name if contact else ""

    def get_contact_company(self, obj):
        contact = self._contact(obj)
        return contact.company if contact else ""

    def get_contact_email(self, obj):
        contact = self._contact(obj)
        return contact.email if contact else ""

    def get_contact_tags(self, obj):
        contact = self._contact(obj)
        return contact.tags if contact else []

    def get_contact_score(self, obj):
        contact = self._contact(obj)
        return contact.lead_score if contact else 0

    def get_contact_status(self, obj):
        contact = self._contact(obj)
        return contact.status if contact else ""

    def get_contact_comments(self, obj):
        contact = self._contact(obj)
        return contact.comments if contact else ""

    def get_last_disposition(self, obj):
        contact = self._contact(obj)
        return contact.last_disposition if contact else ""

    def get_initials(self, obj):
        return initials_from_name(self.get_customer(obj))

    def get_duration(self, obj):
        return format_duration(obj.duration_seconds)

    def get_status(self, obj):
        if obj.state != Call.State.ENDED:
            return obj.get_state_display()
        return obj.outcome or "Ended"


class AgentSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentSession
        fields = ("id", "room_id", "status", "campaign", "started_at")
