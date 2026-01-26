from flask import Blueprint, request, jsonify
from app import db
from models.radio import Radio
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request

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
    radio = Radio.query.filter_by(id=radio_id).first()
    if not radio:
        return jsonify({'error': 'Radio not found'}), 404
    return jsonify(radio.to_dict()), 200

@bp.route('', methods=['POST'])
@token_required
def create_radio():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json()
    
    if not data.get('nome') or not data.get('stream_url'):
        return jsonify({'error': 'Nome and stream_url are required'}), 400
    
    bitrate = _sanitize_bitrate(data.get('bitrate_kbps', 128))
    output_format = _sanitize_format(data.get('output_format', 'mp3'))
    audio_mode = _sanitize_audio_mode(data.get('audio_mode', 'stereo'))
    
    radio = Radio(
        user_id=user_id,
        nome=data['nome'],
        stream_url=data['stream_url'],
        cidade=data.get('cidade'),
        estado=data.get('estado'),
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
    data = request.get_json(silent=True) or {}
    if 'nome' in data:
        radio.nome = data['nome']
    if 'stream_url' in data:
        radio.stream_url = data['stream_url']
    if 'cidade' in data:
        radio.cidade = data['cidade']
    if 'estado' in data:
        radio.estado = data['estado']
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
    broadcast_update(f'user_{ctx.get("user_id")}', 'radio_updated', radio.to_dict())
    
    return jsonify(radio.to_dict()), 200

@bp.route('/<radio_id>', methods=['DELETE'])
@token_required
def delete_radio(radio_id):
    ctx = get_user_ctx()
    radio = Radio.query.filter_by(id=radio_id).first()
    if not radio:
        return jsonify({'error': 'Radio not found'}), 404
    
    db.session.delete(radio)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{ctx.get("user_id")}', 'radio_deleted', {'id': radio_id})
    
    return jsonify({'message': 'Radio deleted'}), 200
