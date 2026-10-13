from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0004_importjob_dial_threads"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="contact",
            constraint=models.UniqueConstraint(
                condition=models.Q(campaign__isnull=False),
                fields=("campaign", "phone"),
                name="unique_lead_phone_per_campaign",
            ),
        ),
    ]
