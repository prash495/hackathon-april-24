# mediapipe-core

Contains the MediaPipe face landmarker model used for proctoring.

## Setup

Download the model file manually (not committed — too large):

```bash
wget -O mediapipe-core/face_landmarker_v2_with_blendshapes.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

## Usage

See `mediapipe-core/main.py` for the face detection implementation.
