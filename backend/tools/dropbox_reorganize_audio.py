import argparse
import csv
import os
import posixpath
import re
import sys
import time
from datetime import datetime
from types import SimpleNamespace

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from services.dropbox_service import (
    DropboxError,
    build_audio_destination,
    build_remote_audio_path,
    delete_file,
    ensure_folder,
    get_audio_id_from_filename,
    get_dropbox_config,
    list_folder_entries,
    move_file,
)

_STATUS_RE = re.compile(r"status=(\d+)")
_RETRY_AFTER_RE = re.compile(r"retry_after[\"']?\s*[:=]\s*(\d+)", re.IGNORECASE)


def _extract_status_code(exc: Exception):
    match = _STATUS_RE.search(str(exc))
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def _extract_retry_after(exc: Exception):
    match = _RETRY_AFTER_RE.search(str(exc))
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def parse_datetime(value):
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def load_metadata_csv(path, *, delimiter=",", encoding="utf-8"):
    metadata_by_name = {}
    metadata_by_id = {}
    if not path:
        return metadata_by_name, metadata_by_id
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Arquivo CSV nao encontrado: {path}")

    with open(path, "r", encoding=encoding, newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        for row in reader:
            normalized = {str(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            gravacao_id = normalized.get("id") or normalized.get("gravacao_id")
            arquivo_nome = normalized.get("arquivo_nome") or normalized.get("filename") or normalized.get("arquivo")
            arquivo_url = normalized.get("arquivo_url") or normalized.get("url")
            criado_em = normalized.get("criado_em") or normalized.get("created_at") or normalized.get("criado_em_local")
            radio_nome = normalized.get("radio_nome") or normalized.get("radio")
            cidade = normalized.get("cidade")
            estado = normalized.get("estado") or normalized.get("uf")

            meta = {
                "id": gravacao_id,
                "arquivo_nome": arquivo_nome,
                "arquivo_url": arquivo_url,
                "criado_em": parse_datetime(criado_em),
                "radio_nome": radio_nome,
                "cidade": cidade,
                "estado": estado,
            }

            if arquivo_nome:
                metadata_by_name.setdefault(arquivo_nome, meta)
            if gravacao_id:
                metadata_by_id.setdefault(gravacao_id, meta)

    return metadata_by_name, metadata_by_id


def iter_dropbox_audio_entries(base_path: str, *, token: str):
    entries = list_folder_entries(base_path, token=token, recursive=True)
    for entry in entries:
        if entry.get(".tag") == "file":
            yield entry


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Reorganiza/renomeia arquivos de audio no Dropbox sem acessar o banco.",
    )
    parser.add_argument(
        "--base-path",
        default=os.getenv("DROPBOX_AUDIO_PATH"),
        help="Diretorio base no Dropbox (default: DROPBOX_AUDIO_PATH).",
    )
    parser.add_argument(
        "--layout",
        default=os.getenv("DROPBOX_AUDIO_LAYOUT", "hierarchy"),
        help="Layout desejado (hierarchy, date, flat). Default segue DROPBOX_AUDIO_LAYOUT.",
    )
    parser.add_argument(
        "--metadata-csv",
        help="CSV com colunas: id, arquivo_nome, criado_em, radio_nome, cidade, estado (opcional arquivo_url).",
    )
    parser.add_argument(
        "--csv-delimiter",
        default=",",
        help="Delimitador do CSV (default: ',').",
    )
    parser.add_argument(
        "--csv-encoding",
        default="utf-8",
        help="Encoding do CSV (default: utf-8).",
    )
    parser.add_argument(
        "--output-csv",
        help="Salva um CSV com id, old_name, new_name, new_path.",
    )
    parser.add_argument(
        "--unrecognized-path",
        help="Move arquivos sem metadata para essa pasta (ex: /clipradio/audio/_NAO_RECONHECIDO).",
    )
    parser.add_argument(
        "--delete-source-on-conflict",
        action="store_true",
        help="Remove arquivo de origem quando o destino ja existe (duplicado).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Numero maximo de tentativas em caso de rate limit (default: 3).",
    )
    parser.add_argument(
        "--retry-wait",
        type=int,
        default=10,
        help="Aguarde N segundos quando houver rate limit e retry_after ausente (default: 10).",
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

    metadata_by_name, metadata_by_id = load_metadata_csv(
        args.metadata_csv,
        delimiter=args.csv_delimiter,
        encoding=args.csv_encoding,
    )

    print(f"Encontradas {len(entries)} arquivo(s) no Dropbox")
    if args.metadata_csv:
        print(f"Metadata carregada: {len(metadata_by_id)} por id, {len(metadata_by_name)} por nome")
    print(f"Layout alvo: {layout}")

    moved = 0
    skipped = 0
    failed = 0
    deleted_duplicates = 0
    output_rows = []

    for entry in entries:
        current_path = entry.get("path_display") or entry.get("path_lower")
        if not current_path:
            skipped += 1
            continue
        filename = os.path.basename(current_path)

        meta = metadata_by_name.get(filename)
        if not meta:
            audio_id = get_audio_id_from_filename(filename)
            if audio_id:
                meta = metadata_by_id.get(audio_id)

        if layout == "hierarchy":
            if not meta:
                if not args.unrecognized_path:
                    skipped += 1
                    continue
                desired_name = filename
                desired_path = posixpath.join(args.unrecognized_path.rstrip("/"), desired_name)
            else:
                gravacao = SimpleNamespace(
                    id=meta.get("id") or get_audio_id_from_filename(filename) or filename,
                    criado_em=meta.get("criado_em"),
                    arquivo_nome=meta.get("arquivo_nome") or filename,
                    arquivo_url=meta.get("arquivo_url"),
                )
                radio = SimpleNamespace(
                    nome=meta.get("radio_nome"),
                    cidade=meta.get("cidade"),
                    estado=meta.get("estado"),
                )
                desired_path, desired_name = build_audio_destination(
                    gravacao,
                    radio=radio,
                    original_filename=filename,
                    base_path=base_path,
                    layout=layout,
                )
        else:
            desired_name = filename
            desired_path = build_remote_audio_path(filename, base_path=base_path, layout=layout)

        if current_path.lower() == desired_path.lower():
            skipped += 1
            continue

        output_rows.append({
            "id": meta.get("id") if meta else "",
            "old_name": filename,
            "new_name": desired_name,
            "new_path": desired_path,
        })

        if args.dry_run:
            print(f"[dry-run] move {current_path} -> {desired_path}")
            moved += 1
            continue

        attempts = max(1, int(args.max_retries or 1))
        for attempt in range(1, attempts + 1):
            try:
                ensure_folder(posixpath.dirname(desired_path), token=cfg.access_token)
                move_file(current_path, desired_path, token=cfg.access_token, autorename=False)
                moved += 1
                break
            except DropboxError as exc:
                status = _extract_status_code(exc)
                if status == 409 and args.delete_source_on_conflict:
                    try:
                        delete_file(current_path, token=cfg.access_token)
                        deleted_duplicates += 1
                    except Exception as delete_exc:
                        failed += 1
                        print(f"Falha ao remover duplicado {current_path}: {delete_exc}")
                    break
                if status == 429 and attempt < attempts:
                    wait_time = _extract_retry_after(exc) or int(args.retry_wait or 10)
                    print(f"Rate limit; aguardando {wait_time}s (tentativa {attempt}/{attempts})")
                    time.sleep(max(1, wait_time))
                    continue
                failed += 1
                print(f"Falha ao mover {current_path}: {exc}")
                break
            except Exception as exc:
                failed += 1
                print(f"Erro inesperado ao mover {current_path}: {exc}")
                break

    if args.output_csv and output_rows:
        try:
            with open(args.output_csv, "w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=["id", "old_name", "new_name", "new_path"])
                writer.writeheader()
                writer.writerows(output_rows)
        except Exception as exc:
            print(f"Falha ao salvar output CSV: {exc}")

    print(
        "Concluido. "
        f"Movidos: {moved}, Ignorados: {skipped}, "
        f"Duplicados removidos: {deleted_duplicates}, Falhas: {failed}"
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
