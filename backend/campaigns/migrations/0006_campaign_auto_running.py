from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("campaigns", "0005_dial_ratio"),
    ]

    operations = [
        migrations.AddField(
            model_name="campaign",
            name="auto_running",
            field=models.BooleanField(default=False),
        ),
    ]
