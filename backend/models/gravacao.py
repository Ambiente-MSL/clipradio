from app import db
from datetime import datetime
from zoneinfo import ZoneInfo
import uuid
from sqlalchemy import inspect
from sqlalchemy.orm.attributes import NO_VALUE

LOCAL_TZ = ZoneInfo("America/Fortaleza")

class Gravacao(db.Model):
    __tablename__ = 'gravacoes'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('usuarios.id'), nullable=False, index=True)
    radio_id = db.Column(db.String(36), db.ForeignKey('radios.id'), nullable=False, index=True)
    status = db.Column(db.String(50), default='iniciando')  # iniciando, gravando, concluido, erro, processando
    tipo = db.Column(db.String(50), default='manual')  # manual, agendado, massa
    arquivo_url = db.Column(db.String(500))
    arquivo_nome = db.Column(db.String(255))
    duracao_segundos = db.Column(db.Integer, default=0)
    duracao_minutos = db.Column(db.Integer, default=0)
    tamanho_mb = db.Column(db.Float, default=0.0)
    transcricao_status = db.Column(db.String(50))
    transcricao_texto = db.Column(db.Text)
    transcricao_erro = db.Column(db.String(500))
    transcricao_idioma = db.Column(db.String(20))
    transcricao_modelo = db.Column(db.String(100))
    transcricao_progresso = db.Column(db.Integer)
    transcricao_cancelada = db.Column(db.Boolean, default=False)
    batch_id = db.Column(db.String(36))  # Para gravação em massa
    # Guardar timestamps com timezone para evitar deslocamento de hora
    criado_em = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(tz=LOCAL_TZ), index=True)
    atualizado_em = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(tz=LOCAL_TZ), onupdate=lambda: datetime.now(tz=LOCAL_TZ))
    
    # Relacionamentos
    clips = db.relationship('Clip', backref='gravacao', lazy=True, cascade='all, delete-orphan')
    tags = db.relationship('Tag', secondary='gravacoes_tags', lazy='subquery', backref=db.backref('gravacoes', lazy=True))
    
    def to_dict(self, include_radio=False, include_transcricao=False):
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'radio_id': self.radio_id,
            'status': self.status,
            'tipo': self.tipo,
            'arquivo_url': self.arquivo_url,
            'arquivo_nome': self.arquivo_nome,
            'duracao_segundos': self.duracao_segundos,
            'duracao_minutos': self.duracao_minutos,
            'tamanho_mb': self.tamanho_mb,
            'batch_id': self.batch_id,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
            'atualizado_em': self.atualizado_em.isoformat() if self.atualizado_em else None
        }

        data['transcricao_status'] = self.transcricao_status
        transcricao_disponivel = None
        if include_transcricao:
            transcricao_disponivel = bool(self.transcricao_texto)
        else:
            try:
                state = inspect(self)
                loaded_value = state.attrs.transcricao_texto.loaded_value
                if loaded_value is not NO_VALUE:
                    transcricao_disponivel = bool(loaded_value)
            except Exception:
                transcricao_disponivel = None
        if transcricao_disponivel is None:
            transcricao_disponivel = self.transcricao_status == 'concluido'
        data['transcricao_disponivel'] = transcricao_disponivel
        data['transcricao_erro'] = self.transcricao_erro
        data['transcricao_idioma'] = self.transcricao_idioma
        data['transcricao_modelo'] = self.transcricao_modelo
        data['transcricao_progresso'] = self.transcricao_progresso
        data['transcricao_cancelada'] = self.transcricao_cancelada
        if include_transcricao:
            data['transcricao_texto'] = self.transcricao_texto
        
        if include_radio and self.radio:
            data['radios'] = {
                'nome': self.radio.nome,
                'cidade': self.radio.cidade,
                'estado': self.radio.estado
            }
        
        return data
