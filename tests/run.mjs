/**
 * Test runner. `node tests/run.mjs`
 *
 * Imports each suite for its side effects (describe() registers), then runs.
 */
import { run } from "./harness.mjs";

await import("./e2e.budget-approvals.mjs");
await import("./e2e.attendance.mjs");
await import("./e2e.roles-reporting.mjs");

process.stdout.write("\n  Culturals — end-to-end suite\n");
const ok = await run();
process.exit(ok ? 0 : 1);
