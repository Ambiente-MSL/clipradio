from flask import Blueprint, send_file, jsonify, current_app, request, Response, stream_with_context
import os

bp = Blueprint('files', __name__)

@bp.route('/audio/<filename>', methods=['GET'])
def get_audio(filename):
    """Servir arquivo de áudio sem exigir header Authorization (usado em <audio> tag)."""
    audio_path = os.path.join(current_app.config['STORAGE_PATH'], 'audio', filename)
    ext = os.path.splitext(filename)[1].lower()
    if ext == '.opus':
        mimetype = 'audio/ogg'
    elif ext == '.flac':
        mimetype = 'audio/flac'
    else:
        mimetype = 'audio/mpeg'
    if os.path.exists(audio_path):
        return send_file(audio_path, mimetype=mimetype)

    # Fallback: buscar no Dropbox quando o arquivo local foi arquivado/deletado
    try:
        from app import db
        from models.gravacao import Gravacao
        from models.radio import Radio
        from services.dropbox_service import build_audio_destination, build_candidate_audio_paths, download_response, get_dropbox_config

        dropbox_cfg = get_dropbox_config()
        if not dropbox_cfg.is_ready:
            return jsonify({'error': 'File not found'}), 404

        range_header = request.headers.get('Range')
        resp = None
        candidates = []

        if dropbox_cfg.audio_layout == "hierarchy":
            gravacao = Gravacao.query.filter(Gravacao.arquivo_nome == filename).first()
            if not gravacao:
                gravacao = Gravacao.query.filter(Gravacao.arquivo_url.like(f"%/{filename}")).first()
            if gravacao:
                radio_obj = gravacao.radio or Radio.query.get(gravacao.radio_id)
                try:
                    remote_path, _ = build_audio_destination(
                        gravacao,
                        radio=radio_obj,
                        original_filename=filename,
                        base_path=dropbox_cfg.audio_path,
                        layout=dropbox_cfg.audio_layout,
                    )
                    candidates.append(remote_path)
                except Exception:
                    pass

            candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path, layout="date"))
            candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path, layout="flat"))
        else:
            candidates.extend(build_candidate_audio_paths(filename, base_path=dropbox_cfg.audio_path))

        seen = set()
        candidates = [path for path in candidates if not (path in seen or seen.add(path))]

        # Libera a conexao do pool antes de iniciar streaming (pode durar minutos).
        try:
            db.session.remove()
        except Exception:
            pass
        for remote_path in candidates:
            resp = download_response(remote_path, token=dropbox_cfg.access_token, range_header=range_header)
            if resp.status_code in (404, 409):
                continue
            if resp.ok or resp.status_code == 206:
                break
            try:
                current_app.logger.error(f"Dropbox download falhou ({resp.status_code}): {resp.text}")
            except Exception:
                pass
            return jsonify({'error': 'File not found'}), 404

        if resp is None or resp.status_code in (404, 409):
            return jsonify({'error': 'File not found'}), 404

        headers = {}
        for key in ('Content-Length', 'Content-Range', 'Accept-Ranges'):
            if key in resp.headers:
                headers[key] = resp.headers.get(key)

        return Response(
            stream_with_context(resp.iter_content(chunk_size=1024 * 256)),
            status=resp.status_code,
            mimetype=mimetype,
            headers=headers,
            direct_passthrough=True,
        )
    except Exception as exc:
        try:
            current_app.logger.exception(f"Falha ao servir áudio via Dropbox: {exc}")
        except Exception:
            pass
        return jsonify({'error': 'File not found'}), 404

@bp.route('/clips/<filename>', methods=['GET'])
def get_clip(filename):
    """Servir arquivo de clipe sem exigir header Authorization (usado em players)."""
    clip_path = os.path.join(current_app.config['STORAGE_PATH'], 'clips', filename)
    if not os.path.exists(clip_path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(clip_path, mimetype='audio/mpeg')
