import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarQuarter,
  change,
  comparePeriods,
  orientPeriods,
  periodChange,
  presets,
  quarterOf,
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
  assert.deepEqual(preset.quarter.a, calendarQuarter(2026, 4));
  assert.deepEqual(preset.quarter.b, calendarQuarter(2026, 3));
  assert.equal(preset.quarter.a.start, "2026-10");
  assert.equal(preset.quarter.a.end, "2026-12");
  assert.equal(preset.quarter.b.start, "2026-07");
  assert.equal(preset.quarter.b.end, "2026-09");
});

test("calendar quarters are Jan–Mar, Apr–Jun, Jul–Sep, and Oct–Dec", () => {
  const bounds = [
    ["2026-01", 1, "2026-01", "2026-03"],
    ["2026-02", 1, "2026-01", "2026-03"],
    ["2026-03", 1, "2026-01", "2026-03"],
    ["2026-04", 2, "2026-04", "2026-06"],
    ["2026-06", 2, "2026-04", "2026-06"],
    ["2026-07", 3, "2026-07", "2026-09"],
    ["2026-09", 3, "2026-07", "2026-09"],
    ["2026-10", 4, "2026-10", "2026-12"],
    ["2026-12", 4, "2026-10", "2026-12"],
    ["2025-12", 4, "2025-10", "2025-12"],
  ];
  for (const [month, quarter, start, end] of bounds) {
    const found = quarterOf(month);
    assert.equal(found.quarter, quarter, month);
    assert.equal(found.year, Number(month.slice(0, 4)), month);
    const range = calendarQuarter(found.year, found.quarter);
    assert.equal(range.start, start, month);
    assert.equal(range.end, end, month);
  }
  assert.equal(quarterOf("2026-03").quarter, 1);
  assert.equal(quarterOf("2026-04").quarter, 2);
  assert.equal(presets(["2026-01"]).quarter.b.id, "2025-Q4");
  assert.equal(presets(["2026-01"]).quarter.b.start, "2025-10");
  assert.equal(presets(["2026-01"]).quarter.b.end, "2025-12");
});

test("different Month Sold periods total different jobs, ignoring date sold", () => {
  const sample = [
    { monthKey: "2026-01", charged: 10, commission: 0, status: "ok", jobType: "Residential", state: "CO", dateSold: "2025-11-02" },
    { monthKey: "2026-03", charged: 20, commission: 0, status: "ok", jobType: "Residential", state: "CO", dateSold: "2024-01-01" },
    { monthKey: "2026-04", charged: 40, commission: 0, status: "ok", jobType: "Commercial", state: "TX", dateSold: "2026-04-02" },
    { monthKey: "2026-12", charged: 3, commission: 0, status: "ok", jobType: "Commercial", state: "TX", dateSold: "2021-05-01" },
    { monthKey: "2025-12", charged: 999, commission: 0, status: "ok", jobType: "Residential", state: "CO", dateSold: "2026-01-15" },
  ];
  const q1 = { start: "2026-01", end: "2026-03" };
  const q2 = { start: "2026-04", end: "2026-06" };
  const q4 = { start: "2026-10", end: "2026-12" };
  const january = { start: "2026-01", end: "2026-01" };

  const first = comparePeriods(sample, january, q1);
  assert.equal(first.a.sales, 10);
  assert.equal(first.a.count, 1);
  assert.equal(first.b.sales, 30);
  assert.equal(first.b.count, 2);
  assert.notEqual(first.a.sales, first.b.sales);

  const quarters = comparePeriods(sample, q2, q4);
  assert.equal(quarters.a.sales, 40);
  assert.equal(quarters.a.count, 1);
  assert.equal(quarters.b.sales, 3);
  assert.equal(quarters.b.count, 1);
  const direction = orientPeriods(quarters.a, quarters.b);
  assert.equal(direction.label, "Apr–Jun 2026 → Oct–Dec 2026");
  assert.equal(periodChange(quarters.a, quarters.b, (period) => period.sales).diff, 3 - 40);

  const december = comparePeriods(sample, { start: "2025-12", end: "2025-12" }, january);
  assert.equal(december.a.sales, 999);
  assert.equal(december.b.sales, 10);
});

test("change is the later period minus the earlier period in either slot", () => {
  const sample = [
    { monthKey: "2026-09", charged: 100, commission: 1, status: "ok", jobType: "Residential", state: "CO" },
    { monthKey: "2026-10", charged: 250, commission: 2, status: "ok", jobType: "Commercial", state: "TX" },
  ];
  const sep = { start: "2026-09", end: "2026-09" };
  const oct = { start: "2026-10", end: "2026-10" };
  for (const [rangeA, rangeB] of [[sep, oct], [oct, sep]]) {
    const { a, b } = comparePeriods(sample, rangeA, rangeB);
    const direction = orientPeriods(a, b);
    assert.equal(direction.label, "Sep 2026 → Oct 2026");
    assert.equal(direction.earlier.sales, 100);
    assert.equal(direction.later.sales, 250);
    const sales = periodChange(a, b, (period) => period.sales);
    assert.equal(sales.diff, 150);
    assert.equal(sales.pct.toFixed(1), "150.0");
    for (const field of ["sales", "count", "avg"]) {
      const delta = periodChange(a, b, (period) => period[field]);
      assert.equal(delta.diff, direction.later[field] - direction.earlier[field], field);
    }
    for (const row of [...typeRows(a, b), ...topStates(a, b)]) {
      assert.equal(row.change.diff, row.later.sales - row.earlier.sales);
    }
  }
});
