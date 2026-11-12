import assert from "node:assert/strict";
import test from "node:test";
import { compareReps } from "../src/rep-compare.js";
import { repKey } from "../src/reps.js";
import { prepareSnapshot } from "../src/sales.js";
import { buildDashboard } from "../src/view.js";

function job(overrides = {}) {
  return {
    company: "SWT",
    rep: "Blake Example",
    date_sold: "2025-08-01",
    month: "2026-08",
    quote_no: "WT-1",
    job_name: "Sample Shop",
    state: "CO",
    location: "CO",
    job_type: "Residential",
    amount: 100,
    amount_pre_fee: 100,
    is_change_order: false,
    status: "",
    tab: "2026",
    row: 2,
    ...overrides,
  };
}

const blake = repKey("Blake Example");
const amy = repKey("Amy Example");
const reps = [
  { repKey: blake, name: "Blake" },
  { repKey: amy, name: "Amy" },
];

const jobs = [
  job({ amount: 100, amount_pre_fee: 100, date_sold: "2025-08-01", month: "2026-08", row: 2 }),
  job({ amount: 40, amount_pre_fee: 40, date_sold: "2026-08-02", month: "2026-08", row: 3 }),
  job({ amount: 999, amount_pre_fee: 999, month: "2025-08", date_sold: "2026-08-03", row: 4 }),
  job({ amount: 888, amount_pre_fee: 888, tab: "2025", month: "2026-08", date_sold: "2026-08-04", row: 5 }),
  job({ rep: "Amy Example", amount: 25, amount_pre_fee: 25, month: "2026-08", row: 6 }),
  job({ rep: "Blake Example", amount: 7, amount_pre_fee: 7, month: "2026-01", row: 7 }),
  job({ rep: "Blake Example", amount: 8, amount_pre_fee: 8, month: "2026-03", row: 8 }),
  job({ rep: "Blake Example", amount: 50, amount_pre_fee: 50, month: "2026-04", row: 9 }),
  job({ rep: "Amy Example", amount: 10, amount_pre_fee: 10, month: "2026-01", row: 10 }),
  job({ rep: "Amy Example", amount: 15, amount_pre_fee: 15, month: "2026-02", row: 11 }),
  job({ rep: "Amy Example", amount: 5, amount_pre_fee: 5, month: "2026-03", row: 12 }),
  job({ rep: "Amy Example", company: "SSG", amount: 500, amount_pre_fee: 500, month: "2026-08", row: 13 }),
  job({ rep: "Blake Example", amount: 4, amount_pre_fee: 4, tab: "2025", month: "2025-02", date_sold: "2025-02-01", row: 14 }),
].map((row) => ({ ...row, repKey: repKey(row.rep), year: String(row.tab) }));

test("Blake vs Amy August uses the sheet tab and Month Sold", () => {
  const result = compareReps(jobs.filter((row) => row.company === "SWT"), {
    reps,
    periods: [{ mode: "month", year: "2026", month: 8 }],
  });
  const [blakeRow, amyRow] = result.periods[0].rows;
  assert.equal(result.periods[0].label, "Aug 2026");
  assert.equal(blakeRow.jobs, 2);
  assert.equal(blakeRow.sales, 140);
  assert.equal(amyRow.jobs, 1);
  assert.equal(amyRow.sales, 25);
  assert.notEqual(blakeRow.sales, amyRow.sales);
});

test("Blake vs Amy Q1 is January through March of that sheet year", () => {
  const result = compareReps(jobs.filter((row) => row.company === "SWT"), {
    reps,
    periods: [
      { mode: "quarter", year: "2026", quarter: 1 },
      { mode: "quarter", year: "2025", quarter: 1 },
    ],
  });
  assert.equal(result.periods[0].label, "Q1 2026");
  assert.equal(result.periods[1].label, "Q1 2025");
  assert.deepEqual(
    result.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Blake", 2, 15],
      ["Amy", 3, 30],
    ],
  );
  assert.equal(result.periods[1].rows[0].sales, 4);
  assert.equal(result.periods[1].rows[1].sales, 0);
});

test("admin comparison matches those totals and a rep cannot request it", () => {
  const prepared = prepareSnapshot({
    swt_jobs: { generated_at: "2026-01-01T00:00:00Z", jobs: jobs.filter((row) => row.company === "SWT") },
    ssg_jobs: { generated_at: "2026-01-01T00:00:00Z", jobs: jobs.filter((row) => row.company === "SSG") },
    reps: {
      generated_at: "2026-01-01T00:00:00Z",
      reps: [
        { company: "SWT", rep: "Blake Example", active: true },
        { company: "SWT", rep: "Amy Example", active: true },
        { company: "SSG", rep: "Amy Example", active: true },
      ],
    },
  });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  const admin = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SWT",
    compare: "month",
    year: "2026",
    month: "8",
    reps: `${blake},${amy}`,
  });
  assert.equal(admin.status, 200);
  assert.deepEqual(
    admin.body.repCompare.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Blake", 2, 140],
      ["Amy", 1, 25],
    ],
  );

  const rep = buildDashboard(prepared.snapshot, { role: "rep", name: "Blake", rep: "Blake Example" }, {
    company: "SWT",
    compare: "quarter",
    year: "2026",
    quarter: "1",
    reps: `${blake},${amy}`,
  });
  assert.equal(rep.status, 403);
  assert.equal(JSON.stringify(rep.body).includes("repCompare"), false);
  assert.equal(JSON.stringify(rep.body).includes("140"), false);
  assert.equal(JSON.stringify(rep.body).includes("Amy Example"), false);
});
