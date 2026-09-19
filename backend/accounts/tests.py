from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Organization, User
from accounts.services import create_account
from campaigns.models import Campaign
from crm.models import Contact


class TenantIsolationTests(TestCase):
    def setUp(self):
        self.a = Organization.objects.create(name="Agency A", max_managers=1, max_admins=1, max_users=1)
        self.b = Organization.objects.create(name="Agency B", max_managers=5, max_admins=5, max_users=5)
        self.super = User.objects.create_user(
            email="root@test.com", password="x", role=User.Role.SUPER_ADMIN, is_superuser=True
        )
        self.agency_a = User.objects.create_user(
            email="a@test.com", password="x", role=User.Role.AGENCY, organization=self.a
        )
        self.agency_b = User.objects.create_user(
            email="b@test.com", password="x", role=User.Role.AGENCY, organization=self.b
        )
        self.camp_a = Campaign.objects.create(name="A Camp", agency=self.a)
        self.camp_b = Campaign.objects.create(name="B Camp", agency=self.b)
        Contact.objects.create(name="Lead A", phone="9000000001", agency=self.a, campaign=self.camp_a)
        Contact.objects.create(name="Lead B", phone="9000000002", agency=self.b, campaign=self.camp_b)

    def _login(self, email):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": "x"}, format="json")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return client

    def test_agency_cannot_see_other_campaigns(self):
        client = self._login("a@test.com")
        res = client.get("/api/campaigns/")
        names = [row["name"] for row in res.data]
        self.assertIn("A Camp", names)
        self.assertNotIn("B Camp", names)

    def test_agency_cannot_see_other_leads(self):
        client = self._login("a@test.com")
        res = client.get("/api/leads/")
        phones = [row["phone"] for row in res.data]
        self.assertIn("9000000001", phones)
        self.assertNotIn("9000000002", phones)

    def test_agency_manager_limit(self):
        create_account(self.super, email="m1@a.com", password="x", role=User.Role.MANAGER, organization=self.a)
        with self.assertRaises(ValueError):
            create_account(self.super, email="m2@a.com", password="x", role=User.Role.MANAGER, organization=self.a)

    def test_login_invalid(self):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": "a@test.com", "password": "wrong"}, format="json")
        self.assertEqual(res.status_code, 401)

    def test_agency_cannot_fetch_other_campaign_by_id(self):
        client = self._login("a@test.com")
        res = client.get(f"/api/campaigns/{self.camp_b.id}/")
        self.assertEqual(res.status_code, 404)
