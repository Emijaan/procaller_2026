from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact
from telephony.models import AgentModeSession, Call
from telephony.modes import close_open_modes, mode_totals, set_agent_mode
from telephony.services import hangup_call, set_call_flag


@override_settings(TELEPHONY_BACKEND="sandbox")
class PreviewAutoDialerTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Agency A", max_managers=5, max_admins=5, max_users=10)
        self.other = Organization.objects.create(name="Agency B", max_managers=5, max_admins=5, max_users=10)
        self.agency = User.objects.create_user(
            email="agency@a.com", password="x", role=User.Role.AGENCY, organization=self.org
        )
        self.agent1 = User.objects.create_user(
            email="u1@a.com", password="x", role=User.Role.USER, organization=self.org, reports_to=self.agency
        )
        self.agent2 = User.objects.create_user(
            email="u2@a.com", password="x", role=User.Role.USER, organization=self.org, reports_to=self.agency
        )
        self.agency_b = User.objects.create_user(
            email="agency@b.com", password="x", role=User.Role.AGENCY, organization=self.other
        )
        self.agent_b = User.objects.create_user(
            email="u1@b.com", password="x", role=User.Role.USER, organization=self.other, reports_to=self.agency_b
        )
        self.camp = Campaign.objects.create(
            name="A Camp",
            agency=self.org,
            created_by=self.agency,
            status=Campaign.Status.ACTIVE,
            active=True,
            dial_method=Campaign.DialMethod.PREVIEW,
            code="DEL-REC",
            wrap_up_seconds=45,
        )
        self.camp.assigned_users.set([self.agent1, self.agent2])
        self.camp_b = Campaign.objects.create(
            name="B Camp",
            agency=self.other,
            created_by=self.agency_b,
            status=Campaign.Status.ACTIVE,
            active=True,
        )
        self.lead = Contact.objects.create(
            name="Lead One",
            phone="9000000001",
            agency=self.org,
            campaign=self.camp,
            lead_status=Contact.LeadStatus.NEW,
        )
        self.lead2 = Contact.objects.create(
            name="Lead Two",
            phone="9000000002",
            agency=self.org,
            campaign=self.camp,
            lead_status=Contact.LeadStatus.NEW,
        )
        Contact.objects.create(
            name="Lead B",
            phone="9000000099",
            agency=self.other,
            campaign=self.camp_b,
            lead_status=Contact.LeadStatus.NEW,
        )

    def _login(self, email):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": "x"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return client

    def test_two_agents_cannot_reserve_the_same_lead(self):
        a = self._login("u1@a.com")
        b = self._login("u2@a.com")
        self.assertEqual(a.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json").status_code, 200)
        self.assertEqual(b.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json").status_code, 200)
        first = a.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        second = b.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertNotEqual(first.data["id"], second.data["id"])
        self.lead.refresh_from_db()
        self.lead2.refresh_from_db()
        owners = {self.lead.reserved_by_id, self.lead2.reserved_by_id}
        self.assertEqual(owners, {self.agent1.id, self.agent2.id})

    def test_preview_auto_starts_manual_break_offline_do_not(self):
        client = self._login("u1@a.com")
        for mode in ("manual", "break", "offline"):
            client.post("/api/agent/mode/", {"mode": mode}, format="json")
            blocked = client.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
            self.assertEqual(blocked.status_code, 400, mode)
            preview_call = client.post(
                "/api/calls/",
                {"phone_number": self.lead.phone, "contact_id": self.lead.id, "campaign_id": self.camp.id, "preview": True},
                format="json",
            )
            self.assertEqual(preview_call.status_code, 400, mode)

        client.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        reserved = client.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(reserved.status_code, 200)
        started = client.post(
            "/api/calls/",
            {"phone_number": reserved.data["phone"], "contact_id": reserved.data["id"], "campaign_id": self.camp.id, "preview": True, "client_dial": True},
            format="json",
        )
        self.assertEqual(started.status_code, 201)
        self.assertEqual(Call.objects.filter(contact_id=reserved.data["id"]).count(), 1)

    def test_stale_reservation_is_released(self):
        a = self._login("u1@a.com")
        b = self._login("u2@a.com")
        a.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        b.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id}, format="json")
        first = a.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(first.status_code, 200)
        Contact.objects.filter(pk=first.data["id"]).update(reserved_until=timezone.now() - timedelta(seconds=5))
        second = b.post("/api/leads/reserve/", {"campaign": self.camp.id}, format="json")
        self.assertEqual(second.status_code, 200)
        ids = {first.data["id"], second.data["id"]}
        self.assertTrue(first.data["id"] in ids)

    def test_mode_durations_use_server_timestamps(self):
        set_agent_mode(self.agent1, "preview")
        row = AgentModeSession.objects.filter(user=self.agent1, ended_at__isnull=True).first()
        AgentModeSession.objects.filter(pk=row.pk).update(started_at=timezone.now() - timedelta(seconds=90))
        close_open_modes(self.agent1)
        row.refresh_from_db()
        self.assertGreaterEqual(row.duration_seconds, 90)
        totals = mode_totals(self.agent1)
        self.assertGreaterEqual(totals["preview"], 90)
        self.assertGreaterEqual(totals["online"], 90)

    def test_hangup_cause_and_hold_seconds_keep_prior_attempts(self):
        first = Call.objects.create(
            agent=self.agent1,
            contact=self.lead,
            campaign=self.camp,
            phone_number=self.lead.phone,
            callerid_token="att-1",
        )
        first.ringing_at = timezone.now()
        first.mark_ended()
        self.assertEqual(first.hangup_cause, "RINGING_NO_ANSWER")
        second = Call.objects.create(
            agent=self.agent1,
            contact=self.lead,
            campaign=self.camp,
            phone_number=self.lead.phone,
            callerid_token="att-2",
        )
        second.answered_at = timezone.now() - timedelta(seconds=8)
        second.state = Call.State.CONNECTED
        second.save()
        set_call_flag(second, on_hold=True)
        Call.objects.filter(pk=second.pk).update(hold_started_at=timezone.now() - timedelta(seconds=5))
        second.refresh_from_db()
        set_call_flag(second, on_hold=False)
        second.refresh_from_db()
        self.assertGreaterEqual(second.hold_seconds, 5)
        hangup_call(second, outcome=Call.Outcome.CONNECTED)
        second.refresh_from_db()
        first.refresh_from_db()
        self.assertEqual(second.hangup_cause, "ANSWERED")
        self.assertEqual(first.hangup_cause, "RINGING_NO_ANSWER")
        self.assertEqual(Call.objects.filter(contact=self.lead).count(), 2)

    def test_agency_isolation_on_live_agents_and_reports(self):
        set_agent_mode(self.agent1, "preview", campaign=self.camp)
        set_agent_mode(self.agent_b, "manual", campaign=self.camp_b)
        a = self._login("agency@a.com")
        live = a.get("/api/live/agents/")
        self.assertEqual(live.status_code, 200)
        ids = [row["id"] for row in live.data["agents"]]
        self.assertIn(self.agent1.id, ids)
        self.assertNotIn(self.agent_b.id, ids)

        reports = a.get("/api/reports/daily/")
        self.assertEqual(reports.status_code, 200)
        report_ids = [row["user_id"] for row in reports.data["agents"]]
        self.assertIn(self.agent1.id, report_ids)
        self.assertNotIn(self.agent_b.id, report_ids)

        camps = a.get("/api/reports/campaigns/")
        camp_names = [row["name"] for row in camps.data["campaigns"]]
        self.assertIn("A Camp", camp_names)
        self.assertNotIn("B Camp", camp_names)

        csv = a.get("/api/reports/export/?kind=daily&file=csv")
        self.assertEqual(csv.status_code, 200)
        self.assertIn(b"agent", csv.content.lower())
        xlsx = a.get("/api/reports/export/?kind=campaign&file=xlsx")
        self.assertEqual(xlsx.status_code, 200)
        self.assertIn("spreadsheet", xlsx["Content-Type"])

        b = self._login("agency@b.com")
        other_live = b.get("/api/live/agents/")
        other_ids = [row["id"] for row in other_live.data["agents"]]
        self.assertNotIn(self.agent1.id, other_ids)
        self.assertIn(self.agent_b.id, other_ids)

    def test_agent_cannot_download_another_agents_recording(self):
        call = Call.objects.create(
            agent=self.agent2,
            campaign=self.camp,
            phone_number="9000000002",
            callerid_token="rec-other",
            recording=True,
        )
        call.recording_file.save("b.webm", SimpleUploadedFile("b.webm", b"RIFF" + b"1" * 64), save=True)
        own = Call.objects.create(
            agent=self.agent1,
            campaign=self.camp,
            phone_number="9000000001",
            callerid_token="rec-own",
            recording=True,
        )
        own.recording_file.save("a.webm", SimpleUploadedFile("a.webm", b"RIFF" + b"0" * 64), save=True)

        client = self._login("u1@a.com")
        listed = client.get("/api/recordings/")
        ids = [row["id"] for row in listed.data["results"]]
        self.assertIn(own.id, ids)
        self.assertNotIn(call.id, ids)
        self.assertEqual(client.get(f"/api/recordings/{call.id}/file/").status_code, 404)
        self.assertEqual(client.get(f"/api/recordings/{own.id}/file/").status_code, 200)

        agency = self._login("agency@a.com")
        agency_ids = [row["id"] for row in agency.get("/api/recordings/").data["results"]]
        self.assertIn(own.id, agency_ids)
        self.assertIn(call.id, agency_ids)

    def test_campaign_wrap_up_and_code(self):
        client = self._login("agency@a.com")
        patched = client.patch(
            f"/api/campaigns/{self.camp.id}/",
            {"wrap_up_seconds": 60, "code": "WRAP1"},
            format="json",
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data["wrap_up_seconds"], 60)
        self.assertEqual(patched.data["code"], "WRAP1")

    def test_agent_reports_are_self_only(self):
        client = self._login("u1@a.com")
        res = client.get("/api/reports/daily/")
        self.assertEqual(res.status_code, 200)
        ids = [row["user_id"] for row in res.data["agents"]]
        self.assertEqual(ids, [self.agent1.id])

    def test_preview_batch_dials_ratio_numbers_and_drops_siblings(self):
        Contact.objects.create(
            name="Lead Three",
            phone="9000000003",
            agency=self.org,
            campaign=self.camp,
            lead_status=Contact.LeadStatus.NEW,
        )
        Contact.objects.create(
            name="Lead Four",
            phone="9000000004",
            agency=self.org,
            campaign=self.camp,
            lead_status=Contact.LeadStatus.NEW,
        )
        client = self._login("u1@a.com")
        client.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id, "dial_ratio": 2}, format="json")
        batch = client.post("/api/calls/preview-batch/", {"campaign_id": self.camp.id, "ratio": 2}, format="json")
        self.assertEqual(batch.status_code, 201, batch.data)
        self.assertEqual(len(batch.data["calls"]), 2)
        self.assertEqual(batch.data["ratio"], 2)
        phones = {row["phone_number"] for row in batch.data["calls"]}
        self.assertEqual(len(phones), 2)
        batches = {row["dial_batch"] for row in batch.data["calls"]}
        self.assertEqual(len(batches), 1)
        self.assertTrue(list(batches)[0])

        live = Call.objects.filter(agent=self.agent1, state__in=["initiating", "ringing"])
        self.assertEqual(live.count(), 2)
        winner = live.first()
        from telephony.services import mark_answered

        mark_answered(winner)
        leftover = Call.objects.filter(agent=self.agent1, dial_batch=winner.dial_batch).exclude(pk=winner.pk).first()
        leftover.refresh_from_db()
        winner.refresh_from_db()
        self.assertEqual(winner.state, Call.State.CONNECTED)
        self.assertEqual(leftover.state, Call.State.ENDED)

    def test_dial_ratio_can_change_without_closing_mode(self):
        client = self._login("u1@a.com")
        started = client.post("/api/agent/mode/", {"mode": "preview", "campaign_id": self.camp.id, "dial_ratio": 2}, format="json")
        self.assertEqual(started.status_code, 200)
        session_id = started.data["session_id"]
        self.assertEqual(started.data["dial_ratio"], 2)
        changed = client.post("/api/agent/mode/", {"dial_ratio": 4}, format="json")
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.data["dial_ratio"], 4)
        self.assertEqual(changed.data["session_id"], session_id)
        self.assertEqual(changed.data["mode"], "preview")
        too_high = client.post("/api/agent/mode/", {"dial_ratio": 99}, format="json")
        self.assertEqual(too_high.data["dial_ratio"], 32)
        agency = self._login("agency@a.com")
        camp = agency.patch(f"/api/campaigns/{self.camp.id}/", {"dial_ratio": 99}, format="json")
        self.assertEqual(camp.status_code, 200)
        self.assertEqual(camp.data["dial_ratio"], 32)
