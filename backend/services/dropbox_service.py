import json
import os
import posixpath
import re
from datetime import datetime
from urllib.parse import unquote, urlparse
from dataclasses import dataclass
from typing import Generator, Optional, Tuple

import requests


DROPBOX_API_BASE = "https://api.dropboxapi.com/2"
DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2"

MAX_SIMPLE_UPLOAD_BYTES = 150 * 1024 * 1024  # 150MB (limite do /files/upload)
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024  # 8MB


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
    if layout in {"date", "flat"}:
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
