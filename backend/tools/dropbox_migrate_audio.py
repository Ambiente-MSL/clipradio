import argparse
import os
import sys
from typing import Iterable

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.dropbox_service import DropboxError, build_remote_audio_path, get_dropbox_config, upload_file


def iter_audio_files(audio_dir: str) -> Iterable[str]:
    if not os.path.isdir(audio_dir):
        return
    for name in sorted(os.listdir(audio_dir)):
        if not name or name.startswith("."):
            continue
        if name.endswith(".dropbox"):
            continue
        path = os.path.join(audio_dir, name)
        if os.path.isfile(path):
            yield path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migra arquivos de áudio locais (storage/audio) para Dropbox e, opcionalmente, remove do disco.",
    )
    parser.add_argument(
        "--audio-dir",
        default=os.getenv("AUDIO_DIR") or os.path.join(os.path.dirname(__file__), "..", "storage", "audio"),
        help="Diretório local de áudios (default: backend/storage/audio ou /app/storage/audio no container).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só imprime o que faria, sem enviar/remover arquivos.",
    )
    parser.add_argument(
        "--delete-local",
        action="store_true",
        help="Remove o arquivo local após upload bem-sucedido.",
    )
    args = parser.parse_args()

    cfg = get_dropbox_config()
    if not cfg.is_ready:
        print("Dropbox não configurado. Defina DROPBOX_UPLOAD_ENABLED=true e DROPBOX_ACCESS_TOKEN.")
        return 2

    audio_dir = os.path.abspath(args.audio_dir)
    if not os.path.isdir(audio_dir):
        print(f"Diretório não encontrado: {audio_dir}")
        return 2

    delete_local = bool(args.delete_local or (cfg.delete_local_after_upload and cfg.local_retention_days <= 0))

    files = list(iter_audio_files(audio_dir))
    if not files:
        print(f"Nenhum arquivo encontrado em {audio_dir}")
        return 0

    print(f"Encontrados {len(files)} arquivo(s) em {audio_dir}")
    print(f"Destino Dropbox: {cfg.audio_path}")
    print(f"Remover local após upload: {'sim' if delete_local else 'não'}")

    ok = 0
    failed = 0
    for local_path in files:
        filename = os.path.basename(local_path)
        remote_path = build_remote_audio_path(filename, base_path=cfg.audio_path)
        try:
            if args.dry_run:
                print(f"[dry-run] upload {local_path} -> {remote_path}")
            else:
                upload_file(local_path, remote_path, token=cfg.access_token)
                ok += 1
                if delete_local:
                    try:
                        os.remove(local_path)
                    except Exception as exc:
                        print(f"Falha ao remover local {local_path}: {exc}")
        except DropboxError as exc:
            failed += 1
            print(f"Falha no upload {local_path}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"Erro inesperado em {local_path}: {exc}")

    print(f"Concluído. Sucesso: {ok}, Falhas: {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
