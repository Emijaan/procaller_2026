from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("campaigns", "0006_campaign_auto_running"),
    ]

    operations = [
        migrations.AddField(
            model_name="campaign",
            name="campaign_type",
            field=models.CharField(
                choices=[("live", "Live agent"), ("ibr", "IBR broadcast")],
                default="live",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="campaign",
            name="tts_prompt",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="campaign",
            name="tts_voice",
            field=models.CharField(blank=True, default="", max_length=80),
        ),
    ]
