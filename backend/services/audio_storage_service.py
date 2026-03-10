import os

from config import Config


def get_audio_storage_dir(*, storage_path=None):
    base_path = storage_path or Config.STORAGE_PATH
    return os.path.join(base_path, "audio")


def extract_audio_filename(gravacao):
    if not gravacao:
        return None
    filename = getattr(gravacao, "arquivo_nome", None)
    if not filename and getattr(gravacao, "arquivo_url", None):
        filename = gravacao.arquivo_url.rsplit("/", 1)[-1]
    return os.path.basename(str(filename or "").strip()) or None


def build_audio_filepath(filename, *, storage_path=None):
    normalized = os.path.basename(str(filename or "").strip())
    if not normalized:
        return None
    return os.path.join(get_audio_storage_dir(storage_path=storage_path), normalized)


def resolve_audio_filepath(gravacao, *, storage_path=None):
    filename = extract_audio_filename(gravacao)
    filepath = build_audio_filepath(filename, storage_path=storage_path)
    if filepath and os.path.exists(filepath):
        return filepath

    gravacao_id = getattr(gravacao, "id", None)
    audio_dir = get_audio_storage_dir(storage_path=storage_path)
    if not gravacao_id or not os.path.isdir(audio_dir):
        return filepath

    try:
        candidates = []
        for name in os.listdir(audio_dir):
            if not name or name.endswith(".dropbox"):
                continue
            candidate_path = os.path.join(audio_dir, name)
            if not os.path.isfile(candidate_path):
                continue
            if name.startswith(f"{gravacao_id}_") or gravacao_id in name:
                candidates.append(candidate_path)
    except Exception:
        candidates = []

    if not candidates:
        return filepath

    candidates.sort(key=os.path.getmtime, reverse=True)
    return candidates[0]


def get_dropbox_marker_path(filepath):
    if not filepath:
        return None
    return f"{filepath}.dropbox"


def write_dropbox_marker(filepath, remote_path):
    marker_path = get_dropbox_marker_path(filepath)
    if not marker_path or not remote_path:
        return None
    with open(marker_path, "w", encoding="utf-8") as fp:
        fp.write(str(remote_path).strip())
    return marker_path


def read_dropbox_marker(filepath):
    marker_path = get_dropbox_marker_path(filepath)
    if not marker_path or not os.path.exists(marker_path):
        return None
    try:
        with open(marker_path, "r", encoding="utf-8") as fp:
            return str(fp.read() or "").strip() or None
    except Exception:
        return None
