from rest_framework import serializers

from .models import Contact, FollowUp


class ContactSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.display_name", read_only=True, default="")
    campaign_name = serializers.CharField(source="campaign.name", read_only=True, default="")

    class Meta:
        model = Contact
        fields = (
            "id",
            "name",
            "phone",
            "email",
            "company",
            "status",
            "owner",
            "owner_name",
            "campaign",
            "campaign_name",
            "tags",
            "lead_score",
            "comments",
            "last_disposition",
            "last_contact_at",
            "lead_status",
            "extra_data",
            "agency",
            "next_callback_at",
            "call_count",
            "dnc",
        )


class FollowUpSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUp
        fields = ("id", "contact", "agent", "reason", "due_at", "priority", "status")
