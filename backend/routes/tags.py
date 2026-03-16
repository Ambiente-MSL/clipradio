import re
from collections import Counter, defaultdict
from datetime import timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy import func
from sqlalchemy.orm import load_only, selectinload
from app import db
from models.tag import Tag
from models.gravacao import Gravacao
from models.radio import Radio
from models.user import User
from services.transcription_service import get_transcription_segments
from utils.jwt_utils import token_required, decode_token
from flask import request as flask_request

bp = Blueprint('tags', __name__)

TAG_CLOUD_GRAVACAO_FIELDS = (
    Gravacao.id,
    Gravacao.user_id,
    Gravacao.radio_id,
    Gravacao.criado_em,
    Gravacao.transcricao_status,
    Gravacao.transcricao_texto,
)
TAG_CLOUD_RADIO_FIELDS = (
    Radio.nome,
    Radio.cidade,
    Radio.estado,
)

def get_user_ctx():
    token = flask_request.headers.get('Authorization', '').replace('Bearer ', '')
    payload = decode_token(token) or {}
    return {
        'user_id': payload.get('user_id'),
        'is_admin': payload.get('is_admin', False),
    }


def _normalize_tag_name(value):
    return " ".join(str(value or "").strip().split())


def _normalize_tag_key(value):
    return _normalize_tag_name(value).lower()


def _resolve_visible_tags(ctx):
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        return Tag.query.order_by(Tag.criado_em.desc()).all()

    user = User.query.get(user_id)
    user_city = (user.cidade or '').strip() if user else ''
    if not user_city:
        return Tag.query.filter_by(user_id=user_id).order_by(Tag.criado_em.desc()).all()

    return (
        Tag.query
        .join(User, Tag.user_id == User.id)
        .filter(func.lower(User.cidade) == user_city.lower())
        .order_by(Tag.criado_em.desc())
        .all()
    )


def _build_tag_cloud_entries(tags):
    entries = {}
    for tag in tags or []:
        normalized_name = _normalize_tag_name(getattr(tag, 'nome', None))
        if not normalized_name:
            continue

        key = _normalize_tag_key(normalized_name)
        current = entries.get(key)
        if current is None:
            entries[key] = {
                'key': key,
                'text': normalized_name,
                'color': getattr(tag, 'cor', None),
                'source_tag_ids': [tag.id],
                'single_word': " " not in normalized_name,
                'count': 0,
                'recording_ids': set(),
                'radios': set(),
                'cities': set(),
                'occurrences': [],
            }
            continue

        current['source_tag_ids'].append(tag.id)
        if not current.get('color') and getattr(tag, 'cor', None):
            current['color'] = tag.cor

    return entries


def _build_combined_tag_pattern(entries):
    tag_texts = sorted(
        (re.escape(entry['text']) for entry in entries.values()),
        key=len,
        reverse=True,
    )
    if not tag_texts:
        return None
    return re.compile(rf"(?=(\b(?:{'|'.join(tag_texts)})\b))", re.IGNORECASE)


def _normalize_word_token(value):
    return re.sub(r"(^[^\w]+|[^\w]+$)", "", str(value or "").strip(), flags=re.UNICODE).lower()


def _build_segment_word_offsets(segment):
    words = segment.get('words') if isinstance(segment, dict) else None
    if not isinstance(words, list):
        return {}

    offsets = defaultdict(list)
    for word in words:
        normalized_word = _normalize_word_token((word or {}).get('word'))
        if not normalized_word:
            continue
        try:
            offsets[normalized_word].append(float((word or {}).get('start') or 0))
        except Exception:
            continue
    return offsets


def _build_occurrence(entry, gravacao, radio, *, offset_seconds=None, count=1, exact_time=False):
    heard_at = None
    if gravacao.criado_em is not None and offset_seconds is not None:
        try:
            heard_at = gravacao.criado_em + timedelta(seconds=float(offset_seconds))
        except Exception:
            heard_at = None

    radio_name = getattr(radio, 'nome', None) if radio else None
    city_name = getattr(radio, 'cidade', None) if radio else None
    state_name = getattr(radio, 'estado', None) if radio else None

    return {
        'tag_key': entry['key'],
        'tag_text': entry['text'],
        'gravacao_id': gravacao.id,
        'radio_id': gravacao.radio_id,
        'radio_nome': radio_name,
        'cidade': city_name,
        'estado': state_name,
        'count': int(count or 1),
        'offset_seconds': float(offset_seconds) if offset_seconds is not None else None,
        'heard_at': heard_at.isoformat() if heard_at else None,
        'exact_time': bool(exact_time and offset_seconds is not None),
        'recorded_at': gravacao.criado_em.isoformat() if gravacao.criado_em else None,
    }


def _register_entry_match(entry, gravacao, radio):
    entry['recording_ids'].add(gravacao.id)
    if radio and getattr(radio, 'nome', None):
        entry['radios'].add(radio.nome)
    if radio and getattr(radio, 'cidade', None):
        entry['cities'].add(radio.cidade)


