import unittest

from pose_video_review.app import parse_byte_range


class ByteRangeTests(unittest.TestCase):
    def test_parses_open_and_suffix_ranges(self):
        self.assertEqual(parse_byte_range("bytes=10-19", 100), (10, 19))
        self.assertEqual(parse_byte_range("bytes=90-", 100), (90, 99))
        self.assertEqual(parse_byte_range("bytes=-10", 100), (90, 99))

    def test_rejects_out_of_bounds_range(self):
        with self.assertRaises(ValueError):
            parse_byte_range("bytes=100-110", 100)


if __name__ == "__main__":
    unittest.main()
