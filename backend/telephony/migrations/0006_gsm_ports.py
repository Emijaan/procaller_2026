from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_gateway(apps, schema_editor):
    GsmGateway = apps.get_model("telephony", "GsmGateway")
    host = "192.168.1.101"
    try:
        from django.conf import settings as dj_settings

        raw = (dj_settings.ASTERISK or {}).get("TRUNK") or "gsm222"
    except Exception:
        raw = "gsm222"
    GsmGateway.objects.get_or_create(
        sip_endpoint=raw,
        defaults={"name": raw, "host": host, "is_active": True},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_organization_ibr_enabled"),
        ("telephony", "0005_call_network_cause"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="GsmGateway",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("host", models.CharField(max_length=80)),
                ("sip_endpoint", models.CharField(default="gsm222", max_length=40)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="PortGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "agency",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="port_group",
                        to="accounts.organization",
                    ),
                ),
                (
                    "gateway",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="groups", to="telephony.gsmgateway"),
                ),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.CreateModel(
            name="GsmPort",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=80)),
                ("dial_prefix", models.CharField(blank=True, default="", max_length=32)),
                ("caller_id", models.CharField(blank=True, default="", max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                (
                    "assigned_user",
                    models.OneToOneField(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="gsm_port",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="ports", to="telephony.portgroup"),
                ),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.AddField(
            model_name="call",
            name="gsm_port",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="calls",
                to="telephony.gsmport",
            ),
        ),
        migrations.RunPython(seed_gateway, migrations.RunPython.noop),
    ]
