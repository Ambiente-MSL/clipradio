from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from flask import current_app
from app import db
from models.agendamento import Agendamento
from models.gravacao import Gravacao
from datetime import datetime
from zoneinfo import ZoneInfo
from services.recording_service import start_recording

LOCAL_TZ = ZoneInfo("America/Fortaleza")
scheduler = BackgroundScheduler(timezone=LOCAL_TZ)

def init_scheduler():
    """Inicializa o agendador"""
    scheduler.start()
    try:
        with current_app.app_context():
            # Carregar agendamentos ativos
            agendamentos = Agendamento.query.filter_by(status='agendado').all()
            for agendamento in agendamentos:
                schedule_agendamento(agendamento)
    except Exception as e:
        print(f"Erro ao carregar agendamentos: {e}")
        # Scheduler continua rodando, agendamentos serão carregados depois

def schedule_agendamento(agendamento):
    """Agenda uma gravação"""
    if agendamento.tipo_recorrencia == 'none':
        # Gravação única
        scheduler.add_job(
            execute_agendamento,
            DateTrigger(run_date=agendamento.data_inicio),
            id=f'ag_{agendamento.id}',
            args=[agendamento.id]
        )
    elif agendamento.tipo_recorrencia == 'daily':
        # Diário
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(hour=agendamento.data_inicio.hour, minute=agendamento.data_inicio.minute),
            id=f'ag_{agendamento.id}',
            args=[agendamento.id]
        )
    elif agendamento.tipo_recorrencia == 'weekly':
        # Semanal
        dias_map = {'dom': 0, 'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5, 'sab': 6}
        dias_semana = [dias_map.get(d.lower(), 0) for d in agendamento.get_dias_semana_list()]
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day_of_week=','.join(map(str, dias_semana)), 
                       hour=agendamento.data_inicio.hour, 
                       minute=agendamento.data_inicio.minute),
            id=f'ag_{agendamento.id}',
            args=[agendamento.id]
        )
    elif agendamento.tipo_recorrencia == 'monthly':
        # Mensal
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day=agendamento.data_inicio.day,
                       hour=agendamento.data_inicio.hour,
                       minute=agendamento.data_inicio.minute),
            id=f'ag_{agendamento.id}',
            args=[agendamento.id]
        )

def execute_agendamento(agendamento_id):
    """Executa um agendamento"""
    with current_app.app_context():
        agendamento = Agendamento.query.get(agendamento_id)
        if not agendamento or agendamento.status != 'agendado':
            return
        
        # Criar gravação
        gravacao = Gravacao(
            user_id=agendamento.user_id,
            radio_id=agendamento.radio_id,
            status='iniciando',
            tipo='agendado',
            duracao_minutos=agendamento.duracao_minutos
        )
        db.session.add(gravacao)
        db.session.commit()
        
        # Atualizar status do agendamento
        agendamento.status = 'em_execucao'
        db.session.commit()
        
        # Iniciar gravação
        try:
            start_recording(gravacao)
        except Exception as e:
            agendamento.status = 'erro'
            gravacao.status = 'erro'
            db.session.commit()
        
        # Se não for recorrente, marcar como concluído
        if agendamento.tipo_recorrencia == 'none':
            agendamento.status = 'concluido'
            db.session.commit()
