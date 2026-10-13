from rest_framework import serializers

from .models import Contact, FollowUp


class ContactSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.display_name", read_only=True, default="")
    campaign_name = serializers.CharField(source="campaign.name", read_only=True, default="")
    import_file_name = serializers.SerializerMethodField()
    disposition_code = serializers.SerializerMethodField()
    disposition_label = serializers.SerializerMethodField()

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
            "tts_status",
            "tts_error",
            "tts_audio",
            "last_contact_at",
            "lead_status",
            "extra_data",
            "agency",
            "next_callback_at",
            "call_count",
            "dnc",
            "import_job",
            "import_file_name",
            "disposition_code",
            "disposition_label",
        )

    def get_import_file_name(self, obj):
        job = getattr(obj, "import_job", None)
        return job.file_name if job else ""

    def _disposition(self, obj):
        cached = getattr(obj, "_disposition_pair", None)
        if cached is None:
            from telephony.causes import lead_disposition

            cached = lead_disposition(obj)
            obj._disposition_pair = cached
        return cached

    def get_disposition_code(self, obj):
        return self._disposition(obj)["disposition_code"]

    def get_disposition_label(self, obj):
        return self._disposition(obj)["disposition_label"]


class ImportJobSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source="campaign.name", read_only=True, default="")
    created_by_name = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()
    lead_count = serializers.IntegerField(read_only=True)
    inactive_count = serializers.IntegerField(read_only=True)

    class Meta:
        from .models import ImportJob

        model = ImportJob
        fields = (
            "id",
            "file_name",
            "campaign",
            "campaign_name",
            "created_by_name",
            "imported_rows",
            "dial_threads",
            "active",
            "has_file",
            "lead_count",
            "inactive_count",
            "created_at",
        )

    def get_created_by_name(self, obj):
        user = obj.created_by
        return user.display_name if user else ""

    def get_has_file(self, obj):
        return bool(obj.source_file)


class FollowUpSerializer(serializers.ModelSerializer):
    class Meta:
        model = FollowUp
        fields = ("id", "contact", "agent", "reason", "due_at", "priority", "status")
