import jwt
from datetime import datetime
from flask import current_app
from functools import wraps
from flask import request, jsonify

from models.user import User

def create_token(user_id):
    """Cria JWT incluindo flag de admin para evitar consultas extras por requisição."""
    user = User.query.get(user_id)
    payload = {
        'user_id': user_id,
        'is_admin': bool(user.is_admin) if user else False,
        'exp': datetime.utcnow() + current_app.config['JWT_ACCESS_TOKEN_EXPIRES'],
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

def decode_token(token):
    try:
        return jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
    except Exception:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            return jsonify({'error': 'Token não informado'}), 401
        
        payload = decode_token(token)
        if not payload:
            return jsonify({'error': 'Token inválido'}), 401
        
        request.user_id = payload.get('user_id')
        request.is_admin = payload.get('is_admin', False)
        return f(*args, **kwargs)
    return decorated
