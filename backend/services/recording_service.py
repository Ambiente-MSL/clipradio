from app import db
from models.gravacao import Gravacao
from models.radio import Radio
from services.websocket_service import broadcast_update
import subprocess
import os
from config import Config
from datetime import datetime
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("America/Fortaleza")

def start_recording(gravacao):
    """Inicia gravação de um stream de rádio"""
    radio = Radio.query.get(gravacao.radio_id)
    if not radio or not radio.stream_url:
        raise ValueError("Radio not found or stream_url missing")
    
    # Garantir diretório
    os.makedirs(os.path.join(Config.STORAGE_PATH, 'audio'), exist_ok=True)

    # Atualizar status
    gravacao.status = 'gravando'
    db.session.commit()
    
    # Gerar nome do arquivo (timestamp no fuso local)
    timestamp = datetime.now(tz=LOCAL_TZ).strftime('%Y%m%d_%H%M%S')
    filename = f"{gravacao.id}_{timestamp}.mp3"
    filepath = os.path.join(Config.STORAGE_PATH, 'audio', filename)
    
    # Iniciar gravação com ffmpeg (em background)
    duration_seconds = gravacao.duracao_minutos * 60 if gravacao.duracao_minutos else 3600
    
    try:
        process = subprocess.Popen(
            [
                'ffmpeg',
                '-nostdin',
                '-y',
                '-i', radio.stream_url,
                '-t', str(duration_seconds),
                '-acodec', 'libmp3lame',
                '-b:a', '128k',
                filepath
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except Exception as e:
        gravacao.status = 'erro'
        db.session.commit()
        raise e
    
    # Atualizar gravacao com informações do arquivo
    gravacao.arquivo_nome = filename
    gravacao.arquivo_url = f"/api/files/audio/{filename}"
    db.session.commit()
    
    # Broadcast update
    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_started', gravacao.to_dict())
    
    return process

def stop_recording(gravacao):
    """Para gravação em andamento"""
    gravacao.status = 'concluido'
    db.session.commit()
    
    # Broadcast update
    broadcast_update(f'user_{gravacao.user_id}', 'gravacao_stopped', gravacao.to_dict())

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
