from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app import db
from models.tag import Tag
from models.gravacao import Gravacao
from models.gravacao_tag import gravacao_tags
from models.user import User
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request

bp = Blueprint('tags', __name__)

def get_user_ctx():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token) or {}
    return {
        'user_id': payload.get('user_id'),
        'is_admin': payload.get('is_admin', False),
    }

@bp.route('', methods=['GET'])
@token_required
def get_tags():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tags = Tag.query.order_by(Tag.criado_em.desc()).all()
    else:
        user = User.query.get(user_id)
        user_city = (user.cidade or '').strip() if user else ''
        if not user_city:
            tags = Tag.query.filter_by(user_id=user_id).order_by(Tag.criado_em.desc()).all()
        else:
            tags = (
                Tag.query
                .join(User, Tag.user_id == User.id)
                .filter(func.lower(User.cidade) == user_city.lower())
                .order_by(Tag.criado_em.desc())
                .all()
            )
    return jsonify([tag.to_dict() for tag in tags]), 200

@bp.route('/<tag_id>', methods=['GET'])
@token_required
def get_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    return jsonify(tag.to_dict()), 200

@bp.route('', methods=['POST'])
@token_required
def create_tag():
    user_id = get_user_ctx().get('user_id')
    data = request.get_json()
    
    if not data.get('nome'):
        return jsonify({'error': 'nome is required'}), 400
    
    tag = Tag(
        user_id=user_id,
        nome=data['nome'],
        cor=data.get('cor')
    )
    
    db.session.add(tag)
    db.session.commit()
    
    return jsonify(tag.to_dict()), 201

@bp.route('/<tag_id>', methods=['PUT'])
@token_required
def update_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    
    data = request.get_json()
    if 'nome' in data:
        tag.nome = data['nome']
    if 'cor' in data:
        tag.cor = data['cor']
    
    db.session.commit()
    return jsonify(tag.to_dict()), 200

@bp.route('/<tag_id>', methods=['DELETE'])
@token_required
def delete_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    
    db.session.delete(tag)
    db.session.commit()
    
    return jsonify({'message': 'Tag deleted'}), 200

@bp.route('/gravacao/<gravacao_id>', methods=['POST'])
@token_required
def add_tag_to_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json()
    tag_id = data.get('tag_id')
    
    if not tag_id:
        return jsonify({'error': 'tag_id is required'}), 400
    
    if ctx.get('is_admin'):
        gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        gravacao = Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    
    if not gravacao or not tag:
        return jsonify({'error': 'Gravacao or Tag not found'}), 404
    
    # Adicionar relação se não existir
    if tag not in gravacao.tags:
        gravacao.tags.append(tag)
        db.session.commit()
    
    return jsonify({'message': 'Tag added to gravacao'}), 200

@bp.route('/gravacao/<gravacao_id>/<tag_id>', methods=['DELETE'])
@token_required
def remove_tag_from_gravacao(gravacao_id, tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    
    if ctx.get('is_admin'):
        gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        gravacao = Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    
    if not gravacao or not tag:
        return jsonify({'error': 'Gravacao or Tag not found'}), 404
    
    if tag in gravacao.tags:
        gravacao.tags.remove(tag)
        db.session.commit()
    
    return jsonify({'message': 'Tag removed from gravacao'}), 200

