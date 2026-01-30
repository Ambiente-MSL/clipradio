import json
import os
import posixpath
import re
import unicodedata
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import unquote, urlparse
from dataclasses import dataclass
from typing import Generator, Optional, Tuple

import requests


DROPBOX_API_BASE = "https://api.dropboxapi.com/2"
DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2"

MAX_SIMPLE_UPLOAD_BYTES = 150 * 1024 * 1024  # 150MB (limite do /files/upload)
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024  # 8MB
LOCAL_TZ = ZoneInfo("America/Fortaleza")


@dataclass(frozen=True)
class DropboxConfig:
    enabled: bool
    access_token: Optional[str]
    audio_path: str
    audio_layout: str
    delete_local_after_upload: bool
    local_retention_days: int

    @property
    def is_ready(self) -> bool:
        return bool(self.enabled and self.access_token)


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
        return "/clipradio/audio"
    if raw.startswith(("http://", "https://")):
        try:
            parsed = urlparse(raw)
            if "dropbox.com" in (parsed.netloc or ""):
                path = parsed.path or ""
                if path.startswith("/work/"):
                    path = path[len("/work/"):]
                elif path.startswith("/home/"):
                    path = path[len("/home/"):]
                else:
                    path = path.lstrip("/")
                path = unquote(path)
                if path:
                    raw = path
        except Exception:
            pass
    raw = raw.strip().rstrip("/")
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw or "/clipradio/audio"


_AUDIO_DATE_RE = re.compile(r"(\\d{8})_(\\d{6})")
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


def _get_audio_timestamp_parts(filename: Optional[str], fallback_dt: Optional[datetime]) -> Tuple[str, str]:
    date_part = None
    time_part = None
    name = os.path.basename(str(filename or ""))
    match = _AUDIO_DATE_RE.search(name)
    if match:
        date_part = match.group(1)
        time_part = match.group(2)
    if date_part and time_part:
        return date_part, time_part

    dt = fallback_dt or datetime.now(tz=LOCAL_TZ)
    if dt.tzinfo:
        dt = dt.astimezone(LOCAL_TZ)
    else:
        dt = dt.replace(tzinfo=LOCAL_TZ)
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
    root = (base_path or cfg.audio_path or "/clipradio/audio").rstrip("/")

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
    layout = _normalize_layout(layout or cfg.audio_layout)

    filename = str(original_filename or getattr(gravacao, "arquivo_nome", "") or "")
    if layout != "hierarchy":
        return (
            build_remote_audio_path(filename, base_path=base_path, layout=layout),
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
    """
    Lê configuração do Dropbox a partir do Flask app (se disponível) ou variáveis de ambiente.
    """
    cfg = {}
    try:
        from flask import current_app

        cfg = getattr(current_app, "config", {}) or {}
    except Exception:
        cfg = {}

    enabled = _as_bool(cfg.get("DROPBOX_UPLOAD_ENABLED", os.getenv("DROPBOX_UPLOAD_ENABLED")), default=False)
    access_token = cfg.get("DROPBOX_ACCESS_TOKEN") or os.getenv("DROPBOX_ACCESS_TOKEN")
    audio_path = cfg.get("DROPBOX_AUDIO_PATH") or os.getenv("DROPBOX_AUDIO_PATH", "/clipradio/audio")
    audio_layout = cfg.get("DROPBOX_AUDIO_LAYOUT") or os.getenv("DROPBOX_AUDIO_LAYOUT", "flat")
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

    return DropboxConfig(
        enabled=enabled,
        access_token=access_token,
        audio_path=audio_path,
        audio_layout=audio_layout,
        delete_local_after_upload=delete_local_after_upload,
        local_retention_days=max(0, local_retention_days),
    )


def build_remote_audio_path(
    filename: str,
    *,
    base_path: Optional[str] = None,
    layout: Optional[str] = None,
) -> str:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/clipradio/audio").rstrip("/")
    name = str(filename or "").lstrip("/")
    layout = _normalize_layout(layout or cfg.audio_layout)
    if layout == "date":
        date_path = get_audio_date_path(name)
        if date_path:
            return posixpath.join(root, date_path, name)
    if layout == "hierarchy":
        return posixpath.join(root, name)
    return posixpath.join(root, name)


def build_candidate_audio_paths(
    filename: str,
    *,
    base_path: Optional[str] = None,
    layout: Optional[str] = None,
) -> Tuple[str, ...]:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/clipradio/audio").rstrip("/")
    name = str(filename or "").lstrip("/")
    layout = _normalize_layout(layout or cfg.audio_layout)

    candidates = []
    if layout == "date":
        date_path = get_audio_date_path(name)
        if date_path:
            candidates.append(posixpath.join(root, date_path, name))
        candidates.append(posixpath.join(root, name))
    elif layout == "hierarchy":
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


def _headers(token: str, api_arg: dict, *, content: bool) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Dropbox-API-Arg": json.dumps(api_arg),
        "Content-Type": "application/octet-stream" if content else "application/json",
    }


