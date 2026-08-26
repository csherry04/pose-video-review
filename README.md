# Pose Video Review

This is a tool to view an OpenCap session with its pose pickles overlayed and allow for easy scrubbing, focused views, and customizing sync offsets between cameras. 

## Supports

- One OpenCap session or a folder containing multiple sessions
- OpenPose and HRNet pickles
- Shared playback, scrubbing, frame stepping
- Per-camera sliders to apply delays
- Resizable tiles and a focused single-camera view

## Install

```bash
conda env create -f environment.yml
conda activate pose-video-review
python -m pip install --no-build-isolation --no-deps -e .
```

## Run

Point the command at an OpenCap session:

```bash
pose-video-review /path/to/OpenCapData_<session-id>
```

Or at a folder containing multiple OpenCap sessions:

```bash
pose-video-review /path/to/opencap-downloads
```

If the sessions are inside the repository, the folder argument can be omitted:

```bash
pose-video-review
```

Open <http://127.0.0.1:8877>.

## Expected OpenCap files

Each camera needs a matching video and pose pickle. The scanner supports the
standard layouts used by OpenCap, including:

```text
OpenCapData_<id>/
└── Videos/
    └── Cam0/
        ├── InputMedia/<trial>/<video>.mov
        ├── OutputPkl*/<trial>/*_rotated_pp.pkl
        └── OutputPkl/<trial>_keypoints.pkl
```

When a browser-compatible `_sync` video exists, the viewer uses it and aligns
it with the original pose frames automatically. Otherwise it uses the original
video. 

## Frame accuracy

Due to some occasional inaccuracies with frame seeking, the frames are first indexed
with their timestamp and this timestamp is compared to the timestamp being displayed
in app to verify it is the correct frame. This is what the top right in each camera view is saying.

Camera headers show the current state:

- `frame N ✓` means the requested paused frame was presented and verified.
- `seeking frame N…` means verification is still in progress.
- `frame N ≠ requested M` means the browser did not present the requested frame
  after three attempts.
- `frame N · live` means playback is smooth and the overlay follows each frame
  reported by the compositor.
- `unverified` means the browser lacks `requestVideoFrameCallback`; playback
  still works using the timestamp index, but exact presentation cannot be
  confirmed.

## Saving alignment

Drag a camera's frame slider to align it with the shared timeline, then click
**Save offsets**. Offsets are written to `pose-video-offsets.json` in the folder
passed to the command and loaded automatically the next time it is opened. Otherwise
it is written to the current terminal directory. 
This generated file is ignored by Git.

## Test

```bash
python -m unittest discover -s tests -v
node --check src/pose_video_review/static/app.js
node tests/test_timing.js
```

