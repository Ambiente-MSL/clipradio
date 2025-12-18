from flask import Blueprint, send_file, jsonify, current_app
import os

bp = Blueprint('files', __name__)

@bp.route('/audio/<filename>', methods=['GET'])
def get_audio(filename):
    """Servir arquivo de áudio sem exigir header Authorization (usado em <audio> tag)."""
    audio_path = os.path.join(current_app.config['STORAGE_PATH'], 'audio', filename)
    if not os.path.exists(audio_path):
        return jsonify({'error': 'File not found'}), 404
    ext = os.path.splitext(filename)[1].lower()
    if ext == '.opus':
        mimetype = 'audio/ogg'
    elif ext == '.flac':
        mimetype = 'audio/flac'
    else:
        mimetype = 'audio/mpeg'
    return send_file(audio_path, mimetype=mimetype)

@bp.route('/clips/<filename>', methods=['GET'])
def get_clip(filename):
    """Servir arquivo de clipe sem exigir header Authorization (usado em players)."""
    clip_path = os.path.join(current_app.config['STORAGE_PATH'], 'clips', filename)
    if not os.path.exists(clip_path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(clip_path, mimetype='audio/mpeg')
