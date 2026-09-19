import re
from datetime import datetime

from django.utils import timezone


def digits_only(value: str) -> str:
    return re.sub(r"\D+", "", value or "")


def normalize_phone(value: str) -> str:
    digits = digits_only(value)
    if digits.startswith("91") and len(digits) == 12:
        return digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        return digits[1:]
    return digits


def make_callerid_token(lead_or_call_id: int) -> str:
    stamp = timezone.localtime().strftime("%m%d%H%M%S")
    return f"P{stamp}{lead_or_call_id:010d}"


def format_duration(seconds: int) -> str:
    seconds = max(0, int(seconds or 0))
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


def initials_from_name(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return f"{parts[0][0]}{parts[-1][0]}".upper()
