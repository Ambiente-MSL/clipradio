import math
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


LOCAL_TZ = ZoneInfo("America/Fortaleza")
DEFAULT_STREAM_MAX_AGE_DAYS = 30


def _get_config_value(key: str, default=None):
    try:
        from flask import current_app

        cfg = getattr(current_app, "config", {}) or {}
        value = cfg.get(key)
        if value is not None:
            return value
    except Exception:
        pass
    return os.getenv(key, default)


def get_audio_stream_max_age_days() -> int:
    raw_value = _get_config_value("AUDIO_STREAM_MAX_AGE_DAYS", DEFAULT_STREAM_MAX_AGE_DAYS)
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_STREAM_MAX_AGE_DAYS


def coerce_audio_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(LOCAL_TZ)
        return value.replace(tzinfo=LOCAL_TZ)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo:
        return parsed.astimezone(LOCAL_TZ)
    return parsed.replace(tzinfo=LOCAL_TZ)


def get_audio_age_days(gravacao, *, now: datetime | None = None):
    created_at = coerce_audio_datetime(getattr(gravacao, "criado_em", None))
    if not created_at:
        return None
    current_time = now or datetime.now(tz=LOCAL_TZ)
    if current_time.tzinfo:
        current_time = current_time.astimezone(LOCAL_TZ)
    else:
        current_time = current_time.replace(tzinfo=LOCAL_TZ)
    delta = current_time - created_at
    if delta.total_seconds() < 0:
        return 0
    return math.floor(delta.total_seconds() / 86400)


def is_audio_stream_allowed(gravacao, *, now: datetime | None = None) -> bool:
    max_age_days = get_audio_stream_max_age_days()
    if max_age_days < 0:
        return True
    created_at = coerce_audio_datetime(getattr(gravacao, "criado_em", None))
    if not created_at:
        return False
    current_time = now or datetime.now(tz=LOCAL_TZ)
    if current_time.tzinfo:
        current_time = current_time.astimezone(LOCAL_TZ)
    else:
        current_time = current_time.replace(tzinfo=LOCAL_TZ)
    return current_time - created_at <= timedelta(days=max_age_days)


def build_audio_access_payload(gravacao) -> dict:
    has_audio_ref = bool(getattr(gravacao, "arquivo_url", None) or getattr(gravacao, "arquivo_nome", None))
    return {
        "audio_can_stream": bool(has_audio_ref and is_audio_stream_allowed(gravacao)),
        "audio_can_download": has_audio_ref,
        "audio_age_days": get_audio_age_days(gravacao),
        "audio_stream_max_age_days": get_audio_stream_max_age_days(),
    }
