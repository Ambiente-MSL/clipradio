import json
import os
import posixpath
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from threading import Lock
from typing import Generator, Optional, Tuple
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo

import requests


DROPBOX_API_BASE = "https://api.dropboxapi.com/2"
DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2"
DROPBOX_OAUTH_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token"

MAX_SIMPLE_UPLOAD_BYTES = 150 * 1024 * 1024
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024
TOKEN_EXPIRY_SKEW_SECONDS = 60
LOCAL_TZ = ZoneInfo("America/Fortaleza")

_TOKEN_CACHE = {}
_TOKEN_CACHE_LOCK = Lock()


@dataclass(frozen=True)
class DropboxConfig:
    enabled: bool
    access_token: Optional[str]
    app_key: Optional[str]
    app_secret: Optional[str]
    refresh_token: Optional[str]
    audio_path: str
    audio_layout: str
    unrecognized_path: str
    delete_local_after_upload: bool
    local_retention_days: int

    @property
    def is_ready(self) -> bool:
        return bool(self.enabled and (self.access_token or (self.app_key and self.refresh_token)))


class DropboxError(RuntimeError):
    pass


def _as_bool(value, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _normalize_layout(value: Optional[str]) -> str:
    layout = str(value or "").strip().lower()
    if layout in {"date", "flat", "hierarchy"}:
        return layout
    return "flat"


def _normalize_dropbox_audio_path(value: Optional[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "/audio"
    if raw.startswith(("http://", "https://")):
        try:
            parsed = urlparse(raw)
            if "dropbox.com" in (parsed.netloc or ""):
                path = parsed.path or ""
                if path.startswith("/work/"):
                    path = path[len("/work/") :]
                elif path.startswith("/home/"):
                    path = path[len("/home/") :]
                else:
                    path = path.lstrip("/")
                path = unquote(path)
                if path:
                    raw = path
        except Exception:
            pass
    raw = raw.replace("\\", "/").strip()
    lowered = raw.lower()
    if ":/" in raw or lowered.startswith("/users/"):
        parts = [part for part in raw.split("/") if part]
        if "Aplicativos" in parts:
            idx = parts.index("Aplicativos")
            if idx + 2 <= len(parts):
                relative_parts = parts[idx + 2 :]
                if relative_parts:
                    raw = "/" + "/".join(relative_parts)
        elif "Apps" in parts:
            idx = parts.index("Apps")
            if idx + 2 <= len(parts):
                relative_parts = parts[idx + 2 :]
                if relative_parts:
                    raw = "/" + "/".join(relative_parts)
    raw = raw.strip().rstrip("/")
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw or "/audio"


def _normalize_unrecognized_path(value: Optional[str], *, base_path: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        raw = posixpath.join(base_path.rstrip("/"), "_NAO_RECONHECIDO")
    raw = raw.rstrip("/")
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw


_AUDIO_DATE_RE = re.compile(r"(\d{8})_(\d{6})")
_AUDIO_ID_RE = re.compile(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.I)


def _slugify_segment(value: Optional[str], *, fallback: str, max_length: int = 80) -> str:
    raw = str(value or "").strip()
    if not raw:
        return fallback
    normalized = unicodedata.normalize("NFKD", raw)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.strip()
    ascii_text = re.sub(r"[^A-Za-z0-9]+", "_", ascii_text)
    ascii_text = ascii_text.strip("_").upper()
    if not ascii_text:
        return fallback
    return ascii_text[:max_length]


def get_audio_id_from_filename(filename: str) -> Optional[str]:
    name = os.path.basename(str(filename or ""))
    match = _AUDIO_ID_RE.search(name)
    if not match:
        return None
    return match.group(1)


def _coerce_datetime(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo:
            return value.astimezone(LOCAL_TZ)
        return value.replace(tzinfo=LOCAL_TZ)
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo:
        return parsed.astimezone(LOCAL_TZ)
    return parsed.replace(tzinfo=LOCAL_TZ)


def _get_audio_timestamp_parts(filename: Optional[str], fallback_dt: Optional[datetime]) -> Tuple[str, str]:
    name = os.path.basename(str(filename or ""))
    match = _AUDIO_DATE_RE.search(name)
    if match:
        return match.group(1), match.group(2)

    dt = _coerce_datetime(fallback_dt) or datetime.now(tz=LOCAL_TZ)
    return dt.strftime("%Y%m%d"), dt.strftime("%H%M%S")


def build_audio_filename(
    gravacao,
    *,
    radio=None,
    original_filename: Optional[str] = None,
    fallback_ext: str = ".mp3",
) -> str:
    radio_name = getattr(radio, "nome", None)
    if radio_name is None and getattr(gravacao, "radio", None):
        radio_name = getattr(gravacao.radio, "nome", None)
    radio_slug = _slugify_segment(radio_name, fallback="RADIO", max_length=80)

    date_part, time_part = _get_audio_timestamp_parts(
        original_filename,
        getattr(gravacao, "criado_em", None),
    )
    _, ext = os.path.splitext(str(original_filename or ""))
    ext = ext.lower() if ext else fallback_ext

    gravacao_id = getattr(gravacao, "id", None) or "SEM_ID"
    return f"{radio_slug}_{date_part}_{time_part}_{gravacao_id}{ext}"


def build_audio_folder_path(
    gravacao,
    *,
    radio=None,
    original_filename: Optional[str] = None,
    base_path: Optional[str] = None,
) -> str:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/audio").rstrip("/")

    radio_obj = radio or getattr(gravacao, "radio", None)
    radio_name = getattr(radio_obj, "nome", None)
    city_name = getattr(radio_obj, "cidade", None)
    uf_value = getattr(radio_obj, "estado", None)

    date_part, _ = _get_audio_timestamp_parts(
        original_filename,
        getattr(gravacao, "criado_em", None),
    )
    year = date_part[:4]
    month = date_part[4:6]

    uf = str(uf_value or "").strip().upper()
    uf = re.sub(r"[^A-Z]", "", uf)
    uf = uf if len(uf) == 2 else _slugify_segment(uf, fallback="UF", max_length=8)

    city = _slugify_segment(city_name, fallback="SEM_CIDADE", max_length=80)
    radio_slug = _slugify_segment(radio_name, fallback="RADIO", max_length=80)

    return posixpath.join(root, year, month, uf, city, radio_slug, "ARQUIVOS")


def build_audio_destination(
    gravacao,
    *,
    radio=None,
    original_filename: Optional[str] = None,
    base_path: Optional[str] = None,
    layout: Optional[str] = None,
) -> Tuple[str, str]:
    cfg = get_dropbox_config()
    current_layout = _normalize_layout(layout or cfg.audio_layout)

    filename = str(original_filename or getattr(gravacao, "arquivo_nome", "") or "")
    if current_layout != "hierarchy":
        return (
            build_remote_audio_path(filename, base_path=base_path, layout=current_layout),
            filename.lstrip("/"),
        )

    desired_name = build_audio_filename(gravacao, radio=radio, original_filename=filename)
    folder_path = build_audio_folder_path(
        gravacao,
        radio=radio,
        original_filename=filename,
        base_path=base_path,
    )
    return posixpath.join(folder_path, desired_name), desired_name


def get_audio_date_path(filename: str) -> Optional[str]:
    name = os.path.basename(str(filename or ""))
    match = _AUDIO_DATE_RE.search(name)
    if not match:
        return None
    date_part = match.group(1)
    try:
        date_obj = datetime.strptime(date_part, "%Y%m%d")
    except ValueError:
        return None
    return date_obj.strftime("%Y/%m/%d")


def get_dropbox_config() -> DropboxConfig:
    cfg = {}
    try:
        from flask import current_app

        cfg = getattr(current_app, "config", {}) or {}
    except Exception:
        cfg = {}

    enabled = _as_bool(cfg.get("DROPBOX_UPLOAD_ENABLED", os.getenv("DROPBOX_UPLOAD_ENABLED")), default=False)
    access_token = cfg.get("DROPBOX_ACCESS_TOKEN") or os.getenv("DROPBOX_ACCESS_TOKEN")
    app_key = cfg.get("DROPBOX_APP_KEY") or os.getenv("DROPBOX_APP_KEY")
    app_secret = cfg.get("DROPBOX_APP_SECRET") or os.getenv("DROPBOX_APP_SECRET")
    refresh_token = cfg.get("DROPBOX_REFRESH_TOKEN") or os.getenv("DROPBOX_REFRESH_TOKEN")
    audio_path = cfg.get("DROPBOX_AUDIO_PATH") or os.getenv("DROPBOX_AUDIO_PATH", "/audio")
    audio_layout = cfg.get("DROPBOX_AUDIO_LAYOUT") or os.getenv("DROPBOX_AUDIO_LAYOUT", "hierarchy")
    unrecognized_path = cfg.get("DROPBOX_AUDIO_UNRECOGNIZED_PATH") or os.getenv(
        "DROPBOX_AUDIO_UNRECOGNIZED_PATH",
        "",
    )
    delete_local_after_upload = _as_bool(
        cfg.get("DROPBOX_DELETE_LOCAL_AFTER_UPLOAD", os.getenv("DROPBOX_DELETE_LOCAL_AFTER_UPLOAD", "true")),
        default=True,
    )
    try:
        local_retention_days = int(
            cfg.get("DROPBOX_LOCAL_RETENTION_DAYS", os.getenv("DROPBOX_LOCAL_RETENTION_DAYS", "0") or 0) or 0
        )
    except Exception:
        local_retention_days = 0

    audio_path = _normalize_dropbox_audio_path(audio_path)
    audio_layout = _normalize_layout(audio_layout)
    unrecognized_path = _normalize_unrecognized_path(unrecognized_path, base_path=audio_path)

    return DropboxConfig(
        enabled=enabled,
        access_token=access_token,
        app_key=app_key,
        app_secret=app_secret,
        refresh_token=refresh_token,
        audio_path=audio_path,
        audio_layout=audio_layout,
        unrecognized_path=unrecognized_path,
        delete_local_after_upload=delete_local_after_upload,
        local_retention_days=max(0, local_retention_days),
    )


def _get_token_cache_key(cfg: DropboxConfig) -> Optional[str]:
    if not (cfg.app_key and cfg.refresh_token):
        return None
    return f"{cfg.app_key}:{cfg.refresh_token}"


def _get_cached_access_token(cache_key: Optional[str]) -> Optional[str]:
    if not cache_key:
        return None
    now = time.time()
    with _TOKEN_CACHE_LOCK:
        payload = _TOKEN_CACHE.get(cache_key)
        if not payload:
            return None
        expires_at = float(payload.get("expires_at") or 0)
        if expires_at and expires_at > now + TOKEN_EXPIRY_SKEW_SECONDS:
            return payload.get("access_token")
        _TOKEN_CACHE.pop(cache_key, None)
    return None


def _cache_access_token(cache_key: Optional[str], access_token: str, expires_in: Optional[int]) -> None:
    if not cache_key or not access_token:
        return
    try:
        expires_seconds = int(expires_in or 0)
    except (TypeError, ValueError):
        expires_seconds = 0
    expires_at = time.time() + expires_seconds if expires_seconds > 0 else 0
    with _TOKEN_CACHE_LOCK:
        _TOKEN_CACHE[cache_key] = {
            "access_token": access_token,
            "expires_at": expires_at,
        }


def _refresh_access_token(cfg: DropboxConfig) -> str:
    if not cfg.refresh_token:
        raise DropboxError("DROPBOX_REFRESH_TOKEN nao configurado")
    if not cfg.app_key:
        raise DropboxError("DROPBOX_APP_KEY nao configurado")

    data = {
        "grant_type": "refresh_token",
        "refresh_token": cfg.refresh_token,
        "client_id": cfg.app_key,
    }
    if cfg.app_secret:
        data["client_secret"] = cfg.app_secret

    resp = requests.post(
        DROPBOX_OAUTH_TOKEN_URL,
        data=data,
        timeout=(10, 30),
    )
    _raise_for_response(resp, action="token_refresh")
    payload = resp.json() or {}
    access_token = str(payload.get("access_token") or "").strip()
    if not access_token:
        raise DropboxError("Dropbox token_refresh nao retornou access_token")
    _cache_access_token(_get_token_cache_key(cfg), access_token, payload.get("expires_in"))
    return access_token


def get_access_token(*, token: Optional[str] = None, force_refresh: bool = False) -> str:
    if token:
        return token

    cfg = get_dropbox_config()
    if not cfg.enabled:
        raise DropboxError("Dropbox nao habilitado")

    cache_key = _get_token_cache_key(cfg)
    if cfg.refresh_token and cfg.app_key:
        if not force_refresh:
            cached = _get_cached_access_token(cache_key)
            if cached:
                return cached
        return _refresh_access_token(cfg)

    if cfg.access_token:
        return cfg.access_token

    raise DropboxError(
        "Dropbox nao configurado. Defina DROPBOX_ACCESS_TOKEN ou DROPBOX_APP_KEY + DROPBOX_REFRESH_TOKEN."
    )


def _dropbox_request(method: str, url: str, *, token: Optional[str] = None, timeout=(10, 30), **kwargs):
    resolved_token = get_access_token(token=token)
    headers = dict(kwargs.pop("headers", {}) or {})
    headers["Authorization"] = f"Bearer {resolved_token}"
    resp = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
    if resp.status_code == 401 and token is None:
        refreshed_token = get_access_token(force_refresh=True)
        if refreshed_token != resolved_token:
            headers["Authorization"] = f"Bearer {refreshed_token}"
            resp = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
    return resp


def get_unrecognized_audio_path(*, base_path: Optional[str] = None) -> str:
    cfg = get_dropbox_config()
    if base_path:
        normalized_base = _normalize_dropbox_audio_path(base_path)
        return _normalize_unrecognized_path(None, base_path=normalized_base)
    return cfg.unrecognized_path


def build_remote_audio_path(
    filename: str,
    *,
    base_path: Optional[str] = None,
    layout: Optional[str] = None,
) -> str:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/audio").rstrip("/")
    name = str(filename or "").lstrip("/")
    current_layout = _normalize_layout(layout or cfg.audio_layout)
    if current_layout == "date":
        date_path = get_audio_date_path(name)
        if date_path:
            return posixpath.join(root, date_path, name)
    if current_layout == "hierarchy":
        return posixpath.join(root, name)
    return posixpath.join(root, name)


def build_candidate_audio_paths(
    filename: str,
    *,
    base_path: Optional[str] = None,
    layout: Optional[str] = None,
) -> Tuple[str, ...]:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/audio").rstrip("/")
    name = str(filename or "").lstrip("/")
    current_layout = _normalize_layout(layout or cfg.audio_layout)

    candidates = []
    if current_layout == "date":
        date_path = get_audio_date_path(name)
        if date_path:
            candidates.append(posixpath.join(root, date_path, name))
        candidates.append(posixpath.join(root, name))
    elif current_layout == "hierarchy":
        candidates.append(posixpath.join(root, name))
    else:
        candidates.append(posixpath.join(root, name))

    seen = set()
    unique = []
    for path in candidates:
        if path in seen:
            continue
        seen.add(path)
        unique.append(path)
    return tuple(unique)


def build_unrecognized_audio_paths(
    filename: str,
    *,
    base_path: Optional[str] = None,
) -> Tuple[str, ...]:
    name = os.path.basename(str(filename or "")).lstrip("/")
    if not name:
        return tuple()
    root = get_unrecognized_audio_path(base_path=base_path)
    return (posixpath.join(root, name),)


def _headers(token: str, api_arg: dict, *, content: bool) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Dropbox-API-Arg": json.dumps(api_arg),
        "Content-Type": "application/octet-stream" if content else "application/json",
    }


def _raise_for_response(resp: requests.Response, *, action: str) -> None:
    if resp.ok:
        return
    try:
        detail = resp.json()
    except Exception:
        detail = resp.text
    raise DropboxError(f"Erro do Dropbox na operacao '{action}' (status={resp.status_code}): {detail}")


def upload_file(
    local_path: str,
    remote_path: str,
    *,
    token: Optional[str] = None,
    timeout: Tuple[int, int] = (10, 300),
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> dict:
    resolved_token = get_access_token(token=token)
    if not local_path or not os.path.exists(local_path):
        raise DropboxError(f"Arquivo local nao encontrado: {local_path}")

    remote_dir = posixpath.dirname(remote_path or "")
    if remote_dir and remote_dir != "/":
        _ensure_folder(remote_dir, token=resolved_token)

    size = os.path.getsize(local_path)
    if size <= MAX_SIMPLE_UPLOAD_BYTES:
        return _upload_simple(local_path, remote_path, token=resolved_token, timeout=timeout)
    return _upload_session(local_path, remote_path, token=resolved_token, timeout=timeout, chunk_size=chunk_size)


def _upload_simple(local_path: str, remote_path: str, *, token: str, timeout: Tuple[int, int]) -> dict:
    api_arg = {"path": remote_path, "mode": "overwrite", "autorename": False, "mute": True, "strict_conflict": False}
    with open(local_path, "rb") as fp:
        resp = _dropbox_request(
            "POST",
            f"{DROPBOX_CONTENT_BASE}/files/upload",
            token=token,
            headers=_headers(token, api_arg, content=True),
            data=fp,
            timeout=timeout,
        )
    _raise_for_response(resp, action="upload")
    return resp.json()


def _upload_session(
    local_path: str,
    remote_path: str,
    *,
    token: str,
    timeout: Tuple[int, int],
    chunk_size: int,
) -> dict:
    commit = {"path": remote_path, "mode": "overwrite", "autorename": False, "mute": True, "strict_conflict": False}
    file_size = os.path.getsize(local_path)

    with open(local_path, "rb") as fp:
        first = fp.read(chunk_size)
        if not first:
            raise DropboxError(f"Arquivo vazio: {local_path}")

        start_resp = _dropbox_request(
            "POST",
            f"{DROPBOX_CONTENT_BASE}/files/upload_session/start",
            token=token,
            headers=_headers(token, {"close": False}, content=True),
            data=first,
            timeout=timeout,
        )
        _raise_for_response(start_resp, action="upload_session/start")
        session_id = start_resp.json().get("session_id")
        if not session_id:
            raise DropboxError("Dropbox nao retornou session_id")

        offset = len(first)
        while True:
            chunk = fp.read(chunk_size)
            if not chunk:
                break
            is_last = fp.tell() >= file_size

            if is_last:
                finish_resp = _dropbox_request(
                    "POST",
                    f"{DROPBOX_CONTENT_BASE}/files/upload_session/finish",
                    token=token,
                    headers=_headers(
                        token,
                        {"cursor": {"session_id": session_id, "offset": offset}, "commit": commit},
                        content=True,
                    ),
                    data=chunk,
                    timeout=timeout,
                )
                _raise_for_response(finish_resp, action="upload_session/finish")
                return finish_resp.json()

            append_resp = _dropbox_request(
                "POST",
                f"{DROPBOX_CONTENT_BASE}/files/upload_session/append_v2",
                token=token,
                headers=_headers(
                    token,
                    {"cursor": {"session_id": session_id, "offset": offset}, "close": False},
                    content=True,
                ),
                data=chunk,
                timeout=timeout,
            )
            _raise_for_response(append_resp, action="upload_session/append_v2")
            offset += len(chunk)

        finish_resp = _dropbox_request(
            "POST",
            f"{DROPBOX_CONTENT_BASE}/files/upload_session/finish",
            token=token,
            headers=_headers(
                token,
                {"cursor": {"session_id": session_id, "offset": offset}, "commit": commit},
                content=True,
            ),
            data=b"",
            timeout=timeout,
        )
        _raise_for_response(finish_resp, action="upload_session/finish")
        return finish_resp.json()


def download_response(
    remote_path: str,
    *,
    token: Optional[str] = None,
    timeout: Tuple[int, int] = (10, 300),
    range_header: Optional[str] = None,
) -> requests.Response:
    headers = {
        "Dropbox-API-Arg": json.dumps({"path": remote_path}),
    }
    if range_header:
        headers["Range"] = range_header

    return _dropbox_request(
        "POST",
        f"{DROPBOX_CONTENT_BASE}/files/download",
        token=token,
        headers=headers,
        stream=True,
        timeout=timeout,
    )


def stream_download(
    remote_path: str,
    *,
    token: Optional[str] = None,
    chunk_size: int = 1024 * 256,
    range_header: Optional[str] = None,
) -> Generator[bytes, None, None]:
    resp = download_response(remote_path, token=token, range_header=range_header)
    _raise_for_response(resp, action="download")
    for chunk in resp.iter_content(chunk_size=chunk_size):
        if chunk:
            yield chunk


def list_folder_entries(
    path: str,
    *,
    token: Optional[str] = None,
    recursive: bool = False,
    timeout: Tuple[int, int] = (10, 30),
) -> list:
    entries = []
    payload = {"path": path, "recursive": bool(recursive), "include_deleted": False}
    resp = _dropbox_request(
        "POST",
        f"{DROPBOX_API_BASE}/files/list_folder",
        token=token,
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    _raise_for_response(resp, action="list_folder")
    data = resp.json() or {}
    entries.extend(data.get("entries") or [])
    cursor = data.get("cursor")

    while data.get("has_more"):
        resp = _dropbox_request(
            "POST",
            f"{DROPBOX_API_BASE}/files/list_folder/continue",
            token=token,
            headers={"Content-Type": "application/json"},
            json={"cursor": cursor},
            timeout=timeout,
        )
        _raise_for_response(resp, action="list_folder/continue")
        data = resp.json() or {}
        entries.extend(data.get("entries") or [])
        cursor = data.get("cursor")
    return entries


def move_file(
    from_path: str,
    to_path: str,
    *,
    token: Optional[str] = None,
    autorename: bool = False,
    timeout: Tuple[int, int] = (10, 30),
) -> dict:
    resp = _dropbox_request(
        "POST",
        f"{DROPBOX_API_BASE}/files/move_v2",
        token=token,
        headers={"Content-Type": "application/json"},
        json={"from_path": from_path, "to_path": to_path, "autorename": autorename},
        timeout=timeout,
    )
    _raise_for_response(resp, action="move")
    return resp.json()


def delete_file(
    path: str,
    *,
    token: Optional[str] = None,
    timeout: Tuple[int, int] = (10, 30),
) -> dict:
    resp = _dropbox_request(
        "POST",
        f"{DROPBOX_API_BASE}/files/delete_v2",
        token=token,
        headers={"Content-Type": "application/json"},
        json={"path": path},
        timeout=timeout,
    )
    _raise_for_response(resp, action="delete")
    return resp.json()


def _ensure_folder(path: str, *, token: str, timeout: Tuple[int, int] = (10, 30)) -> None:
    normalized = str(path or "").strip()
    if not normalized or normalized == "/":
        return
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"

    parts = [part for part in normalized.strip("/").split("/") if part]
    current = ""
    for part in parts:
        current = f"{current}/{part}"
        resp = _dropbox_request(
            "POST",
            f"{DROPBOX_API_BASE}/files/create_folder_v2",
            token=token,
            headers={"Content-Type": "application/json"},
            json={"path": current, "autorename": False},
            timeout=timeout,
        )
        if resp.ok:
            continue
        if resp.status_code == 409:
            try:
                data = resp.json() or {}
                summary = str(data.get("error_summary") or "")
                if "conflict" in summary and "folder" in summary:
                    continue
            except Exception:
                pass
        _raise_for_response(resp, action="create_folder")


def ensure_folder(path: str, *, token: Optional[str] = None) -> None:
    resolved_token = get_access_token(token=token)
    _ensure_folder(path, token=resolved_token)
