import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pose_video_review.discovery import discover_folder, discover_session


METADATA = (60.0, 720, 1280, 120)


def create_trial(
    session: Path,
    camera: str = "Cam0",
    trial: str = "squat",
    output_folder: str = "OutputPkl",
    pose_name: str | None = None,
) -> tuple[Path, Path]:
    video = session / "Videos" / camera / "InputMedia" / trial / f"{trial}.mp4"
    pose_name = pose_name or f"{trial}_keypoints.pkl"
    pose = session / "Videos" / camera / output_folder / pose_name
    video.parent.mkdir(parents=True, exist_ok=True)
    pose.parent.mkdir(parents=True, exist_ok=True)
    video.touch()
    pose.touch()
    return video, pose


class DiscoveryTests(unittest.TestCase):
    def test_discovers_legacy_openpose_pickle(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "OpenCapData_session"
            video, pose = create_trial(session)

            with patch("pose_video_review.discovery.video_metadata", return_value=METADATA):
                entries = discover_session(session)

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["trial"], "squat")
            self.assertEqual(entries[0]["videoPath"], str(video.resolve()))
            self.assertEqual(entries[0]["posePath"], str(pose.resolve()))
            self.assertEqual(entries[0]["poseType"], "OpenPose")

    def test_discovers_current_openpose_and_hrnet_layouts(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "OpenCapData_session"
            _, openpose = create_trial(
                session, "Cam0", "jump", "OutputPkl_default/jump", "trial-id_rotated_pp.pkl"
            )
            _, hrnet = create_trial(
                session, "Cam1", "squat", "OutputPkl_mmpose_0.8/squat", "trial-id_rotated_pp.pkl"
            )

            with patch("pose_video_review.discovery.video_metadata", return_value=METADATA):
                entries = discover_session(session)

            self.assertEqual({entry["posePath"] for entry in entries}, {str(openpose.resolve()), str(hrnet.resolve())})
            self.assertEqual({entry["poseType"] for entry in entries}, {"OpenPose", "HRNet"})

    def test_prefers_processed_pickle_over_raw_hrnet_pickle(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "OpenCapData_session"
            _, raw = create_trial(
                session, "Cam0", "squat", "OutputPkl_mmpose_0.8/squat", "trial-id_rotated.pkl"
            )
            processed = raw.with_name("trial-id_rotated_pp.pkl")
            processed.touch()

            with patch("pose_video_review.discovery.video_metadata", return_value=METADATA):
                entries = discover_session(session)

            self.assertEqual(entries[0]["posePath"], str(processed.resolve()))

    def test_excludes_neutral_trials(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "OpenCapData_session"
            create_trial(session, trial="neutral")
            create_trial(session, trial="squat")

            with patch("pose_video_review.discovery.video_metadata", return_value=METADATA):
                entries = discover_session(session)

            self.assertEqual([entry["trial"] for entry in entries], ["squat"])

    def test_discovers_multiple_sessions_and_uses_unique_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "downloads"
            create_trial(root / "OpenCapData_one")
            create_trial(root / "nested" / "OpenCapData_two")

            with patch("pose_video_review.discovery.video_metadata", return_value=METADATA):
                entries = discover_folder(root)

            self.assertEqual([entry["id"] for entry in entries], ["0", "1"])
            self.assertEqual(
                {entry["trial"] for entry in entries},
                {"OpenCapData_one / squat", "OpenCapData_two / squat"},
            )

    def test_uses_sync_video_and_inferred_pose_frame_offset(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "OpenCapData_session"
            video, _ = create_trial(session)
            sync = video.with_name("squat_sync.mp4")
            sync.touch()

            with (
                patch("pose_video_review.discovery.video_metadata", return_value=METADATA),
                patch("pose_video_review.discovery.infer_sync_frame_offset", return_value=12),
            ):
                entry = discover_session(session)[0]

            self.assertEqual(entry["videoPath"], str(sync.resolve()))
            self.assertEqual(entry["poseFrameOffset"], 12)


if __name__ == "__main__":
    unittest.main()
