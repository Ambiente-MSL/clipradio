from flask import Blueprint, request, jsonify
from app import db
from models.gravacao import Gravacao
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request
from datetime import datetime
from services.recording_service import hydrate_gravacao_metadata

bp = Blueprint('gravacoes', __name__)

def get_user_ctx():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token) or {}
    return {
        'user_id': payload.get('user_id'),
        'is_admin': payload.get('is_admin', False)
    }

@bp.route('', methods=['POST'])
@token_required
def create_gravacao():
    """Cria um registro de gravação para o usuário autenticado"""
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json() or {}

    radio_id = data.get('radio_id')
    if not radio_id:
        return jsonify({'error': 'radio_id is required'}), 400

    gravacao = Gravacao(
        user_id=user_id,
        radio_id=radio_id,
        status=data.get('status', 'iniciando'),
        tipo=data.get('tipo', 'manual'),
        duracao_minutos=data.get('duracao_minutos', 0),
        duracao_segundos=data.get('duracao_segundos', 0),
        tamanho_mb=data.get('tamanho_mb', 0.0),
        batch_id=data.get('batch_id')
    )

    db.session.add(gravacao)
    db.session.commit()

    return jsonify(gravacao.to_dict(include_radio=True)), 201

@bp.route('', methods=['GET'])
@token_required
def get_gravacoes():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)

    query = Gravacao.query
    if not is_admin:
        query = query.filter_by(user_id=user_id)
    
    # Filtros
    radio_id = request.args.get('radio_id')
    if radio_id and radio_id != 'all':
        query = query.filter_by(radio_id=radio_id)
    
    # Filtro por data
    data_filter = request.args.get('data')
    if data_filter:
        try:
            start_date = datetime.strptime(data_filter, '%Y-%m-%d')
            end_date = datetime(start_date.year, start_date.month, start_date.day, 23, 59, 59)
            query = query.filter(Gravacao.criado_em >= start_date, Gravacao.criado_em <= end_date)
        except:
            pass
    
    # Filtro por cidade/estado (via join com radio)
    cidade = request.args.get('cidade')
    estado = request.args.get('estado')
    
    gravacoes = query.order_by(Gravacao.criado_em.desc()).all()
    
    # Aplicar filtros de cidade/estado após busca
    if cidade or estado:
        gravacoes = [g for g in gravacoes if g.radio and 
                     (not cidade or (g.radio.cidade and cidade.lower() in g.radio.cidade.lower())) and
                     (not estado or (g.radio.estado and estado.upper() == g.radio.estado.upper()))]
    
    # Enriquecer metadados com dados reais do arquivo (duração, tamanho, status)
    gravacoes = [hydrate_gravacao_metadata(g, autocommit=True) for g in gravacoes]
    
    return jsonify([g.to_dict(include_radio=True) for g in gravacoes]), 200

@bp.route('/<gravacao_id>', methods=['GET'])
@token_required
def get_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first() if is_admin else Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravacao not found'}), 404
    gravacao = hydrate_gravacao_metadata(gravacao, autocommit=True)
    return jsonify(gravacao.to_dict(include_radio=True)), 200

@bp.route('/<gravacao_id>', methods=['DELETE'])
@token_required
def delete_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first() if is_admin else Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravacao not found'}), 404
    
    db.session.delete(gravacao)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'gravacao_deleted', {'id': gravacao_id})
    
    return jsonify({'message': 'Gravacao deleted'}), 200

@bp.route('/batch-delete', methods=['POST'])
@token_required
def batch_delete():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    data = request.get_json()
    gravacao_ids = data.get('gravacao_ids', [])
    
    if not gravacao_ids:
        return jsonify({'error': 'No gravacao IDs provided'}), 400
    
    gravacoes = Gravacao.query.filter(Gravacao.id.in_(gravacao_ids))
    if not is_admin:
        gravacoes = gravacoes.filter(Gravacao.user_id == user_id)
    gravacoes = gravacoes.all()
    
    for gravacao in gravacoes:
        db.session.delete(gravacao)
    
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'gravacoes_deleted', {'ids': gravacao_ids})
    
    return jsonify({'message': f'{len(gravacoes)} gravacoes deleted'}), 200

@bp.route('/stats', methods=['GET'])
@token_required
def get_stats():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    gravacoes = Gravacao.query.all() if is_admin else Gravacao.query.filter_by(user_id=user_id).all()

    # Garantir que duração/tamanho reflitam o arquivo salvo
    gravacoes = [hydrate_gravacao_metadata(g, autocommit=True) for g in gravacoes]
    
    total = len(gravacoes)
    total_duration = sum(g.duracao_segundos or 0 for g in gravacoes)
    total_size = sum(g.tamanho_mb or 0 for g in gravacoes)
    unique_radios = len(set(g.radio_id for g in gravacoes))
    
    return jsonify({
        'totalGravacoes': total,
        'totalDuration': total_duration,
        'totalSize': total_size,
        'uniqueRadios': unique_radios
    }), 200
