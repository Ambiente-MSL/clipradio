import argparse
import os
import posixpath
import sys

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from flask import Flask

from app import db
from config import Config
from models.gravacao import Gravacao
from models.radio import Radio
from services.dropbox_service import (
    DropboxError,
    build_audio_destination,
    ensure_folder,
    get_audio_id_from_filename,
    get_dropbox_config,
    list_folder_entries,
    move_file,
)


def create_db_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = Config.SQLALCHEMY_ENGINE_OPTIONS
    db.init_app(app)
    try:
        Config.init_app(app)
    except Exception:
        pass
    return app


def iter_dropbox_audio_entries(base_path: str, *, token: str):
    entries = list_folder_entries(base_path, token=token, recursive=True)
    for entry in entries:
        if entry.get(".tag") == "file":
            yield entry


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reorganiza/renomeia arquivos de audio no Dropbox com hierarquia por data/estado/cidade/radio.",
    )
    parser.add_argument(
        "--base-path",
        default=os.getenv("DROPBOX_AUDIO_PATH"),
        help="Diretorio base no Dropbox (default: DROPBOX_AUDIO_PATH).",
    )
    parser.add_argument(
        "--layout",
        default=os.getenv("DROPBOX_AUDIO_LAYOUT", "hierarchy"),
        help="Layout desejado (hierarchy). Default segue DROPBOX_AUDIO_LAYOUT.",
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

    entry_by_name = {}
    entry_by_id = {}
    for entry in entries:
        path = entry.get("path_display") or entry.get("path_lower")
        if not path:
            continue
        name = os.path.basename(path)
        entry_by_name.setdefault(name, []).append(path)
        audio_id = get_audio_id_from_filename(name)
        if audio_id:
            entry_by_id.setdefault(audio_id, []).append(path)

    app = create_db_app()
    with app.app_context():
        gravacoes = Gravacao.query.all()

        print(f"Encontradas {len(entries)} arquivo(s) no Dropbox")
        print(f"Encontradas {len(gravacoes)} gravacao(oes) no banco")
        print(f"Layout alvo: {layout}")

        moved = 0
        updated = 0
        skipped = 0
        failed = 0

        for gravacao in gravacoes:
            current_name = gravacao.arquivo_nome
            if not current_name and gravacao.arquivo_url:
                current_name = gravacao.arquivo_url.rsplit("/", 1)[-1]
            current_name = current_name or ""

            radio_obj = gravacao.radio or Radio.query.get(gravacao.radio_id)
            desired_path, desired_name = build_audio_destination(
                gravacao,
                radio=radio_obj,
                original_filename=current_name,
                base_path=base_path,
                layout=layout,
            )

            current_paths = []
            if current_name:
                current_paths = entry_by_name.get(current_name, [])
            if not current_paths and desired_name:
                current_paths = entry_by_name.get(desired_name, [])
            if not current_paths:
                current_paths = entry_by_id.get(gravacao.id, [])

            if not current_paths:
                skipped += 1
                continue

            current_path = current_paths[0]
            if current_path.lower() == desired_path.lower():
                if desired_name and gravacao.arquivo_nome != desired_name:
                    if args.dry_run:
                        print(f"[dry-run] update DB {gravacao.id} nome={desired_name}")
                    else:
                        gravacao.arquivo_nome = desired_name
                        gravacao.arquivo_url = f"/api/files/audio/{desired_name}"
                        try:
                            db.session.commit()
                            updated += 1
                        except Exception:
                            db.session.rollback()
                            failed += 1
                else:
                    skipped += 1
                continue

            if args.dry_run:
                print(f"[dry-run] move {current_path} -> {desired_path}")
                moved += 1
                continue

            try:
                ensure_folder(posixpath.dirname(desired_path), token=cfg.access_token)
                move_file(current_path, desired_path, token=cfg.access_token, autorename=False)
                moved += 1
            except DropboxError as exc:
                failed += 1
                print(f"Falha ao mover {current_path}: {exc}")
                continue
            except Exception as exc:
                failed += 1
                print(f"Erro inesperado ao mover {current_path}: {exc}")
                continue

            if desired_name and gravacao.arquivo_nome != desired_name:
                gravacao.arquivo_nome = desired_name
                gravacao.arquivo_url = f"/api/files/audio/{desired_name}"
                try:
                    db.session.commit()
                    updated += 1
                except Exception:
                    db.session.rollback()
                    failed += 1

        print(f"Concluido. Movidos: {moved}, Atualizados DB: {updated}, Ignorados: {skipped}, Falhas: {failed}")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
