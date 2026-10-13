from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_user_auth_epoch"),
    ]

    operations = [
        migrations.AddField(
            model_name="organization",
            name="ibr_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
