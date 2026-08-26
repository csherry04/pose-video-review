"""Read OpenPose and OpenCap HRNet/MMPose pose pickles."""

from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np


POSE_EDGES = [
    ("neck", "right_shoulder"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("neck", "left_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("neck", "right_hip"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_heel"),
    ("right_heel", "right_big_toe"),
    ("neck", "left_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_heel"),
    ("left_heel", "left_big_toe"),
]

OPENPOSE_BODY_25 = [
    "nose", "neck", "right_shoulder", "right_elbow", "right_wrist",
    "left_shoulder", "left_elbow", "left_wrist", "mid_hip", "right_hip",
    "right_knee", "right_ankle", "left_hip", "left_knee", "left_ankle",
    "right_eye", "left_eye", "right_ear", "left_ear", "left_big_toe",
    "left_small_toe", "left_heel", "right_big_toe", "right_small_toe",
    "right_heel",
]

MMPOSE_WHOLEBODY_23 = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip", "left_knee",
    "right_knee", "left_ankle", "right_ankle", "left_big_toe",
    "left_small_toe", "left_heel", "right_big_toe", "right_small_toe",
    "right_heel",
]


def _best_person(people: object, field: str, expected_points: int) -> np.ndarray | None:
    if not isinstance(people, (list, tuple)):
        return None
    candidates = []
    for person in people:
        if not isinstance(person, dict) or field not in person:
            continue
        try:
            values = np.asarray(person[field], dtype=float).reshape(-1, 3)
        except (TypeError, ValueError):
            continue
        if len(values) < expected_points:
            continue
        confidence = values[:expected_points, 2]
        score = float(np.mean(confidence[confidence > 0])) if np.any(confidence > 0) else 0.0
        candidates.append((score, values))
    return max(candidates, key=lambda item: item[0])[1] if candidates else None


def _named_points(names: list[str], values: np.ndarray) -> dict[str, list[float]]:
    return {
        name: [round(float(point[0]), 2), round(float(point[1]), 2)]
        for name, point in zip(names, values)
        if np.isfinite(point[:2]).all() and point[2] > 0
    }


def normalize_openpose(raw: object) -> list[dict[str, list[float]] | None]:
    """Normalize OpenPose or post-processed HRNet BODY_25 frames."""
    if not isinstance(raw, (list, tuple)):
        raise ValueError("OpenPose pickle must contain a list of video frames.")
    frames = []
    for people in raw:
        values = _best_person(people, "pose_keypoints_2d", len(OPENPOSE_BODY_25))
        frames.append(_named_points(OPENPOSE_BODY_25, values) if values is not None else None)
    return frames


def normalize_hrnet(raw: object) -> list[dict[str, list[float]] | None]:
    """Normalize older raw OpenCap HRNet/MMPose frames."""
    if not isinstance(raw, (list, tuple)):
        raise ValueError("HRNet pickle must contain a list of video frames.")
    frames = []
    for people in raw:
        values = _best_person(people, "preds_with_flip", len(MMPOSE_WHOLEBODY_23))
        if values is None:
            frames.append(None)
            continue
        points = _named_points(MMPOSE_WHOLEBODY_23, values)
        for name, left, right in (
            ("neck", "left_shoulder", "right_shoulder"),
            ("mid_hip", "left_hip", "right_hip"),
        ):
            if left in points and right in points:
                points[name] = [
                    round((points[left][0] + points[right][0]) / 2, 2),
                    round((points[left][1] + points[right][1]) / 2, 2),
                ]
        frames.append(points)
    return frames


def normalize_pose(raw: object) -> list[dict[str, list[float]] | None]:
    if not isinstance(raw, (list, tuple)):
        raise ValueError("Pose pickle must contain a list of video frames.")
    for people in raw:
        if not isinstance(people, (list, tuple)):
            continue
        for person in people:
            if not isinstance(person, dict):
                continue
            if "pose_keypoints_2d" in person:
                return normalize_openpose(raw)
            if "preds_with_flip" in person:
                return normalize_hrnet(raw)
    if not raw or all(not frame for frame in raw):
        return [None] * len(raw)
    raise ValueError("Unsupported pose pickle structure; expected OpenPose BODY_25 or OpenCap HRNet/MMPose.")


def load_pose(path: Path) -> list[dict[str, list[float]] | None]:
    if path.suffix.casefold() not in {".pkl", ".pickle"}:
        raise ValueError(f"Pose file must be a pickle: {path}")
    with path.open("rb") as handle:
        return normalize_pose(pickle.load(handle))
