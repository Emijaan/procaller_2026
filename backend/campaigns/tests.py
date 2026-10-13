from datetime import timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from openpyxl import Workbook
from rest_framework.test import APIClient

from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact
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
class CampaignLeadMappingTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Agency A", max_managers=5, max_admins=5, max_users=10)
        self.agency = User.objects.create_user(
            email="agency@a.com", password="x", role=User.Role.AGENCY, organization=self.org
        )
        self.agent = User.objects.create_user(
            email="u1@a.com", password="x", role=User.Role.USER, organization=self.org, reports_to=self.agency
        )
        self.camp = Campaign.objects.create(
            name="Map Camp",
            agency=self.org,
            created_by=self.agency,
            status=Campaign.Status.ACTIVE,
            active=True,
            dial_method=Campaign.DialMethod.MANUAL,
        )
        self.camp.assigned_users.add(self.agent)

    def _login(self, email):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": "x"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return client

    def _upload(self, client, rows, threads="1"):
        payload = _workbook(rows)
        preview = client.post(
            f"/api/campaigns/{self.camp.id}/import/preview/",
            {"file": SimpleUploadedFile("leads.xlsx", payload, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            format="multipart",
        )
        if preview.status_code != 200:
            return preview, None
        confirmed = client.post(
            f"/api/campaigns/{self.camp.id}/import/",
            {
                "file": SimpleUploadedFile("leads.xlsx", payload, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "job_id": preview.data["job_id"],
                "dial_threads": threads,
            },
            format="multipart",
        )
        return preview, confirmed

    def test_upload_keeps_extra_columns_and_call_results_on_the_same_lead(self):
        agency = self._login("agency@a.com")
        missing = agency.post(
            f"/api/campaigns/{self.camp.id}/import/preview/",
            {"file": SimpleUploadedFile("bad.xlsx", _workbook([["Name"], ["Ravi"]]), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            format="multipart",
        )
        self.assertEqual(missing.status_code, 400)

        preview, confirmed = self._upload(
            agency,
            [
                ["Mobile", "Name", "City", "Notes"],
                ["919000000001", "Ravi", "Delhi", ""],
                ["9000000001", "Ravi again", "Mumbai", "dup"],
                ["123", "Short", "Pune", "bad"],
            ],
        )
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["valid_rows"], 1)
        self.assertEqual(preview.data["duplicate_rows"], 1)
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["imported"], 1)
        self.camp.refresh_from_db()
        self.assertEqual(self.camp.dial_method, Campaign.DialMethod.MANUAL)

        lead = Contact.objects.get(campaign=self.camp)
        self.assertEqual(lead.phone, "9000000001")
        self.assertEqual(lead.extra_data["City"], "Delhi")
        self.assertEqual(lead.extra_data["Notes"], "")
        self.assertEqual(lead.extra_data["Name"], "Ravi")
        lead_id = lead.id

        again, again_done = self._upload(agency, [["Mobile", "City"], ["9000000001", "Jaipur"]])
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again_done.data["imported"], 0)
        lead.refresh_from_db()
        self.assertEqual(lead.extra_data["City"], "Delhi")
        self.assertEqual(Contact.objects.filter(campaign=self.camp).count(), 1)

        agent = self._login("u1@a.com")
        manual = agent.post(
            "/api/calls/",
            {"phone_number": lead.phone, "contact_id": lead.id, "campaign_id": self.camp.id, "client_dial": True},
            format="json",
        )
        self.assertEqual(manual.status_code, 201, manual.data)
        Call.objects.filter(pk=manual.data["id"]).update(
            answered_at=timezone.now() - timedelta(seconds=95),
            state=Call.State.CONNECTED,
        )
        hung = agent.post(f"/api/calls/{manual.data['id']}/hangup/", {}, format="json")
        self.assertEqual(hung.status_code, 200, hung.data)
        disp = agent.post(
            f"/api/calls/{manual.data['id']}/disposition/",
            {"disposition": "Interested", "notes": "Wants a visit"},
            format="json",
        )
        self.assertEqual(disp.status_code, 200, disp.data)

        Contact.objects.filter(pk=lead.id).update(lead_status=Contact.LeadStatus.NEW, reserved_by=None, reserved_until=None)
        agent.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        reserved = agent.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(reserved.status_code, 200, reserved.data)
        self.assertEqual(reserved.data["id"], lead_id)
        preview_call = agent.post(
            "/api/calls/",
            {
                "phone_number": reserved.data["phone"],
                "contact_id": reserved.data["id"],
                "campaign_id": self.camp.id,
                "preview": True,
                "client_dial": True,
            },
            format="json",
        )
        self.assertEqual(preview_call.status_code, 201, preview_call.data)

        board = agency.get(f"/api/campaigns/{self.camp.id}/leads/")
        self.assertEqual(board.status_code, 200, board.data)
        self.assertEqual(board.data["columns"], ["Name", "City", "Notes"])
        row = board.data["leads"][0]
        self.assertEqual(row["id"], lead_id)
        self.assertEqual(row["extra_data"]["City"], "Delhi")
        self.assertEqual(row["extra_data"]["Notes"], "")
        self.assertEqual(row["attempt_count"], 2)
        self.assertEqual(row["last_disposition"], "Interested")
        self.assertEqual(row["last_agent"], self.agent.display_name)
        talked = [call for call in row["calls"] if call["disposition"] == "Interested"]
        self.assertEqual(len(talked), 1)
        self.assertGreaterEqual(talked[0]["duration_seconds"], 90)
        self.assertEqual(len(row["calls"]), 2)
