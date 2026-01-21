import argparse
import os
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.dropbox_service import (
    DropboxError,
    build_remote_audio_path,
    get_audio_date_path,
    get_dropbox_config,
    list_folder_entries,
    move_file,
)


def iter_dropbox_audio_entries(base_path: str, *, token: str):
    entries = list_folder_entries(base_path, token=token, recursive=True)
    for entry in entries:
        if entry.get(".tag") == "file":
            yield entry


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reorganiza arquivos de audio ja enviados ao Dropbox em uma nova hierarquia.",
    )
    parser.add_argument(
        "--base-path",
        default=os.getenv("DROPBOX_AUDIO_PATH"),
        help="Diretorio base no Dropbox (default: DROPBOX_AUDIO_PATH).",
    )
    parser.add_argument(
        "--layout",
        default=os.getenv("DROPBOX_AUDIO_LAYOUT"),
        help="Layout desejado (date ou flat). Default segue DROPBOX_AUDIO_LAYOUT.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="So imprime o que faria, sem mover arquivos.",
    )
    args = parser.parse_args()

    cfg = get_dropbox_config()
    if not cfg.is_ready:
        print("Dropbox nao configurado. Defina DROPBOX_UPLOAD_ENABLED=true e DROPBOX_ACCESS_TOKEN.")
        return 2

    base_path = args.base_path or cfg.audio_path
    layout = args.layout or cfg.audio_layout

    entries = list(iter_dropbox_audio_entries(base_path, token=cfg.access_token))
    if not entries:
        print(f"Nenhum arquivo encontrado em {base_path}")
        return 0

    print(f"Encontrados {len(entries)} arquivo(s) em {base_path}")
    print(f"Layout alvo: {layout}")

    moved = 0
    skipped = 0
    failed = 0

    for entry in entries:
        current_path = entry.get("path_display") or entry.get("path_lower")
        if not current_path:
            skipped += 1
            continue
        filename = os.path.basename(current_path)
        if layout == "date" and not get_audio_date_path(filename):
            skipped += 1
            continue
        desired_path = build_remote_audio_path(filename, base_path=base_path, layout=layout)
        if current_path.lower() == desired_path.lower():
            skipped += 1
            continue

        if args.dry_run:
            print(f"[dry-run] move {current_path} -> {desired_path}")
            moved += 1
            continue

        try:
            move_file(current_path, desired_path, token=cfg.access_token, autorename=False)
            moved += 1
        except DropboxError as exc:
            failed += 1
            print(f"Falha ao mover {current_path}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"Erro inesperado ao mover {current_path}: {exc}")

    print(f"Concluido. Movidos: {moved}, Ignorados: {skipped}, Falhas: {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
