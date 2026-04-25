FROM python:3.11-slim

WORKDIR /app

# OpenCV headless needs these system libs
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

COPY mediapipe-core/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mediapipe-core/ ./mediapipe-core/

EXPOSE 8002
CMD ["uvicorn", "mediapipe-core.proctor:app", "--host", "0.0.0.0", "--port", "8002"]
