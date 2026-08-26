"""Discover videos and pose pickles in OpenCap download folders."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np


VIDEO_EXTENSIONS = {".avi", ".m4v", ".mov", ".mp4"}


def video_metadata(path: Path) -> tuple[float, int, int, int]:
    if not path.is_file():
        raise FileNotFoundError(f"Video does not exist: {path}")
    capture = cv2.VideoCapture(str(path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    finally:
        capture.release()
    if fps <= 0 or width <= 0 or height <= 0 or frame_count <= 0:
        raise ValueError(f"Could not read video metadata: {path}")
    return fps, width, height, frame_count


def _pose_details(path: Path) -> tuple[str, str, bool] | None:
    """Return trial, original video stem, and whether the pickle is processed."""
    if path.name.endswith("_keypoints.pkl"):
        trial = path.name.removesuffix("_keypoints.pkl")
        return trial, trial, True
    if path.name.endswith("_rotated_pp.pkl"):
        return path.parent.name, path.name.removesuffix("_rotated_pp.pkl"), True
    if path.name.endswith("_rotated.pkl"):
        return path.parent.name, path.name.removesuffix("_rotated.pkl"), False
    return None


def _is_neutral(trial: str) -> bool:
    normalized = trial.strip().casefold()
    return normalized == "neutral" or normalized.startswith(("neutral_", "neutral-", "neutral "))


def _video_files(directory: Path) -> list[Path]:
    return sorted(
        path for path in directory.iterdir()
        if path.is_file() and path.suffix.casefold() in VIDEO_EXTENSIONS
    )


def _thumbnail(frame: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, (48, 64), interpolation=cv2.INTER_AREA)


def infer_sync_frame_offset(original_path: Path, sync_path: Path) -> int:
    """Find which original frame became frame zero of a synchronized video."""
    _, _, _, original_count = video_metadata(original_path)
    _, _, _, sync_count = video_metadata(sync_path)
    if original_count <= sync_count:
        return 0

    original_capture = cv2.VideoCapture(str(original_path))
    original_frames = []
    try:
        while True:
            ok, frame = original_capture.read()
            if not ok:
                break
            original_frames.append(_thumbnail(frame))
    finally:
        original_capture.release()
    if len(original_frames) < sync_count:
        return 0

    max_offset = len(original_frames) - sync_count
    originals = np.asarray(original_frames, dtype=np.float32)
    sample_indices = sorted({0, sync_count // 4, sync_count // 2, 3 * sync_count // 4, sync_count - 1})
    scores = np.zeros(max_offset + 1, dtype=float)
    samples_read = 0
    sync_capture = cv2.VideoCapture(str(sync_path))
    try:
        for frame_index in sample_indices:
            sync_capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = sync_capture.read()
            if not ok:
                continue
            target = _thumbnail(frame).astype(np.float32)
            candidates = originals[frame_index:frame_index + max_offset + 1]
            scores += np.mean((candidates - target) ** 2, axis=(1, 2))
            samples_read += 1
    finally:
        sync_capture.release()
    return int(np.argmin(scores)) if samples_read else 0


def _pose_type(path: Path) -> str:
    return "HRNet" if any("mmpose" in part.casefold() for part in path.parts) else "OpenPose"


def discover_session(path: Path) -> list[dict]:
    """Discover dynamic trials in one OpenCap session."""
    session_path = path.expanduser().resolve()
    videos_dir = session_path / "Videos"
    if not videos_dir.is_dir():
        raise FileNotFoundError(f"OpenCap session has no Videos directory: {session_path}")

    candidates: dict[tuple[str, str], tuple[int, Path, str]] = {}
    for camera_dir in sorted(videos_dir.glob("Cam*")):
        if not camera_dir.is_dir():
            continue
        for pose_path in sorted(camera_dir.glob("OutputPkl*/**/*.pkl")):
            details = _pose_details(pose_path)
            if details is None:
                continue
            trial, original_stem, processed = details
            if _is_neutral(trial):
                continue
            key = (camera_dir.name, trial)
            priority = 2 if processed else 1
            if key not in candidates or priority > candidates[key][0]:
                candidates[key] = (priority, pose_path, original_stem)

    rows = []
    for (camera, trial), (_, pose_path, original_stem) in sorted(candidates.items()):
        input_dir = videos_dir / camera / "InputMedia" / trial
        if not input_dir.is_dir():
            continue
        videos = _video_files(input_dir)
        originals = [
            video for video in videos
            if "sync" not in video.stem.casefold() and "rotated" not in video.stem.casefold()
        ]
        preferred = [video for video in originals if video.stem in {trial, original_stem}]
        original = (preferred or originals or [None])[0]
        sync = next((video for video in videos if "sync" in video.stem.casefold()), None)
        video = sync or original
        if video is None:
            continue

        fps, width, height, frame_count = video_metadata(video)
        pose_width, pose_height = width, height
        pose_frame_offset = 0
        if original is not None:
            _, pose_width, pose_height, _ = video_metadata(original)
            if sync is not None:
                pose_frame_offset = infer_sync_frame_offset(original, sync)
        rows.append({
            "trial": trial,
            "camera": camera,
            "videoPath": str(video.resolve()),
            "posePath": str(pose_path.resolve()),
            "poseType": _pose_type(pose_path),
            "poseFrameOffset": pose_frame_offset,
            "poseWidth": pose_width,
            "poseHeight": pose_height,
            "fps": fps,
            "width": width,
            "height": height,
            "numFrames": frame_count,
            "frameRange": [0, frame_count - 1],
            "durationSeconds": (frame_count - 1) / fps,
        })

    if not rows:
        raise ValueError(
            "No dynamic OpenCap trials found. Expected Videos/Cam*/InputMedia/<trial> "
            "videos with matching OutputPkl* pose files."
        )
    for index, entry in enumerate(rows):
        entry["id"] = str(index)
    return rows


def discover_folder(path: Path) -> list[dict]:
    """Load one OpenCap session or recursively discover a collection."""
    source_path = path.expanduser().resolve()
    if (source_path / "Videos").is_dir():
        return discover_session(source_path)
    if not source_path.is_dir():
        raise FileNotFoundError(f"OpenCap folder does not exist: {source_path}")

    session_paths = sorted({videos_dir.parent for videos_dir in source_path.rglob("Videos")})
    entries = []
    errors = []
    for session_path in session_paths:
        try:
            session_entries = discover_session(session_path)
        except (FileNotFoundError, ValueError) as exc:
            errors.append(f"{session_path.name}: {exc}")
            continue
        for entry in session_entries:
            entry["trial"] = f"{session_path.name} / {entry['trial']}"
            entry["id"] = str(len(entries))
            entries.append(entry)
    if not entries:
        detail = f" ({'; '.join(errors)})" if errors else ""
        raise ValueError(f"No usable OpenCap sessions found below: {source_path}{detail}")
    return entries
