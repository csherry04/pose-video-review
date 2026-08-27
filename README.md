# Pose Video Review

This tool displays OpenCap sessions with their pose pickles overlaid. It supports
easy scrubbing, focused camera views, and manual sync offsets between cameras.

## Supports

- One OpenCap session or a folder containing multiple sessions
- OpenPose BODY_25 pickles
- OpenCap HRNet/MMPose pickles, both processed and older raw formats
- Shared playback, scrubbing, frame stepping, speed, and looping
- Exact per-frame presentation-timestamp indexing and browser verification
- Per-camera frame alignment sliders
- Independent Dynamic/Neutral and Saved/Unsaved trial filters
- Resizable tiles and a focused single-camera view

Dynamic trials are shown by default. Neutral trials are available through the
**Trial type** filter and use the same saved/unsaved offset status as dynamic
trials. The viewer only reads videos and pose pickles; it does not modify them
or require OpenSim, a GPU, a workstation, or a cloud service.

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

Because browser frame seeking can occasionally be inaccurate, the viewer first
indexes every frame timestamp. It then compares the requested timestamp with
the timestamp the browser actually displays. Each camera header reports the
result.

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

This verifies the frame in the displayed video. Mapping a `_sync` video back to
the original pose sequence assumes the synchronized file is a contiguous trim;
the scanner estimates that trim offset from five image samples.

## Saving alignment

Drag a camera's frame slider to align it with the shared timeline, then click
**Save offsets**. Offsets are written to `pose-video-offsets.json` in the folder
passed to the command and loaded automatically the next time it is opened. If
no folder is passed, it is written to the current terminal directory. This
generated file is ignored by Git.

## Test

```bash
python -m unittest discover -s tests -v
node --check src/pose_video_review/static/app.js
node tests/test_timing.js
node tests/test_filters.js
```

Only load pickle files from sources you trust; Python pickles can execute code
when opened.
