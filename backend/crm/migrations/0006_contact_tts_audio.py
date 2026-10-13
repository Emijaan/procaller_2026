from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0005_unique_lead_phone_per_campaign"),
    ]

    operations = [
        migrations.AddField(
            model_name="contact",
            name="tts_audio",
            field=models.FileField(blank=True, null=True, upload_to="tts/%Y/%m/%d/"),
        ),
        migrations.AddField(
            model_name="contact",
            name="tts_error",
            field=models.CharField(blank=True, default="", max_length=240),
        ),
        migrations.AddField(
            model_name="contact",
            name="tts_status",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
    ]
