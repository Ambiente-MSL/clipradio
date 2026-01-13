import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Database
    import urllib.parse
    
    _db_user = os.getenv('DB_USER', '')
    _db_password = os.getenv('DB_PASSWORD', '')
    _db_host = os.getenv('DB_HOST', 'db')
    _db_port = os.getenv('DB_PORT', '5432')
    _db_name = os.getenv('DB_NAME', '')
    
    # URL encode a senha para evitar problemas com caracteres especiais
    _db_password_encoded = urllib.parse.quote_plus(_db_password) if _db_password else ''
    
    # Garantir que estamos usando TCP/IP explicitamente
    # O problema é que psycopg2 pode interpretar "db" como socket Unix
    # Vamos usar connect_args no SQLAlchemy para forçar TCP/IP
    # Mas primeiro, vamos garantir que a URL está correta
    SQLALCHEMY_DATABASE_URI = (
        f"postgresql+psycopg2://{_db_user}:{_db_password_encoded}"
        f"@{_db_host}:{_db_port}/{_db_name}"
    )
    
    # Configurações adicionais para forçar TCP/IP
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'host': _db_host,
            'port': int(_db_port),
            'connect_timeout': 10
        }
    }
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False
    
    # Security
    SECRET_KEY = os.getenv('SECRET_KEY')
    JWT_SECRET_KEY = os.getenv('JWT_SECRET')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)
    
    # CORS
    CORS_ORIGINS = "*"
    
    # Storage
    STORAGE_PATH = os.path.join(os.path.dirname(__file__), 'storage')
    UPLOAD_PATH = os.path.join(os.path.dirname(__file__), 'uploads')

    # Dropbox (opcional) - arquivamento de áudios para economizar disco
    DROPBOX_UPLOAD_ENABLED = os.getenv('DROPBOX_UPLOAD_ENABLED', 'false').lower() == 'true'
    DROPBOX_ACCESS_TOKEN = os.getenv('DROPBOX_ACCESS_TOKEN')
    DROPBOX_AUDIO_PATH = os.getenv('DROPBOX_AUDIO_PATH', '/clipradio/audio')
    DROPBOX_DELETE_LOCAL_AFTER_UPLOAD = os.getenv('DROPBOX_DELETE_LOCAL_AFTER_UPLOAD', 'true').lower() == 'true'
    DROPBOX_LOCAL_RETENTION_DAYS = int(os.getenv('DROPBOX_LOCAL_RETENTION_DAYS', '0') or 0)

    TRANSCRIBE_ENABLED = os.getenv('TRANSCRIBE_ENABLED', 'true').lower() == 'true'
    TRANSCRIBE_MODEL = os.getenv('TRANSCRIBE_MODEL', 'tiny')
    TRANSCRIBE_LANGUAGE = os.getenv('TRANSCRIBE_LANGUAGE', 'pt')
    TRANSCRIBE_DEVICE = os.getenv('TRANSCRIBE_DEVICE', 'cpu')
    TRANSCRIBE_COMPUTE_TYPE = os.getenv('TRANSCRIBE_COMPUTE_TYPE', 'int8')
    TRANSCRIBE_BEAM_SIZE = int(os.getenv('TRANSCRIBE_BEAM_SIZE', '1') or 1)
    TRANSCRIBE_BEST_OF = int(os.getenv('TRANSCRIBE_BEST_OF', '1') or 1)
    TRANSCRIBE_VAD = os.getenv('TRANSCRIBE_VAD', 'true').lower() == 'true'
    TRANSCRIBE_VAD_MIN_SILENCE_MS = int(os.getenv('TRANSCRIBE_VAD_MIN_SILENCE_MS', '500') or 500)
    TRANSCRIBE_CHUNK_LENGTH = int(os.getenv('TRANSCRIBE_CHUNK_LENGTH', '15') or 15)
    TRANSCRIBE_TEXT_UPDATE_SECONDS = int(os.getenv('TRANSCRIBE_TEXT_UPDATE_SECONDS', '10') or 10)
    
    @staticmethod
    def init_app(app):
        os.makedirs(Config.STORAGE_PATH, exist_ok=True)
        os.makedirs(Config.UPLOAD_PATH, exist_ok=True)
        os.makedirs(os.path.join(Config.STORAGE_PATH, 'audio'), exist_ok=True)
        os.makedirs(os.path.join(Config.STORAGE_PATH, 'clips'), exist_ok=True)

