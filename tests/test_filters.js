const assert = require("node:assert/strict");
const { filterTrials } = require("../src/pose_video_review/static/filters.js");

const trials = [
  { id: "squat", trialType: "dynamic", saveStatus: "saved" },
  { id: "jump", trialType: "dynamic", saveStatus: "unsaved" },
  { id: "neutral", trialType: "neutral", saveStatus: "unsaved" },
];

assert.deepEqual(filterTrials(trials, "dynamic", "all").map((trial) => trial.id), ["squat", "jump"]);
assert.deepEqual(filterTrials(trials, "neutral", "all").map((trial) => trial.id), ["neutral"]);
assert.deepEqual(filterTrials(trials, "all", "saved").map((trial) => trial.id), ["squat"]);
assert.deepEqual(filterTrials(trials, "neutral", "unsaved").map((trial) => trial.id), ["neutral"]);
assert.deepEqual(filterTrials(trials, "neutral", "saved"), []);

console.log("Trial filter tests passed.");
