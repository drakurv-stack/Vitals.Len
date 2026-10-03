"""JSON-lines worker used by the VitalLens Live browser demo."""

import base64
import binascii
import io
import json
import math
import os
import sys
import threading
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vitallens import VitalLens


OUTPUT_LOCK = threading.Lock()
UPDATE_LOCK = threading.Lock()
def empty_update(result_sequence=0):
    return {
        "resultSequence": result_sequence,
        "faceDetected": False,
        "heartRate": None,
        "respiratoryRate": None,
        "hrvSdnn": None,
        "hrvRmssd": None,
    }


latest_update = empty_update()


def emit(payload):
    with OUTPUT_LOCK:
        sys.stdout.write(json.dumps(payload, separators=(",", ":"), allow_nan=False))
        sys.stdout.write("\n")
        sys.stdout.flush()


def scalar(value):
    values = np.asarray(value).reshape(-1)
    if values.size == 0:
        return None
    number = float(values[-1])
    return number if math.isfinite(number) else None


def metric(vitals, key):
    vital = vitals.get(key)
    if not isinstance(vital, dict):
        return None
    value = scalar(vital.get("value"))
    confidence = scalar(vital.get("confidence"))
    if value is None or confidence is None:
        return None
    return {
        "value": value,
        "unit": str(vital.get("unit", "")),
        "confidence": confidence,
    }


def make_update(result):
    face = result.get("face", {})
    coordinates = face.get("coordinates", [])
    try:
        face_detected = np.asarray(coordinates).size > 0
    except (TypeError, ValueError):
        face_detected = False

    vitals = result.get("vitals", {})
    return {
        "faceDetected": bool(face_detected),
        "heartRate": metric(vitals, "heart_rate"),
        "respiratoryRate": metric(vitals, "respiratory_rate"),
        "hrvSdnn": metric(vitals, "hrv_sdnn"),
        "hrvRmssd": metric(vitals, "hrv_rmssd"),
    }


def main():
    api_key = os.environ.get("VITALLENS_API_KEY")
    if not api_key:
        emit({"type": "error", "error": "VitalLens API key is not configured."})
        return 1

    try:
        client = VitalLens(method="vitallens", api_key=api_key)
        client.rppg.fps_target = 8.0
        session = None
        result_sequence = 0

        def on_result(results):
            nonlocal result_sequence
            if not results:
                return
            update = make_update(results[0])
            with UPDATE_LOCK:
                if session is None or session.current_face is None or not update["faceDetected"]:
                    update = empty_update(result_sequence)
                else:
                    result_sequence += 1
                    update["resultSequence"] = result_sequence
                latest_update.update(update)
            emit({"type": "result", "update": update})

        session = client.stream(on_result=on_result)
    except Exception:
        emit({"type": "error", "error": "VitalLens could not initialize the live stream."})
        return 1

    emit({"type": "ready"})

    try:
        for line in sys.stdin:
            try:
                command = json.loads(line)
            except json.JSONDecodeError:
                emit({"type": "error", "error": "Invalid worker message."})
                continue

            if command.get("type") == "close":
                break
            if command.get("type") != "frame":
                emit({"type": "error", "error": "Unsupported worker message."})
                continue

            request_id = command.get("requestId")
            encoded = command.get("jpegBase64")
            timestamp = command.get("timestamp")
            if (
                not isinstance(request_id, str)
                or not isinstance(encoded, str)
                or len(encoded) > 150_000
                or not isinstance(timestamp, (int, float))
                or not math.isfinite(timestamp)
                or timestamp < 0
            ):
                emit(
                    {
                        "type": "frame-error",
                        "requestId": request_id,
                        "error": "Invalid camera frame.",
                    }
                )
                continue

            try:
                image_bytes = base64.b64decode(encoded, validate=True)
                with Image.open(io.BytesIO(image_bytes)) as image:
                    if image.format != "JPEG" or image.width * image.height > 640 * 480:
                        raise ValueError("Unsupported image size or format")
                    frame = np.asarray(image.convert("RGB"))
                session.push(frame, float(timestamp))
            except (binascii.Error, OSError, ValueError):
                emit(
                    {
                        "type": "frame-error",
                        "requestId": request_id,
                        "error": "The camera frame could not be decoded.",
                    }
                )
                continue
            except Exception:
                emit(
                    {
                        "type": "frame-error",
                        "requestId": request_id,
                        "error": "VitalLens could not process this camera frame.",
                    }
                )
                continue

            face_detected = session.current_face is not None
            with UPDATE_LOCK:
                if face_detected:
                    update = dict(latest_update)
                else:
                    update = empty_update(result_sequence)
                    latest_update.update(update)
            update["faceDetected"] = face_detected
            emit({"type": "frame", "requestId": request_id, "update": update})
    finally:
        session.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())