import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


def _env_bool(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name, default):
    value = os.getenv(name)
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _env_float(name, default=None, *, allow_none=False):
    value = os.getenv(name)
    if value in (None, ""):
        return default
    if allow_none and str(value).strip().lower() in {"none", "null"}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _env_str(name, default=None):
    value = os.getenv(name)
    if value is None:
        return default
    normalized = str(value).strip()
    return normalized or default

class Config:
    # Database
    import urllib.parse
    
    _db_user = os.getenv('DB_USER', '')
    _db_password = os.getenv('DB_PASSWORD', '')
    _db_host = os.getenv('DB_HOST', 'db')
    _db_port = os.getenv('DB_PORT', '5432')
    _db_name = os.getenv('DB_NAME', '')
    _db_pool_size = int(os.getenv('DB_POOL_SIZE', '10') or 10)
    _db_max_overflow = int(os.getenv('DB_MAX_OVERFLOW', '20') or 20)
    _db_pool_timeout = int(os.getenv('DB_POOL_TIMEOUT', '20') or 20)
    
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
        },
        # Evita conexoes "mortas" apos reinicio do banco
        'pool_pre_ping': True,
        # Recicla conexoes antigas para reduzir queda por timeout no servidor
        'pool_recycle': 1800,
        'pool_size': _db_pool_size,
        'max_overflow': _db_max_overflow,
        'pool_timeout': _db_pool_timeout
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
    DROPBOX_APP_KEY = os.getenv('DROPBOX_APP_KEY')
    DROPBOX_APP_SECRET = os.getenv('DROPBOX_APP_SECRET')
    DROPBOX_REFRESH_TOKEN = os.getenv('DROPBOX_REFRESH_TOKEN')
    DROPBOX_AUDIO_PATH = os.getenv('DROPBOX_AUDIO_PATH', '/audio')
    DROPBOX_AUDIO_LAYOUT = os.getenv('DROPBOX_AUDIO_LAYOUT', 'hierarchy')
    DROPBOX_AUDIO_UNRECOGNIZED_PATH = os.getenv('DROPBOX_AUDIO_UNRECOGNIZED_PATH', '/audio/_NAO_RECONHECIDO')
    DROPBOX_DELETE_LOCAL_AFTER_UPLOAD = os.getenv('DROPBOX_DELETE_LOCAL_AFTER_UPLOAD', 'true').lower() == 'true'
    DROPBOX_LOCAL_RETENTION_DAYS = int(os.getenv('DROPBOX_LOCAL_RETENTION_DAYS', '30') or 30)
    try:
        AUDIO_STREAM_MAX_AGE_DAYS = int(os.getenv('AUDIO_STREAM_MAX_AGE_DAYS', '30') or 30)
    except (TypeError, ValueError):
        AUDIO_STREAM_MAX_AGE_DAYS = 30

    TRANSCRIBE_ENABLED = _env_bool('TRANSCRIBE_ENABLED', True)
    TRANSCRIBE_MODEL = _env_str('TRANSCRIBE_MODEL', 'small')
    TRANSCRIBE_LANGUAGE = _env_str('TRANSCRIBE_LANGUAGE', 'pt')
    TRANSCRIBE_DEVICE = _env_str('TRANSCRIBE_DEVICE', 'cpu')
    TRANSCRIBE_COMPUTE_TYPE = _env_str('TRANSCRIBE_COMPUTE_TYPE', 'int8')
    TRANSCRIBE_CPU_THREADS = _env_int('TRANSCRIBE_CPU_THREADS', 0)
    TRANSCRIBE_MODEL_WORKERS = _env_int('TRANSCRIBE_MODEL_WORKERS', 1)
    TRANSCRIBE_SERIALIZE_JOBS = _env_bool('TRANSCRIBE_SERIALIZE_JOBS', True)
    TRANSCRIBE_BEAM_SIZE = _env_int('TRANSCRIBE_BEAM_SIZE', 5)
    TRANSCRIBE_BEST_OF = _env_int('TRANSCRIBE_BEST_OF', 5)
    TRANSCRIBE_PATIENCE = _env_float('TRANSCRIBE_PATIENCE', 1.2)
    TRANSCRIBE_CONDITION_ON_PREVIOUS_TEXT = _env_bool('TRANSCRIBE_CONDITION_ON_PREVIOUS_TEXT', True)
    TRANSCRIBE_INITIAL_PROMPT = _env_str('TRANSCRIBE_INITIAL_PROMPT')
    TRANSCRIBE_HOTWORDS = _env_str('TRANSCRIBE_HOTWORDS')
    TRANSCRIBE_WORD_TIMESTAMPS = _env_bool('TRANSCRIBE_WORD_TIMESTAMPS', True)
    TRANSCRIBE_HALLUCINATION_SILENCE_THRESHOLD = _env_float(
        'TRANSCRIBE_HALLUCINATION_SILENCE_THRESHOLD',
        2.0,
        allow_none=True,
    )
    TRANSCRIBE_VAD = _env_bool('TRANSCRIBE_VAD', True)
    TRANSCRIBE_VAD_MIN_SILENCE_MS = _env_int('TRANSCRIBE_VAD_MIN_SILENCE_MS', 2000)
    TRANSCRIBE_VAD_SPEECH_PAD_MS = _env_int('TRANSCRIBE_VAD_SPEECH_PAD_MS', 500)
    TRANSCRIBE_CHUNK_LENGTH = _env_int('TRANSCRIBE_CHUNK_LENGTH', 30)
    TRANSCRIBE_AUDIO_PREPROCESS = _env_bool('TRANSCRIBE_AUDIO_PREPROCESS', True)
    TRANSCRIBE_AUDIO_SAMPLE_RATE = _env_int('TRANSCRIBE_AUDIO_SAMPLE_RATE', 16000)
    TRANSCRIBE_AUDIO_CHANNELS = _env_int('TRANSCRIBE_AUDIO_CHANNELS', 1)
    TRANSCRIBE_AUDIO_FILTER = _env_str(
        'TRANSCRIBE_AUDIO_FILTER',
        'highpass=f=80,lowpass=f=7600,loudnorm=I=-16:LRA=11:TP=-1.5',
    )
    TRANSCRIBE_TEXT_UPDATE_SECONDS = _env_int('TRANSCRIBE_TEXT_UPDATE_SECONDS', 10)
    TRANSCRIBE_PROGRESS_STEP = _env_int('TRANSCRIBE_PROGRESS_STEP', 5)
    TRANSCRIBE_MAX_CONCURRENT = _env_int('TRANSCRIBE_MAX_CONCURRENT', 1)
    TRANSCRIBE_RECOVERY_ENABLED = _env_bool('TRANSCRIBE_RECOVERY_ENABLED', True)
    TRANSCRIBE_RECOVERY_INTERVAL_SECONDS = _env_int('TRANSCRIBE_RECOVERY_INTERVAL_SECONDS', 45)
    TRANSCRIBE_RECOVERY_BATCH_SIZE = _env_int('TRANSCRIBE_RECOVERY_BATCH_SIZE', 5)

    FFMPEG_THREADS = _env_int('FFMPEG_THREADS', 0)

    STREAM_VALIDATE_ON_SCHEDULE = _env_bool('STREAM_VALIDATE_ON_SCHEDULE', True)
    STREAM_VALIDATE_ON_EXECUTE = _env_bool('STREAM_VALIDATE_ON_EXECUTE', True)
    STREAM_VALIDATE_TIMEOUT_SECONDS = _env_int('STREAM_VALIDATE_TIMEOUT_SECONDS', 8)
    
    @staticmethod
    def init_app(app):
        os.makedirs(Config.STORAGE_PATH, exist_ok=True)
        os.makedirs(Config.UPLOAD_PATH, exist_ok=True)
        os.makedirs(os.path.join(Config.STORAGE_PATH, 'audio'), exist_ok=True)
        os.makedirs(os.path.join(Config.STORAGE_PATH, 'clips'), exist_ok=True)
        os.makedirs(os.path.join(Config.STORAGE_PATH, 'transcripts'), exist_ok=True)

