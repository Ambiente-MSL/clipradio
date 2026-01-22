#!/bin/bash
set -e

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
exec gunicorn --worker-class eventlet -w 2 --bind 0.0.0.0:5000 --timeout 300 --access-logfile - --error-logfile - app:app
