import os
import subprocess
import threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict

import requests

from flask import current_app, has_app_context
from app import db
from config import Config
from models.gravacao import Gravacao
from models.radio import Radio
from services.websocket_service import broadcast_update

LOCAL_TZ = ZoneInfo("America/Fortaleza")
MIN_RECORD_SECONDS = 10  # evita gravação zero em caso de input faltando
ALLOWED_BITRATES = {96, 128}
ALLOWED_FORMATS = {'mp3', 'opus'}
ALLOWED_AUDIO_MODES = {'mono', 'stereo'}
ACTIVE_PROCESSES: Dict[str, subprocess.Popen] = {}

def _safe_session_remove(app_obj=None):
    """Fecha a sessão do SQLAlchemy com contexto ativo."""
    try:
        if has_app_context():
            db.session.remove()
            return
        if app_obj is not None:
            with app_obj.app_context():
                db.session.remove()
    except Exception:
        pass


def _validate_stream_url_http(stream_url, timeout_seconds):
    timeout = max(2, int(timeout_seconds or 8))
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Icy-MetaData": "1",
        "Accept": "*/*",
    }
    try:
        with requests.get(
            stream_url,
            headers=headers,
            stream=True,
            timeout=(timeout, timeout),
            allow_redirects=True,
        ) as resp:
            if resp.status_code >= 400:
                return False, f"HTTP {resp.status_code}"

            content_type = (resp.headers.get("Content-Type") or "").lower()
            is_html = "text/html" in content_type or "application/xhtml+xml" in content_type
            is_audio = "audio/" in content_type
            is_playlist = "mpegurl" in content_type

            first_chunk = b""
            for chunk in resp.iter_content(chunk_size=4096):
                if chunk:
                    first_chunk = chunk
                    break

            if not first_chunk:
                return False, "no data received"

            snippet = first_chunk[:200].lower()
            if is_html and (b"<html" in snippet or b"<!doctype html" in snippet):
                return False, "html response"

            if is_audio or is_playlist:
                return True, None

            if b"#extm3u" in snippet or b"[playlist]" in snippet:
                return True, None

            return True, None
    except requests.RequestException as exc:
        return False, str(exc)


def validate_stream_url(stream_url, *, timeout_seconds=None):
    if not stream_url:
        return False, "stream_url missing"
    timeout = max(2, int(timeout_seconds or Config.STREAM_VALIDATE_TIMEOUT_SECONDS or 8))
    rw_timeout = str(timeout * 1000000)
    cmd = ["ffprobe", "-hide_banner", "-loglevel", "error"]
    if str(stream_url).lower().startswith(("http://", "https://")):
        cmd += ["-user_agent", "Mozilla/5.0"]
    cmd += [
        "-rw_timeout",
        rw_timeout,
        "-i",
        stream_url,
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
    ]
    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout + 2,
        )
    except FileNotFoundError:
        return _validate_stream_url_http(stream_url, timeout)
    except subprocess.TimeoutExpired:
        return False, "timeout"

    if result.returncode != 0:
        err = result.stderr.decode(errors="ignore").strip()
        if err:
            err = err.splitlines()[-1]
            err = err[:200]
        if str(stream_url).lower().startswith(("http://", "https://")):
            http_ok, http_reason = _validate_stream_url_http(stream_url, timeout)
            if http_ok:
                return True, None
            return False, http_reason or err or "stream unavailable"
        return False, err or "stream unavailable"

    return True, None


def _get_audio_filepath(gravacao):
    """Retorna o caminho absoluto do arquivo de áudio associado, se houver."""
    if not gravacao:
        return None
    filename = gravacao.arquivo_nome
    if not filename and getattr(gravacao, "arquivo_url", None):
        filename = gravacao.arquivo_url.rsplit("/", 1)[-1]
    if not filename:
        return None
    return os.path.join(Config.STORAGE_PATH, "audio", filename)


def _probe_duration_seconds(filepath):
    """Obtém duração real via ffprobe; retorna None se falhar."""
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


def _file_size_mb(filepath):
    """Obtém tamanho do arquivo em MB (duas casas)."""
    if not filepath or not os.path.exists(filepath):
        return None
    try:
        return round(os.path.getsize(filepath) / (1024 * 1024), 2)
    except Exception:
        return None


