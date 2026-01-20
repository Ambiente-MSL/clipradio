import json
import os
import posixpath
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

    return DropboxConfig(
        enabled=enabled,
        access_token=access_token,
        audio_path=audio_path,
        delete_local_after_upload=delete_local_after_upload,
        local_retention_days=max(0, local_retention_days),
    )


def build_remote_audio_path(filename: str, *, base_path: Optional[str] = None) -> str:
    cfg = get_dropbox_config()
    root = (base_path or cfg.audio_path or "/clipradio/audio").rstrip("/")
    name = str(filename or "").lstrip("/")
    return f"{root}/{name}"


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


def _ensure_folder(path: str, *, token: str, timeout: Tuple[int, int] = (10, 30)) -> None:
    normalized = str(path or "").strip()
    if not normalized or normalized == "/":
        return
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"

    resp = requests.post(
        f"{DROPBOX_API_BASE}/files/create_folder_v2",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"path": normalized, "autorename": False},
        timeout=timeout,
    )
    if resp.ok:
        return
    if resp.status_code == 409:
        try:
            data = resp.json() or {}
            summary = str(data.get("error_summary") or "")
            if "conflict" in summary and "folder" in summary:
                return
        except Exception:
            pass
    _raise_for_response(resp, action="create_folder")
