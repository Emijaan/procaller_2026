from django.core.management.base import BaseCommand

from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact


DEMO_CONTACTS = [
    ("Rajesh Kumar", "9876543210", "rajesh@abctech.in", "ABC Technologies", ["Hot Lead", "Enterprise"], 82),
    ("Meena Iyer", "8765432109", "meena@meridian.com", "Meridian Health", ["VIP"], 75),
    ("Arjun Bose", "7654321098", "arjun@novarealty.in", "Nova Realty", ["Callback"], 58),
    ("Sunita Desai", "6543210987", "sunita@vertex.io", "Vertex Solutions", [], 34),
    ("Vikram Nair", "5432109876", "vikram@cloudindia.com", "Cloud India", ["Interested", "High Priority"], 91),
    ("Kavitha Reddy", "4321098765", "kavitha@greenfields.in", "Greenfields Corp", ["Pricing"], 67),
    ("Rohan Gupta", "3210987654", "rohan@fincraft.com", "FinCraft", ["Enterprise"], 79),
    ("Divya Krishnan", "2109876543", "divya@startech.in", "StarTech India", ["Hot Lead"], 88),
]


class Command(BaseCommand):
    help = "Seed ProCaller demo users, campaign, and contacts"

    def handle(self, *args, **options):
        org, _ = Organization.objects.get_or_create(
            name="AP Infotech and Cyber Solution",
            defaults={"product_name": "ProCaller", "timezone": "Asia/Kolkata"},
        )
        admin, created = User.objects.get_or_create(
            email="admin@apinfotech.com",
            defaults={
                "first_name": "Aman",
                "last_name": "Kumar",
                "role": User.Role.ADMIN,
                "team": "Leadership",
                "extension": "2100",
                "sip_username": "2100",
                "sip_password": "2100",
                "avatar_initials": "AK",
                "organization": org,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created:
            admin.set_password("ProCaller@2026")
            admin.save()

        agent, created = User.objects.get_or_create(
            email="agent@apinfotech.com",
            defaults={
                "first_name": "Rahul",
                "last_name": "Sharma",
                "role": User.Role.AGENT,
                "team": "Sales Alpha",
                "extension": "2101",
                "sip_username": "2101",
                "sip_password": "2101",
                "avatar_initials": "RS",
                "organization": org,
            },
        )
        if created:
            agent.set_password("ProCaller@2026")
            agent.save()

        agent2, created = User.objects.get_or_create(
            email="agent2@apinfotech.com",
            defaults={
                "first_name": "Priya",
                "last_name": "Singh",
                "role": User.Role.AGENT,
                "team": "Sales Alpha",
                "extension": "2102",
                "sip_username": "2102",
                "sip_password": "2102",
                "avatar_initials": "PS",
                "organization": org,
            },
        )
        if created:
            agent2.set_password("ProCaller@2026")
            agent2.save()

        campaign, _ = Campaign.objects.get_or_create(
            name="Manual Outbound",
            defaults={
                "status": Campaign.Status.RUNNING,
                "dial_method": Campaign.DialMethod.MANUAL,
                "caller_id": "0000000000",
                "caller_id_name": "ProCaller",
            },
        )

        for name, phone, email, company, tags, score in DEMO_CONTACTS:
            Contact.objects.get_or_create(
                phone=phone,
                defaults={
                    "name": name,
                    "email": email,
                    "company": company,
                    "tags": tags,
                    "lead_score": score,
                    "owner": agent,
                    "campaign": campaign,
                    "comments": "Imported for ProCaller manual-calling launch.",
                    "status": Contact.Status.INACTIVE if name == "Sunita Desai" else Contact.Status.ACTIVE,
                },
            )

        self.stdout.write(self.style.SUCCESS("Seeded ProCaller demo data."))
        self.stdout.write("Admin  admin@apinfotech.com / ProCaller@2026  ext 1000")
        self.stdout.write("Agent  agent@apinfotech.com / ProCaller@2026  ext 1001")
        self.stdout.write("Agent2 agent2@apinfotech.com / ProCaller@2026  ext 1002")
