"""
Gaze + Head Pose analyzer for proctoring.
Synced with mediapipe-core/main.py pipeline.

Detection logic:
  1. Iris ratio: difference of (iris-to-inner) vs (iris-to-outer) distance
     - Positive = looking left, Negative = looking right
     - Uses both eyes, takes the difference (left - right) * 100
  2. Face angle: angle between face normal and camera forward (0,0,-1)
     - 0° = facing camera, higher = head turned
  3. Cheating if: angle >= 20° OR |lateral| > delta

Usage:
    analyzer = GazeAnalyzer()
    result = analyzer.analyze(face_landmarks, frame_width, frame_height)
"""

import numpy as np


# ── MediaPipe landmark indices (matching mediapipe-core/main.py) ──
DEFINITIONS = {
    'left-eye-in-and-out': [463, 263],   # inner, outer corners
    'right-eye-in-and-out': [133, 33],   # inner, outer corners
    'face-bounds': [54, 284, 152],       # right cheek, left cheek, chin
}

LEFT_IRIS = 473
RIGHT_IRIS = 468

# Camera forward direction (looking into the screen)
CAM_FORWARD = np.array([0.0, 0.0, -1.0])


class GazeAnalyzer:
    """Tracks gaze direction and head pose, matching the mediapipe-core pipeline."""

    def __init__(
        self,
        lateral_delta: float = 1.5,
        angle_threshold: float = 20.0,
        cheat_frame_threshold: int = 15,
    ):
        # lateral_delta: how far iris ratio can drift before flagging
        self.lateral_delta = lateral_delta
        # angle_threshold: degrees of head turn before flagging
        self.angle_threshold = angle_threshold
        # consecutive frames before CHEATING status
        self.cheat_frame_threshold = cheat_frame_threshold
        self.cheat_counter = 0

    def _iris_ratio(self, face, iris_idx: int, in_out_indices: list) -> float:
        """
        How far the iris is from the inner vs outer eye corner.
        Returns d_inner - d_outer:
          negative = closer to inner (looking toward nose)
          positive = closer to outer (looking away from nose)
        """
        iris = face[iris_idx]
        inner = face[in_out_indices[0]]
        outer = face[in_out_indices[1]]
        d_inner = np.hypot(iris.x - inner.x, iris.y - inner.y)
        d_outer = np.hypot(iris.x - outer.x, iris.y - outer.y)
        return d_inner - d_outer

    def _face_angle(self, face) -> float:
        """
        Angle between face normal and camera forward vector.
        0° = facing camera directly. Higher = head turned.
        Returns angle in degrees (0-180 range, flipped so 0 = facing camera).
        """
        fb = [face[i] for i in DEFINITIONS['face-bounds']]
        pts = np.array([[lm.x, lm.y, lm.z] for lm in fb])
        v1, v2 = pts[1] - pts[0], pts[2] - pts[0]
        normal = np.cross(v1, v2)
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-6:
            return 0.0
        normal /= norm_len
        dot = np.clip(np.dot(normal, CAM_FORWARD), -1.0, 1.0)
        angle = np.degrees(np.arccos(dot))
        return round(180.0 - angle, 3)

    def analyze(self, face, w: int, h: int) -> dict:
        """
        Analyze one face's landmarks. Matches mediapipe-core/main.py logic exactly.

        Args:
            face: list of MediaPipe NormalizedLandmark (478 points)
            w: frame width in pixels
            h: frame height in pixels

        Returns dict:
            status:        "OK" or "CHEATING"
            gaze:          "Looking Left" / "Looking Right" / "Looking Straight"
            lateral:       iris lateral value (+ = left, - = right)
            angle:         head angle from camera (0 = facing camera)
            cheating:      bool
            cheat_counter: int
        """
        # ── Iris ratio (same as mediapipe-core) ──
        left = self._iris_ratio(face, LEFT_IRIS, DEFINITIONS['left-eye-in-and-out'])
        right = self._iris_ratio(face, RIGHT_IRIS, DEFINITIONS['right-eye-in-and-out'])
        lateral = round((left - right) * 100, 3)

        # ── Face angle (same as mediapipe-core) ──
        angle = self._face_angle(face)

        # ── Gaze direction label ──
        if lateral < -self.lateral_delta:
            gaze = "Looking Right"
        elif lateral > self.lateral_delta:
            gaze = "Looking Left"
        else:
            gaze = "Looking Straight"

        # ── Cheating detection (same logic as mediapipe-core) ──
        is_cheating = angle >= self.angle_threshold or abs(lateral) > self.lateral_delta

        if is_cheating:
            self.cheat_counter += 1
        else:
            self.cheat_counter = max(0, self.cheat_counter - 1)

        cheating = self.cheat_counter >= self.cheat_frame_threshold

        return {
            "status": "CHEATING" if cheating else "OK",
            "gaze": gaze,
            "lateral": lateral,
            "angle": angle,
            "cheating": cheating,
            "cheat_counter": self.cheat_counter,
        }
