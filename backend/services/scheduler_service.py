from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from zoneinfo import ZoneInfo

from flask import current_app

from app import db
from models.agendamento import Agendamento
from models.gravacao import Gravacao
from services.recording_service import start_recording
from services.websocket_service import broadcast_update

LOCAL_TZ = ZoneInfo("America/Fortaleza")
scheduler = BackgroundScheduler(timezone=LOCAL_TZ)

def init_scheduler():
    """Inicializa o agendador e recarrega agendamentos ativos."""
    scheduler.start()
    try:
        with current_app.app_context():
            agendamentos = Agendamento.query.filter_by(status='agendado').all()
            for agendamento in agendamentos:
                schedule_agendamento(agendamento)
    except Exception as e:
        print(f"Erro ao carregar agendamentos: {e}")


def _normalized_run_date(dt):
    if dt.tzinfo:
        return dt.astimezone(LOCAL_TZ)
    return dt.replace(tzinfo=LOCAL_TZ)


def unschedule_agendamento(agendamento_id):
    """Remove job existente, se houver."""
    try:
        scheduler.remove_job(f"ag_{agendamento_id}")
    except Exception:
        pass


def schedule_agendamento(agendamento):
    """Agenda uma gravação (removendo job anterior se existir)."""
    unschedule_agendamento(agendamento.id)

    run_date = _normalized_run_date(agendamento.data_inicio)

    if agendamento.tipo_recorrencia == 'none':
        scheduler.add_job(
            execute_agendamento,
            DateTrigger(run_date=run_date),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
        )
    elif agendamento.tipo_recorrencia == 'daily':
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(hour=run_date.hour, minute=run_date.minute),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
        )
    elif agendamento.tipo_recorrencia == 'weekly':
        dias_map = {'dom': 0, 'seg': 1, 'ter': 2, 'qua': 3, 'qui': 4, 'sex': 5, 'sab': 6}
        dias_semana = [dias_map.get(d.lower(), 0) for d in agendamento.get_dias_semana_list()]
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day_of_week=','.join(map(str, dias_semana)), hour=run_date.hour, minute=run_date.minute),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
        )
    elif agendamento.tipo_recorrencia == 'monthly':
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day=run_date.day, hour=run_date.hour, minute=run_date.minute),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
        )


def execute_agendamento(agendamento_id):
    """Executa um agendamento e controla status/gravação."""
    with current_app.app_context():
        agendamento = Agendamento.query.get(agendamento_id)
        if not agendamento or agendamento.status != 'agendado':
            return

        gravacao = Gravacao(
            user_id=agendamento.user_id,
            radio_id=agendamento.radio_id,
            status='iniciando',
            tipo='agendado',
            duracao_minutos=agendamento.duracao_minutos,
        )
        db.session.add(gravacao)
        db.session.commit()

        agendamento.status = 'em_execucao'
        db.session.commit()
        broadcast_update(f"user_{agendamento.user_id}", "agendamento_updated", agendamento.to_dict())

        try:
            # Bloqueia até terminar; recording_service finaliza status e atualiza gravação/arquivo
            start_recording(
                gravacao,
                duration_seconds=agendamento.duracao_minutos * 60,
                agendamento=agendamento,
                block=True,
            )
        except Exception:
            agendamento.status = 'erro'
            gravacao.status = 'erro'
            db.session.commit()
            broadcast_update(f"user_{agendamento.user_id}", "agendamento_updated", agendamento.to_dict())
            broadcast_update(f"user_{agendamento.user_id}", "gravacao_updated", gravacao.to_dict())

        if agendamento.tipo_recorrencia == 'none':
            unschedule_agendamento(agendamento.id)
