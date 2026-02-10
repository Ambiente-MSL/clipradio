from datetime import datetime, timedelta
import os
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from flask import current_app, has_app_context

from app import db
from config import Config
from models.agendamento import Agendamento
from models.gravacao import Gravacao
from models.radio import Radio
from services.recording_service import start_recording, validate_stream_url
from services.websocket_service import broadcast_update

LOCAL_TZ = ZoneInfo("America/Fortaleza")
scheduler = BackgroundScheduler(
    timezone=LOCAL_TZ,
    job_defaults={"misfire_grace_time": 60, "coalesce": True, "max_instances": 1},
)
_scheduler_app = None


def _capture_scheduler_app(app=None):
    """Captura a instância real do Flask app para uso em jobs do APScheduler."""
    global _scheduler_app
    if app is not None:
        _scheduler_app = app
        return _scheduler_app
    if _scheduler_app is not None:
        return _scheduler_app
    try:
        _scheduler_app = current_app._get_current_object()
    except Exception:
        pass
    return _scheduler_app


def _safe_session_remove(app_obj=None):
    """Remove session com contexto ativo, evitando RuntimeError fora de app context."""
    try:
        if has_app_context():
            db.session.remove()
            return
        if app_obj is None:
            app_obj = _capture_scheduler_app()
        if app_obj:
            with app_obj.app_context():
                db.session.remove()
    except Exception:
        pass

def init_scheduler(app=None):
    """Inicializa o agendador e recarrega agendamentos ativos."""
    _capture_scheduler_app(app)
    if not scheduler.running:
        scheduler.start()
    app_obj = None
    try:
        app_obj = _capture_scheduler_app()
        if not app_obj:
            raise RuntimeError("Flask app não disponível para iniciar o scheduler")

        with app_obj.app_context():
            agendamentos = Agendamento.query.filter_by(status='agendado').all()
            for agendamento in agendamentos:
                schedule_agendamento(agendamento)
            # Job periÛdico para limpar agendamentos travados em execuÓÐo
            scheduler.add_job(
                cleanup_agendamentos_stuck,
                IntervalTrigger(minutes=5),
                id="ag_cleanup",
                replace_existing=True,
            )
            # Job diário para limpar áudio local já arquivado no Dropbox (opcional)
            if app_obj.config.get("DROPBOX_UPLOAD_ENABLED") and (app_obj.config.get("DROPBOX_LOCAL_RETENTION_DAYS") or 0) > 0:
                scheduler.add_job(
                    cleanup_local_audio_archived,
                    CronTrigger(hour=3, minute=30, timezone=LOCAL_TZ),
                    id="dropbox_audio_cleanup",
                    replace_existing=True,
                )
    except Exception as e:
        print(f"Erro ao carregar agendamentos: {e}")
    finally:
        _safe_session_remove(app_obj)


def cleanup_local_audio_archived():
    """
    Remove arquivos locais em storage/audio que já foram arquivados no Dropbox e
    excederam o período de retenção local (DROPBOX_LOCAL_RETENTION_DAYS).

    Para evitar perder dados quando o upload falha, só remove quando existe o marcador:
      <arquivo>.dropbox
    """
    app_obj = _capture_scheduler_app()
    if not app_obj:
        return

    try:
        with app_obj.app_context():
            retention_days = int(app_obj.config.get("DROPBOX_LOCAL_RETENTION_DAYS") or 0)
            if retention_days <= 0:
                return

            storage_path = app_obj.config.get("STORAGE_PATH")
            if not storage_path:
                return
            audio_dir = os.path.join(storage_path, "audio")
            if not os.path.isdir(audio_dir):
                return

            cutoff = datetime.now(tz=LOCAL_TZ) - timedelta(days=retention_days)
            for name in os.listdir(audio_dir):
                if not name or name.endswith(".dropbox"):
                    continue
                file_path = os.path.join(audio_dir, name)
                if not os.path.isfile(file_path):
                    continue
                marker_path = f"{file_path}.dropbox"
                if not os.path.exists(marker_path):
                    continue
                try:
                    mtime = datetime.fromtimestamp(os.path.getmtime(file_path), tz=LOCAL_TZ)
                    if mtime <= cutoff:
                        try:
                            os.remove(file_path)
                        except Exception:
                            pass
                        try:
                            os.remove(marker_path)
                        except Exception:
                            pass
                except Exception:
                    continue
    except Exception as e:
        try:
            print(f"cleanup_local_audio_archived falhou: {e}")
        except Exception:
            pass
    finally:
        _safe_session_remove(app_obj)


def _normalized_run_date(dt):
    if dt.tzinfo:
        return dt.astimezone(LOCAL_TZ)
    return dt.replace(tzinfo=LOCAL_TZ)


