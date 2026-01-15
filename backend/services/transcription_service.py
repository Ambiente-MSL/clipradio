import json
import os
import queue
import subprocess
import threading
from collections import Counter

from flask import current_app

from app import db
from config import Config
from models.gravacao import Gravacao
from services.websocket_service import broadcast_update

_MODEL = None
_MODEL_LOCK = threading.Lock()
_TRANSCRIBE_LOCK = threading.Lock()
_TRANSCRIBE_QUEUE = queue.Queue()
_TRANSCRIBE_WORKERS = []
_TRANSCRIBE_WORKER_LOCK = threading.Lock()
_TRANSCRIBE_IN_FLIGHT = Counter()
_TRANSCRIBE_IN_FLIGHT_LOCK = threading.Lock()
_TRANSCRIBE_ACTIVE = 0
_TRANSCRIBE_ACTIVE_LOCK = threading.Lock()


def _get_transcribe_max_workers():
    try:
        return max(1, int(Config.TRANSCRIBE_MAX_CONCURRENT or 1))
    except Exception:
        return 1


def _ensure_transcribe_workers():
    max_workers = _get_transcribe_max_workers()
    with _TRANSCRIBE_WORKER_LOCK:
        alive_workers = [worker for worker in _TRANSCRIBE_WORKERS if worker.is_alive()]
        _TRANSCRIBE_WORKERS[:] = alive_workers
        while len(_TRANSCRIBE_WORKERS) < max_workers:
            worker = threading.Thread(target=_transcribe_worker, daemon=True)
            _TRANSCRIBE_WORKERS.append(worker)
            worker.start()


def _transcribe_worker():
    global _TRANSCRIBE_ACTIVE
    while True:
        job = _TRANSCRIBE_QUEUE.get()
        if job is None:
            _TRANSCRIBE_QUEUE.task_done()
            break
        gravacao_id = job.get("gravacao_id")
        force = bool(job.get("force"))
        app_obj = job.get("app_obj")

        with _TRANSCRIBE_ACTIVE_LOCK:
            _TRANSCRIBE_ACTIVE += 1

        ctx = None
        try:
            if app_obj:
                ctx = app_obj.app_context()
                ctx.push()
            try:
                gravacao = Gravacao.query.get(gravacao_id)
            except Exception:
                gravacao = None
            if gravacao and gravacao.transcricao_cancelada:
                _commit_transcription(
                    gravacao,
                    status="interrompido",
                    progresso=gravacao.transcricao_progresso or 0,
                    cancelada=True,
                )
            else:
                transcribe_gravacao(gravacao_id, force=force)
        finally:
            if ctx:
                ctx.pop()
            with _TRANSCRIBE_ACTIVE_LOCK:
                _TRANSCRIBE_ACTIVE = max(0, _TRANSCRIBE_ACTIVE - 1)
            with _TRANSCRIBE_IN_FLIGHT_LOCK:
                if gravacao_id:
                    if _TRANSCRIBE_IN_FLIGHT.get(gravacao_id, 0) > 1:
                        _TRANSCRIBE_IN_FLIGHT[gravacao_id] -= 1
                    else:
                        _TRANSCRIBE_IN_FLIGHT.pop(gravacao_id, None)
            _TRANSCRIBE_QUEUE.task_done()


def _get_audio_filepath(gravacao):
    if not gravacao:
        return None
    filename = gravacao.arquivo_nome
    if not filename and getattr(gravacao, "arquivo_url", None):
        filename = gravacao.arquivo_url.rsplit("/", 1)[-1]
    if not filename:
        return None
    return os.path.join(Config.STORAGE_PATH, "audio", filename)


def _resolve_audio_filepath(gravacao):
    filepath = _get_audio_filepath(gravacao)
    if filepath and os.path.exists(filepath):
        return filepath
    if not gravacao or not gravacao.id:
        return filepath
    audio_dir = os.path.join(Config.STORAGE_PATH, "audio")
    if not os.path.isdir(audio_dir):
        return filepath
    prefix = f"{gravacao.id}_"
    try:
        candidates = [
            name for name in os.listdir(audio_dir)
            if name.startswith(prefix)
        ]
    except Exception:
        candidates = []
    if not candidates:
        return filepath
    candidates.sort(
        key=lambda name: os.path.getmtime(os.path.join(audio_dir, name)),
        reverse=True,
    )
    candidate_name = candidates[0]
    candidate_path = os.path.join(audio_dir, candidate_name)
    if os.path.exists(candidate_path):
        if not gravacao.arquivo_nome:
            gravacao.arquivo_nome = candidate_name
            gravacao.arquivo_url = f"/api/files/audio/{candidate_name}"
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()
        return candidate_path
    return filepath


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


def _get_transcription_segments_path(gravacao_id):
    if not gravacao_id:
        return None
    filename = f"{gravacao_id}.segments.json"
    return os.path.join(Config.STORAGE_PATH, "transcripts", filename)


def _persist_transcription_segments(gravacao_id, segments):
    path = _get_transcription_segments_path(gravacao_id)
    if not path:
        return
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fp:
            json.dump({"segments": segments}, fp, ensure_ascii=True)
    except Exception:
        pass


