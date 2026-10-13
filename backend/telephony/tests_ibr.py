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
