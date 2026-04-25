FROM python:3.11-slim

WORKDIR /app

# System deps for bcrypt
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Cache bust: v2
COPY apps/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/backend/ ./apps/backend/

EXPOSE 8000
CMD ["uvicorn", "apps.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