def _accumulate_segment_matches(entries, pattern, gravacao, radio, segment):
    if pattern is None:
        return 0

    segment_text = str((segment or {}).get('text') or '')
    if not segment_text:
        return 0

    matches = list(pattern.finditer(segment_text))
    if not matches:
        return 0

    try:
        start_seconds = float((segment or {}).get('start') or 0)
    except Exception:
        start_seconds = 0.0

    word_offsets = _build_segment_word_offsets(segment)
    word_offset_indexes = defaultdict(int)
    matched_count = 0

    for match in matches:
        matched_text = match.group(1)
        matched_key = _normalize_tag_key(matched_text)
        entry = entries.get(matched_key)
        if entry is None:
            continue

        offset_seconds = start_seconds
        exact_time = False
        if entry.get('single_word'):
            normalized_word = _normalize_word_token(matched_text)
            offsets = word_offsets.get(normalized_word) or []
            offset_index = word_offset_indexes[normalized_word]
            if offset_index < len(offsets):
                offset_seconds = offsets[offset_index]
                word_offset_indexes[normalized_word] = offset_index + 1
                exact_time = True

        entry['occurrences'].append(
            _build_occurrence(
                entry,
                gravacao,
                radio,
                offset_seconds=offset_seconds,
                exact_time=exact_time,
            )
        )
        entry['count'] += 1
        _register_entry_match(entry, gravacao, radio)
        matched_count += 1

    return matched_count


def _accumulate_text_only_matches(entries, pattern, gravacao, radio, text):
    if pattern is None:
        return 0

    matches = list(pattern.finditer(str(text or '')))
    if not matches:
        return 0

    counts = Counter()
    for match in matches:
        matched_key = _normalize_tag_key(match.group(1))
        if matched_key in entries:
            counts[matched_key] += 1

    total_matches = 0
    for key, count in counts.items():
        entry = entries[key]
        entry['occurrences'].append(
            _build_occurrence(
                entry,
                gravacao,
                radio,
                offset_seconds=None,
                count=count,
                exact_time=False,
            )
        )
        entry['count'] += count
        _register_entry_match(entry, gravacao, radio)
        total_matches += count

    return total_matches

@bp.route('', methods=['GET'])
@token_required
def get_tags():
    ctx = get_user_ctx()
    tags = _resolve_visible_tags(ctx)
    return jsonify([tag.to_dict() for tag in tags]), 200

@bp.route('/<tag_id>', methods=['GET'])
@token_required
def get_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    return jsonify(tag.to_dict()), 200

@bp.route('', methods=['POST'])
@token_required
def create_tag():
    user_id = get_user_ctx().get('user_id')
    data = request.get_json()
    
    if not data.get('nome'):
        return jsonify({'error': 'nome is required'}), 400
    
    tag = Tag(
        user_id=user_id,
        nome=data['nome'],
        cor=data.get('cor')
    )
    
    db.session.add(tag)
    db.session.commit()
    
    return jsonify(tag.to_dict()), 201

@bp.route('/<tag_id>', methods=['PUT'])
@token_required
def update_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    
    data = request.get_json()
    if 'nome' in data:
        tag.nome = data['nome']
    if 'cor' in data:
        tag.cor = data['cor']
    
    db.session.commit()
    return jsonify(tag.to_dict()), 200