def hydrate_gravacao_metadata(gravacao, *, autocommit=False, check_files=True):
    """
    Garante que duração, tamanho e status estejam consistentes com o arquivo físico.
    - Lê o arquivo em disco (se existir) para preencher duracao_segundos/minutos e tamanho_mb.
    - Se o tempo previsto já passou e ainda está marcado como gravando/iniciando, marca como concluído.
    - check_files=False evita I/O de disco/ffprobe (útil para listas/estatísticas).
    Retorna o objeto (já ajustado).
    """
    if not gravacao:
        return gravacao

    changed = False
    filepath = _get_audio_filepath(gravacao)

    # Tamanho real
    if check_files:
        size_mb = _file_size_mb(filepath)
        if size_mb is not None and (gravacao.tamanho_mb or 0) != size_mb:
            gravacao.tamanho_mb = size_mb
            changed = True

    # Duração real (evita ffprobe se já existe duração salva)
    real_duration = None
    if check_files and (gravacao.duracao_segundos or 0) <= 0:
        real_duration = _probe_duration_seconds(filepath)
        if real_duration:
            gravacao.duracao_segundos = real_duration
            gravacao.duracao_minutos = max(1, round(real_duration / 60))
            changed = True

    # Atualizar status automaticamente se o tempo previsto já passou
    expected_duration = gravacao.duracao_segundos or (
        (gravacao.duracao_minutos or 0) * 60
    )
    if expected_duration <= 0:
        expected_duration = MIN_RECORD_SECONDS
    if gravacao.criado_em and gravacao.status in ("iniciando", "gravando"):
        try:
            expected_end = gravacao.criado_em + timedelta(seconds=expected_duration + 5)
            now = datetime.now(tz=gravacao.criado_em.tzinfo or LOCAL_TZ)
            if now >= expected_end:
                gravacao.status = "concluido"
                changed = True
        except Exception:
            pass

    if autocommit and changed:
        db.session.commit()

    return gravacao


def _finalizar_gravacao(gravacao, status, filepath=None, duration_seconds=None, agendamento=None):
    """Atualiza status, tamanhos e emite broadcast."""
    try:
        file_size = _file_size_mb(filepath)
        if file_size is not None:
            gravacao.tamanho_mb = file_size
    except Exception:
        pass

    # Preferir duração real do arquivo, se existir
    real_duration = _probe_duration_seconds(filepath) or duration_seconds
    if real_duration:
        gravacao.duracao_segundos = real_duration
        gravacao.duracao_minutos = max(1, round(real_duration / 60))

    gravacao.status = status
    if agendamento:
        # Recorrentes voltam para 'agendado' após concluir; Únicos ficam 'concluido'
        if status == 'concluido' and getattr(agendamento, 'tipo_recorrencia', 'none') != 'none':
            agendamento.status = 'agendado'
        else:
            agendamento.status = status if status in ('concluido', 'erro') else agendamento.status

    db.session.commit()

    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_updated', gravacao.to_dict())
    if agendamento:
        broadcast_update(f'user_{gravacao.user_id}', 'agendamento_updated', agendamento.to_dict())

    # Iniciar transcricao local apos concluir a gravacao.
    try:
        if status == 'concluido' and Config.TRANSCRIBE_ENABLED:
            from services.transcription_service import start_transcription
            start_transcription(gravacao.id)
    except Exception as exc:
        try:
            current_app.logger.exception(f"Falha ao iniciar transcricao: {exc}")
        except Exception:
            pass

    # Arquivar para Dropbox (opcional). Mantém URLs iguais (/api/files/audio/<arquivo>)
    try:
        if status == 'concluido':
            from services.dropbox_service import build_audio_destination, get_dropbox_config, upload_file

            dropbox_cfg = get_dropbox_config()
            if dropbox_cfg.is_ready and filepath and os.path.exists(filepath):
                radio_obj = None
                try:
                    radio_obj = Radio.query.get(gravacao.radio_id)
                except Exception:
                    radio_obj = None

                remote_path, remote_name = build_audio_destination(
                    gravacao,
                    radio=radio_obj,
                    original_filename=os.path.basename(filepath),
                    base_path=dropbox_cfg.audio_path,
                )
                upload_file(filepath, remote_path, token=dropbox_cfg.access_token)

                should_delete_local = dropbox_cfg.delete_local_after_upload and dropbox_cfg.local_retention_days <= 0
                if Config.TRANSCRIBE_ENABLED and gravacao.transcricao_status != 'concluido':
                    should_delete_local = False

                if not should_delete_local:
                    try:
                        marker_path = f"{filepath}.dropbox"
                        with open(marker_path, "w", encoding="utf-8") as fp:
                            fp.write(remote_path)
                    except Exception:
                        pass

                if dropbox_cfg.audio_layout == "hierarchy" and remote_name:
                    can_update_db = not (Config.TRANSCRIBE_ENABLED and gravacao.transcricao_status != 'concluido')
                    if can_update_db and gravacao.arquivo_nome != remote_name:
                        gravacao.arquivo_nome = remote_name
                        gravacao.arquivo_url = f"/api/files/audio/{remote_name}"
                        try:
                            db.session.commit()
                        except Exception:
                            db.session.rollback()

                if should_delete_local:
                    try:
                        os.remove(filepath)
                    except Exception:
                        pass
    except Exception as exc:
        try:
            current_app.logger.exception(f"Falha ao arquivar gravação no Dropbox: {exc}")
        except Exception:
            pass


