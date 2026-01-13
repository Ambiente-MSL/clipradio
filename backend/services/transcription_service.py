import os
import subprocess
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


def _probe_duration_seconds(filepath):
    if not filepath or not os.path.exists(filepath):
        return None
    try:
        out = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                filepath,
            ],
            stderr=subprocess.STDOUT,
        )
        return int(round(float(out.strip())))
    except Exception:
        return None


def _commit_transcription(
    gravacao,
    *,
    status,
    texto=None,
    erro=None,
    idioma=None,
    modelo=None,
    progresso=None,
    cancelada=None,
):
    gravacao.transcricao_status = status
    gravacao.transcricao_erro = erro
    if texto is not None:
        gravacao.transcricao_texto = texto
    if idioma is not None:
        gravacao.transcricao_idioma = idioma
    if modelo is not None:
        gravacao.transcricao_modelo = modelo
    if progresso is not None:
        gravacao.transcricao_progresso = progresso
    if cancelada is not None:
        gravacao.transcricao_cancelada = cancelada
    db.session.commit()
    try:
        broadcast_update(
            f"user_{gravacao.user_id}",
            "gravacao_updated",
            gravacao.to_dict(include_transcricao=False),
        )
    except Exception:
        pass


def _update_progress(gravacao, progresso):
    _commit_transcription(
        gravacao,
        status=gravacao.transcricao_status or "processando",
        progresso=progresso,
    )


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
            progresso=gravacao.transcricao_progresso or 0,
        )
        return False

    _commit_transcription(
        gravacao,
        status="processando",
        erro=None,
        modelo=Config.TRANSCRIBE_MODEL,
        progresso=0,
        cancelada=False,
    )

    try:
        with _TRANSCRIBE_LOCK:
            model = _load_model()
            language = Config.TRANSCRIBE_LANGUAGE or None
            transcribe_kwargs = {
                "language": language,
                "beam_size": max(1, int(Config.TRANSCRIBE_BEAM_SIZE or 1)),
            }
            best_of = int(Config.TRANSCRIBE_BEST_OF or 0)
            if best_of > 0:
                transcribe_kwargs["best_of"] = best_of
            if Config.TRANSCRIBE_VAD:
                transcribe_kwargs["vad_filter"] = True
                transcribe_kwargs["vad_parameters"] = {
                    "min_silence_duration_ms": int(Config.TRANSCRIBE_VAD_MIN_SILENCE_MS or 500),
                }
            segments, info = model.transcribe(filepath, **transcribe_kwargs)
            detected_lang = getattr(info, "language", None)
    except Exception as exc:
        _commit_transcription(
            gravacao,
            status="erro",
            erro=str(exc)[:500],
            progresso=gravacao.transcricao_progresso or 0,
        )
        return False

    total_duration = gravacao.duracao_segundos or _probe_duration_seconds(filepath) or 0
    if total_duration <= 0:
        total_duration = 0

    parts = []
    last_progress = gravacao.transcricao_progresso or 0
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)

        if total_duration:
            progress = int((segment.end / total_duration) * 100)
            progress = max(last_progress, min(100, progress))
        else:
            progress = last_progress

        if progress >= last_progress + 2:
            _update_progress(gravacao, progress)
            last_progress = progress

        try:
            db.session.refresh(gravacao)
            if gravacao.transcricao_cancelada:
                partial = " ".join(parts).strip()
                _commit_transcription(
                    gravacao,
                    status="interrompido",
                    texto=partial,
                    progresso=last_progress,
                    cancelada=True,
                )
                return False
        except Exception:
            pass

    texto = " ".join(parts).strip()
    if not texto:
        _commit_transcription(
            gravacao,
            status="erro",
            erro="transcricao_vazia",
            progresso=last_progress,
        )
        return False

    _commit_transcription(
        gravacao,
        status="concluido",
        texto=texto,
        idioma=detected_lang or Config.TRANSCRIBE_LANGUAGE,
        modelo=Config.TRANSCRIBE_MODEL,
        progresso=100,
        cancelada=False,
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
            progresso=0,
            cancelada=False,
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


def request_transcription_stop(gravacao_id):
    if not Config.TRANSCRIBE_ENABLED:
        return False
    gravacao = Gravacao.query.get(gravacao_id)
    if not gravacao:
        return False
    if gravacao.transcricao_status not in ("processando", "interrompendo"):
        return False
    _commit_transcription(
        gravacao,
        status="interrompendo",
        progresso=gravacao.transcricao_progresso or 0,
        cancelada=True,
    )
    return True