@bp.route('/<tag_id>', methods=['DELETE'])
@token_required
def delete_tag(tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    if ctx.get('is_admin'):
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    if not tag:
        return jsonify({'error': 'Tag not found'}), 404
    
    db.session.delete(tag)
    db.session.commit()
    
    return jsonify({'message': 'Tag deleted'}), 200

@bp.route('/gravacao/<gravacao_id>', methods=['POST'])
@token_required
def add_tag_to_gravacao(gravacao_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    data = request.get_json()
    tag_id = data.get('tag_id')
    
    if not tag_id:
        return jsonify({'error': 'tag_id is required'}), 400
    
    if ctx.get('is_admin'):
        gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        gravacao = Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    
    if not gravacao or not tag:
        return jsonify({'error': 'Gravacao or Tag not found'}), 404
    
    # Adicionar relação se não existir
    if tag not in gravacao.tags:
        gravacao.tags.append(tag)
        db.session.commit()
    
    return jsonify({'message': 'Tag added to gravacao'}), 200

@bp.route('/gravacao/<gravacao_id>/<tag_id>', methods=['DELETE'])
@token_required
def remove_tag_from_gravacao(gravacao_id, tag_id):
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    
    if ctx.get('is_admin'):
        gravacao = Gravacao.query.filter_by(id=gravacao_id).first()
        tag = Tag.query.filter_by(id=tag_id).first()
    else:
        gravacao = Gravacao.query.filter_by(id=gravacao_id, user_id=user_id).first()
        tag = Tag.query.filter_by(id=tag_id, user_id=user_id).first()
    
    if not gravacao or not tag:
        return jsonify({'error': 'Gravacao or Tag not found'}), 404
    
    if tag in gravacao.tags:
        gravacao.tags.remove(tag)
        db.session.commit()
    
    return jsonify({'message': 'Tag removed from gravacao'}), 200


@bp.route('/cloud', methods=['GET'])
@token_required
def get_tags_cloud():
    ctx = get_user_ctx()
    user_id = ctx.get('user_id')
    is_admin = ctx.get('is_admin', False)

    try:
        occurrence_limit = int(request.args.get('occurrence_limit', 1500) or 1500)
    except (TypeError, ValueError):
        occurrence_limit = 1500
    occurrence_limit = max(100, min(5000, occurrence_limit))

    visible_tags = _resolve_visible_tags(ctx)
    tag_entries = _build_tag_cloud_entries(visible_tags)
    if not tag_entries:
        return jsonify({
            'summary': {
                'total_tags': 0,
                'matched_tags': 0,
                'total_occurrences': 0,
                'recordings_scanned': 0,
                'recordings_with_matches': 0,
                'occurrences_returned': 0,
                'occurrences_truncated': False,
            },
            'words': [],
            'occurrences': [],
        }), 200
    tag_pattern = _build_combined_tag_pattern(tag_entries)

    query = (
        Gravacao.query
        .filter(Gravacao.transcricao_status == 'concluido')
        .filter(Gravacao.transcricao_texto.isnot(None))
        .filter(Gravacao.transcricao_texto != '')
        .options(
            load_only(*TAG_CLOUD_GRAVACAO_FIELDS),
            selectinload(Gravacao.radio).load_only(*TAG_CLOUD_RADIO_FIELDS),
        )
        .order_by(Gravacao.criado_em.desc())
    )
    if not is_admin:
        query = query.filter(Gravacao.user_id == user_id)

    gravacoes = query.all()
    recordings_with_matches = set()

    for gravacao in gravacoes:
        radio = getattr(gravacao, 'radio', None)
        transcript_text = gravacao.transcricao_texto or ''
        if not transcript_text or tag_pattern.search(transcript_text) is None:
            continue

        segments = get_transcription_segments(gravacao.id)
        has_segments = isinstance(segments, list) and len(segments) > 0
        matched_in_recording = 0

        if has_segments:
            for segment in segments:
                matched_in_recording += _accumulate_segment_matches(tag_entries, tag_pattern, gravacao, radio, segment)
        else:
            matched_in_recording += _accumulate_text_only_matches(
                tag_entries,
                tag_pattern,
                gravacao,
                radio,
                transcript_text,
            )

        if matched_in_recording > 0:
            recordings_with_matches.add(gravacao.id)

    flat_occurrences = []
    occurrences_truncated = False
    for entry in tag_entries.values():
        sorted_occurrences = sorted(
            entry['occurrences'],
            key=lambda item: (
                item.get('heard_at') or '',
                item.get('recorded_at') or '',
                item.get('radio_nome') or '',
            ),
            reverse=True,
        )
        entry['occurrences'] = sorted_occurrences
        remaining = occurrence_limit - len(flat_occurrences)
        if remaining > 0:
            flat_occurrences.extend(sorted_occurrences[:remaining])
            if len(sorted_occurrences) > remaining:
                occurrences_truncated = True
        elif sorted_occurrences:
            occurrences_truncated = True

    words = []
    total_occurrences = 0
    matched_tags = 0
    for entry in tag_entries.values():
        total_occurrences += entry['count']
        if entry['count'] > 0:
            matched_tags += 1

        words.append({
            'key': entry['key'],
            'text': entry['text'],
            'color': entry.get('color'),
            'count': entry['count'],
            'recordings_count': len(entry['recording_ids']),
            'radios_count': len(entry['radios']),
            'cities_count': len(entry['cities']),
            'source_tag_ids': entry['source_tag_ids'],
            'last_heard_at': entry['occurrences'][0]['heard_at'] if entry['occurrences'] else None,
            'sample_occurrences': entry['occurrences'][:5],
        })

    words.sort(key=lambda item: (-item['count'], item['text'].lower()))
    flat_occurrences.sort(
        key=lambda item: (
            item.get('heard_at') or '',
            item.get('recorded_at') or '',
            item.get('tag_text') or '',
        ),
        reverse=True,
    )

    return jsonify({
        'summary': {
            'total_tags': len(words),
            'matched_tags': matched_tags,
            'total_occurrences': total_occurrences,
            'recordings_scanned': len(gravacoes),
            'recordings_with_matches': len(recordings_with_matches),
            'occurrences_returned': len(flat_occurrences),
            'occurrence_limit': occurrence_limit,
            'occurrences_truncated': occurrences_truncated,
        },
        'words': words,
        'occurrences': flat_occurrences,
    }), 200

