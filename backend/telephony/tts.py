import os
import re
import tempfile
import threading
import wave
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.core.files.base import ContentFile

_PLACEHOLDER = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")


def render_prompt(template, values):
    """Fill {{column}} from the lead. A missing column is an error. A blank cell stays blank."""
    values = values or {}
    missing = []

    def replace(match):
        key = match.group(1).strip()
        if key not in values:
            missing.append(key)
            return ""
        return "" if values[key] is None else str(values[key])

    text = _PLACEHOLDER.sub(replace, template or "")
    if missing:
        names = ", ".join(sorted(set(missing)))
        raise ValueError(f"Prompt is missing columns: {names}")
    text = " ".join(text.split())
    if not text:
        raise ValueError("Prompt is empty")
    return text


def list_voices():
    folder = Path(settings.PIPER_VOICES)
    if not folder.is_dir():
        return []
    return sorted(path.name[: -len(".onnx")] for path in folder.glob("*.onnx") if path.with_suffix(".onnx.json").exists() or Path(str(path) + ".json").exists())


def voice_path(name):
    safe = (name or settings.PIPER_DEFAULT_VOICE or "").strip()
    if not safe or "/" in safe or "\\" in safe or safe.startswith("."):
        raise ValueError("Unknown Piper voice")
    model = Path(settings.PIPER_VOICES) / f"{safe}.onnx"
    config = Path(str(model) + ".json")
    if not model.is_file() or not config.is_file():
        raise ValueError(f"Piper voice {safe} is not installed")
    return model


@lru_cache(maxsize=4)
def _load_voice(model_path):
    from piper import PiperVoice

    return PiperVoice.load(model_path)


def synthesize(text, dest, voice=None):
    model = voice_path(voice or settings.PIPER_DEFAULT_VOICE)
    loaded = _load_voice(str(model))
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(dest), "wb") as wav_file:
        loaded.synthesize_wav(text, wav_file)
    if dest.stat().st_size < 44:
        raise RuntimeError("Piper returned an empty file")
    return dest


def _lead_values(lead):
    values = {
        "name": lead.name or "",
        "phone": lead.phone or "",
        "mobile": lead.phone or "",
    }
    for key, value in (lead.extra_data or {}).items():
        values[str(key)] = "" if value is None else value
    return values


def generate_lead_audio(lead, prompt, voice):
    text = render_prompt(prompt, _lead_values(lead))
    handle, path = tempfile.mkstemp(suffix=".wav")
    os.close(handle)
    try:
        synthesize(text, path, voice)
        with open(path, "rb") as audio:
            payload = audio.read()
    finally:
        if os.path.exists(path):
            os.remove(path)
    if not payload.startswith(b"RIFF"):
        raise RuntimeError("Piper did not return a WAV file")
    lead.tts_audio.save(f"lead-{lead.id}.wav", ContentFile(payload), save=False)
    lead.tts_status = "ready"
    lead.tts_error = ""
    lead.save(update_fields=["tts_audio", "tts_status", "tts_error", "updated_at"])
    return lead


def generate_campaign_audio(campaign):
    voice = (campaign.tts_voice or settings.PIPER_DEFAULT_VOICE).strip()
    voice_path(voice)
    prompt = campaign.tts_prompt or ""
    ready = failed = 0
    errors = []
    for lead in campaign.contacts.all().order_by("id"):
        try:
            generate_lead_audio(lead, prompt, voice)
            ready += 1
        except Exception as exc:
            failed += 1
            lead.tts_status = "failed"
            lead.tts_error = str(exc)[:240]
            lead.save(update_fields=["tts_status", "tts_error", "updated_at"])
            if len(errors) < 20:
                errors.append({"lead_id": lead.id, "phone": lead.phone, "detail": str(exc)})
    return {"ready": ready, "failed": failed, "errors": errors, "voice": voice}


def generate_leads(campaign, contact_ids):
    """Build one Piper file per approved row. A missing column fails only that row."""
    from crm.models import Contact

    ids = list(contact_ids)
    leads = Contact.objects.filter(pk__in=ids, campaign=campaign).order_by("id")
    voice = (campaign.tts_voice or settings.PIPER_DEFAULT_VOICE).strip()
    prompt = campaign.tts_prompt or ""
    try:
        voice_path(voice)
    except Exception as exc:
        leads.update(tts_status="failed", tts_error=str(exc)[:240])
        return {"ready": 0, "failed": leads.count(), "voice": voice}
    ready = failed = 0
    for lead in leads:
        try:
            generate_lead_audio(lead, prompt, voice)
            ready += 1
        except Exception as exc:
            failed += 1
            lead.tts_status = "failed"
            lead.tts_error = str(exc)[:240]
            lead.save(update_fields=["tts_status", "tts_error", "updated_at"])
    return {"ready": ready, "failed": failed, "voice": voice}


def queue_ibr_speech(campaign_id, contact_ids):
    ids = [int(pk) for pk in contact_ids if pk]

    def run():
        from django.db import close_old_connections

        from campaigns.models import Campaign

        inline = getattr(settings, "IBR_APPROVE_INLINE", False)
        if not inline:
            close_old_connections()
        try:
            campaign = Campaign.objects.filter(pk=campaign_id).first()
            if campaign and ids:
                generate_leads(campaign, ids)
        finally:
            if not inline:
                close_old_connections()

    if getattr(settings, "IBR_APPROVE_INLINE", False):
        run()
        return
    threading.Thread(target=run, daemon=True).start()
