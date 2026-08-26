const assert = require("node:assert/strict");
const { frameForMediaTime, frameSeekTime } = require("../src/pose_video_review/static/timing.js");

const variableTimes = [0, 0.016, 0.035, 0.051];
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12);

assert.equal(frameForMediaTime(variableTimes, 60, 0.000), 0);
assert.equal(frameForMediaTime(variableTimes, 60, 0.016), 1);
assert.equal(frameForMediaTime(variableTimes, 60, 0.034), 2);
assert.equal(frameForMediaTime(variableTimes, 60, 0.049), 3);

approximately(frameSeekTime(variableTimes, 60, 1), 0.0255);
approximately(frameSeekTime(variableTimes, 60, 1, 1), 0.02075);
approximately(frameSeekTime(variableTimes, 60, 1, 2), 0.03025);
assert.ok(frameSeekTime(variableTimes, 60, 3) > variableTimes[3]);

assert.equal(frameForMediaTime([], 50, 0.1), 5);
assert.equal(frameSeekTime([], 50, 5), 0.1);

console.log("Frame timing tests passed.");
