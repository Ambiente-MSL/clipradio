from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import IntegrityError, SQLAlchemyError, OperationalError
import time
from app import db
from models.user import User
from utils.jwt_utils import create_token, token_required

bp = Blueprint('auth', __name__)

def _query_with_retry(query_fn, retries=1, delay=0.4):
    for attempt in range(retries + 1):
        try:
            return query_fn()
        except OperationalError:
            current_app.logger.exception(
                "Erro de banco (OperationalError) na tentativa %s/%s",
                attempt + 1,
                retries + 1
            )
            db.session.rollback()
            db.engine.dispose()
            if attempt < retries:
                time.sleep(delay)
                continue
            raise

@bp.route('/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password required'}), 400
    
    try:
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already exists'}), 409
        
        raw_nome = data.get('nome')
        if isinstance(raw_nome, str) and raw_nome.strip():
            nome = raw_nome.strip()[:255]
        else:
            # Se veio objeto ou vazio, usa prefixo do e-mail como nome padr├úo
            email_prefix = data['email'].split('@')[0] if '@' in data['email'] else data['email']
            nome = (email_prefix or 'Usuario').strip()[:255]
        
        user = User(email=data['email'], nome=nome)
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        token = create_token(user.id)
        return jsonify({'user': user.to_dict(), 'token': token}), 201
    
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Email already exists'}), 409
    except SQLAlchemyError as e:
        current_app.logger.exception("Erro de banco ao registrar usuário")
        db.session.rollback()
        return jsonify({'error': 'Database error while creating user', 'detail': str(e)}), 500
    except Exception as e:
        current_app.logger.exception("Erro inesperado no registro")
        db.session.rollback()
        return jsonify({'error': 'Internal server error', 'detail': str(e)}), 500

@bp.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password required'}), 400
    
    try:
        user = _query_with_retry(
            lambda: User.query.filter_by(email=data.get('email')).first()
        )
    except OperationalError:
        current_app.logger.exception("Erro ao buscar usuário para login")
        db.session.rollback()
        return jsonify({'error': 'Database unavailable. Please try again.'}), 500
    except SQLAlchemyError:
        current_app.logger.exception("Erro ao buscar usuário para login")
        db.session.rollback()
        return jsonify({'error': 'Database unavailable. Please try again.'}), 500
    
    if not user or not user.check_password(data.get('password', '')):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not user.ativo:
        return jsonify({'error': 'User inactive'}), 403
    
    token = create_token(user.id)
    return jsonify({'user': user.to_dict(), 'token': token}), 200

@bp.route('/me', methods=['GET'])
@token_required
def get_me():
    from utils.jwt_utils import decode_token
    from flask import request
    
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token)
    user_id = payload['user_id']
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify(user.to_dict()), 200

@bp.route('/logout', methods=['POST'])
@token_required
def logout():
    return jsonify({'message': 'Logged out'}), 200
