(function initializeTrialFilters(root) {
  function filterTrials(trials, trialType, saveStatus) {
    return trials.filter((trial) => (
      (trialType === "all" || trial.trialType === trialType)
      && (saveStatus === "all" || trial.saveStatus === saveStatus)
    ));
  }

  const api = { filterTrials };
  root.TrialFilters = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
}(typeof globalThis !== "undefined" ? globalThis : this));
