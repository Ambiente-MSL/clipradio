import os

from flask import Blueprint, Response, current_app, jsonify, request, send_file, stream_with_context

bp = Blueprint("files", __name__)


def _guess_audio_mimetype(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".opus":
        return "audio/ogg"
    if ext == ".flac":
        return "audio/flac"
    return "audio/mpeg"


def _is_download_requested() -> bool:
    return str(request.args.get("download", "")).strip().lower() in {"1", "true", "yes", "y", "on"}


def _find_gravacao_by_filename(filename: str):
    from models.gravacao import Gravacao

    gravacao = Gravacao.query.filter(Gravacao.arquivo_nome == filename).first()
    if gravacao:
        return gravacao
    return Gravacao.query.filter(Gravacao.arquivo_url.like(f"%/{filename}")).first()


def _download_only_response(gravacao):
    from services.audio_access_service import get_audio_stream_max_age_days

    max_age_days = get_audio_stream_max_age_days()
    return (
        jsonify(
            {
                "error": "Audio disponivel apenas para download.",
                "download_only": True,
                "audio_stream_max_age_days": max_age_days,
                "gravacao_id": getattr(gravacao, "id", None),
            }
        ),
        403,
    )


@bp.route("/audio/<filename>", methods=["GET"])
def get_audio(filename):
    from app import db
    from models.radio import Radio
    from services.audio_access_service import is_audio_stream_allowed
    from services.dropbox_service import (
        build_audio_destination,
        build_candidate_audio_paths,
        build_unrecognized_audio_paths,
        download_response,
        get_dropbox_config,
    )

    download_requested = _is_download_requested()
    mimetype = _guess_audio_mimetype(filename)
    gravacao = None

    try:
        gravacao = _find_gravacao_by_filename(filename)
        if gravacao and not download_requested and not is_audio_stream_allowed(gravacao):
            return _download_only_response(gravacao)

        audio_path = os.path.join(current_app.config["STORAGE_PATH"], "audio", filename)
        if os.path.exists(audio_path):
            return send_file(
                audio_path,
                mimetype=mimetype,
                as_attachment=download_requested,
                download_name=os.path.basename(filename),
            )

        dropbox_cfg = get_dropbox_config()
        if not dropbox_cfg.is_ready:
            return jsonify({"error": "File not found"}), 404

        range_header = None if download_requested else request.headers.get("Range")
        candidates = []

        if dropbox_cfg.audio_layout == "hierarchy" and gravacao:
            radio_obj = getattr(gravacao, "radio", None) or Radio.query.get(gravacao.radio_id)
            original_names = [filename]
            if getattr(gravacao, "arquivo_nome", None) and gravacao.arquivo_nome not in original_names:
                original_names.append(gravacao.arquivo_nome)

            for original_name in original_names:
                try:
                    remote_path, desired_name = build_audio_destination(
                        gravacao,
                        radio=radio_obj,
                        original_filename=original_name,
                        base_path=dropbox_cfg.audio_path,
                        layout=dropbox_cfg.audio_layout,
                    )
                    candidates.append(remote_path)
                    if desired_name and desired_name != original_name:
                        candidates.extend(
                            build_unrecognized_audio_paths(
                                desired_name,
                                base_path=dropbox_cfg.audio_path,
                            )
                        )
                except Exception:
                    continue

        candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path, layout="hierarchy"))
        candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path, layout="date"))
        candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path, layout="flat"))
        candidates.extend(build_unrecognized_audio_paths(filename, base_path=dropbox_cfg.audio_path))

        seen = set()
        unique_candidates = []
        for candidate in candidates:
            normalized = str(candidate or "").strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            unique_candidates.append(normalized)

        try:
            db.session.remove()
        except Exception:
            pass

        resp = None
        for remote_path in unique_candidates:
            resp = download_response(remote_path, range_header=range_header)
            if resp.status_code in (404, 409):
                continue
            if resp.ok or resp.status_code == 206:
                break
            try:
                current_app.logger.error(f"Dropbox download failed ({resp.status_code}): {resp.text}")
            except Exception:
                pass
            return jsonify({"error": "File not found"}), 404

        if resp is None or resp.status_code in (404, 409):
            return jsonify({"error": "File not found"}), 404

        headers = {}
        for key in ("Content-Length", "Content-Range", "Accept-Ranges"):
            if key in resp.headers:
                headers[key] = resp.headers.get(key)
        if download_requested:
            safe_name = os.path.basename(filename).replace('"', "")
            headers["Content-Disposition"] = f'attachment; filename="{safe_name}"'

        return Response(
            stream_with_context(resp.iter_content(chunk_size=1024 * 256)),
            status=resp.status_code,
            mimetype=mimetype,
            headers=headers,
            direct_passthrough=True,
        )
    except Exception as exc:
        try:
            current_app.logger.exception(f"Falha ao servir audio via Dropbox: {exc}")
        except Exception:
            pass
        return jsonify({"error": "File not found"}), 404


@bp.route("/clips/<filename>", methods=["GET"])
def get_clip(filename):
    clip_path = os.path.join(current_app.config["STORAGE_PATH"], "clips", filename)
    if not os.path.exists(clip_path):
        return jsonify({"error": "File not found"}), 404
    return send_file(clip_path, mimetype="audio/mpeg")