def _normalize_cron_day_of_week(dias_semana, *, default_dt=None):
    """
    Normaliza `dias_semana` (ints ou strings PT-BR) para o formato do APScheduler.
    Aceita:
      - int: 0=Domingo .. 6=Sábado (padrão do frontend)
      - str: "dom/seg/ter/qua/qui/sex/sab" ou "sun/mon/..."
    Retorna string tipo "mon,tue,wed".
    """
    if not dias_semana:
        dias_semana = []

    num_to_cron = {0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat"}
    pt_to_cron = {
        "dom": "sun",
        "domingo": "sun",
        "seg": "mon",
        "segunda": "mon",
        "ter": "tue",
        "terça": "tue",
        "terca": "tue",
        "qua": "wed",
        "quarta": "wed",
        "qui": "thu",
        "quinta": "thu",
        "sex": "fri",
        "sexta": "fri",
        "sab": "sat",
        "sábado": "sat",
        "sabado": "sat",
        "sun": "sun",
        "mon": "mon",
        "tue": "tue",
        "wed": "wed",
        "thu": "thu",
        "fri": "fri",
        "sat": "sat",
    }

    normalized = []
    for item in dias_semana:
        if isinstance(item, int):
            mapped = num_to_cron.get(item)
        else:
            value = str(item).strip().lower()
            mapped = num_to_cron.get(int(value)) if value.isdigit() else pt_to_cron.get(value)

        if mapped and mapped not in normalized:
            normalized.append(mapped)

    if not normalized and default_dt is not None:
        weekday_to_cron = {0: "mon", 1: "tue", 2: "wed", 3: "thu", 4: "fri", 5: "sat", 6: "sun"}
        mapped = weekday_to_cron.get(default_dt.weekday())
        if mapped:
            normalized = [mapped]

    return ",".join(normalized)


def _next_status_after_run(agendamento):
    """Determina status pÛs-execuÓÐo (reagendar recorrentes, concluir Ûnicos)."""
    if not agendamento:
        return "concluido"
    return "agendado" if agendamento.tipo_recorrencia != "none" else "concluido"


def cleanup_agendamentos_stuck():
    """
    Marca agendamentos travados em 'em_execucao' como concluÌdo/agendado
    quando o hor·rio previsto j· passou (evita ficar eternamente 'Gravando').
    """
    app_obj = _capture_scheduler_app()
    if not app_obj:
        return

    try:
        with app_obj.app_context():
            now = datetime.now(tz=LOCAL_TZ).replace(tzinfo=None)
            stuck = Agendamento.query.filter_by(status="em_execucao").all()
            atualizados = []
            for ag in stuck:
                duracao = ag.duracao_minutos or 0
                fim_previsto = (ag.data_inicio or now) + timedelta(minutes=duracao, seconds=60)
                if fim_previsto <= now:
                    ag.status = _next_status_after_run(ag)
                    atualizados.append(ag)

            if atualizados:
                db.session.commit()
                for ag in atualizados:
                    broadcast_update(f"user_{ag.user_id}", "agendamento_updated", ag.to_dict())
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            print(f"cleanup_agendamentos_stuck falhou: {e}")
        except Exception:
            pass
    finally:
        _safe_session_remove(app_obj)


def unschedule_agendamento(agendamento_id):
    """Remove job existente, se houver."""
    try:
        scheduler.remove_job(f"ag_{agendamento_id}")
    except Exception:
        pass


def schedule_agendamento(agendamento):
    """Agenda uma gravação (removendo job anterior se existir)."""
    _capture_scheduler_app()
    if not scheduler.running:
        scheduler.start()
    unschedule_agendamento(agendamento.id)

    run_date = _normalized_run_date(agendamento.data_inicio)

    if agendamento.tipo_recorrencia == 'none':
        scheduler.add_job(
            execute_agendamento,
            DateTrigger(run_date=run_date),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
            replace_existing=True,
        )
    elif agendamento.tipo_recorrencia == 'daily':
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(hour=run_date.hour, minute=run_date.minute, timezone=LOCAL_TZ),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
            replace_existing=True,
        )
    elif agendamento.tipo_recorrencia == 'weekly':
        day_of_week = _normalize_cron_day_of_week(agendamento.get_dias_semana_list(), default_dt=run_date)
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day_of_week=day_of_week, hour=run_date.hour, minute=run_date.minute, timezone=LOCAL_TZ),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
            replace_existing=True,
        )
    elif agendamento.tipo_recorrencia == 'monthly':
        scheduler.add_job(
            execute_agendamento,
            CronTrigger(day=run_date.day, hour=run_date.hour, minute=run_date.minute, timezone=LOCAL_TZ),
            id=f"ag_{agendamento.id}",
            args=[agendamento.id],
            replace_existing=True,
        )


def execute_agendamento(agendamento_id):
    """Executa um agendamento e controla status/gravação."""
    app_obj = _capture_scheduler_app()
    if not app_obj:
        print(f"Erro: Flask app indisponível para executar agendamento {agendamento_id}")
        return

    try:
        with app_obj.app_context():
            agendamento = Agendamento.query.get(agendamento_id)
            if not agendamento or agendamento.status != 'agendado':
                return

            if Config.STREAM_VALIDATE_ON_EXECUTE:
                radio = Radio.query.get(agendamento.radio_id)
                if not radio or not radio.stream_url:
                    agendamento.status = 'erro'
                    db.session.commit()
                    broadcast_update(f"user_{agendamento.user_id}", "agendamento_updated", agendamento.to_dict())
                    unschedule_agendamento(agendamento.id)
                    return
                ok, reason = validate_stream_url(
                    radio.stream_url,
                    timeout_seconds=Config.STREAM_VALIDATE_TIMEOUT_SECONDS,
                )
                if not ok:
                    agendamento.status = 'erro'
                    db.session.commit()
                    broadcast_update(f"user_{agendamento.user_id}", "agendamento_updated", agendamento.to_dict())
                    try:
                        current_app.logger.error(
                            f"Agendamento {agendamento.id} falhou ao validar stream: {reason}"
                        )
                    except Exception:
                        pass
                    unschedule_agendamento(agendamento.id)
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

            next_status = _next_status_after_run(agendamento)
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
            # Fallback para nao ficar travado em "em_execucao"/"Gravando"
            if agendamento.status == 'em_execucao':
                agendamento.status = next_status
                db.session.commit()
                broadcast_update(f"user_{agendamento.user_id}", "agendamento_updated", agendamento.to_dict())

            if agendamento.tipo_recorrencia == 'none':
                unschedule_agendamento(agendamento.id)
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            current_app.logger.exception(f"Erro ao executar agendamento {agendamento_id}: {e}")
        except Exception:
            pass
    finally:
        _safe_session_remove(app_obj)
