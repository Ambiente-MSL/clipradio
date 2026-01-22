from flask import Flask, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
from config import Config
import time


db = SQLAlchemy()
socketio = SocketIO(cors_allowed_origins="*", async_mode='eventlet')


def wait_for_db(max_tries=30, delay=2):
    """Espera o banco responder antes de iniciar o scheduler."""
    from sqlalchemy import create_engine, text
    from config import Config
    
    # Criar engine temporário para testar conexão
    engine = create_engine(
        Config.SQLALCHEMY_DATABASE_URI,
        **Config.SQLALCHEMY_ENGINE_OPTIONS
    )
    
    for i in range(max_tries):
        try:
            with engine.connect() as conn:
                conn.execute(text('SELECT 1'))
            return
        except Exception:
            if i < max_tries - 1:
                time.sleep(delay)
            else:
                raise RuntimeError("Banco nao respondeu a tempo")


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    Config.init_app(app)
    
    # Configurar engine options para forçar TCP/IP
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = Config.SQLALCHEMY_ENGINE_OPTIONS
    
    # Inicializar extensoes
    db.init_app(app)
    CORS(app)
    socketio.init_app(app)
    
    # Importar modelos (apos db.init_app)
    with app.app_context():
        from models.user import User
        from models.radio import Radio
        from models.gravacao import Gravacao
        from models.agendamento import Agendamento
        from models.tag import Tag
        from models.clip import Clip
        from models.gravacao_tag import gravacao_tags
        from models.cliente import Cliente
        
        # Garantir que todas as tabelas existam antes de receber requisições
        try:
            db.create_all()
            app.logger.info("Tabelas verificadas/criadas com sucesso.")
        except Exception as e:
            app.logger.exception("Falha ao criar/verificar tabelas do banco.")
            raise
    
    # Registrar blueprints
    from routes import auth, radios, gravacoes, agendamentos, tags, recording, files, admin
    
    app.register_blueprint(auth.bp, url_prefix='/api/auth')
    app.register_blueprint(radios.bp, url_prefix='/api/radios')
    app.register_blueprint(gravacoes.bp, url_prefix='/api/gravacoes')
    app.register_blueprint(agendamentos.bp, url_prefix='/api/agendamentos')
    app.register_blueprint(tags.bp, url_prefix='/api/tags')
    app.register_blueprint(recording.bp, url_prefix='/api/recording')
    app.register_blueprint(files.bp, url_prefix='/api/files')
    app.register_blueprint(admin.bp, url_prefix='/api/admin')
    
    @app.route('/api/health')
    def health():
        try:
            # Testar conexao com banco
            db.session.execute(db.text('SELECT 1'))
            # Validar se a tabela de usuarios estДЃ acessГ­vel (evita 500 silenciosos)
            db.session.execute(db.text('SELECT 1 FROM usuarios LIMIT 1'))
            return jsonify({'status': 'ok', 'database': 'connected'})
        except Exception as e:
            app.logger.exception("Health check falhou")
            return jsonify({'status': 'error', 'database': 'disconnected', 'error': str(e)}), 500
    
    # Inicializar scheduler (aguardar banco estar pronto)
    from services.scheduler_service import init_scheduler
    with app.app_context():
        try:
            wait_for_db(max_tries=60, delay=1)  # Mais tentativas, intervalo menor
            init_scheduler()
        except RuntimeError as e:
            # Log do erro mas não falha a inicialização
            print(f"Warning: {e}. Scheduler não iniciado.")
    
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'Not found'}), 404
    
    @app.errorhandler(500)
    def server_error(e):
        db.session.rollback()
        return jsonify({'error': 'Internal server error'}), 500
    
    return app

# Criar app para gunicorn
app = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
