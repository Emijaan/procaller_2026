from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_organization_ibr_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="pc_number",
            field=models.PositiveIntegerField(blank=True, null=True, unique=True),
        ),
    ]
