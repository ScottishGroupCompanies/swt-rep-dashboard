import assert from "node:assert/strict";
import test from "node:test";
import { loginCandidates } from "../src/reps.js";

test("DASHBOARD_EXCLUDE_REPS adds non-person codes without a code change", () => {
  const previous = process.env.DASHBOARD_EXCLUDE_REPS;
  process.env.DASHBOARD_EXCLUDE_REPS = "QX";
  try {
    const logins = loginCandidates([
      { company: "SWT", rep: "QX", active: true },
      { company: "SSG", rep: "HOO", active: true },
      { company: "SWT", rep: "Ada Example", active: true },
    ]);
    assert.deepEqual(
      logins.map((login) => login.rep),
      ["Ada Example"],
    );
  } finally {
    if (previous == null) delete process.env.DASHBOARD_EXCLUDE_REPS;
    else process.env.DASHBOARD_EXCLUDE_REPS = previous;
  }
});
