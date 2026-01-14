from flask import Blueprint, request, jsonify
from app import db
from models.gravacao import Gravacao
from models.agendamento import Agendamento
from models.radio import Radio
from models.user import User
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request
from datetime import datetime
from sqlalchemy import and_, or_, desc
from services.recording_service import hydrate_gravacao_metadata

bp = Blueprint('gravacoes', __name__)
MAX_PER_PAGE = 100

def _parse_positive_int(value, default):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default

def _parse_nonnegative_int(value, default):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default

def _parse_iso_datetime(value):
    if not value:
        return None
    try:
        if value.endswith('Z'):
            value = f"{value[:-1]}+00:00"
        return datetime.fromisoformat(value)
    except Exception:
        return None

def _apply_gravacoes_filters(query, *, user_id, is_admin, radio_id=None, data_filter=None, cidade=None, estado=None, status=None, tipo=None):
    if not is_admin:
        query = query.filter(Gravacao.user_id == user_id)

    if radio_id and radio_id != 'all':
        query = query.filter(Gravacao.radio_id == radio_id)

    if status:
        query = query.filter(Gravacao.status == status)

    if tipo:
        query = query.filter(Gravacao.tipo == tipo)

    if data_filter:
        try:
            start_date = datetime.strptime(data_filter, '%Y-%m-%d')
            end_date = datetime(start_date.year, start_date.month, start_date.day, 23, 59, 59)
            query = query.filter(Gravacao.criado_em >= start_date, Gravacao.criado_em <= end_date)
        except Exception:
            pass

    if cidade or estado:
        query = query.join(Radio)
        if cidade:
            query = query.filter(Radio.cidade.ilike(f"%{cidade}%"))
        if estado:
            query = query.filter(db.func.upper(Radio.estado) == estado.upper())

    return query

def get_user_ctx():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token) or {}
    return {
        'user_id': payload.get('user_id'),
        'is_admin': payload.get('is_admin', False),
    }

def _gravacao_access_allowed(gravacao, ctx):
    return bool(ctx.get('is_admin') or gravacao.user_id == ctx.get('user_id'))

