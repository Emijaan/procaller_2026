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

    def test_recordings_are_agency_scoped(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from telephony.models import Call

        call_a = Call.objects.create(
            agent=self.agency_a,
            campaign=self.camp_a,
            phone_number="9000000001",
            callerid_token="rec-a",
            recording=True,
        )
        call_a.recording_file.save("a.webm", SimpleUploadedFile("a.webm", b"RIFF" + b"0" * 64), save=True)
        call_b = Call.objects.create(
            agent=self.agency_b,
            campaign=self.camp_b,
            phone_number="9000000002",
            callerid_token="rec-b",
            recording=True,
        )
        call_b.recording_file.save("b.webm", SimpleUploadedFile("b.webm", b"RIFF" + b"1" * 64), save=True)

        agency_client = self._login("a@test.com")
        listed = agency_client.get("/api/recordings/")
        ids = [row["id"] for row in listed.data["results"]]
        self.assertIn(call_a.id, ids)
        self.assertNotIn(call_b.id, ids)
        self.assertEqual(listed.data["results"][0]["phone_number"], "9000000001")
        self.assertEqual(listed.data["results"][0]["campaign_name"], "A Camp")
        self.assertEqual(listed.data["results"][0]["agency_name"], "Agency A")
        self.assertEqual(listed.data["results"][0]["user_name"], self.agency_a.display_name)
        self.assertEqual(listed.data["results"][0]["campaign_id"], self.camp_a.id)

        other = agency_client.get(f"/api/recordings/{call_b.id}/file/")
        self.assertEqual(other.status_code, 404)
        own = agency_client.get(f"/api/recordings/{call_a.id}/file/")
        self.assertEqual(own.status_code, 200)

        root = self._login("root@test.com")
        all_rows = root.get("/api/recordings/")
        all_ids = [row["id"] for row in all_rows.data["results"]]
        self.assertIn(call_a.id, all_ids)
        self.assertIn(call_b.id, all_ids)

    def test_super_admin_can_edit_deactivate_and_delete_staff(self):
        root = self._login("root@test.com")
        created = root.post(
            "/api/staff/",
            {
                "email": "mgr@a.com",
                "password": "x",
                "role": "manager",
                "first_name": "Meg",
                "organization": self.a.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        patched = root.patch(f"/api/staff/{pk}/", {"team": "Collections", "last_name": "Shah"}, format="json")
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["team"], "Collections")
        deactivated = root.patch(f"/api/staff/{pk}/", {"is_active": False}, format="json")
        self.assertEqual(deactivated.status_code, 200)
        self.assertFalse(deactivated.data["is_active"])
        deleted = root.delete(f"/api/staff/{pk}/")
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.data.get("deleted") or deleted.data.get("deactivated"))
        self.assertFalse(User.objects.filter(pk=pk, is_active=True).exists())

    def test_super_admin_cannot_delete_self(self):
        root = self._login("root@test.com")
        res = root.delete(f"/api/staff/{self.super.id}/")
        self.assertEqual(res.status_code, 400)

    def test_agency_cannot_manage_other_tenant_staff(self):
        client = self._login("a@test.com")
        res = client.patch(f"/api/staff/{self.agency_b.id}/", {"team": "Nope"}, format="json")
        self.assertEqual(res.status_code, 404)

    def test_super_admin_can_edit_and_deactivate_agency(self):
        root = self._login("root@test.com")
        created = root.post(
            "/api/agencies/",
            {"name": "New Co", "email": "newco@test.com", "max_managers": 2, "max_admins": 2, "max_users": 5},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        pk = created.data["id"]
        patched = root.patch(f"/api/agencies/{pk}/", {"max_users": 9, "name": "New Co Ltd"}, format="json")
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data["max_users"], 9)
        self.assertEqual(patched.data["name"], "New Co Ltd")
        paused = root.patch(f"/api/agencies/{pk}/", {"is_active": False, "subscription_status": "suspended"}, format="json")
        self.assertEqual(paused.status_code, 200)
        self.assertFalse(paused.data["is_active"])
        removed = root.delete(f"/api/agencies/{pk}/")
        self.assertEqual(removed.status_code, 200)

    def test_user_create_requires_campaign(self):
        root = self._login("root@test.com")
        missing = root.post(
            "/api/staff/",
            {
                "email": "caller@a.com",
                "password": "x",
                "role": "user",
                "organization": self.a.id,
            },
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("campaign", str(missing.data).lower())
        created = root.post(
            "/api/staff/",
            {
                "email": "caller@a.com",
                "password": "x",
                "role": "user",
                "organization": self.a.id,
                "campaign": self.camp_a.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["campaign_ids"], [self.camp_a.id])
        self.assertIn("A Camp", created.data["campaign_names"])
        user = User.objects.get(pk=created.data["id"])
        self.assertTrue(self.camp_a.assigned_users.filter(pk=user.id).exists())

    def test_agency_can_create_edit_and_delete_users_on_its_own_line(self):
        client = self._login("a@test.com")
        created = client.post(
            "/api/staff/",
            {"email": "line-user@a.com", "password": "x", "role": "user", "campaign": self.camp_a.id},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        org = created.data["organization"]
        self.assertEqual(org["id"] if isinstance(org, dict) else org, self.a.id)
        pk = created.data["id"]
        edited = client.patch(f"/api/staff/{pk}/", {"first_name": "Line"}, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data["first_name"], "Line")
        other = client.patch(f"/api/staff/{self.agency_b.id}/", {"first_name": "Nope"}, format="json")
        self.assertEqual(other.status_code, 404)
        planted = client.post(
            "/api/staff/",
            {
                "email": "line-user@b.com",
                "password": "x",
                "role": "user",
                "organization": self.b.id,
                "campaign": self.camp_b.id,
            },
            format="json",
        )
        self.assertEqual(planted.status_code, 403)
        self.assertFalse(User.objects.filter(email="line-user@b.com").exists())
        removed = client.delete(f"/api/staff/{pk}/")
        self.assertEqual(removed.status_code, 200, removed.data)
        self.assertFalse(User.objects.filter(pk=pk).exists())

    def test_agency_cannot_cross_into_another_agency_by_id(self):
        from telephony.models import Call

        client = self._login("a@test.com")
        listed = client.get("/api/agencies/")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["id"] for row in listed.data], [self.a.id])
        other_agency = client.get(f"/api/agencies/{self.b.id}/")
        self.assertIn(other_agency.status_code, (403, 404))
        other_staff = client.get(f"/api/staff/{self.agency_b.id}/")
        self.assertEqual(other_staff.status_code, 404)

        created = client.post(
            "/api/staff/",
            {
                "email": "planted@b.com",
                "password": "x",
                "role": "manager",
                "organization": self.b.id,
                "reports_to": self.agency_b.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 403, created.data)
        self.assertFalse(User.objects.filter(email="planted@b.com").exists())

        own = client.post(
            "/api/staff/",
            {
                "email": "mgr-a@test.com",
                "password": "x",
                "role": "manager",
                "first_name": "In",
                "organization": self.a.id,
            },
            format="json",
        )
        self.assertEqual(own.status_code, 201, own.data)
        moved = client.patch(
            f"/api/staff/{own.data['id']}/",
            {"organization": self.b.id, "reports_to": self.agency_b.id, "extra_permissions": ["create_agency"]},
            format="json",
        )
        self.assertEqual(moved.status_code, 403, moved.data)
        kept = User.objects.get(pk=own.data["id"])
        self.assertEqual(kept.organization_id, self.a.id)
        self.assertNotIn("create_agency", kept.extra_permissions or [])

        lead = client.post(
            "/api/leads/",
            {"name": "Stolen", "phone": "9111111111", "campaign": self.camp_b.id, "owner": self.agency_b.id},
            format="json",
        )
        self.assertEqual(lead.status_code, 404, lead.data)
        self.assertFalse(Contact.objects.filter(phone="9111111111").exists())

        call_b = Call.objects.create(
            agent=self.agency_b,
            campaign=self.camp_b,
            phone_number="9000000002",
            callerid_token="iso-b",
        )
        answered = client.post(f"/api/calls/{call_b.id}/answer/", {}, format="json")
        self.assertEqual(answered.status_code, 404)
        uploaded = client.post(f"/api/calls/{call_b.id}/recording/", {}, format="multipart")
        self.assertEqual(uploaded.status_code, 404)
        session = client.post("/api/telephony/session/", {"campaign_id": self.camp_b.id}, format="json")
        self.assertEqual(session.status_code, 404)
        mode = client.post("/api/agent/mode/", {"mode": "manual", "campaign_id": self.camp_b.id}, format="json")
        self.assertEqual(mode.status_code, 404)

        shared = Campaign.objects.create(name="Unassigned", agency=None)
        names = [row["name"] for row in client.get("/api/campaigns/").data]
        self.assertNotIn("Unassigned", names)
        root = self._login("root@test.com")
        root_names = [row["name"] for row in root.get("/api/campaigns/").data]
        self.assertIn("Unassigned", root_names)
        self.assertIn("B Camp", root_names)
        both = root.get("/api/staff/")
        emails = [row["email"] for row in both.data]
        self.assertIn("a@test.com", emails)
        self.assertIn("b@test.com", emails)
        self.assertEqual(shared.agency_id, None)

    def test_agency_created_on_the_team_page_does_not_see_the_platform_company(self):
        platform = Organization.objects.create(name="Platform")
        self.super.organization = platform
        self.super.save(update_fields=["organization"])
        User.objects.create_user(email="other@platform.com", password="x", role=User.Role.USER, organization=platform)
        root = self._login("root@test.com")
        missing = root.post(
            "/api/staff/",
            {
                "email": "nolimits@test.com",
                "password": "x",
                "role": "agency",
                "first_name": "No Limits",
            },
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        created = root.post(
            "/api/staff/",
            {
                "email": "mittal@test.com",
                "password": "x",
                "role": "agency",
                "first_name": "Mittal Enterprises",
                "organization": platform.id,
                "max_managers": 1,
                "max_admins": 2,
                "max_users": 3,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        org = created.data["organization"]
        org_id = org["id"] if isinstance(org, dict) else org
        self.assertNotEqual(org_id, platform.id)
        self.assertEqual(org["name"], "Mittal Enterprises")
        self.assertEqual(org["max_managers"], 1)
        self.assertEqual(org["max_admins"], 2)
        self.assertEqual(org["max_users"], 3)
        client = self._login("mittal@test.com")
        first_manager = client.post(
            "/api/staff/",
            {"email": "manager1@test.com", "password": "x", "role": "manager", "first_name": "One"},
            format="json",
        )
        self.assertEqual(first_manager.status_code, 201, first_manager.data)
        second_manager = client.post(
            "/api/staff/",
            {"email": "manager2@test.com", "password": "x", "role": "manager", "first_name": "Two"},
            format="json",
        )
        self.assertEqual(second_manager.status_code, 400)
        raised = root.patch(
            f"/api/staff/{created.data['id']}/",
            {"max_managers": 4, "max_users": 8},
            format="json",
        )
        self.assertEqual(raised.status_code, 200, raised.data)
        self.assertEqual(raised.data["organization"]["max_managers"], 4)
        self.assertEqual(raised.data["organization"]["max_users"], 8)
        self.assertEqual(raised.data["organization"]["max_admins"], 2)
        emails = sorted(row["email"] for row in client.get("/api/staff/").data)
        self.assertEqual(emails, ["manager1@test.com", "mittal@test.com"])

    def test_call_list_stays_inside_the_reporting_family(self):
        from telephony.models import Call

        platform = Organization.objects.create(name="Platform Calls")
        self.super.organization = platform
        self.super.save(update_fields=["organization"])
        outsider = User.objects.create_user(
            email="outsider@platform.com", password="x", role=User.Role.USER, organization=platform
        )
        agency = User.objects.create_user(
            email="family-agency@test.com", password="x", role=User.Role.AGENCY, organization=platform
        )
        child = User.objects.create_user(
            email="family-user@test.com", password="x", role=User.Role.USER, organization=platform, reports_to=agency
        )
        Call.objects.create(agent=self.super, phone_number="9000000001", callerid_token="super-call")
        Call.objects.create(agent=outsider, phone_number="9000000002", callerid_token="outsider-call")
        Call.objects.create(agent=agency, phone_number="9000000003", callerid_token="agency-call")
        Call.objects.create(agent=child, phone_number="9000000004", callerid_token="child-call")

        agency_client = self._login("family-agency@test.com")
        agency_phones = {row["phone_number"] for row in agency_client.get("/api/calls/").data}
        self.assertEqual(agency_phones, {"9000000003", "9000000004"})

        user_client = self._login("family-user@test.com")
        user_phones = {row["phone_number"] for row in user_client.get("/api/calls/").data}
        self.assertEqual(user_phones, {"9000000004"})

        root = self._login("root@test.com")
        root_phones = {row["phone_number"] for row in root.get("/api/calls/").data}
        self.assertTrue({"9000000001", "9000000002", "9000000003", "9000000004"} <= root_phones)

    def test_analytics_uses_only_the_reporting_family(self):
        from django.utils import timezone

        from crm.models import Contact
        from telephony.models import Call

        home = Organization.objects.create(name="Analytics Home")
        other = Organization.objects.create(name="Analytics Other")
        agency = User.objects.create_user(
            email="analytics-agency@test.com", password="x", role=User.Role.AGENCY, organization=home
        )
        User.objects.create_user(
            email="analytics-user@test.com", password="x", role=User.Role.USER, organization=home, reports_to=agency
        )
        outsider = User.objects.create_user(
            email="analytics-outsider@test.com", password="x", role=User.Role.USER, organization=other
        )
        Contact.objects.create(name="Home Lead", phone="9111000001", agency=home)
        Contact.objects.create(name="Other Lead", phone="9111000002", agency=other)
        own = Call.objects.create(
            agent=agency, phone_number="9111000001", callerid_token="analytics-own", disposition="CONNECTED"
        )
        Call.objects.filter(pk=own.pk).update(answered_at=timezone.now(), duration_seconds=40)
        Call.objects.create(
            agent=outsider, phone_number="9111000002", callerid_token="analytics-other", disposition="SWITCHED_OFF"
        )

        client = self._login("analytics-agency@test.com")
        res = client.get("/api/analytics/?period=7d")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["totals"]["calls"], 1)
        self.assertEqual(res.data["totals"]["connected"], 1)
        self.assertEqual([row["name"] for row in res.data["outcomes"]], ["CONNECTED"])
        self.assertEqual([row["name"] for row in res.data["agents"]], [agency.display_name])
        funnel = {row["name"]: row["value"] for row in res.data["funnel"]}
        self.assertEqual(funnel["Leads"], 1)
        self.assertNotIn("Anjali", str(res.data))
        self.assertNotIn("SWITCHED_OFF", str(res.data["outcomes"]))

    def test_followups_stay_inside_the_reporting_family(self):
        from django.utils import timezone

        from crm.models import Contact, FollowUp

        home = Organization.objects.create(name="Follow Home")
        other = Organization.objects.create(name="Follow Other")
        agency = User.objects.create_user(
            email="follow-agency@test.com", password="x", role=User.Role.AGENCY, organization=home
        )
        child = User.objects.create_user(
            email="follow-user@test.com", password="x", role=User.Role.USER, organization=home, reports_to=agency
        )
        outsider = User.objects.create_user(
            email="follow-outsider@test.com", password="x", role=User.Role.USER, organization=other
        )
        home_lead = Contact.objects.create(name="Home Person", phone="9222000001", agency=home)
        other_lead = Contact.objects.create(name="Other Person", phone="9222000002", agency=other)
        own = FollowUp.objects.create(
            contact=home_lead, agent=child, reason="Call back", due_at=timezone.now(), priority="High"
        )
        foreign = FollowUp.objects.create(
            contact=other_lead, agent=outsider, reason="Not ours", due_at=timezone.now()
        )

        client = self._login("follow-agency@test.com")
        listed = client.get("/api/followups/")
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual([row["customer"] for row in listed.data], ["Home Person"])
        hidden = client.patch(f"/api/followups/{foreign.id}/", {"status": "done"}, format="json")
        self.assertEqual(hidden.status_code, 404)
        done = client.patch(f"/api/followups/{own.id}/", {"status": "done"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["bucket"], "completed")
        foreign.refresh_from_db()
        self.assertNotEqual(foreign.status, FollowUp.Status.DONE)
