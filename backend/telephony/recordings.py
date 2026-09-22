import re
import zipfile
from datetime import datetime, time, timedelta
from io import BytesIO
from pathlib import Path

from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status
from rest_framework.response import Response

from accounts.access import require_perm, scoped_recordings

from .models import Call

MAX_RECORDING_BYTES = 40 * 1024 * 1024
ALLOWED_RECORDING_EXT = {".webm", ".ogg", ".wav", ".mp3", ".m4a"}
ALLOWED_RECORDING_MIME = {
    "audio/webm",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "application/octet-stream",
}


def recordings_qs(user):
    qs = Call.objects.select_related(
        "agent",
        "agent__organization",
        "contact",
        "campaign",
        "campaign__agency",
    )
    qs = scoped_recordings(user, qs)
    return qs.exclude(recording_file="").exclude(recording_file__isnull=True)


def apply_recording_filters(qs, params, user):
    q = (params.get("q") or "").strip()
    if q:
        qs = qs.filter(
            Q(phone_number__icontains=q)
            | Q(contact__name__icontains=q)
            | Q(agent__first_name__icontains=q)
            | Q(agent__last_name__icontains=q)
            | Q(campaign__name__icontains=q)
        ).distinct()
    campaign = params.get("campaign")
    if campaign:
        qs = qs.filter(campaign_id=campaign)
    agent = params.get("agent")
    if agent:
        qs = qs.filter(agent_id=agent)
    agency = params.get("agency")
    if agency:
        from accounts.access import is_super_admin

        if is_super_admin(user):
            qs = qs.filter(Q(agent__organization_id=agency) | Q(campaign__agency_id=agency)).distinct()
    outcome = (params.get("outcome") or "").strip()
    if outcome:
        qs = qs.filter(outcome__iexact=outcome)
    start = _parse_day(params.get("from"))
    if start:
        qs = qs.filter(started_at__gte=start)
    end = _parse_day(params.get("to"), end=True)
    if end:
        qs = qs.filter(started_at__lt=end)
    return qs


def _parse_day(value, end=False):
    if not value:
        return None
    day = parse_date(str(value)[:10])
    if not day:
        return None
    moment = datetime.combine(day, time.min)
    aware = timezone.make_aware(moment, timezone.get_current_timezone())
    if end:
        return aware + timedelta(days=1)
    return aware


def save_recording(call, upload):
    name = (getattr(upload, "name", "") or "call.webm").lower()
    mime = (getattr(upload, "content_type", "") or "").lower()
    size = int(getattr(upload, "size", 0) or 0)
    if size > MAX_RECORDING_BYTES:
        raise ValueError("Recording is too large (40MB max)")
    if size < 32:
        raise ValueError("Recording file is empty")
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_RECORDING_EXT and mime not in ALLOWED_RECORDING_MIME:
        raise ValueError("Unsupported recording format")
    if call.recording_file:
        call.recording_file.delete(save=False)
    call.recording_file = upload
    call.recording = True
    call.recording_bytes = size
    call.recording_mime = (mime or "audio/webm")[:64]
    call.save(update_fields=["recording_file", "recording", "recording_bytes", "recording_mime"])
    return call


def recording_archive_name(call):
    stamp = timezone.localtime(call.started_at).strftime("%Y%m%d-%H%M%S") if call.started_at else "undated"
    ext = Path(call.recording_file.name).suffix or ".webm"
    phone = _safe_part(call.phone_number, "unknown")
    campaign = _safe_part(call.campaign_id or "none", "none")
    return f"{stamp}_{phone}_c{campaign}_{call.id}{ext}"


def _safe_part(value, fallback="x"):
    text = re.sub(r"[^0-9A-Za-z._+-]+", "_", str(value or fallback)).strip("._")
    return (text[:40] or fallback)


def file_response(call, download=False):
    mime = call.recording_mime or "audio/webm"
    return FileResponse(
        call.recording_file.open("rb"),
        as_attachment=download,
        filename=recording_archive_name(call),
        content_type=mime,
    )


def zip_recordings(qs):
    buf = BytesIO()
    count = 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for call in qs[:200]:
            if not call.recording_file:
                continue
            try:
                with call.recording_file.open("rb") as handle:
                    archive.writestr(recording_archive_name(call), handle.read())
                    count += 1
            except Exception:
                continue
    if not count:
        return Response({"detail": "No recordings selected"}, status=status.HTTP_400_BAD_REQUEST)
    buf.seek(0)
    response = HttpResponse(buf.getvalue(), content_type="application/zip")
    stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
    response["Content-Disposition"] = f'attachment; filename="procaller-recordings-{stamp}.zip"'
    return response


def require_logs(user):
    require_perm(user, "view_call_logs")
