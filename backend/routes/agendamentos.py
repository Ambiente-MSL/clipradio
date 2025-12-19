from flask import Blueprint, request, jsonify, Response
from app import db
from models.agendamento import Agendamento
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import csv
import io
from datetime import datetime as dt_mod
from services.scheduler_service import schedule_agendamento, unschedule_agendamento

LOCAL_TZ = ZoneInfo("America/Fortaleza")


def parse_datetime_local(dt_value):
    """Converte string ISO ou datetime para datetime ingênuo no fuso de Fortaleza."""
    if isinstance(dt_value, str):
        # Suporta "Z" (UTC) ou offset explícito; se vier sem offset, assume já ser local
        value = dt_value.replace('Z', '+00:00')
        dt_obj = datetime.fromisoformat(value)
    else:
        dt_obj = dt_value

    if dt_obj.tzinfo:
        dt_local = dt_obj.astimezone(LOCAL_TZ)
    else:
        # Assume que já é horário local se vier sem tzinfo
        dt_local = dt_obj.replace(tzinfo=LOCAL_TZ)

    # Remover tzinfo antes de salvar no banco (coluna sem timezone), mas mantendo horário local correto
    return dt_local.replace(tzinfo=None)

bp = Blueprint('agendamentos', __name__)

def get_user_id():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token)
    return payload['user_id'] if payload else None


def _agendamento_to_row(agendamento):
    """Dados básicos para exportar relatórios."""
    radio_nome = getattr(agendamento.radio, 'nome', '') if hasattr(agendamento, 'radio') else ''
    return {
        'id': agendamento.id,
        'radio': radio_nome,
        'data_inicio': agendamento.data_inicio.isoformat() if agendamento.data_inicio else '',
        'duracao_minutos': agendamento.duracao_minutos,
        'tipo_recorrencia': agendamento.tipo_recorrencia,
        'dias_semana': ','.join(str(dia) for dia in (agendamento.get_dias_semana_list() or [])),
        'status': agendamento.status,
        'criado_em': agendamento.criado_em.isoformat() if agendamento.criado_em else '',
    }


def _generate_csv(rows):
    output = io.StringIO()
    fieldnames = ['id', 'radio', 'data_inicio', 'duracao_minutos', 'tipo_recorrencia', 'dias_semana', 'status', 'criado_em']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    data = output.getvalue()
    output.close()
    return data