def start_recording(gravacao, *, duration_seconds=None, agendamento=None, block=False):
    """Inicia gravação de um stream de rádio.

    Params:
        gravacao: instancia da gravação já persistida
        duration_seconds: duração em segundos (fallback para gravacao.duracao_minutos)
        agendamento: instancia de agendamento para atualizar status, se houver
        block: se True, aguarda término do ffmpeg antes de retornar
    """
    radio = Radio.query.get(gravacao.radio_id)
    if not radio or not radio.stream_url:
        raise ValueError("Radio not found or stream_url missing")

    try:
        bitrate_kbps = int(getattr(radio, 'bitrate_kbps', 128))
    except Exception:
        bitrate_kbps = 128
    if bitrate_kbps not in ALLOWED_BITRATES:
        bitrate_kbps = 128

    output_format = (getattr(radio, 'output_format', 'mp3') or 'mp3').lower()
    if output_format not in ALLOWED_FORMATS:
        output_format = 'mp3'

    audio_mode = (getattr(radio, 'audio_mode', 'stereo') or 'stereo').lower()
    if audio_mode not in ALLOWED_AUDIO_MODES:
        audio_mode = 'stereo'
    channels = 1 if audio_mode == 'mono' else 2

    os.makedirs(os.path.join(Config.STORAGE_PATH, 'audio'), exist_ok=True)

    # Definir duração com fallback seguro (evita ficar gravando indefinidamente)
    duration_seconds = duration_seconds or gravacao.duracao_segundos or (
        gravacao.duracao_minutos * 60 if gravacao.duracao_minutos else 0
    )
    try:
        duration_seconds = int(duration_seconds)
    except Exception:
        duration_seconds = 0
    if duration_seconds <= 0:
        duration_seconds = 300  # 5min padrão se nada informado
    duration_seconds = max(MIN_RECORD_SECONDS, duration_seconds)

    # Guardar duração planejada para cálculo de status e exibição
    gravacao.duracao_segundos = duration_seconds
    gravacao.duracao_minutos = max(1, round(duration_seconds / 60))

    timestamp = datetime.now(tz=LOCAL_TZ).strftime('%Y%m%d_%H%M%S')
    filename = f"{gravacao.id}_{timestamp}.{output_format}"
    filepath = os.path.join(Config.STORAGE_PATH, 'audio', filename)

    gravacao.status = 'gravando'
    gravacao.arquivo_nome = filename
    gravacao.arquivo_url = f"/api/files/audio/{filename}"
    db.session.commit()

    # Guardar stderr para inspecionar falhas do ffmpeg (evita arquivo 0 bytes silencioso)
    ffmpeg_process = None
    try:
        stream_url = radio.stream_url
        ffmpeg_cmd = [
            'ffmpeg',
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-y',
        ]
        if Config.FFMPEG_THREADS and Config.FFMPEG_THREADS > 0:
            ffmpeg_cmd += ['-threads', str(Config.FFMPEG_THREADS)]
        if str(stream_url).lower().startswith(('http://', 'https://')):
            ffmpeg_cmd += [
                '-reconnect',
                '1',
                '-reconnect_streamed',
                '1',
                '-reconnect_delay_max',
                '5',
                '-user_agent',
                'Mozilla/5.0',
            ]
        ffmpeg_cmd += [
            '-i',
            stream_url,
            '-t',
            str(duration_seconds),
        ]

        ffmpeg_cmd += ['-ac', str(channels)]
        if output_format == 'opus':
            ffmpeg_cmd += ['-c:a', 'libopus', '-b:a', f'{bitrate_kbps}k', '-vbr', 'on']
        else:
            ffmpeg_cmd += ['-acodec', 'libmp3lame', '-b:a', f'{bitrate_kbps}k']

        ffmpeg_cmd.append(filepath)

        ffmpeg_process = subprocess.Popen(
            ffmpeg_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        ACTIVE_PROCESSES[gravacao.id] = ffmpeg_process
    except Exception as exc:
        _finalizar_gravacao(gravacao, 'erro', filepath, duration_seconds, agendamento)
        raise exc

    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_started', gravacao.to_dict())

    try:
        app_obj = current_app._get_current_object()
    except Exception:
        app_obj = None

    def wait_and_finalize():
        if app_obj:
            ctx = app_obj.app_context()
            ctx.push()
        else:
            ctx = None
        try:
            # Timeout de segurança: duração solicitada + 20s
            try:
                return_code = ffmpeg_process.wait(timeout=duration_seconds + 20)
                timed_out = False
            except subprocess.TimeoutExpired:
                ffmpeg_process.terminate()
                return_code = -1
                timed_out = True
            stderr_output = b''
            try:
                if ffmpeg_process.stderr:
                    stderr_output = ffmpeg_process.stderr.read()
            except Exception:
                pass

            file_exists = filepath and os.path.exists(filepath)
            file_size = os.path.getsize(filepath) if file_exists else 0
            real_duration = _probe_duration_seconds(filepath)
            min_seconds = min(duration_seconds, MIN_RECORD_SECONDS)
            expected_bytes = int((bitrate_kbps * 1000 / 8) * min_seconds)
            min_ok_bytes = max(8 * 1024, int(expected_bytes * 0.1))
            duration_ok = real_duration is not None and real_duration >= MIN_RECORD_SECONDS
            file_ok = file_exists and (duration_ok or (real_duration is None and file_size >= min_ok_bytes))

            if return_code == 0 and file_ok:
                _finalizar_gravacao(gravacao, 'concluido', filepath, duration_seconds, agendamento)
            else:
                # Logar erro para depurar streams que nÇ¬o gravam
                msg = (
                    f"ffmpeg failed for gravacao {gravacao.id} "
                    f"(return_code={return_code}, exists={file_exists}, size={file_size}, "
                    f"duration={real_duration}, timed_out={timed_out})"
                )
                try:
                    if stderr_output:
                        msg += f" stderr={stderr_output.decode(errors='ignore')[:2000]}"
                    current_app.logger.error(msg)
                except Exception:
                    pass
                _finalizar_gravacao(gravacao, 'erro', filepath, duration_seconds, agendamento)
        except Exception:
            _finalizar_gravacao(gravacao, 'erro', filepath, duration_seconds, agendamento)
        finally:
            ACTIVE_PROCESSES.pop(gravacao.id, None)
            if ctx:
                ctx.pop()
            _safe_session_remove(app_obj)

    if block:
        wait_and_finalize()
    else:
        threading.Thread(target=wait_and_finalize, daemon=True).start()

    return ffmpeg_process


def stop_recording(gravacao):
    """Para gravação em andamento manualmente."""
    filepath = _get_audio_filepath(gravacao)

    proc = ACTIVE_PROCESSES.pop(gravacao.id, None)
    if proc:
        try:
            proc.terminate()
        except Exception:
            pass

    _finalizar_gravacao(gravacao, 'concluido', filepath=filepath)



def process_audio_with_ai(gravacao, palavras_chave):
    """Processa áudio com IA para gerar clipes"""
    from models.clip import Clip
    
    # Atualizar status
    gravacao.status = 'processando'
    db.session.commit()
    
    # Exemplo: criar clipes baseados em palavras-chave
    clips = []
    for palavra in palavras_chave:
        # Mock: criar clipe de exemplo
        clip = Clip(
            gravacao_id=gravacao.id,
            palavra_chave=palavra,
            inicio_segundos=0,
            fim_segundos=30,
            arquivo_url=None  # Será gerado pelo processamento
        )
        db.session.add(clip)
        clips.append(clip)
    
    db.session.commit()
    
    gravacao.status = 'concluido'
    db.session.commit()
    
    # Broadcast update
    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_processed', {
        'gravacao': gravacao.to_dict(),
        'clips': [c.to_dict() for c in clips]
    })
    
    return {'clips_created': len(clips)}
