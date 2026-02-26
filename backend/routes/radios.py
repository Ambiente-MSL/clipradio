from flask import Blueprint, request, jsonify
from app import db
from models.radio import Radio
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request
from urllib.parse import urlsplit, urlunsplit

bp = Blueprint('radios', __name__)

def get_user_ctx():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token) or {}
    return {
        'user_id': payload.get('user_id'),
        'is_admin': payload.get('is_admin', False),
    }


def _radio_access_allowed(radio, ctx):
    return bool(ctx.get('is_admin') or radio.user_id == ctx.get('user_id'))

ALLOWED_BITRATES = {96, 128}
ALLOWED_FORMATS = {'mp3', 'opus'}
ALLOWED_AUDIO_MODES = {'mono', 'stereo'}


def _normalize_spaces(value):
    return " ".join(str(value or "").strip().split())


def _normalize_state(value):
    return _normalize_spaces(value).upper()


def _normalize_stream_url(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed = urlsplit(raw)
    except Exception:
        return raw.rstrip("/")
    if not parsed.scheme and not parsed.netloc:
        return raw.rstrip("/")
    scheme = (parsed.scheme or "").lower()
    netloc = (parsed.netloc or "").lower()
    path = (parsed.path or "").rstrip("/")
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


def _find_duplicate_radio(user_id, *, nome, stream_url, cidade=None, estado=None, exclude_id=None):
    normalized_nome = _normalize_spaces(nome).lower()
    normalized_cidade = _normalize_spaces(cidade).lower()
    normalized_estado = _normalize_state(estado)
    normalized_stream = _normalize_stream_url(stream_url)

    if not normalized_nome and not normalized_stream:
        return None

    query = Radio.query.filter_by(user_id=user_id)
    if exclude_id:
        query = query.filter(Radio.id != exclude_id)

    radios = query.all()
    for radio in radios:
        same_stream = (
            bool(normalized_stream)
            and _normalize_stream_url(radio.stream_url) == normalized_stream
        )
        same_identity = (
            bool(normalized_nome)
            and _normalize_spaces(radio.nome).lower() == normalized_nome
            and _normalize_spaces(radio.cidade).lower() == normalized_cidade
            and _normalize_state(radio.estado) == normalized_estado
        )
        if same_stream or same_identity:
            return radio
    return None

def _sanitize_bitrate(value):
    try:
        ivalue = int(value)
        return ivalue if ivalue in ALLOWED_BITRATES else 128
    except Exception:
        return 128

def _sanitize_format(value):
    value = (value or '').lower()
    return value if value in ALLOWED_FORMATS else 'mp3'

def _sanitize_audio_mode(value):
    value = (value or '').lower()
    return value if value in ALLOWED_AUDIO_MODES else 'stereo'

@bp.route('', methods=['GET'])
@token_required
def get_radios():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    query = Radio.query
    if not is_admin:
        query = query.filter_by(user_id=user_id)
    radios = query.order_by(Radio.favorita.desc(), Radio.criado_em.desc()).all()
    return jsonify([radio.to_dict() for radio in radios]), 200

@bp.route('/<radio_id>', methods=['GET'])
@token_required
def get_radio(radio_id):
    ctx = get_user_ctx()
    radio = Radio.query.filter_by(id=radio_id).first()
    if not radio:
        return jsonify({'error': 'Radio not found'}), 404
    if not _radio_access_allowed(radio, ctx):
        return jsonify({'error': 'Radio not found'}), 404
    return jsonify(radio.to_dict()), 200

@bp.route('', methods=['POST'])
@token_required
def create_radio():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json(silent=True) or {}

    nome = _normalize_spaces(data.get('nome'))
    stream_url = str(data.get('stream_url') or '').strip()
    cidade = _normalize_spaces(data.get('cidade')) or None
    estado = _normalize_state(data.get('estado')) or None

    if not nome or not stream_url:
        return jsonify({'error': 'Nome and stream_url are required'}), 400

    duplicate_radio = _find_duplicate_radio(
        user_id,
        nome=nome,
        stream_url=stream_url,
        cidade=cidade,
        estado=estado,
    )
    if duplicate_radio:
        return jsonify({'error': 'Já existe uma rádio com este stream ou com o mesmo nome/cidade/estado.'}), 409
    
    bitrate = _sanitize_bitrate(data.get('bitrate_kbps', 128))
    output_format = _sanitize_format(data.get('output_format', 'mp3'))
    audio_mode = _sanitize_audio_mode(data.get('audio_mode', 'stereo'))
    
    radio = Radio(
        user_id=user_id,
        nome=nome,
        stream_url=stream_url,
        cidade=cidade,
        estado=estado,
        favorita=data.get('favorita', False),
        bitrate_kbps=bitrate,
        output_format=output_format,
        audio_mode=audio_mode,
    )
    
    db.session.add(radio)
    db.session.commit()
    
    # Broadcast update via WebSocket
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'radio_created', radio.to_dict())
    
    return jsonify(radio.to_dict()), 201

