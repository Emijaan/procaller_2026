from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_permission_alter_organization_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="auth_epoch",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
