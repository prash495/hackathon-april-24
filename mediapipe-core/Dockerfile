FROM python:3.11-slim

WORKDIR /app

# OpenCV headless needs these system libs, wget for model download
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0 wget && rm -rf /var/lib/apt/lists/*

COPY mediapipe-core/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mediapipe-core/ ./mediapipe-core/

# Download the MediaPipe face landmarker model if not present
RUN if [ ! -f mediapipe-core/face_landmarker_v2_with_blendshapes.task ]; then \
    wget -q -O mediapipe-core/face_landmarker_v2_with_blendshapes.task \
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"; \
    fi

EXPOSE 8002
CMD ["uvicorn", "mediapipe-core.proctor:app", "--host", "0.0.0.0", "--port", "8002"]
