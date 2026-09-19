from rest_framework import serializers

from .models import Campaign


class CampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = ("id", "name", "status", "dial_method", "caller_id", "caller_id_name", "active")