@bp.route('', methods=['POST'])
@token_required
def create_gravacao():
    """Cria um registro de gravação para o usuário autenticado"""
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json() or {}

    radio_id = data.get('radio_id')
    if not radio_id:
        return jsonify({'error': 'O campo radio_id é obrigatório'}), 400


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
    include_stats = (request.args.get('include_stats') or '').lower() == 'true'
    radio_id = request.args.get('radio_id')
    data_filter = request.args.get('data')
    cidade = (request.args.get('cidade') or '').strip() or None
    estado = (request.args.get('estado') or '').strip() or None
    status = (request.args.get('status') or '').strip() or None
    tipo = (request.args.get('tipo') or '').strip() or None

    # Paginacao
    limit_arg = request.args.get('limit')
    offset_arg = request.args.get('offset')
    page = _parse_positive_int(request.args.get('page'), 1)
    per_page = _parse_positive_int(request.args.get('per_page'), 10)
    per_page = min(per_page, MAX_PER_PAGE)

    if limit_arg is not None:
        limit = _parse_positive_int(limit_arg, per_page)
        limit = min(limit, MAX_PER_PAGE)
        offset = _parse_nonnegative_int(offset_arg, 0)
        page = (offset // limit) + 1 if limit else 1
        per_page = limit
    else:
        limit = per_page
        offset = (page - 1) * per_page

    cursor_dt = _parse_iso_datetime(request.args.get('cursor'))
    cursor_id = (request.args.get('cursor_id') or '').strip() or None

    base_query = _apply_gravacoes_filters(
        Gravacao.query,
        user_id=user_id,
        is_admin=is_admin,
        radio_id=radio_id,
        data_filter=data_filter,
        cidade=cidade,
        estado=estado,
        status=status,
        tipo=tipo,
    )

    total = base_query.with_entities(db.func.count(Gravacao.id)).scalar() or 0
    total_pages = (total + per_page - 1) // per_page if total else 0
    if limit_arg is None and total_pages and page > total_pages:
        page = total_pages
        offset = (page - 1) * per_page

    gravacoes_query = base_query.order_by(Gravacao.criado_em.desc(), Gravacao.id.desc())
    if cursor_dt:
        offset = 0
        page = 1
        if cursor_id:
            gravacoes_query = gravacoes_query.filter(
                or_(
                    Gravacao.criado_em < cursor_dt,
                    and_(Gravacao.criado_em == cursor_dt, Gravacao.id < cursor_id)
                )
            )
        else:
            gravacoes_query = gravacoes_query.filter(Gravacao.criado_em < cursor_dt)

    gravacoes = gravacoes_query.offset(offset).limit(limit).all()

    # Enriquecer metadados com dados reais do arquivo (duracao, tamanho, status)
    gravacoes = [hydrate_gravacao_metadata(g, autocommit=True) for g in gravacoes]

    payload = [g.to_dict(include_radio=True) for g in gravacoes]

    meta = {
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': total_pages,
    }
    if cursor_dt and gravacoes and len(gravacoes) >= limit:
        last_item = gravacoes[-1]
        meta['next_cursor'] = last_item.criado_em.isoformat() if last_item.criado_em else None
        meta['next_cursor_id'] = last_item.id

    if include_stats:
        duration_expr = db.func.coalesce(Gravacao.duracao_segundos, Gravacao.duracao_minutos * 60)
        stats_query = db.session.query(
            db.func.coalesce(db.func.sum(duration_expr), 0),
            db.func.coalesce(db.func.sum(Gravacao.tamanho_mb), 0),
            db.func.count(db.distinct(Gravacao.radio_id)),
        )
        stats_query = _apply_gravacoes_filters(
            stats_query,
            user_id=user_id,
            is_admin=is_admin,
            radio_id=radio_id,
            data_filter=data_filter,
            cidade=cidade,
            estado=estado,
            status=status,
            tipo=tipo,
        )
        stats_row = stats_query.first() or (0, 0, 0)
        stats = {
            'totalGravacoes': total,
            'totalDuration': int(stats_row[0] or 0),
            'totalSize': float(stats_row[1] or 0),
            'uniqueRadios': int(stats_row[2] or 0),
        }
        return jsonify({'items': payload, 'stats': stats, 'meta': meta}), 200

    return jsonify({'items': payload, 'meta': meta}), 200


@bp.route('/ongoing', methods=['GET'])
@token_required
def get_ongoing():
    """Retorna gravações em andamento (gravando/iniciando/processando). Admin vê todas."""
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    query = Gravacao.query.filter(Gravacao.status.in_(('iniciando', 'gravando', 'processando')))
    if not is_admin:
        query = query.filter_by(user_id=user_id)


    gravacoes = query.order_by(Gravacao.criado_em.desc()).all()
    gravacoes = [hydrate_gravacao_metadata(g, autocommit=True) for g in gravacoes]
    return jsonify([g.to_dict(include_radio=True) for g in gravacoes]), 200

@bp.route('/<gravacao_id>', methods=['GET'])
@token_required
def get_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravação não encontrada'}), 404
    if not is_admin and not _gravacao_access_allowed(gravacao, ctx):
        return jsonify({'error': 'Gravação não encontrada'}), 404
    gravacao = hydrate_gravacao_metadata(gravacao, autocommit=True)
    return jsonify(gravacao.to_dict(include_radio=True)), 200


@bp.route('/<gravacao_id>/transcricao', methods=['GET', 'POST'])
@token_required
def gravacao_transcricao(gravacao_id):
    ctx = get_user_ctx()
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravação não encontrada'}), 404
    if not is_admin and not _gravacao_access_allowed(gravacao, ctx):
        return jsonify({'error': 'Gravação não encontrada'}), 404

    if request.method == 'POST':
        data = request.get_json() or {}
        force = bool(data.get('force'))
        from services.transcription_service import start_transcription
        start_transcription(gravacao.id, force=force)
        try:
            db.session.refresh(gravacao)
        except Exception:
            pass
        return jsonify({'id': gravacao.id, 'status': gravacao.transcricao_status}), 202

    return jsonify({
        'id': gravacao.id,
        'status': gravacao.transcricao_status,
        'texto': gravacao.transcricao_texto,
        'erro': gravacao.transcricao_erro,
        'idioma': gravacao.transcricao_idioma,
        'modelo': gravacao.transcricao_modelo,
        'progresso': gravacao.transcricao_progresso,
        'cancelada': gravacao.transcricao_cancelada,
    }), 200


@bp.route('/<gravacao_id>/transcricao/stop', methods=['POST'])
@token_required
def gravacao_transcricao_stop(gravacao_id):
    ctx = get_user_ctx()
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravação não encontrada'}), 404
    if not is_admin and not _gravacao_access_allowed(gravacao, ctx):
        return jsonify({'error': 'Gravação não encontrada'}), 404

    from services.transcription_service import request_transcription_stop
    stopped = request_transcription_stop(gravacao.id)
    if not stopped:
        return jsonify({'id': gravacao.id, 'status': gravacao.transcricao_status}), 200
    return jsonify({'id': gravacao.id, 'status': gravacao.transcricao_status}), 200

@bp.route('/<gravacao_id>', methods=['DELETE'])
@token_required
def delete_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
    if not gravacao:
        return jsonify({'error': 'Gravação não encontrada'}), 404
    if not is_admin and not _gravacao_access_allowed(gravacao, ctx):
        return jsonify({'error': 'Gravação não encontrada'}), 404
    
    db.session.delete(gravacao)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'gravacao_deleted', {'id': gravacao_id})
    
    return jsonify({'message': 'Gravação excluída'}), 200

