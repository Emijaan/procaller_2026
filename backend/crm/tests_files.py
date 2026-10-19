from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact, ImportJob
from telephony.models import Call


def _workbook(rows):
    book = Workbook()
    sheet = book.active
    for row in rows:
        sheet.append(row)
    buf = BytesIO()
    book.save(buf)
    return buf.getvalue()


@override_settings(TELEPHONY_BACKEND="sandbox")
class LeadFileVisibilityTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Agency A", max_managers=5, max_admins=5, max_users=10)
        self.other = Organization.objects.create(name="Agency B", max_managers=5, max_admins=5, max_users=10)
        self.root = User.objects.create_user(email="root@a.com", password="x", role=User.Role.SUPER_ADMIN, is_superuser=True)
        self.agency = User.objects.create_user(email="agency@a.com", password="x", role=User.Role.AGENCY, organization=self.org)
        self.manager = User.objects.create_user(
            email="manager@a.com", password="x", role=User.Role.MANAGER, organization=self.org, reports_to=self.agency
        )
        self.admin = User.objects.create_user(
            email="admin@a.com", password="x", role=User.Role.ADMIN, organization=self.org, reports_to=self.manager
        )
        self.agent = User.objects.create_user(
            email="user@a.com", password="x", role=User.Role.USER, organization=self.org, reports_to=self.admin
        )
        self.agency_b = User.objects.create_user(
            email="agency@b.com", password="x", role=User.Role.AGENCY, organization=self.other
        )
        self.camp = Campaign.objects.create(
            name="File Camp", agency=self.org, created_by=self.agency, status=Campaign.Status.ACTIVE, active=True
        )
        self.camp.assigned_users.add(self.agent)
        self.camp_b = Campaign.objects.create(
            name="Other Camp", agency=self.other, created_by=self.agency_b, status=Campaign.Status.ACTIVE, active=True
        )

    def _login(self, email):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": "x"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return client

    def _upload(self):
        agency = self._login("agency@a.com")
        payload = _workbook([["Mobile", "Name", "City"], ["9000000001", "Ravi", "Delhi"], ["9000000002", "Asha", "Pune"]])
        upload = SimpleUploadedFile(
            "leads.xlsx", payload, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        preview = agency.post(f"/api/campaigns/{self.camp.id}/import/preview/", {"file": upload}, format="multipart")
        self.assertEqual(preview.status_code, 200, preview.data)
        confirmed = agency.post(
            f"/api/campaigns/{self.camp.id}/import/",
            {
                "file": SimpleUploadedFile("leads.xlsx", payload, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "job_id": preview.data["job_id"],
                "dial_threads": "2",
            },
            format="multipart",
        )
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        return preview.data["job_id"]

    def test_managers_see_every_agency_lead_and_can_stop_the_file(self):
        job_id = self._upload()
        job = ImportJob.objects.get(pk=job_id)
        self.assertTrue(job.source_file)
        self.assertEqual(Contact.objects.filter(import_job=job).count(), 2)

        for email in ("root@a.com", "agency@a.com", "manager@a.com", "admin@a.com"):
            client = self._login(email)
            phones = {row["phone"] for row in client.get("/api/leads/").data}
            self.assertEqual(phones, {"9000000001", "9000000002"}, email)
            files = client.get("/api/lead-files/")
            self.assertEqual(files.status_code, 200, files.data)
            self.assertEqual(files.data[0]["id"], job_id)
            self.assertTrue(files.data[0]["has_file"])
            self.assertEqual(files.data[0]["file_name"], "leads.xlsx")

        outsider = self._login("agency@b.com")
        self.assertEqual(outsider.get("/api/leads/").data, [])
        self.assertEqual(outsider.get("/api/lead-files/").data, [])
        self.assertEqual(outsider.get(f"/api/lead-files/{job_id}/file/").status_code, 404)

        user = self._login("user@a.com")
        self.assertEqual(user.get("/api/lead-files/").status_code, 403)
        blocked = user.patch(f"/api/leads/{Contact.objects.filter(import_job=job).first().id}/", {"status": "Inactive"}, format="json")
        self.assertEqual(blocked.status_code, 403)

        downloaded = self._login("manager@a.com").get(f"/api/lead-files/{job_id}/file/")
        self.assertEqual(downloaded.status_code, 200)
        body = b"".join(downloaded.streaming_content)
        self.assertTrue(body.startswith(b"PK"))

        stopped = self._login("admin@a.com").patch(f"/api/lead-files/{job_id}/", {"active": False}, format="json")
        self.assertEqual(stopped.status_code, 200, stopped.data)
        self.assertFalse(stopped.data["active"])
        self.assertEqual(Contact.objects.filter(import_job=job, status=Contact.Status.INACTIVE).count(), 2)

        agent = self._login("user@a.com")
        agent.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        missed = agent.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(missed.status_code, 404)

        started = self._login("manager@a.com").patch(f"/api/lead-files/{job_id}/", {"active": True}, format="json")
        self.assertTrue(started.data["active"])
        one = Contact.objects.filter(import_job=job).order_by("id").first()
        held = self._login("agency@a.com").patch(f"/api/leads/{one.id}/", {"status": "Inactive"}, format="json")
        self.assertEqual(held.status_code, 200)
        one.refresh_from_db()
        self.assertEqual(one.status, Contact.Status.INACTIVE)
        agent.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        reserved = agent.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(reserved.status_code, 200, reserved.data)
        self.assertNotEqual(reserved.data["id"], one.id)

    def test_a_lead_and_a_whole_file_can_be_deleted(self):
        job_id = self._upload()
        leads = list(Contact.objects.filter(import_job_id=job_id).order_by("id"))
        user = self._login("user@a.com")
        self.assertEqual(user.delete(f"/api/leads/{leads[0].id}/").status_code, 403)
        self.assertEqual(user.delete(f"/api/lead-files/{job_id}/").status_code, 403)

        removed = self._login("manager@a.com").delete(f"/api/leads/{leads[0].id}/")
        self.assertEqual(removed.status_code, 200, removed.data)
        self.assertFalse(Contact.objects.filter(pk=leads[0].id).exists())
        self.assertTrue(Contact.objects.filter(pk=leads[1].id).exists())

        wiped = self._login("admin@a.com").delete(f"/api/lead-files/{job_id}/")
        self.assertEqual(wiped.status_code, 200, wiped.data)
        self.assertEqual(wiped.data["deleted"], 1)
        self.assertFalse(Contact.objects.filter(import_job_id=job_id).exists())
        self.assertFalse(ImportJob.objects.filter(pk=job_id).exists())
        self.assertEqual(self._login("admin@a.com").get("/api/lead-files/").data, [])

    def test_staff_can_delete_leads_from_an_older_upload(self):
        job = ImportJob.objects.create(
            agency=self.org,
            campaign=self.camp,
            created_by=self.agency,
            file_name="old.xlsx",
            status=ImportJob.Status.DONE,
            imported_rows=4,
        )
        leads = [
            Contact.objects.create(
                name=email.split("@")[0],
                phone=phone,
                agency=self.org,
                campaign=self.camp,
                lead_status=Contact.LeadStatus.NEW,
            )
            for email, phone in (
                ("root@a.com", "9110000001"),
                ("agency@a.com", "9110000002"),
                ("manager@a.com", "9110000003"),
                ("admin@a.com", "9110000004"),
            )
        ]
        outsider = Contact.objects.create(
            name="Other",
            phone="9110000009",
            agency=self.other,
            campaign=self.camp_b,
            lead_status=Contact.LeadStatus.NEW,
        )
        listed = self._login("agency@a.com").get(f"/api/leads/?import_job={job.id}&limit=50")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual({row["id"] for row in listed.data}, {lead.id for lead in leads})
        self.assertEqual(self._login("agency@b.com").delete(f"/api/leads/{leads[0].id}/").status_code, 404)
        self.assertEqual(self._login("user@a.com").delete(f"/api/leads/{leads[0].id}/").status_code, 403)

        for email, lead in zip(("root@a.com", "agency@a.com", "manager@a.com"), leads[:3]):
            removed = self._login(email).delete(f"/api/leads/{lead.id}/")
            self.assertEqual(removed.status_code, 200, removed.data)
            self.assertFalse(Contact.objects.filter(pk=lead.id).exists())

        wiped = self._login("admin@a.com").delete(f"/api/lead-files/{job.id}/")
        self.assertEqual(wiped.status_code, 200, wiped.data)
        self.assertEqual(wiped.data["deleted"], 1)
        self.assertFalse(Contact.objects.filter(pk=leads[3].id).exists())
        self.assertFalse(ImportJob.objects.filter(pk=job.id).exists())
        self.assertEqual(self._login("agency@a.com").get("/api/lead-files/").data, [])
        self.assertTrue(Contact.objects.filter(pk=outsider.id).exists())

    def test_reload_puts_selected_dispositions_back_into_auto_dial(self):
        switched = Contact.objects.create(
            name="Switched", phone="9001110001", agency=self.org, campaign=self.camp, owner=self.agent,
            lead_status=Contact.LeadStatus.CONNECTED, status=Contact.Status.INACTIVE,
        )
        answered = Contact.objects.create(
            name="Answered", phone="9001110002", agency=self.org, campaign=self.camp,
            lead_status=Contact.LeadStatus.INTERESTED,
        )
        live = Contact.objects.create(
            name="Live", phone="9001110003", agency=self.org, campaign=self.camp,
            lead_status=Contact.LeadStatus.CALLING,
        )
        blocked = Contact.objects.create(
            name="Blocked", phone="9001110004", agency=self.org, campaign=self.camp, dnc=True,
            lead_status=Contact.LeadStatus.NOT_CONNECTED,
        )
        outsider = Contact.objects.create(
            name="Outsider", phone="9001110005", agency=self.other, campaign=self.camp_b,
            lead_status=Contact.LeadStatus.CONNECTED,
        )
        Call.objects.create(
            agent=self.agent, contact=switched, campaign=self.camp, phone_number=switched.phone,
            state=Call.State.ENDED, disposition="SWITCHED_OFF", callerid_token="reload-1",
        )
        Call.objects.create(
            agent=self.agent, contact=answered, campaign=self.camp, phone_number=answered.phone,
            state=Call.State.ENDED, disposition="CONNECTED", callerid_token="reload-2",
        )
        Call.objects.create(
            agent=self.agent, contact=live, campaign=self.camp, phone_number=live.phone,
            state=Call.State.RINGING, disposition="SWITCHED_OFF", callerid_token="reload-3",
        )
        Call.objects.create(
            agent=self.agent, contact=blocked, campaign=self.camp, phone_number=blocked.phone,
            state=Call.State.ENDED, disposition="SWITCHED_OFF", callerid_token="reload-4",
        )
        Call.objects.create(
            agent=self.agency_b, contact=outsider, campaign=self.camp_b, phone_number=outsider.phone,
            state=Call.State.ENDED, disposition="SWITCHED_OFF", callerid_token="reload-5",
        )

        agency = self._login("agency@a.com")
        choices = agency.get("/api/leads/reload/")
        self.assertEqual(choices.status_code, 200)
        self.assertIn("SWITCHED_OFF", {row["code"] for row in choices.data["dispositions"]})
        self.assertNotIn("NOT_DIALED", {row["code"] for row in choices.data["dispositions"]})
        self.assertEqual(self._login("user@a.com").post("/api/leads/reload/", {"dispositions": ["SWITCHED_OFF"]}, format="json").status_code, 403)

        reloaded = agency.post("/api/leads/reload/", {"dispositions": ["SWITCHED_OFF"]}, format="json")
        self.assertEqual(reloaded.status_code, 200, reloaded.data)
        self.assertEqual(reloaded.data["reloaded"], 1)
        self.assertEqual(reloaded.data["skipped"], 2)
        switched.refresh_from_db()
        self.assertEqual(switched.lead_status, Contact.LeadStatus.ASSIGNED)
        self.assertEqual(switched.status, Contact.Status.ACTIVE)
        answered.refresh_from_db()
        self.assertEqual(answered.lead_status, Contact.LeadStatus.INTERESTED)
        live.refresh_from_db()
        self.assertEqual(live.lead_status, Contact.LeadStatus.CALLING)
        outsider.refresh_from_db()
        self.assertEqual(outsider.lead_status, Contact.LeadStatus.CONNECTED)
        self.assertEqual(Call.objects.filter(contact=switched).count(), 1)

        from crm.queue import reserve_next_lead

        nxt = reserve_next_lead(self.agent, campaign_id=self.camp.id)
        self.assertEqual(nxt.id, switched.id)
