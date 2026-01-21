import argparse
import os
import sys
from typing import Iterable, Optional

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
    build_remote_audio_path,
    get_audio_id_from_filename,
    get_dropbox_config,
    upload_file,
)


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


def resolve_gravacao_by_filename(filename: str) -> Optional[Gravacao]:
    if not filename:
        return None
    gravacao = Gravacao.query.filter(Gravacao.arquivo_nome == filename).first()
    if gravacao:
        return gravacao
    gravacao_id = get_audio_id_from_filename(filename)
    if not gravacao_id:
        return None
    return Gravacao.query.get(gravacao_id)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migra arquivos de audio locais (storage/audio) para Dropbox e, opcionalmente, remove do disco.",
    )
    parser.add_argument(
        "--audio-dir",
        default=os.getenv("AUDIO_DIR") or os.path.join(os.path.dirname(__file__), "..", "storage", "audio"),
        help="Diretorio local de audios (default: backend/storage/audio ou /app/storage/audio no container).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="So imprime o que faria, sem enviar/remover arquivos.",
    )
    parser.add_argument(
        "--delete-local",
        action="store_true",
        help="Remove o arquivo local apos upload bem-sucedido.",
    )
    args = parser.parse_args()

    cfg = get_dropbox_config()
    if not cfg.is_ready:
        print("Dropbox nao configurado. Defina DROPBOX_UPLOAD_ENABLED=true e DROPBOX_ACCESS_TOKEN.")
        return 2

    audio_dir = os.path.abspath(args.audio_dir)
    if not os.path.isdir(audio_dir):
        print(f"Diretorio nao encontrado: {audio_dir}")
        return 2

    delete_local = bool(args.delete_local or (cfg.delete_local_after_upload and cfg.local_retention_days <= 0))

    files = list(iter_audio_files(audio_dir))
    if not files:
        print(f"Nenhum arquivo encontrado em {audio_dir}")
        return 0

    print(f"Encontrados {len(files)} arquivo(s) em {audio_dir}")
    print(f"Destino Dropbox: {cfg.audio_path}")
    print(f"Remover local apos upload: {'sim' if delete_local else 'nao'}")

    app = None
    if cfg.audio_layout == "hierarchy":
        app = create_db_app()

    ok = 0
    failed = 0
    for local_path in files:
        filename = os.path.basename(local_path)
        remote_path = build_remote_audio_path(filename, base_path=cfg.audio_path)
        if app:
            with app.app_context():
                gravacao = resolve_gravacao_by_filename(filename)
                if gravacao:
                    radio_obj = gravacao.radio or Radio.query.get(gravacao.radio_id)
                    remote_path, _ = build_audio_destination(
                        gravacao,
                        radio=radio_obj,
                        original_filename=filename,
                        base_path=cfg.audio_path,
                        layout=cfg.audio_layout,
                    )
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

    print(f"Concluido. Sucesso: {ok}, Falhas: {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
