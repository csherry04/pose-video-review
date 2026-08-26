import unittest

from pose_video_review.pose import normalize_pose


class PoseTests(unittest.TestCase):
    def test_normalizes_openpose_body25(self):
        keypoints = []
        for index in range(25):
            keypoints.extend([index + 0.25, index + 0.5, 0.9])

        frames = normalize_pose([[{"person_id": [0], "pose_keypoints_2d": keypoints}], []])

        self.assertEqual(frames[0]["neck"], [1.25, 1.5])
        self.assertEqual(frames[0]["right_heel"], [24.25, 24.5])
        self.assertIsNone(frames[1])

    def test_normalizes_raw_hrnet_and_builds_midpoints(self):
        keypoints = [[index + 0.25, index + 0.5, 0.9] for index in range(23)]

        frames = normalize_pose([[{"track_id": 0, "preds_with_flip": keypoints}], []])

        self.assertEqual(frames[0]["left_shoulder"], [5.25, 5.5])
        self.assertEqual(frames[0]["right_heel"], [22.25, 22.5])
        self.assertEqual(frames[0]["neck"], [5.75, 6.0])
        self.assertEqual(frames[0]["mid_hip"], [11.75, 12.0])
        self.assertIsNone(frames[1])

    def test_selects_person_with_highest_average_confidence(self):
        low = [value for _ in range(25) for value in (1, 2, 0.1)]
        high = [value for _ in range(25) for value in (3, 4, 0.9)]

        frame = normalize_pose([[
            {"pose_keypoints_2d": low},
            {"pose_keypoints_2d": high},
        ]])[0]

        self.assertEqual(frame["neck"], [3.0, 4.0])

    def test_rejects_unknown_pickle_structure(self):
        with self.assertRaisesRegex(ValueError, "Unsupported pose pickle structure"):
            normalize_pose([[{"keypoints": [[1, 2, 0.9]]}]])


if __name__ == "__main__":
    unittest.main()
