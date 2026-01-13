import os
import threading

from flask import current_app

from app import db
from config import Config
from models.gravacao import Gravacao
from services.websocket_service import broadcast_update

_MODEL = None
_MODEL_LOCK = threading.Lock()
_TRANSCRIBE_LOCK = threading.Lock()


def _get_audio_filepath(gravacao):
    if not gravacao:
        return None
    filename = gravacao.arquivo_nome
    if not filename and getattr(gravacao, "arquivo_url", None):
        filename = gravacao.arquivo_url.rsplit("/", 1)[-1]
    if not filename:
        return None
    return os.path.join(Config.STORAGE_PATH, "audio", filename)


def _load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL
        try:
            from faster_whisper import WhisperModel
        except Exception as exc:
            raise RuntimeError("faster-whisper is not installed") from exc
        _MODEL = WhisperModel(
            Config.TRANSCRIBE_MODEL,
            device=Config.TRANSCRIBE_DEVICE,
            compute_type=Config.TRANSCRIBE_COMPUTE_TYPE,
        )
    return _MODEL


def _join_segments(segments):
    parts = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)
    return " ".join(parts).strip()


def _commit_transcription(gravacao, *, status, texto=None, erro=None, idioma=None, modelo=None):
    gravacao.transcricao_status = status
    gravacao.transcricao_erro = erro
    if texto is not None:
        gravacao.transcricao_texto = texto
    if idioma is not None:
        gravacao.transcricao_idioma = idioma
    if modelo is not None:
        gravacao.transcricao_modelo = modelo
    db.session.commit()
    try:
        broadcast_update(
            f"user_{gravacao.user_id}",
            "gravacao_updated",
            gravacao.to_dict(include_transcricao=False),
        )
    except Exception:
        pass


def transcribe_gravacao(gravacao_id, *, force=False):
    if not Config.TRANSCRIBE_ENABLED:
        return False

    gravacao = Gravacao.query.get(gravacao_id)
    if not gravacao:
        return False

    if gravacao.status != "concluido" and not force:
        return False

    if gravacao.transcricao_texto and not force:
        return True

    if gravacao.transcricao_status == "processando" and not force:
        return True

    filepath = _get_audio_filepath(gravacao)
    if not filepath or not os.path.exists(filepath):
        _commit_transcription(
            gravacao,
            status="erro",
            erro="arquivo_de_audio_nao_encontrado",
        )
        return False

    _commit_transcription(
        gravacao,
        status="processando",
        erro=None,
        modelo=Config.TRANSCRIBE_MODEL,
    )

    try:
        with _TRANSCRIBE_LOCK:
            model = _load_model()
            language = Config.TRANSCRIBE_LANGUAGE or None
            segments, info = model.transcribe(
                filepath,
                language=language,
                beam_size=Config.TRANSCRIBE_BEAM_SIZE,
            )
            texto = _join_segments(segments)
            detected_lang = getattr(info, "language", None)
    except Exception as exc:
        _commit_transcription(
            gravacao,
            status="erro",
            erro=str(exc)[:500],
        )
        return False

    if not texto:
        _commit_transcription(
            gravacao,
            status="erro",
            erro="transcricao_vazia",
        )
        return False

    _commit_transcription(
        gravacao,
        status="concluido",
        texto=texto,
        idioma=detected_lang or Config.TRANSCRIBE_LANGUAGE,
        modelo=Config.TRANSCRIBE_MODEL,
    )
    return True


def start_transcription(gravacao_id, *, force=False):
    if not Config.TRANSCRIBE_ENABLED:
        return False

    try:
        gravacao = Gravacao.query.get(gravacao_id)
    except Exception:
        gravacao = None

    if gravacao:
        if gravacao.transcricao_texto and not force:
            return True
        if gravacao.transcricao_status == "processando" and not force:
            return True
        _commit_transcription(
            gravacao,
            status="processando",
            erro=None,
            modelo=Config.TRANSCRIBE_MODEL,
        )

    try:
        app_obj = current_app._get_current_object()
    except Exception:
        app_obj = None

    def _runner():
        ctx = None
        if app_obj:
            ctx = app_obj.app_context()
            ctx.push()
        try:
            transcribe_gravacao(gravacao_id, force=force)
        finally:
            if ctx:
                ctx.pop()

    threading.Thread(target=_runner, daemon=True).start()
    return True
