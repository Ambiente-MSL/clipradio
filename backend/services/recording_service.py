import os
import subprocess
import threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict

from flask import current_app
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


def hydrate_gravacao_metadata(gravacao, *, autocommit=False):
    """
    Garante que duração, tamanho e status estejam consistentes com o arquivo físico.
    - Lê o arquivo em disco (se existir) para preencher duracao_segundos/minutos e tamanho_mb.
    - Se o tempo previsto já passou e ainda está marcado como gravando/iniciando, marca como concluído.
    Retorna o objeto (já ajustado).
    """
    if not gravacao:
        return gravacao

    changed = False
    filepath = _get_audio_filepath(gravacao)

    # Tamanho real
    size_mb = _file_size_mb(filepath)
    if size_mb is not None and (gravacao.tamanho_mb or 0) != size_mb:
        gravacao.tamanho_mb = size_mb
        changed = True

    # Duração real
    real_duration = _probe_duration_seconds(filepath)
    if real_duration:
        if (gravacao.duracao_segundos or 0) != real_duration:
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
        # Recorrentes voltam para 'agendado' apÛs concluir; Ûnicos ficam 'concluido'
        if status == 'concluido' and getattr(agendamento, 'tipo_recorrencia', 'none') != 'none':
            agendamento.status = 'agendado'
        else:
            agendamento.status = status if status in ('concluido', 'erro') else agendamento.status

    db.session.commit()

    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_updated', gravacao.to_dict())
    if agendamento:
        broadcast_update(f'user_{gravacao.user_id}', 'agendamento_updated', agendamento.to_dict())


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
        ffmpeg_cmd = [
            'ffmpeg',
            '-nostdin',
            '-y',
            '-i',
            radio.stream_url,
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
            min_ok_bytes = 1024  # ~1KB para considerar arquivo válido
            file_ok = file_exists and file_size >= min_ok_bytes

            if return_code == 0 and file_ok:
                _finalizar_gravacao(gravacao, 'concluido', filepath, duration_seconds, agendamento)
            else:
                # Logar erro para depurar streams que nÇ¬o gravam
                msg = (
                    f"ffmpeg failed for gravacao {gravacao.id} "
                    f"(return_code={return_code}, exists={file_exists}, size={file_size}, timed_out={timed_out})"
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

    if block:
        wait_and_finalize()
    else:
        threading.Thread(target=wait_and_finalize, daemon=True).start()

    return ffmpeg_process


def stop_recording(gravacao):
    """Para grava??o em andamento manualmente."""
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
    
    # Aqui você implementaria a lógica de processamento com IA
    # Por enquanto, retornamos uma resposta mock
    
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
