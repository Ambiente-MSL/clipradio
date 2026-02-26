#!/bin/bash
set -euo pipefail

echo "Esperando o PostgreSQL estar pronto..."

# Esperar até o PostgreSQL estar aceitando conexões
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER"; do
  echo "PostgreSQL ainda não está pronto - aguardando..."
  sleep 2
done

echo "PostgreSQL está pronto!"

# Executar as migrations (se necessário)
# flask db upgrade

# Iniciar a aplicação
exec gunicorn \
  --worker-class eventlet \
  --workers "${GUNICORN_WORKERS:-1}" \
  --bind 0.0.0.0:5000 \
  --timeout "${GUNICORN_TIMEOUT:-300}" \
  --graceful-timeout "${GUNICORN_GRACEFUL_TIMEOUT:-30}" \
  --keep-alive "${GUNICORN_KEEPALIVE:-5}" \
  --max-requests "${GUNICORN_MAX_REQUESTS:-1000}" \
  --max-requests-jitter "${GUNICORN_MAX_REQUESTS_JITTER:-100}" \
  --access-logfile - \
  --error-logfile - \
  app:app