@bp.route('/batch-delete', methods=['POST'])
@token_required
def batch_delete():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    data = request.get_json()
    gravacao_ids = data.get('gravacao_ids', [])
    
    if not gravacao_ids:
        return jsonify({'error': 'Nenhum ID de gravação informado'}), 400
    
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
    
    return jsonify({'message': f'{len(gravacoes)} gravações excluídas'}), 200

@bp.route('/stats', methods=['GET'])
@token_required
def get_stats():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)
    query = Gravacao.query
    if not is_admin:
        query = query.filter(Gravacao.user_id == user_id)

    duration_expr = db.func.coalesce(Gravacao.duracao_segundos, Gravacao.duracao_minutos * 60)
    stats_row = query.with_entities(
        db.func.count(Gravacao.id),
        db.func.coalesce(db.func.sum(duration_expr), 0),
        db.func.coalesce(db.func.sum(Gravacao.tamanho_mb), 0),
        db.func.count(db.distinct(Gravacao.radio_id)),
    ).first() or (0, 0, 0, 0)
    total = int(stats_row[0] or 0)
    total_duration = int(stats_row[1] or 0)
    total_size = float(stats_row[2] or 0)
    unique_radios = int(stats_row[3] or 0)
    
    return jsonify({
        'totalGravacoes': total,
        'totalDuration': total_duration,
        'totalSize': total_size,
        'uniqueRadios': unique_radios
    }), 200


@bp.route('/admin/quick-stats', methods=['GET'])
@token_required
def admin_quick_stats():
    """Retorna indicadores rápidos para admins."""
    ctx = get_user_ctx()
    if not ctx.get('is_admin'):
        return jsonify({'error': 'Acesso negado'}), 403

    # Base de gravações válidas (ignora erros)
    duration_expr = db.func.coalesce(Gravacao.duracao_segundos, Gravacao.duracao_minutos * 60)
    base_grav = Gravacao.query.filter(Gravacao.status != 'erro')

    total_duration_seconds = (
        base_grav.with_entities(db.func.coalesce(db.func.sum(duration_expr), 0)).scalar() or 0
    )
    total_users = db.session.query(User).count()

    # Usuário que mais agendou
    top_scheduler_row = (
        db.session.query(Agendamento.user_id, db.func.count(Agendamento.id).label('total'))
        .group_by(Agendamento.user_id)
        .order_by(desc('total'))
        .first()
    )
    top_scheduler = None
    if top_scheduler_row:
        user = User.query.get(top_scheduler_row.user_id)
        if user:
            top_scheduler = {
                'id': user.id,
                'nome': user.nome or user.email,
                'email': user.email,
                'total_agendamentos': int(top_scheduler_row.total or 0),
            }

    # Rádio com mais tempo gravado
    top_radio_row = (
        base_grav.with_entities(
            Gravacao.radio_id,
            db.func.coalesce(db.func.sum(duration_expr), 0).label('total_dur')
        )
        .group_by(Gravacao.radio_id)
        .order_by(desc('total_dur'))
        .first()
    )
    top_radio = None
    if top_radio_row:
        radio = Radio.query.get(top_radio_row.radio_id)
        if radio:
            top_radio = {
                'id': radio.id,
                'nome': radio.nome,
                'total_duration_seconds': int(top_radio_row.total_dur or 0),
            }

    return jsonify({
        'total_duration_seconds': int(total_duration_seconds),
        'total_duration_hours': round((total_duration_seconds or 0) / 3600, 2),
        'total_users': total_users,
        'top_scheduler': top_scheduler,
        'top_radio': top_radio,
    }), 200