def _escape_pdf_text(text):
    return str(text).replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _generate_pdf(rows, start_date=None, end_date=None):
    """Gera PDF simples com colunas alinhadas (texto monoespacado)."""
    columns = [
        ("ID", 8),
        ("RADIO", 18),
        ("INICIO", 16),
        ("DUR", 4),
        ("RECOR", 8),
        ("DIAS", 12),
        ("STATUS", 10),
    ]

    def _fit(text, width, align="left"):
        value = "" if text is None else str(text)
        if len(value) > width:
            value = value[: width - 3] + "..." if width > 3 else value[:width]
        return value.rjust(width) if align == "right" else value.ljust(width)

    def _format_date(value):
        if not value:
            return ""
        text = str(value)
        if "T" in text:
            text = text.replace("T", " ")
        if "+" in text:
            text = text.split("+", 1)[0]
        if text.endswith("Z"):
            text = text[:-1]
        return text[:16]

    def _format_dias(value):
        if not value:
            return ""
        day_map = {
            0: "Dom",
            1: "Seg",
            2: "Ter",
            3: "Qua",
            4: "Qui",
            5: "Sex",
            6: "Sab",
        }
        parts = [part.strip() for part in str(value).split(",") if part.strip()]
        labels = []
        for part in parts:
            if part.isdigit():
                labels.append(day_map.get(int(part), part))
            else:
                labels.append(part[:3])
        return ",".join(labels)

    def _format_recorrencia(value):
        mapping = {
            "none": "unico",
            "daily": "diario",
            "weekly": "semanal",
            "monthly": "mensal",
        }
        return mapping.get(str(value or "").lower(), str(value or ""))

    def _format_status(value):
        mapping = {
            "em_execucao": "execucao",
        }
        return mapping.get(str(value or ""), str(value or ""))

    def _build_line(values):
        parts = []
        for (label, width), value in zip(columns, values):
            align = "right" if label == "DUR" else "left"
            parts.append(_fit(value, width, align=align))
        return " ".join(parts).rstrip()

    title = "Relatorio de Agendamentos"
    generated = f"Gerado em: {dt_mod.now().isoformat(timespec='seconds')}"
    period_line = None
    if start_date and end_date:
        period_line = f"Periodo: {start_date} a {end_date}"
    elif start_date:
        period_line = f"Periodo: a partir de {start_date}"
    elif end_date:
        period_line = f"Periodo: ate {end_date}"

    header_line = _build_line([label for label, _ in columns])
    separator = "-" * len(header_line)

    data_lines = []
    for row in rows:
        data_lines.append(
            _build_line(
                [
                    (row.get("id") or "")[:8],
                    row.get("radio"),
                    _format_date(row.get("data_inicio")),
                    row.get("duracao_minutos"),
                    _format_recorrencia(row.get("tipo_recorrencia")),
                    _format_dias(row.get("dias_semana")),
                    _format_status(row.get("status")),
                ]
            )
        )

    if not data_lines:
        data_lines = ["Sem agendamentos para o periodo selecionado."]

    header_lines = [title, generated]
    if period_line:
        header_lines.append(period_line)
    header_lines += ["", header_line, separator]

    continuation_header = [f"{title} (continua)", "", header_line, separator]

    leading = 14
    margin_x = 40
    start_y = 760
    max_lines = 50

    pages = []
    current = list(header_lines)
    for line in data_lines:
        if len(current) >= max_lines:
            pages.append(current)
            current = list(continuation_header)
        current.append(line)
    if current:
        pages.append(current)

    objects = []

    def obj(idx, content):
        return f"{idx} 0 obj\n{content}\nendobj\n"

    font_id = 3
    page_count = len(pages)
    first_page_id = 4
    kids = []

    objects.append(obj(1, "<< /Type /Catalog /Pages 2 0 R >>"))

    for i in range(page_count):
        page_id = first_page_id + (i * 2)
        content_id = page_id + 1
        kids.append(f"{page_id} 0 R")

    pages_obj = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {page_count} >>"
    objects.append(obj(2, pages_obj))
    objects.append(obj(font_id, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"))

    for i, page_lines in enumerate(pages):
        page_id = first_page_id + (i * 2)
        content_id = page_id + 1
        stream_lines = [
            "BT",
            "/F1 10 Tf",
            f"{leading} TL",
            f"{margin_x} {start_y} Td",
        ]
        for idx, text in enumerate(page_lines):
            escaped = _escape_pdf_text(text)
            if idx == 0:
                stream_lines.append(f"({escaped}) Tj")
            else:
                stream_lines.append("T*")
                stream_lines.append(f"({escaped}) Tj")
        stream_lines.append("ET")
        stream_content = "\n".join(stream_lines)
        stream_bytes = stream_content.encode("latin-1", errors="ignore")

        page_obj = (
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_id} 0 R /Resources << /Font << /F1 {font_id} 0 R >> >> >>"
        )
        objects.append(obj(page_id, page_obj))
        objects.append(
            obj(
                content_id,
                f"<< /Length {len(stream_bytes)} >>\nstream\n{stream_content}\nendstream",
            )
        )

    pdf_parts = ["%PDF-1.4\n"]
    offsets = []
    for content in objects:
        offsets.append(sum(len(p.encode("latin-1", errors="ignore")) for p in pdf_parts))
        pdf_parts.append(content)

    xref_offset = sum(len(p.encode("latin-1", errors="ignore")) for p in pdf_parts)
    xref = ["xref", f"0 {len(objects)+1}", "0000000000 65535 f "]
    for off in offsets:
        xref.append(f"{off:010} 00000 n ")
    trailer = [
        "trailer",
        f"<< /Size {len(objects)+1} /Root 1 0 R >>",
        "startxref",
        str(xref_offset),
        "%%EOF",
    ]

    pdf_bytes = "".join(pdf_parts + ["\n".join(xref) + "\n", "\n".join(trailer)]).encode(
        "latin-1",
        errors="ignore",
    )
    return pdf_bytes

@bp.route('', methods=['GET'])
@token_required
def get_agendamentos():
    user_id = get_user_id()
    agendamentos = Agendamento.query.filter_by(user_id=user_id).order_by(Agendamento.data_inicio.desc()).all()
    return jsonify([a.to_dict(include_radio=True) for a in agendamentos]), 200

@bp.route('/report', methods=['GET'])
@token_required
def export_agendamentos():
    """Exporta todos os agendamentos do usuário em CSV ou PDF."""
    user_id = get_user_id()
    export_format = request.args.get('format', 'csv').lower()
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = Agendamento.query.filter_by(user_id=user_id)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
        except ValueError:
            return jsonify({'error': 'Invalid start_date'}), 400
        query = query.filter(Agendamento.data_inicio >= start_dt)
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
        except ValueError:
            return jsonify({'error': 'Invalid end_date'}), 400
        end_dt = end_dt + timedelta(days=1) - timedelta(microseconds=1)
        query = query.filter(Agendamento.data_inicio <= end_dt)
    if start_date and end_date and start_dt > end_dt:
        return jsonify({'error': 'Invalid date range'}), 400

    agendamentos = query.order_by(Agendamento.data_inicio.desc()).all()
    rows = [_agendamento_to_row(a) for a in agendamentos]
    filename_base = f"agendamentos_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    if export_format == 'pdf':
        pdf_bytes = _generate_pdf(rows, start_date=start_date, end_date=end_date)
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename=\"{filename_base}.pdf\"'}
        )

    # Default CSV
    csv_data = _generate_csv(rows)
    return Response(
        csv_data,
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=\"{filename_base}.csv\"'}
    )