def _raise_for_response(resp: requests.Response, *, action: str) -> None:
    if resp.ok:
        return
    detail = None
    try:
        detail = resp.json()
    except Exception:
        detail = resp.text
    raise DropboxError(f"Dropbox {action} failed (status={resp.status_code}): {detail}")


def upload_file(
    local_path: str,
    remote_path: str,
    *,
    token: Optional[str] = None,
    timeout: Tuple[int, int] = (10, 300),
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> dict:
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN não configurado")
    if not local_path or not os.path.exists(local_path):
        raise DropboxError(f"Arquivo local não encontrado: {local_path}")

    remote_dir = posixpath.dirname(remote_path or "")
    if remote_dir and remote_dir != "/":
        _ensure_folder(remote_dir, token=token)

    size = os.path.getsize(local_path)
    if size <= MAX_SIMPLE_UPLOAD_BYTES:
        return _upload_simple(local_path, remote_path, token=token, timeout=timeout)
    return _upload_session(local_path, remote_path, token=token, timeout=timeout, chunk_size=chunk_size)


def _upload_simple(local_path: str, remote_path: str, *, token: str, timeout: Tuple[int, int]) -> dict:
    api_arg = {"path": remote_path, "mode": "overwrite", "autorename": False, "mute": True, "strict_conflict": False}
    with open(local_path, "rb") as fp:
        resp = requests.post(
            f"{DROPBOX_CONTENT_BASE}/files/upload",
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

    with open(local_path, "rb") as fp:
        first = fp.read(chunk_size)
        if not first:
            raise DropboxError(f"Arquivo vazio: {local_path}")

        start_resp = requests.post(
            f"{DROPBOX_CONTENT_BASE}/files/upload_session/start",
            headers=_headers(token, {"close": False}, content=True),
            data=first,
            timeout=timeout,
        )
        _raise_for_response(start_resp, action="upload_session/start")
        session_id = start_resp.json().get("session_id")
        if not session_id:
            raise DropboxError("Dropbox não retornou session_id")

        offset = len(first)
        while True:
            chunk = fp.read(chunk_size)
            if not chunk:
                break
            next_chunk = fp.peek(1) if hasattr(fp, "peek") else None
            is_last = next_chunk == b"" if next_chunk is not None else (fp.tell() >= os.path.getsize(local_path))

            if is_last:
                finish_resp = requests.post(
                    f"{DROPBOX_CONTENT_BASE}/files/upload_session/finish",
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

            append_resp = requests.post(
                f"{DROPBOX_CONTENT_BASE}/files/upload_session/append_v2",
                headers=_headers(token, {"cursor": {"session_id": session_id, "offset": offset}, "close": False}, content=True),
                data=chunk,
                timeout=timeout,
            )
            _raise_for_response(append_resp, action="upload_session/append_v2")
            offset += len(chunk)

        # Se chegamos aqui, o arquivo tinha exatamente 1 chunk (já enviado no start); finalizar com body vazio.
        finish_resp = requests.post(
            f"{DROPBOX_CONTENT_BASE}/files/upload_session/finish",
            headers=_headers(token, {"cursor": {"session_id": session_id, "offset": offset}, "commit": commit}, content=True),
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
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN não configurado")

    headers = {
        "Authorization": f"Bearer {token}",
        "Dropbox-API-Arg": json.dumps({"path": remote_path}),
    }
    if range_header:
        headers["Range"] = range_header

    resp = requests.post(
        f"{DROPBOX_CONTENT_BASE}/files/download",
        headers=headers,
        stream=True,
        timeout=timeout,
    )
    return resp


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
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN nǜo configurado")

    entries = []
    payload = {"path": path, "recursive": bool(recursive), "include_deleted": False}
    resp = requests.post(
        f"{DROPBOX_API_BASE}/files/list_folder",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=timeout,
    )
    _raise_for_response(resp, action="list_folder")
    data = resp.json() or {}
    entries.extend(data.get("entries") or [])
    cursor = data.get("cursor")
    while data.get("has_more"):
        resp = requests.post(
            f"{DROPBOX_API_BASE}/files/list_folder/continue",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN nǜo configurado")

    resp = requests.post(
        f"{DROPBOX_API_BASE}/files/move_v2",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN nÇœo configurado")

    resp = requests.post(
        f"{DROPBOX_API_BASE}/files/delete_v2",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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
        resp = requests.post(
            f"{DROPBOX_API_BASE}/files/create_folder_v2",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
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
    cfg = get_dropbox_config()
    token = token or cfg.access_token
    if not token:
        raise DropboxError("DROPBOX_ACCESS_TOKEN nǜo configurado")
    _ensure_folder(path, token=token)
