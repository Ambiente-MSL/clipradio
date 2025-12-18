from app import db
from datetime import datetime
import uuid

class Radio(db.Model):
    __tablename__ = 'radios'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('usuarios.id'), nullable=False, index=True)
    nome = db.Column(db.String(255), nullable=False)
    stream_url = db.Column(db.String(500), nullable=False)
    cidade = db.Column(db.String(255))
    estado = db.Column(db.String(2))
    favorita = db.Column(db.Boolean, default=False)
    bitrate_kbps = db.Column(db.Integer, default=128)
    output_format = db.Column(db.String(10), default='mp3')  # mp3 ou opus
    audio_mode = db.Column(db.String(10), default='stereo')  # stereo ou mono
    criado_em = db.Column(db.DateTime, default=datetime.utcnow)
    atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    gravacoes = db.relationship('Gravacao', backref='radio', lazy=True, cascade='all, delete-orphan')
    agendamentos = db.relationship('Agendamento', backref='radio', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'nome': self.nome,
            'stream_url': self.stream_url,
            'cidade': self.cidade,
            'estado': self.estado,
            'favorita': self.favorita,
            'bitrate_kbps': self.bitrate_kbps,
            'output_format': self.output_format,
            'audio_mode': self.audio_mode,
            'criado_em': self.criado_em.isoformat() if self.criado_em else None,
            'atualizado_em': self.atualizado_em.isoformat() if self.atualizado_em else None
        }
