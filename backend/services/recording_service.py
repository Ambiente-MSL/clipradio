import os
import subprocess
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from flask import current_app

from app import db
from config import Config
from models.gravacao import Gravacao
from models.radio import Radio
from services.websocket_service import broadcast_update

LOCAL_TZ = ZoneInfo("America/Fortaleza")


def _finalizar_gravacao(gravacao, status, filepath=None, duration_seconds=None, agendamento=None):
    """Atualiza status, tamanhos e emite broadcast."""
    try:
        if filepath and os.path.exists(filepath):
            gravacao.tamanho_mb = round(os.path.getsize(filepath) / (1024 * 1024), 2)
    except Exception:
        pass

    if duration_seconds:
        gravacao.duracao_segundos = duration_seconds
        gravacao.duracao_minutos = max(1, round(duration_seconds / 60))

    gravacao.status = status
    if agendamento:
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

    os.makedirs(os.path.join(Config.STORAGE_PATH, 'audio'), exist_ok=True)

    duration_seconds = duration_seconds or (gravacao.duracao_minutos * 60 if gravacao.duracao_minutos else 3600)

    timestamp = datetime.now(tz=LOCAL_TZ).strftime('%Y%m%d_%H%M%S')
    filename = f"{gravacao.id}_{timestamp}.mp3"
    filepath = os.path.join(Config.STORAGE_PATH, 'audio', filename)

    gravacao.status = 'gravando'
    gravacao.arquivo_nome = filename
    gravacao.arquivo_url = f"/api/files/audio/{filename}"
    db.session.commit()

    try:
        process = subprocess.Popen(
            [
                'ffmpeg',
                '-nostdin',
                '-y',
                '-i',
                radio.stream_url,
                '-t',
                str(duration_seconds),
                '-acodec',
                'libmp3lame',
                '-b:a',
                '128k',
                filepath,
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
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
            return_code = process.wait()
            if return_code == 0 and os.path.exists(filepath):
                _finalizar_gravacao(gravacao, 'concluido', filepath, duration_seconds, agendamento)
            else:
                _finalizar_gravacao(gravacao, 'erro', filepath, duration_seconds, agendamento)
        except Exception:
            _finalizar_gravacao(gravacao, 'erro', filepath, duration_seconds, agendamento)
        finally:
            if ctx:
                ctx.pop()

    if block:
        wait_and_finalize()
    else:
        threading.Thread(target=wait_and_finalize, daemon=True).start()

    return process


def stop_recording(gravacao):
    """Para gravação em andamento manualmente."""
    _finalizar_gravacao(gravacao, 'concluido')

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
