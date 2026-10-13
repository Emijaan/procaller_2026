from django.db import migrations, models


def seed_observed_ports(apps, schema_editor):
    """Record the 16 ports seen on SMG4016. Prefix and SIM number stay blank until known."""
    GsmGateway = apps.get_model("telephony", "GsmGateway")
    PortGroup = apps.get_model("telephony", "PortGroup")
    GsmPort = apps.get_model("telephony", "GsmPort")
    gateway = GsmGateway.objects.filter(sip_endpoint="gsm222").first()
    if not gateway:
        return
    group, _created = PortGroup.objects.get_or_create(
        gateway=gateway,
        name="SMG4016 observed ports",
        defaults={"is_active": True},
    )
    for number in range(1, 17):
        GsmPort.objects.get_or_create(
            group=group,
            synway_port=number,
            defaults={
                "name": f"Port {number}",
                "sip_account": str(8000 + number),
                "dial_prefix": "",
                "caller_id": "",
                "is_active": number != 9,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ("telephony", "0006_gsm_ports"),
    ]

    operations = [
        migrations.AddField(
            model_name="gsmport",
            name="sip_account",
            field=models.CharField(blank=True, default="", max_length=32),
        ),
        migrations.AddField(
            model_name="gsmport",
            name="synway_port",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(seed_observed_ports, migrations.RunPython.noop),
    ]
