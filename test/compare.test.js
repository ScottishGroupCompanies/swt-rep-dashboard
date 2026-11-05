import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  change,
  comparePeriods,
  orientPeriods,
  periodChange,
  presets,
  rangeLabel,
  topStates,
  typeRows,
} from "../src/compare.js";

const jobs = [
  { monthKey: "2026-09", charged: 100, commission: 7, status: "ok", jobType: "Residential", state: "CO" },
  { monthKey: "2026-10", charged: 200, commission: 0, status: "below_floor", jobType: "Commercial", state: "TX" },
  { monthKey: "2026-10", charged: 50, commission: 3.5, status: "ok", jobType: "Residential", state: "CO" },
  { monthKey: "2026-11", charged: 80, commission: 5, status: "undersold", jobType: "Commercial", state: "CO" },
];

test("Sep 2026–Oct 2026 includes both months and reports the split", () => {
  const { a, b } = comparePeriods(
    jobs,
    { start: "2026-10", end: "2026-09" },
    { start: "2026-11", end: "2026-11" },
  );
  assert.equal(rangeLabel(a.start, a.end), "Sep–Oct 2026");
  assert.equal(a.sales, 350);
  assert.equal(a.commission, 10.5);
  assert.equal(a.count, 3);
  assert.equal(Math.round(a.avg * 100), Math.round((350 / 3) * 100));
  assert.equal(a.belowFloor, 1);
  assert.equal(b.sales, 80);
  assert.equal(b.count, 1);
  assert.equal(b.belowFloor, 0);

  const types = typeRows(a, b);
  assert.deepEqual(types.map((row) => row.name), ["Residential", "Commercial"]);
  assert.equal(types[0].earlier.sales, 150);
  assert.equal(types[1].earlier.sales, 200);
  assert.equal(types[1].later.sales, 80);

  const states = topStates(a, b, 5);
  assert.equal(states[0].state, "CO");
  assert.equal(states[0].earlier.sales, 150);
  assert.equal(states[0].later.sales, 80);
  assert.equal(states[1].state, "TX");
  assert.equal(states[1].change.diff, -200);
});

test("change is the later value minus the earlier value, with no percent when the earlier value is zero", () => {
  assert.deepEqual(change(110, 100), { diff: 10, pct: 10 });
  assert.equal(change(95, 100).pct, -5);
  assert.deepEqual(change(0, 0), { diff: 0, pct: 0 });
  assert.equal(change(25, 0).pct, null);
  assert.equal(change(25, 0).diff, 25);
});

test("presets are this month vs last month and this quarter vs last quarter", () => {
  const keys = ["2026-08", "2026-09", "2026-10", "2026-11"];
  const preset = presets(keys);
  assert.deepEqual(preset.month, {
    a: { start: "2026-11", end: "2026-11" },
    b: { start: "2026-10", end: "2026-10" },
  });
  assert.equal(preset.quarter.a.start, "2026-10");
  assert.equal(preset.quarter.a.end, "2026-11");
  assert.equal(preset.quarter.b.start, "2026-08");
  assert.equal(preset.quarter.b.end, "2026-09");
});

test("Nick snapshot Nov vs Oct uses stored job totals", async () => {
  const data = JSON.parse(await readFile(new URL("../data/nick_dashboard.json", import.meta.url), "utf8"));
  assert.equal(data.rep.displayName, "Nick");
  const { a, b } = comparePeriods(
    data.jobs,
    { start: "2026-11", end: "2026-11" },
    { start: "2026-10", end: "2026-10" },
  );
  const sum = (rows, field) => Math.round(rows.reduce((total, job) => total + Number(job[field] || 0), 0) * 100);
  const nov = data.jobs.filter((job) => job.monthKey === "2026-11");
  const oct = data.jobs.filter((job) => job.monthKey === "2026-10");
  assert.equal(Math.round(a.sales * 100), sum(nov, "charged"));
  assert.equal(Math.round(a.commission * 100), sum(nov, "commission"));
  assert.equal(a.count, nov.length);
  assert.equal(a.belowFloor, nov.filter((job) => job.status === "below_floor").length);
  assert.equal(Math.round(b.sales * 100), sum(oct, "charged"));
  assert.equal(b.count, oct.length);
  const preset = presets(data.months.map((month) => month.key));
  assert.deepEqual(preset.month.a, { start: "2026-11", end: "2026-11" });
  assert.deepEqual(preset.month.b, { start: "2026-10", end: "2026-10" });
  assert.equal(preset.quarter.a.start, "2026-10");
  assert.equal(preset.quarter.b.start, "2026-07");
  assert.equal(preset.quarter.b.end, "2026-09");
});

test("Sep 2026 to Oct 2026 is +$14,569.56 / +306.1% in either slot", async () => {
  const data = JSON.parse(await readFile(new URL("../data/nick_dashboard.json", import.meta.url), "utf8"));
  const sep = { start: "2026-09", end: "2026-09" };
  const oct = { start: "2026-10", end: "2026-10" };
  const fields = ["sales", "commission", "count", "avg", "belowFloor"];

  for (const [rangeA, rangeB] of [[sep, oct], [oct, sep]]) {
    const { a, b } = comparePeriods(data.jobs, rangeA, rangeB);
    const direction = orientPeriods(a, b);
    assert.equal(direction.label, "Sep 2026 → Oct 2026");
    assert.equal(Math.round(direction.earlier.sales * 100), 475904);
    assert.equal(Math.round(direction.later.sales * 100), 1932860);
    const sales = periodChange(a, b, (period) => period.sales);
    assert.equal(Math.round(sales.diff * 100), 1456956);
    assert.equal(sales.pct.toFixed(1), "306.1");
    for (const field of fields) {
      const delta = periodChange(a, b, (period) => period[field]);
      assert.equal(delta.diff, direction.later[field] - direction.earlier[field], field);
    }
    for (const row of [...typeRows(a, b), ...topStates(a, b)]) {
      assert.equal(row.change.diff, row.later.sales - row.earlier.sales);
    }
  }
});
