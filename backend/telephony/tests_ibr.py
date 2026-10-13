from django.conf import settings
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import Organization, User
from campaigns.models import Campaign
from crm.models import Contact
from telephony.channels import assign_user_port
from telephony.inbound import resolve_inbound
from telephony.models import Call, GsmGateway, GsmPort, PortGroup
from telephony.pstn import ami_pstn_channel
from telephony.tts import render_prompt


class PromptRenderTests(TestCase):
    def test_placeholders_and_missing_column(self):
        text = render_prompt(
            "Hello {{customer_name}}, your outstanding loan amount is {{loan_amount}} rupees.",
            {"customer_name": "Asha", "loan_amount": "1500"},
        )
        self.assertEqual(text, "Hello Asha, your outstanding loan amount is 1500 rupees.")
        with self.assertRaises(ValueError):
            render_prompt("Hello {{customer_name}}", {"name": "Asha"})


@override_settings(TELEPHONY_BACKEND="sandbox")
class IbrPiperTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Agency A", max_users=5)
        self.other = Organization.objects.create(name="Agency B", max_users=5)
        self.super = User.objects.create_user(
            email="root@ibr.test", password="x", role=User.Role.SUPER_ADMIN, is_superuser=True
        )
        self.agency = User.objects.create_user(
            email="agency@ibr.test", password="x", role=User.Role.AGENCY, organization=self.org
        )
        self.other_agency = User.objects.create_user(
            email="other@ibr.test", password="x", role=User.Role.AGENCY, organization=self.other
        )
        self.caller = User.objects.create_user(
            email="user@ibr.test",
            password="x",
            role=User.Role.USER,
            organization=self.org,
            reports_to=self.agency,
            extension="2101",
        )

    def _login(self, email):
        client = APIClient()
        res = client.post("/api/auth/login/", {"email": email, "password": "x"}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        return client

    def test_agency_cannot_enable_ibr_or_create_while_disabled(self):
        client = self._login("agency@ibr.test")
        res = client.patch(f"/api/agencies/{self.org.id}/", {"ibr_enabled": True}, format="json")
        self.assertEqual(res.status_code, 403)
        self.org.refresh_from_db()
        self.assertFalse(self.org.ibr_enabled)
        res = client.post(
            "/api/campaigns/",
            {"name": "Broadcast", "campaign_type": "ibr", "tts_prompt": "Hello {{name}}"},
            format="json",
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Campaign.objects.filter(name="Broadcast").exists())

    def test_piper_generates_a_wav_for_the_lead(self):
        self.org.ibr_enabled = True
        self.org.save(update_fields=["ibr_enabled"])
        client = self._login("agency@ibr.test")
        created = client.post(
            "/api/campaigns/",
            {
                "name": "Loan IBR",
                "campaign_type": "ibr",
                "tts_prompt": "Hello {{customer_name}}, your outstanding loan amount is {{loan_amount}} rupees.",
                "tts_voice": "en_US-lessac-low",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        camp = Campaign.objects.get(pk=created.data["id"])
        Contact.objects.create(
            name="Asha",
            phone="9811111111",
            agency=self.org,
            campaign=camp,
            extra_data={"customer_name": "Asha", "loan_amount": "1500"},
        )
        Contact.objects.create(
            name="Missing",
            phone="9811111112",
            agency=self.org,
            campaign=camp,
            extra_data={"customer_name": "Ravi"},
        )
        res = client.post(f"/api/campaigns/{camp.id}/tts/", {}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["ready"], 1)
        self.assertEqual(res.data["failed"], 1)
        ready = Contact.objects.get(phone="9811111111")
        self.assertEqual(ready.tts_status, "ready")
        ready.tts_audio.open("rb")
        header = ready.tts_audio.read(4)
        ready.tts_audio.close()
        self.assertEqual(header, b"RIFF")
        self.assertEqual(Contact.objects.get(phone="9811111112").tts_status, "failed")

    def test_other_agency_and_user_cannot_generate(self):
        self.org.ibr_enabled = True
        self.org.save(update_fields=["ibr_enabled"])
        camp = Campaign.objects.create(
            name="Loan IBR",
            agency=self.org,
            created_by=self.agency,
            campaign_type=Campaign.CampaignType.IBR,
            tts_prompt="Hello {{name}}",
        )
        other = self._login("other@ibr.test")
        res = other.post(f"/api/campaigns/{camp.id}/tts/", {}, format="json")
        self.assertEqual(res.status_code, 404)
        user = self._login("user@ibr.test")
        res = user.post(f"/api/campaigns/{camp.id}/tts/", {}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_port_stays_inside_the_agency_and_prefix_is_used(self):
        gateway = GsmGateway.objects.create(name="gsm222", host="192.168.1.101", sip_endpoint="gsm222")
        group_a = PortGroup.objects.create(gateway=gateway, name="A ports", agency=self.org)
        group_b = PortGroup.objects.create(gateway=gateway, name="B ports", agency=self.other)
        port_b = GsmPort.objects.create(group=group_b, name="B1", dial_prefix="8", caller_id="9800000002")
        with self.assertRaises(ValueError):
            assign_user_port(self.caller, port_b.id)
        camp = Campaign.objects.create(name="Live", agency=self.org, status=Campaign.Status.ACTIVE)
        client = self._login("root@ibr.test")
        created = client.post(
            "/api/staff/",
            {
                "email": "new@ibr.test",
                "password": "x",
                "role": "user",
                "first_name": "New",
                "organization": self.org.id,
                "reports_to": self.agency.id,
                "campaign_ids": [camp.id],
                "gsm_port": port_b.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 400)
        self.assertFalse(User.objects.filter(email="new@ibr.test").exists())
        port_a = GsmPort.objects.create(group=group_a, name="A1", dial_prefix="9", caller_id="9800000001")
        created = client.post(
            "/api/staff/",
            {
                "email": "new@ibr.test",
                "password": "x",
                "role": "user",
                "first_name": "New",
                "organization": self.org.id,
                "reports_to": self.agency.id,
                "campaign_ids": [camp.id],
                "gsm_port": port_a.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        asterisk = {**settings.ASTERISK, "CHANNEL_TECH": "pjsip", "ORIGINATE_STYLE": "direct", "TRUNK": "gsm222"}
        with override_settings(ASTERISK=asterisk):
            self.assertEqual(ami_pstn_channel("9811111111", "9"), "PJSIP/99811111111@gsm222")

    def test_inbound_matches_only_the_port_that_dialed(self):
        gateway = GsmGateway.objects.create(name="gsm222", host="192.168.1.101")
        group = PortGroup.objects.create(gateway=gateway, name="A ports", agency=self.org)
        port = GsmPort.objects.create(group=group, name="A1", caller_id="919800000001", assigned_user=self.caller)
        self.assertEqual(resolve_inbound("9811111111", "9800000001"), "")
        Call.objects.create(
            agent=self.caller,
            phone_number="919811111111",
            callerid_token="out-1",
            direction=Call.Direction.OUTBOUND,
            gsm_port=port,
        )
        self.assertEqual(resolve_inbound("9811111111", "9800000001"), "2101")
        self.assertEqual(resolve_inbound("9811111111", "9800000099"), "")
        client = APIClient()
        res = client.get("/api/telephony/inbound/", {"caller": "9811111111", "did": "9800000001"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content, b"2101")

    def test_csv_import_and_speech_file_stay_in_the_agency(self):
        from django.core.files.base import ContentFile
        from django.core.files.uploadedfile import SimpleUploadedFile

        from telephony.models import GsmPort

        camp = Campaign.objects.create(name="CSV Camp", agency=self.org, created_by=self.agency, status=Campaign.Status.ACTIVE)
        client = self._login("agency@ibr.test")
        preview = client.post(
            f"/api/campaigns/{camp.id}/import/preview/",
            {"file": SimpleUploadedFile("leads.csv", b"mobile,customer_name\n9811111111,Asha\n", content_type="text/csv")},
            format="multipart",
        )
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["valid_rows"], 1)
        self.assertIn("customer_name", preview.data["headers"])
        lead = Contact.objects.create(name="Asha", phone="9811111111", agency=self.org, campaign=camp)
        lead.tts_audio.save("lead.wav", ContentFile(b"RIFF" + b"\x00" * 40), save=True)
        path = "/media/" + lead.tts_audio.name
        own = client.get(path)
        self.assertEqual(own.status_code, 200)
        self.assertTrue(b"".join(own.streaming_content).startswith(b"RIFF"))
        other = self._login("other@ibr.test")
        self.assertEqual(other.get(path).status_code, 404)
        anon = APIClient()
        self.assertEqual(anon.get(path).status_code, 401)
        observed = GsmPort.objects.filter(synway_port=3, sip_account="8003").first()
        self.assertIsNotNone(observed)
        self.assertEqual(observed.caller_id, "")
        self.assertEqual(observed.dial_prefix, "")
        self.assertFalse(GsmPort.objects.get(synway_port=9).is_active)

    @override_settings(IBR_APPROVE_INLINE=True)
    def test_approving_an_ibr_file_builds_each_wave_and_records_outcomes(self):
        import csv
        from io import StringIO
        from pathlib import Path
        from unittest.mock import patch

        from django.core.files.base import ContentFile
        from django.core.files.uploadedfile import SimpleUploadedFile

        from telephony.ami import _handle_event
        from telephony.hopper import fill_ibr

        self.org.ibr_enabled = True
        self.org.save(update_fields=["ibr_enabled"])
        camp = Campaign.objects.create(
            name="Loan IBR",
            agency=self.org,
            created_by=self.agency,
            campaign_type=Campaign.CampaignType.IBR,
            tts_prompt="Hello {{customer_name}}, amount {{loan_amount}}.",
            status=Campaign.Status.DRAFT,
            dial_ratio=1,
        )
        spoken = []

        def fake_synth(text, dest, voice=None):
            spoken.append(text)
            Path(dest).write_bytes(b"RIFF" + b"\x00" * 40)

        client = self._login("agency@ibr.test")
        sheet = SimpleUploadedFile(
            "leads.csv",
            b"mobile,customer_name,loan_amount\n9811111111,Asha,1500\n9811111112,Ravi,800\n",
            content_type="text/csv",
        )
        with patch("telephony.tts.voice_path", return_value=Path("/tmp/voice.onnx")), patch("telephony.tts.synthesize", fake_synth):
            preview = client.post(f"/api/campaigns/{camp.id}/import/preview/", {"file": sheet}, format="multipart")
            self.assertEqual(preview.status_code, 200, preview.data)
            sheet.seek(0)
            approved = client.post(
                f"/api/campaigns/{camp.id}/import/",
                {"file": sheet, "job_id": preview.data["job_id"], "dial_threads": "3"},
                format="multipart",
            )
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data["speech"], "started")
        self.assertEqual(approved.data["threads"], 3)
        camp.refresh_from_db()
        self.assertTrue(camp.auto_running)
        self.assertEqual(camp.status, Campaign.Status.RUNNING)
        self.assertEqual(camp.dial_ratio, 3)
        self.assertEqual(spoken, [
            "Hello Asha, amount 1500.",
            "Hello Ravi, amount 800.",
        ])
        asha = Contact.objects.get(phone="9811111111")
        ravi = Contact.objects.get(phone="9811111112")
        self.assertEqual(asha.tts_status, "ready")
        self.assertEqual(ravi.tts_status, "ready")
        asha_call = Call.objects.create(
            agent=self.agency, contact=asha, campaign=camp, phone_number=asha.phone, callerid_token="ibr-asha", state=Call.State.RINGING
        )
        _handle_event({
            "Event": "Hangup",
            "ActionID": f"ibr-{asha_call.id}",
            "Channel": "PJSIP/9811111111@gsm222",
            "Cause": "20",
            "Cause-txt": "Subscriber switched off",
        })
        asha_call.refresh_from_db()
        self.assertEqual(asha_call.disposition, "SWITCHED_OFF")
        ravi_call = Call.objects.create(
            agent=self.agency, contact=ravi, campaign=camp, phone_number=ravi.phone, callerid_token="ibr-ravi", state=Call.State.RINGING
        )
        _handle_event({
            "Event": "Newstate",
            "ActionID": f"ibr-{ravi_call.id}",
            "Channel": "PJSIP/9811111112@gsm222",
            "ChannelStateDesc": "Up",
        })
        _handle_event({
            "Event": "Hangup",
            "ActionID": f"ibr-{ravi_call.id}",
            "Channel": "PJSIP/9811111112@gsm222",
            "Cause": "16",
            "Cause-txt": "Normal Clearing",
        })
        ravi_call.refresh_from_db()
        self.assertEqual(ravi_call.disposition, "CONNECTED")
        self.assertIsNotNone(ravi_call.answered_at)
        missed = Contact.objects.create(
            name="Una", phone="9811111113", agency=self.org, campaign=camp, extra_data={"customer_name": "Una"}, tts_status="pending"
        )
        Call.objects.create(
            agent=self.agency,
            contact=missed,
            campaign=camp,
            phone_number=missed.phone,
            callerid_token="ibr-una",
            state=Call.State.ENDED,
            disposition="Connected",
            outcome="Connected",
        )
        report = client.get(f"/api/reports/export/?kind=ibr&file=csv&campaign={camp.id}")
        self.assertEqual(report.status_code, 200)
        rows = list(csv.DictReader(StringIO(report.content.decode())))
        by_phone = {row["phone"]: row for row in rows}
        self.assertEqual(by_phone["9811111111"]["disposition"], "SWITCHED_OFF")
        self.assertEqual(by_phone["9811111111"]["announcement"], "The number you are calling is switched off.")
        self.assertEqual(by_phone["9811111111"]["customer_name"], "Asha")
        self.assertEqual(by_phone["9811111111"]["loan_amount"], "1500")
        self.assertEqual(by_phone["9811111112"]["disposition"], "CONNECTED")
        self.assertEqual(by_phone["9811111113"]["disposition"], "UNKNOWN_UNCLASSIFIED")
        self.assertEqual(by_phone["9811111113"]["outcome"], "UNKNOWN_UNCLASSIFIED")
        other = self._login("other@ibr.test")
        self.assertEqual(other.get(f"/api/reports/export/?kind=ibr&file=csv&campaign={camp.id}").status_code, 404)
        user = self._login("user@ibr.test")
        self.assertEqual(user.get(f"/api/reports/export/?kind=ibr&file=csv&campaign={camp.id}").status_code, 403)
        self.assertEqual(user.post(f"/api/campaigns/{camp.id}/import/", {"dial_threads": "1"}, format="multipart").status_code, 403)

        manager = User.objects.create_user(
            email="manager@ibr.test", password="x", role=User.Role.MANAGER, organization=self.org, reports_to=self.agency
        )
        admin = User.objects.create_user(
            email="admin@ibr.test", password="x", role=User.Role.ADMIN, organization=self.org, reports_to=manager
        )
        for owner, email, label in ((manager, "manager@ibr.test", "Manager"), (admin, "admin@ibr.test", "Admin")):
            owned = Campaign.objects.create(
                name=f"{label} IBR",
                agency=self.org,
                created_by=owner,
                manager=manager,
                admin=admin if owner == admin else None,
                campaign_type=Campaign.CampaignType.IBR,
                tts_prompt="Hello {{customer_name}}.",
                dial_ratio=1,
            )
            staff = self._login(email)
            upload = SimpleUploadedFile("one.csv", b"mobile,customer_name\n9811111114,Neha\n", content_type="text/csv")
            with patch("telephony.tts.voice_path", return_value=Path("/tmp/voice.onnx")), patch("telephony.tts.synthesize", fake_synth):
                preview = staff.post(f"/api/campaigns/{owned.id}/import/preview/", {"file": upload}, format="multipart")
                self.assertEqual(preview.status_code, 200, preview.data)
                upload.seek(0)
                approved = staff.post(
                    f"/api/campaigns/{owned.id}/import/",
                    {"file": upload, "job_id": preview.data["job_id"], "dial_threads": "2"},
                    format="multipart",
                )
            self.assertEqual(approved.status_code, 200, approved.data)
            self.assertEqual(approved.data["threads"], 2)
            owned.refresh_from_db()
            self.assertEqual(owned.dial_ratio, 2)
            self.assertTrue(owned.auto_running)
            self.assertEqual(Contact.objects.get(campaign=owned).tts_status, "ready")
            self.assertIn("Hello Neha.", spoken)

        quiet = Campaign.objects.create(
            name="Quiet IBR",
            agency=self.org,
            created_by=self.agency,
            campaign_type=Campaign.CampaignType.IBR,
            status=Campaign.Status.RUNNING,
            auto_running=True,
            active=True,
            dial_ratio=1,
        )
        waiting = Contact.objects.create(name="Wait", phone="9811111115", agency=self.org, campaign=quiet, tts_status="pending")
        first = Contact.objects.create(name="One", phone="9811111116", agency=self.org, campaign=quiet, tts_status="ready")
        second = Contact.objects.create(name="Two", phone="9811111117", agency=self.org, campaign=quiet, tts_status="ready")
        first.tts_audio.save("one.wav", ContentFile(b"RIFF" + b"\x00" * 40), save=True)
        second.tts_audio.save("two.wav", ContentFile(b"RIFF" + b"\x00" * 40), save=True)
        placed = fill_ibr(quiet)
        self.assertEqual(len(placed), 1)
        self.assertEqual(Call.objects.filter(campaign=quiet).count(), 1)
        self.assertNotEqual(placed[0].contact_id, waiting.id)
        self.assertEqual(Contact.objects.get(pk=second.id).lead_status, Contact.LeadStatus.NEW)


class CustomerAnswerTests(TestCase):
    def test_only_the_gsm_answer_connects_the_call(self):
        from telephony.ami import _handle_event

        org = Organization.objects.create(name="Answer Org")
        agent = User.objects.create_user(
            email="agent@answer.test", password="x", role=User.Role.USER, organization=org, extension="2100", sip_username="2100",
        )
        call = Call.objects.create(
            agent=agent, phone_number="7827847488", callerid_token="answer-1", state=Call.State.RINGING,
        )
        _handle_event({
            "Event": "Newstate",
            "Channel": "PJSIP/2100-0000001e",
            "ChannelStateDesc": "Up",
        })
        call.refresh_from_db()
        self.assertEqual(call.state, Call.State.RINGING)
        self.assertIsNone(call.answered_at)
        _handle_event({
            "Event": "DialEnd",
            "Channel": "PJSIP/2100-0000001e",
            "DestChannel": "PJSIP/gsm222-0000001f",
            "DialStatus": "ANSWER",
        })
        call.refresh_from_db()
        self.assertEqual(call.state, Call.State.CONNECTED)
        self.assertIsNotNone(call.answered_at)
