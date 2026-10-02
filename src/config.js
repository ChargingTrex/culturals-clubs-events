/**
 * Release identity and where feedback goes.
 *
 * Kept in one place so the banner, the feedback form and the issue it opens all
 * name the same build — feedback that cannot be tied to a build cannot be acted on.
 */
export const APP = {
  name: "Culturals",
  version: "0.2.0",
  channel: "Pilot",
};

export const FEEDBACK = {
  /** Feedback opens a pre-filled issue here, using the form in .github/ISSUE_TEMPLATE. */
  repo: "ChargingTrex/culturals-clubs-events",
  issueTemplate: "pilot-feedback.yml",
  /**
   * Optional. Set an address to offer "Send by email" as well, for testers with no
   * GitHub account. Left empty, the option is not shown.
   */
  email: "",
};

/**
 * Build details written by the deploy job (build.json: commit, time, test result).
 * Absent when running from a checkout, which is fine — the app says "local build".
 */
let buildPromise = null;
export function buildInfo() {
  if (!buildPromise) {
    buildPromise = typeof fetch === "function" && typeof location !== "undefined"
      ? fetch("build.json", { cache: "no-store" })
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null)
      : Promise.resolve(null);
  }
  return buildPromise;
}

export const buildLabel = info => (info && info.commit
  ? `v${APP.version} · ${String(info.commit).slice(0, 7)}`
  : `v${APP.version} · local build`);