@bp.route('/<radio_id>', methods=['PUT'])
@token_required
def update_radio(radio_id):
    ctx = get_user_ctx()
    radio = Radio.query.filter_by(id=radio_id).first()
    if not radio:
        return jsonify({'error': 'Radio not found'}), 404
    if not _radio_access_allowed(radio, ctx):
        return jsonify({'error': 'Radio not found'}), 404
    data = request.get_json(silent=True) or {}

    next_nome = _normalize_spaces(data.get('nome')) if 'nome' in data else radio.nome
    next_stream_url = str(data.get('stream_url') or '').strip() if 'stream_url' in data else radio.stream_url
    next_cidade = (_normalize_spaces(data.get('cidade')) or None) if 'cidade' in data else radio.cidade
    next_estado = (_normalize_state(data.get('estado')) or None) if 'estado' in data else radio.estado

    if not next_nome or not next_stream_url:
        return jsonify({'error': 'Nome and stream_url are required'}), 400

    duplicate_radio = _find_duplicate_radio(
        radio.user_id,
        nome=next_nome,
        stream_url=next_stream_url,
        cidade=next_cidade,
        estado=next_estado,
        exclude_id=radio.id,
    )
    if duplicate_radio:
        return jsonify({'error': 'Já existe uma rádio com este stream ou com o mesmo nome/cidade/estado.'}), 409

    if 'nome' in data:
        radio.nome = next_nome
    if 'stream_url' in data:
        radio.stream_url = next_stream_url
    if 'cidade' in data:
        radio.cidade = next_cidade
    if 'estado' in data:
        radio.estado = next_estado
    if 'favorita' in data:
        radio.favorita = data['favorita']
    if 'bitrate_kbps' in data:
        radio.bitrate_kbps = _sanitize_bitrate(data.get('bitrate_kbps'))
    if 'output_format' in data:
        radio.output_format = _sanitize_format(data.get('output_format'))
    if 'audio_mode' in data:
        radio.audio_mode = _sanitize_audio_mode(data.get('audio_mode'))
    
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{radio.user_id}', 'radio_updated', radio.to_dict())
    
    return jsonify(radio.to_dict()), 200

@bp.route('/<radio_id>', methods=['DELETE'])
@token_required
def delete_radio(radio_id):
    ctx = get_user_ctx()
    radio = Radio.query.filter_by(id=radio_id).first()
    if not radio:
        return jsonify({'error': 'Radio not found'}), 404
    if not _radio_access_allowed(radio, ctx):
        return jsonify({'error': 'Radio not found'}), 404
    target_user_id = radio.user_id
    
    db.session.delete(radio)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{target_user_id}', 'radio_deleted', {'id': radio_id})
    
    return jsonify({'message': 'Radio deleted'}), 200
