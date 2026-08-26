import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pose_video_review.state import ViewerState


def entries(root: Path) -> list[dict]:
    return [
        {
            "id": str(index),
            "trial": "squat",
            "camera": f"Cam{index}",
            "videoPath": str(root / f"cam{index}.mp4"),
            "posePath": str(root / f"cam{index}.pkl"),
            "fps": 60.0,
            "width": 640,
            "height": 360,
            "numFrames": 120,
            "frameRange": [0, 119],
            "durationSeconds": 119 / 60,
        }
        for index in range(2)
    ]


class StateTests(unittest.TestCase):
    def test_saved_status_requires_every_camera_even_for_zero_offsets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            discovered = entries(root)
            with patch("pose_video_review.state.discover_folder", return_value=copy.deepcopy(discovered)):
                state = ViewerState(root)

            self.assertEqual(state.trials()[0]["saveStatus"], "unsaved")
            state.save_offsets([{"id": "0", "offset_frames": 0}])
            self.assertEqual(state.trials()[0]["saveStatus"], "unsaved")
            state.save_offsets([{"id": "1", "offset_frames": -7}])
            self.assertEqual(state.trials()[0]["saveStatus"], "saved")

    def test_offsets_reload_by_video_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            discovered = entries(root)
            with patch("pose_video_review.state.discover_folder", return_value=copy.deepcopy(discovered)):
                state = ViewerState(root)
                result = state.save_offsets([
                    {"id": "0", "offset_frames": 8},
                    {"id": "1", "offset_frames": -3},
                ])
            with patch("pose_video_review.state.discover_folder", return_value=copy.deepcopy(discovered)):
                reloaded = ViewerState(root)

            self.assertEqual(Path(result["path"]).resolve(), (root / "pose-video-offsets.json").resolve())
            self.assertEqual([entry["savedOffsetFrames"] for entry in reloaded.entries], [8, -3])
            payload = json.loads((root / "pose-video-offsets.json").read_text())
            self.assertEqual(payload["version"], 1)

    def test_rejects_unknown_video_id(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch("pose_video_review.state.discover_folder", return_value=entries(root)):
                state = ViewerState(root)
            with self.assertRaisesRegex(ValueError, "known video id"):
                state.save_offsets([{"id": "missing", "offset_frames": 1}])


if __name__ == "__main__":
    unittest.main()
