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
        from services.dropbox_service import build_remote_audio_path, download_response, get_dropbox_config

        dropbox_cfg = get_dropbox_config()
        if not dropbox_cfg.is_ready:
            return jsonify({'error': 'File not found'}), 404

        remote_path = build_remote_audio_path(filename, base_path=dropbox_cfg.audio_path)
        range_header = request.headers.get('Range')
        resp = download_response(remote_path, token=dropbox_cfg.access_token, range_header=range_header)
        if resp.status_code in (404, 409):
            return jsonify({'error': 'File not found'}), 404
        if not resp.ok and resp.status_code != 206:
            try:
                current_app.logger.error(f"Dropbox download falhou ({resp.status_code}): {resp.text}")
            except Exception:
                pass
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
