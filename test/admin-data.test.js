import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDemo, fakeCharged, fakeRate } from "../src/admin-data.js";
import { computeCommission } from "../src/commission.js";

test("simulated dollars are deterministic and ignore any source price", () => {
  assert.equal(fakeCharged("SG-00917:2026"), fakeCharged("SG-00917:2026"));
  assert.notEqual(fakeCharged("SG-00917:2026"), fakeCharged("SG-00917:2025"));
  assert.equal(fakeCharged("SG-00917:2026") % 50, 0);
  assert.equal(fakeRate("AH"), fakeRate("AH"));
  assert.ok(fakeRate("DE") >= 0.045 && fakeRate("DE") <= 0.085);
});

test("admin roster uses first names only and simulated commission", async () => {
  const raw = JSON.parse(await readFile(new URL("../data/admin-jobs.json", import.meta.url), "utf8"));
  assert.equal(JSON.stringify(raw).includes("charged"), false);
  const demo = buildDemo(raw);
  const names = demo.reps.map((rep) => rep.name);
  for (const name of ["Amy", "Blake", "Derek", "John", "Scott", "Dana", "Katie"]) {
    assert.ok(names.includes(name), name);
  }
  for (const rep of demo.reps) {
    assert.equal(rep.name.split(/\s+/).length, 1, rep.name);
    for (const job of rep.jobs) {
      const row = computeCommission(rep.rate, job.charged, job.listPrice);
      assert.equal(job.commission, row.commission, job.id);
    }
  }
  const katie = demo.reps.find((rep) => rep.name === "Katie");
  assert.equal(katie.name, "Katie");
  assert.equal(JSON.stringify(demo).includes("Katie "), false);
  assert.ok(demo.jobs2025.length > 0);
  assert.ok(demo.jobs2025.every((job) => job.monthKey.startsWith("2025-")));
  assert.ok(demo.sales > 0 && demo.commission > 0);
});