@bp.route('/<agendamento_id>', methods=['GET'])
@token_required
def get_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    return jsonify(agendamento.to_dict(include_radio=True)), 200

@bp.route('', methods=['POST'])
@token_required
def create_agendamento():
    user_id = get_user_id()
    data = request.get_json()
    
    if not data.get('radio_id') or not data.get('data_inicio') or not data.get('duracao_minutos'):
        return jsonify({'error': 'radio_id, data_inicio and duracao_minutos are required'}), 400
    
    agendamento = Agendamento(
        user_id=user_id,
        radio_id=data['radio_id'],
        data_inicio=parse_datetime_local(data['data_inicio']),
        duracao_minutos=data['duracao_minutos'],
        tipo_recorrencia=data.get('tipo_recorrencia', 'none'),
        status=data.get('status', 'agendado')
    )
    
    if 'dias_semana' in data:
        agendamento.set_dias_semana_list(data['dias_semana'])
    if 'palavras_chave' in data:
        agendamento.set_palavras_chave_list(data['palavras_chave'])
    
    db.session.add(agendamento)
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_created', agendamento.to_dict())

    # Agenda execução futura
    if agendamento.status == 'agendado':
        try:
            schedule_agendamento(agendamento)
        except Exception as e:
            print(f"Falha ao agendar job do agendamento {agendamento.id}: {e}")
    
    return jsonify(agendamento.to_dict(include_radio=True)), 201

@bp.route('/<agendamento_id>', methods=['PUT'])
@token_required
def update_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    data = request.get_json()
    if 'radio_id' in data:
        agendamento.radio_id = data['radio_id']
    if 'data_inicio' in data:
        agendamento.data_inicio = parse_datetime_local(data['data_inicio'])
    if 'duracao_minutos' in data:
        agendamento.duracao_minutos = data['duracao_minutos']
    if 'tipo_recorrencia' in data:
        agendamento.tipo_recorrencia = data['tipo_recorrencia']
    if 'status' in data:
        agendamento.status = data['status']
    if 'dias_semana' in data:
        agendamento.set_dias_semana_list(data['dias_semana'])
    if 'palavras_chave' in data:
        agendamento.set_palavras_chave_list(data['palavras_chave'])
    
    db.session.commit()
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_updated', agendamento.to_dict())

    # Atualiza job do scheduler conforme status
    if agendamento.status == 'agendado':
        try:
            schedule_agendamento(agendamento)
        except Exception as e:
            print(f"Falha ao reagendar job do agendamento {agendamento.id}: {e}")
    else:
        unschedule_agendamento(agendamento.id)
    
    return jsonify(agendamento.to_dict(include_radio=True)), 200

@bp.route('/<agendamento_id>', methods=['DELETE'])
@token_required
def delete_agendamento(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    db.session.delete(agendamento)
    db.session.commit()

    # Remover job agendado, se existir
    unschedule_agendamento(agendamento_id)
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_deleted', {'id': agendamento_id})
    
    return jsonify({'message': 'Agendamento deleted'}), 200

@bp.route('/<agendamento_id>/toggle-status', methods=['POST'])
@token_required
def toggle_status(agendamento_id):
    user_id = get_user_id()
    agendamento = Agendamento.query.filter_by(id=agendamento_id, user_id=user_id).first()
    if not agendamento:
        return jsonify({'error': 'Agendamento not found'}), 404
    
    agendamento.status = 'inativo' if agendamento.status == 'agendado' else 'agendado'
    db.session.commit()

    # Atualiza job do scheduler conforme status
    if agendamento.status == 'agendado':
        try:
            schedule_agendamento(agendamento)
        except Exception as e:
            print(f"Falha ao reagendar job do agendamento {agendamento.id}: {e}")
    else:
        unschedule_agendamento(agendamento.id)
    
    # Broadcast update
    from services.websocket_service import broadcast_update
    broadcast_update(f'user_{user_id}', 'agendamento_updated', agendamento.to_dict())
    
    return jsonify(agendamento.to_dict(include_radio=True)), 200
