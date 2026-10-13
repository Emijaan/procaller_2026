from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("telephony", "0004_dial_ratio"),
    ]

    operations = [
        migrations.AddField(
            model_name="call",
            name="cause_code",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="call",
            name="cause_text",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AlterField(
            model_name="call",
            name="outcome",
            field=models.CharField(
                blank=True,
                choices=[
                    ("Connected", "Connected"),
                    ("No Answer", "No Answer"),
                    ("Busy", "Busy"),
                    ("Failed", "Failed"),
                    ("Cancelled", "Cancelled"),
                    ("Unknown", "Unknown"),
                    ("Switch Off", "Switch Off"),
                    ("Not Reachable", "Not Reachable"),
                    ("Out of Service Area", "Out of Service Area"),
                    ("Incoming Calls Not Allowed", "Incoming Calls Not Allowed"),
                ],
                default="",
                max_length=64,
            ),
        ),
    ]
