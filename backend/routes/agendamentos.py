from flask import Blueprint, request, jsonify
from app import db
from models.agendamento import Agendamento
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request
from datetime import datetime
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/Fortaleza")


def parse_datetime_local(dt_value):
    """Converte string ISO ou datetime para datetime ingênuo no fuso de Fortaleza."""
    if isinstance(dt_value, str):
        # Suporta "Z" (UTC) ou offset explícito; se vier sem offset, assume já ser local
        value = dt_value.replace('Z', '+00:00')
        dt_obj = datetime.fromisoformat(value)
    else:
        dt_obj = dt_value

    if dt_obj.tzinfo:
        dt_local = dt_obj.astimezone(LOCAL_TZ)
    else:
        # Assume que já é horário local se vier sem tzinfo
        dt_local = dt_obj.replace(tzinfo=LOCAL_TZ)

    # Remover tzinfo antes de salvar no banco (coluna sem timezone), mas mantendo horário local correto
    return dt_local.replace(tzinfo=None)

bp = Blueprint('agendamentos', __name__)

def get_user_id():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token)
    return payload['user_id'] if payload else None

@bp.route('', methods=['GET'])
@token_required
def get_agendamentos():
    user_id = get_user_id()
    agendamentos = Agendamento.query.filter_by(user_id=user_id).order_by(Agendamento.data_inicio.desc()).all()
    return jsonify([a.to_dict(include_radio=True) for a in agendamentos]), 200

@bp.route('/<agendamento_id>', methods=['GET'])
@token_required
def get_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    return jsonify(agendamento.to_dict(include_radio=True)), 200

@bp.route('', methods=['POST'])
@token_required
def create_agendamento():
    user_id = get_user_id()
    data = request.get_json()
    
    if not data.get('radio_id') or not data.get('data_inicio') or not data.get('duracao_minutos'):
        return jsonify({'error': 'radio_id, data_inicio and duracao_minutos are required'}), 400
    
    agendamento = Agendamento(
        user_id=user_id,
        radio_id=data['radio_id'],
        data_inicio=parse_datetime_local(data['data_inicio']),
        duracao_minutos=data['duracao_minutos'],
        tipo_recorrencia=data.get('tipo_recorrencia', 'none'),
        status=data.get('status', 'agendado')
    )
    
    if 'dias_semana' in data:
        agendamento.set_dias_semana_list(data['dias_semana'])
    if 'palavras_chave' in data:
        agendamento.set_palavras_chave_list(data['palavras_chave'])
    
    db.session.add(agendamento)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_created', agendamento.to_dict())
    
    return jsonify(agendamento.to_dict(include_radio=True)), 201

@bp.route('/<agendamento_id>', methods=['PUT'])
@token_required
def update_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    data = request.get_json()
    if 'radio_id' in data:
        agendamento.radio_id = data['radio_id']
    if 'data_inicio' in data:
        agendamento.data_inicio = parse_datetime_local(data['data_inicio'])
    if 'duracao_minutos' in data:
        agendamento.duracao_minutos = data['duracao_minutos']
    if 'tipo_recorrencia' in data:
        agendamento.tipo_recorrencia = data['tipo_recorrencia']
    if 'status' in data:
        agendamento.status = data['status']
    if 'dias_semana' in data:
        agendamento.set_dias_semana_list(data['dias_semana'])
    if 'palavras_chave' in data:
        agendamento.set_palavras_chave_list(data['palavras_chave'])
    
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_updated', agendamento.to_dict())
    
    return jsonify(agendamento.to_dict(include_radio=True)), 200

@bp.route('/<agendamento_id>', methods=['DELETE'])
@token_required
def delete_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    db.session.delete(agendamento)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_deleted', {'id': agendamento_id})
    
    return jsonify({'message': 'Agendamento deleted'}), 200

@bp.route('/<agendamento_id>/toggle-status', methods=['POST'])
@token_required
def toggle_status(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    agendamento.status = 'inativo' if agendamento.status == 'agendado' else 'agendado'
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_updated', agendamento.to_dict())
    
    return jsonify(agendamento.to_dict(include_radio=True)), 200
