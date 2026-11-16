import assert from "node:assert/strict";
import test from "node:test";
import { comparePeriods } from "../src/compare.js";
import { canonicalDate, canonicalMonth } from "../src/months.js";
import { compareReps } from "../src/rep-compare.js";
import { prepareSnapshot } from "../src/sales.js";
import { buildDashboard } from "../src/view.js";

function job(overrides = {}) {
  return {
    company: "SHI",
    rep: "Lee Example",
    date_sold: "1/9/2026",
    month: "8-August",
    quote_no: "HI-1",
    job_name: "Sample Remodel",
    state: "CO",
    location: "CO",
    job_type: "Remodel",
    amount: 100,
    amount_pre_fee: 100,
    is_change_order: false,
    status: "",
    tab: "2026",
    row: 2,
    ...overrides,
  };
}

test("SHI Month Sold and Date Sold normalize from the sheet tab", () => {
  assert.equal(canonicalMonth("8-August", "2026"), "2026-08");
  assert.equal(canonicalMonth("1-January", "2026"), "2026-01");
  assert.equal(canonicalMonth("4-April", "2025"), "2025-04");
  assert.equal(canonicalMonth("2026-08", "2026"), "2026-08");
  assert.equal(canonicalDate("1/9/2026"), "2026-01-09");
  assert.equal(canonicalDate("2026-01-09"), "2026-01-09");

  const prepared = prepareSnapshot({
    swt_jobs: { jobs: [] },
    ssg_jobs: { jobs: [] },
    shi_jobs: {
      jobs: [
        job({ amount: 100, amount_pre_fee: 100, month: "8-August", date_sold: "1/9/2026", row: 2 }),
        job({ amount: 20, amount_pre_fee: 20, month: "8-August", date_sold: "8/2/2026", row: 3 }),
        job({ amount: 7, amount_pre_fee: 7, month: "1-January", date_sold: "1/15/2026", row: 4 }),
        job({ rep: "Rio Example", amount: 5, amount_pre_fee: 5, month: "1-January", row: 5 }),
        job({ rep: "Rio Example", amount: 9, amount_pre_fee: 9, month: "3-March", row: 6 }),
        job({ amount: 50, amount_pre_fee: 50, month: "4-April", row: 7 }),
      ],
    },
    reps: {
      reps: [
        { company: "SHI", rep: "Lee Example", active: true },
        { company: "SHI", rep: "Rio Example", active: true },
      ],
    },
  });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  assert.equal(prepared.snapshot.shi.jobs[0].month, "2026-08");
  assert.equal(prepared.snapshot.shi.jobs[0].date_sold, "2026-01-09");
  assert.equal(prepared.snapshot.shi.jobs[0].year, "2026");
});

test("changing SHI month and quarter changes the comparison", () => {
  const jobs = [
    { repKey: "lee", name: "Lee", year: "2026", month: "8-August", amount: 100, date: "1/9/2026" },
    { repKey: "lee", name: "Lee", year: "2026", month: "8-August", amount: 20, date: "8/2/2026" },
    { repKey: "lee", name: "Lee", year: "2026", month: "1-January", amount: 7, date: "1/15/2026" },
    { repKey: "rio", name: "Rio", year: "2026", month: "1-January", amount: 5, date: "1/4/2026" },
    { repKey: "rio", name: "Rio", year: "2026", month: "3-March", amount: 9, date: "3/1/2026" },
    { repKey: "lee", name: "Lee", year: "2026", month: "4-April", amount: 50, date: "4/1/2026" },
    { repKey: "lee", name: "Lee", year: "2025", month: "8-August", amount: 3, date: "8/1/2025" },
  ];
  const reps = [
    { repKey: "lee", name: "Lee" },
    { repKey: "rio", name: "Rio" },
  ];
  const august = compareReps(jobs, { reps, periods: [{ mode: "month", year: "2026", month: 8 }] });
  const january = compareReps(jobs, { reps, periods: [{ mode: "month", year: "2026", month: 1 }] });
  assert.deepEqual(
    august.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Lee", 2, 120],
      ["Rio", 0, 0],
    ],
  );
  assert.deepEqual(
    january.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Lee", 1, 7],
      ["Rio", 1, 5],
    ],
  );
  assert.notDeepEqual(august.periods[0].rows, january.periods[0].rows);

  const quarter = compareReps(jobs, { reps, periods: [{ mode: "quarter", year: "2026", quarter: 1 }] });
  assert.deepEqual(
    quarter.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Lee", 1, 7],
      ["Rio", 2, 14],
    ],
  );

  const periods = comparePeriods(
    jobs.map((row) => ({ monthKey: canonicalMonth(row.month, row.year), charged: row.amount, commission: 0, jobType: "Remodel", state: "CO", status: "ok" })),
    { start: "2026-08", end: "2026-08" },
    { start: "2026-01", end: "2026-01" },
  );
  assert.equal(periods.a.sales, 120);
  assert.equal(periods.b.sales, 12);
  assert.notEqual(periods.a.sales, periods.b.sales);
});

test("stored SHI sheet months still compare after sign-in", () => {
  const prepared = prepareSnapshot({
    swt_jobs: { jobs: [] },
    ssg_jobs: { jobs: [] },
    shi_jobs: {
      jobs: [
        job({ amount: 100, amount_pre_fee: 100, month: "8-August", row: 2 }),
        job({ amount: 7, amount_pre_fee: 7, month: "1-January", row: 3 }),
        job({ rep: "Rio Example", amount: 5, amount_pre_fee: 5, month: "1-January", row: 4 }),
      ],
    },
    reps: {
      reps: [
        { company: "SHI", rep: "Lee Example", active: true },
        { company: "SHI", rep: "Rio Example", active: true },
      ],
    },
  });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  const keys = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, { company: "SHI" }).body.leaderboard.map(
    (row) => row.repKey,
  );
  const january = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SHI",
    compare: "month",
    year: "2026",
    month: "1",
    reps: keys.join(","),
  });
  const august = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SHI",
    compare: "month",
    year: "2026",
    month: "8",
    reps: keys.join(","),
  });
  assert.notDeepEqual(
    january.body.repCompare.periods[0].rows.map((row) => row.sales),
    august.body.repCompare.periods[0].rows.map((row) => row.sales),
  );
  assert.equal(august.body.repCompare.periods[0].rows.find((row) => row.name === "Lee").sales, 100);
  assert.equal(january.body.repCompare.periods[0].rows.find((row) => row.name === "Lee").sales, 7);
});
