from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0003_preview_autodial"),
    ]

    operations = [
        migrations.AddField(
            model_name="importjob",
            name="dial_threads",
            field=models.PositiveSmallIntegerField(default=1),
        ),
    ]
