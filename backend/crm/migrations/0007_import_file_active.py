from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0006_contact_tts_audio"),
    ]

    operations = [
        migrations.AddField(
            model_name="importjob",
            name="active",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="importjob",
            name="source_file",
            field=models.FileField(blank=True, null=True, upload_to="imports/%Y/%m/%d/"),
        ),
        migrations.AddField(
            model_name="contact",
            name="import_job",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="contacts",
                to="crm.importjob",
            ),
        ),
    ]