def get_transcription_segments(gravacao_id):
    path = _get_transcription_segments_path(gravacao_id)
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fp:
            data = json.load(fp) or {}
    except Exception:
        return []
    segments = data.get("segments")
    return segments if isinstance(segments, list) else []


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

    if gravacao.transcricao_texto and not force:
        return True

    filepath = _resolve_audio_filepath(gravacao)
    if not filepath or not os.path.exists(filepath):
        _commit_transcription(
            gravacao,
            status="erro",
            erro="arquivo_de_audio_nao_encontrado",
            progresso=gravacao.transcricao_progresso or 0,
        )
        return False
    try:
        file_size = os.path.getsize(filepath)
    except Exception:
        file_size = 0
    if file_size < 1024 and not force:
        _commit_transcription(
            gravacao,
            status="erro",
            erro="arquivo_de_audio_invalido",
            progresso=gravacao.transcricao_progresso or 0,
        )
        return False

    if (gravacao.duracao_segundos or 0) <= 0:
        probed_duration = _probe_duration_seconds(filepath) or 0
        if probed_duration > 0:
            gravacao.duracao_segundos = probed_duration
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

    _commit_transcription(
        gravacao,
        status="processando",
        erro=None,
        modelo=Config.TRANSCRIBE_MODEL,
        progresso=0,
        cancelada=False,
    )

    acquired = _TRANSCRIBE_LOCK.acquire(blocking=False)
    if not acquired:
        _commit_transcription(
            gravacao,
            status="fila",
            progresso=gravacao.transcricao_progresso or 0,
            cancelada=False,
        )
        while True:
            if _TRANSCRIBE_LOCK.acquire(timeout=1):
                break
            try:
                db.session.refresh(gravacao)
                if gravacao.transcricao_cancelada:
                    _commit_transcription(
                        gravacao,
                        status="interrompido",
                        progresso=gravacao.transcricao_progresso or 0,
                        cancelada=True,
                    )
                    return False
            except Exception:
                pass

    try:
        try:
            db.session.refresh(gravacao)
            if gravacao.transcricao_cancelada:
                _commit_transcription(
                    gravacao,
                    status="interrompido",
                    progresso=gravacao.transcricao_progresso or 0,
                    cancelada=True,
                )
                return False
            if gravacao.transcricao_status == "fila":
                _commit_transcription(
                    gravacao,
                    status="processando",
                    progresso=max(1, gravacao.transcricao_progresso or 0),
                    cancelada=False,
                )
        except Exception:
            pass

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
        chunk_length = int(Config.TRANSCRIBE_CHUNK_LENGTH or 0)
        if chunk_length > 0:
            transcribe_kwargs["chunk_length"] = chunk_length
        segments, info = model.transcribe(filepath, **transcribe_kwargs)
        detected_lang = getattr(info, "language", None)

        total_duration = gravacao.duracao_segundos or int(round(getattr(info, "duration", 0) or 0)) or 0
        if total_duration <= 0:
            total_duration = _probe_duration_seconds(filepath) or 0

        parts = []
        segments_payload = []
        last_progress = gravacao.transcricao_progresso or 0
        last_text_end = 0.0
        text_update_seconds = max(1, int(Config.TRANSCRIBE_TEXT_UPDATE_SECONDS or 10))

        _commit_transcription(
            gravacao,
            status="processando",
            progresso=last_progress or 1,
        )
        if last_progress == 0:
            last_progress = 1

        for segment in segments:
            text = (segment.text or "").strip()
            if text:
                parts.append(text)
                segments_payload.append({
                    "start": float(getattr(segment, "start", 0) or 0),
                    "end": float(getattr(segment, "end", 0) or 0),
                    "text": text,
                })

            segment_end = getattr(segment, "end", 0) or 0
            if total_duration:
                progress = int((segment_end / total_duration) * 100)
                if progress == 0 and segment_end:
                    progress = 1
                progress = max(last_progress, min(99, progress))
            else:
                progress = min(99, last_progress + 1)

            text_update = segment_end and (segment_end - last_text_end) >= text_update_seconds
            progress_update = progress > last_progress
            if progress_update or text_update:
                texto_parcial = " ".join(parts).strip() if text_update else None
                _commit_transcription(
                    gravacao,
                    status="processando",
                    progresso=progress if progress_update else last_progress,
                    texto=texto_parcial,
                )
                if progress_update:
                    last_progress = progress
                if text_update:
                    last_text_end = float(segment_end)

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
    except Exception as exc:
        _commit_transcription(
            gravacao,
            status="erro",
            erro=str(exc)[:500],
            progresso=gravacao.transcricao_progresso or 0,
        )
        return False
    finally:
        try:
            _TRANSCRIBE_LOCK.release()
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
    _persist_transcription_segments(gravacao.id, segments_payload)
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
        with _TRANSCRIBE_ACTIVE_LOCK:
            active = _TRANSCRIBE_ACTIVE
        pending = _TRANSCRIBE_QUEUE.qsize()
        max_workers = _get_transcribe_max_workers()
        queued = active >= max_workers or pending > 0
        initial_status = "fila" if queued else "processando"
        _commit_transcription(
            gravacao,
            status=initial_status,
            erro=None,
            modelo=Config.TRANSCRIBE_MODEL,
            progresso=0,
            cancelada=False,
        )

    try:
        app_obj = current_app._get_current_object()
    except Exception:
        app_obj = None

    _ensure_transcribe_workers()

    with _TRANSCRIBE_IN_FLIGHT_LOCK:
        if not force and _TRANSCRIBE_IN_FLIGHT.get(gravacao_id, 0) > 0:
            return True
        _TRANSCRIBE_IN_FLIGHT[gravacao_id] += 1

    _TRANSCRIBE_QUEUE.put({
        "gravacao_id": gravacao_id,
        "force": force,
        "app_obj": app_obj,
    })
    return True


def request_transcription_stop(gravacao_id):
    if not Config.TRANSCRIBE_ENABLED:
        return False
    gravacao = Gravacao.query.get(gravacao_id)
    if not gravacao:
        return False
    if gravacao.transcricao_status not in ("processando", "interrompendo", "fila"):
        return False
    _commit_transcription(
        gravacao,
        status="interrompendo",
        progresso=gravacao.transcricao_progresso or 0,
        cancelada=True,
    )
    return True
