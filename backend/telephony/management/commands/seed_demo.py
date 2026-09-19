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
            defaults={
                "product_name": "ProCaller",
                "timezone": "Asia/Kolkata",
                "max_managers": 10,
                "max_admins": 30,
                "max_users": 300,
            },
        )
        admin, created = User.objects.get_or_create(
            email="admin@apinfotech.com",
            defaults={
                "first_name": "Aman",
                "last_name": "Kumar",
                "role": User.Role.SUPER_ADMIN,
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
        else:
            admin.role = User.Role.SUPER_ADMIN
            admin.is_superuser = True
            admin.organization = org
            admin.save(update_fields=["role", "is_superuser", "organization"])

        agency_user, created = User.objects.get_or_create(
            email="agency@apinfotech.com",
            defaults={
                "first_name": "AP",
                "last_name": "Infotech",
                "role": User.Role.AGENCY,
                "team": "Agency",
                "organization": org,
                "avatar_initials": "AI",
            },
        )
        if created:
            agency_user.set_password("ProCaller@2026")
            agency_user.save()
        else:
            agency_user.role = User.Role.AGENCY
            agency_user.is_superuser = False
            agency_user.organization = org
            agency_user.save(update_fields=["role", "is_superuser", "organization"])

        manager, created = User.objects.get_or_create(
            email="manager@apinfotech.com",
            defaults={
                "first_name": "Amit",
                "last_name": "Verma",
                "role": User.Role.MANAGER,
                "team": "Collections",
                "organization": org,
                "reports_to": agency_user,
                "max_admins": 5,
                "max_users": 50,
                "avatar_initials": "AV",
            },
        )
        if created:
            manager.set_password("ProCaller@2026")
            manager.save()
        else:
            manager.role = User.Role.MANAGER
            manager.is_superuser = False
            manager.organization = org
            manager.reports_to = agency_user
            manager.save(update_fields=["role", "is_superuser", "organization", "reports_to"])

        camp_admin, created = User.objects.get_or_create(
            email="campaign.admin@apinfotech.com",
            defaults={
                "first_name": "Neha",
                "last_name": "Joshi",
                "role": User.Role.ADMIN,
                "team": "Collections",
                "organization": org,
                "reports_to": manager,
                "avatar_initials": "NJ",
            },
        )
        if created:
            camp_admin.set_password("ProCaller@2026")
            camp_admin.save()
        else:
            camp_admin.role = User.Role.ADMIN
            camp_admin.is_superuser = False
            camp_admin.organization = org
            camp_admin.reports_to = manager
            camp_admin.save(update_fields=["role", "is_superuser", "organization", "reports_to"])

        agent, created = User.objects.get_or_create(
            email="agent@apinfotech.com",
            defaults={
                "first_name": "Rahul",
                "last_name": "Sharma",
                "role": User.Role.USER,
                "team": "Sales Alpha",
                "extension": "2101",
                "sip_username": "2101",
                "sip_password": "2101",
                "avatar_initials": "RS",
                "organization": org,
                "reports_to": camp_admin,
            },
        )
        if created:
            agent.set_password("ProCaller@2026")
            agent.save()
        else:
            agent.role = User.Role.USER
            agent.is_superuser = False
            agent.organization = org
            agent.reports_to = camp_admin
            agent.save(update_fields=["role", "is_superuser", "organization", "reports_to"])

        agent2, created = User.objects.get_or_create(
            email="agent2@apinfotech.com",
            defaults={
                "first_name": "Priya",
                "last_name": "Singh",
                "role": User.Role.USER,
                "team": "Sales Alpha",
                "extension": "2102",
                "sip_username": "2102",
                "sip_password": "2102",
                "avatar_initials": "PS",
                "organization": org,
                "reports_to": camp_admin,
            },
        )
        if created:
            agent2.set_password("ProCaller@2026")
            agent2.save()
        else:
            agent2.role = User.Role.USER
            agent2.is_superuser = False
            agent2.organization = org
            agent2.reports_to = camp_admin
            agent2.save(update_fields=["role", "is_superuser", "organization", "reports_to"])

        campaign, _ = Campaign.objects.get_or_create(
            name="Manual Outbound",
            defaults={
                "status": Campaign.Status.ACTIVE,
                "dial_method": Campaign.DialMethod.MANUAL,
                "caller_id": "0000000000",
                "caller_id_name": "ProCaller",
                "agency": org,
                "manager": manager,
                "admin": camp_admin,
                "created_by": camp_admin,
            },
        )
        campaign.agency = org
        campaign.manager = manager
        campaign.admin = camp_admin
        campaign.save()
        campaign.assigned_users.set([agent, agent2])

        for name, phone, email, company, tags, score in DEMO_CONTACTS:
            contact, created = Contact.objects.get_or_create(
                phone=phone,
                defaults={
                    "name": name,
                    "email": email,
                    "company": company,
                    "tags": tags,
                    "lead_score": score,
                    "owner": agent,
                    "campaign": campaign,
                    "agency": org,
                    "lead_status": Contact.LeadStatus.ASSIGNED,
                    "extra_data": {"product": "Personal Loan", "city": "Delhi"},
                    "comments": "Imported for ProCaller manual-calling launch.",
                    "status": Contact.Status.INACTIVE if name == "Sunita Desai" else Contact.Status.ACTIVE,
                },
            )
            if not created:
                contact.agency = org
                contact.campaign = campaign
                contact.owner = agent
                contact.lead_status = contact.lead_status or Contact.LeadStatus.ASSIGNED
                if not contact.extra_data:
                    contact.extra_data = {"product": "Personal Loan", "city": "Delhi"}
                contact.save()

        self.stdout.write(self.style.SUCCESS("Seeded ProCaller hierarchy demo data."))
        self.stdout.write("Super Admin  admin@apinfotech.com / ProCaller@2026")
        self.stdout.write("Agency       agency@apinfotech.com / ProCaller@2026")
        self.stdout.write("Manager      manager@apinfotech.com / ProCaller@2026")
        self.stdout.write("Admin        campaign.admin@apinfotech.com / ProCaller@2026")
        self.stdout.write("User         agent@apinfotech.com / ProCaller@2026  ext 2101")
