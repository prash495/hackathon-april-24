FROM python:3.11-slim

WORKDIR /app

# System deps for bcrypt
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

COPY apps/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/backend/ ./apps/backend/

EXPOSE 8000
# Shell form so ${PORT} (injected by Railway) expands; fall back to 8000 locally.
CMD uvicorn apps.backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
