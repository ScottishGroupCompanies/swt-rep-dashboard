import assert from "node:assert/strict";
import test from "node:test";
import { compareReps } from "../src/rep-compare.js";
import { companyLabel, loginCandidates, normalizeCompany, repKey } from "../src/reps.js";
import { allJobs, prepareSnapshot, tabTotals } from "../src/sales.js";
import { buildDashboard } from "../src/view.js";

function job(overrides = {}) {
  return {
    company: "SHI",
    rep: "Ada Example",
    date_sold: "2025-11-02",
    month: "2026-08",
    quote_no: "HI-1",
    job_name: "Sample Remodel",
    state: "CO",
    location: "CO - Denver",
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

const swtJobs = {
  generated_at: "2026-01-01T00:00:00Z",
  jobs: [job({ company: "SWT", amount: 10, amount_pre_fee: 10, month: "2026-01", quote_no: "WT-1" })],
};
const ssgJobs = { generated_at: "2026-02-02T00:00:00Z", jobs: [] };

test("SHI is a company code and the full name maps to it", () => {
  assert.equal(companyLabel("SHI"), "Scottish Home Improvements");
  assert.equal(normalizeCompany("SHI"), "SHI");
  assert.equal(normalizeCompany("Scottish Home Improvements"), "SHI");
});

test("one login covers the same person at SHI and another company", () => {
  const logins = loginCandidates([
    { company: "SWT", rep: "Ada Example", active: true },
    { company: "SHI", rep: "Ada Example", active: true },
    { company: "SSG", rep: "Cara Sample", active: true },
    { company: "SHI", rep: "Cara Sample", active: true },
    { company: "SHI", rep: "Ben Sample", active: false },
  ]);
  assert.deepEqual(logins, [
    { name: "Ada", role: "rep", rep: "Ada Example", companies: ["SWT", "SHI"] },
    { name: "Cara", role: "rep", rep: "Cara Sample", companies: ["SSG", "SHI"] },
  ]);
});

test("an upload without shi_jobs keeps SHI empty and still accepts SWT and SSG", () => {
  const prepared = prepareSnapshot({ swt_jobs: swtJobs, ssg_jobs: ssgJobs, reps: { reps: [] } });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  assert.deepEqual(prepared.counts, { swt: 1, ssg: 0, shi: 0, reps: 0 });
  assert.deepEqual(prepared.snapshot.shi, { generated_at: null, jobs: [] });
});

test("admin SHI totals, periods, and rep compare use the sheet tab and Month Sold", () => {
  const shiJobs = [
    job({ amount: 100, amount_pre_fee: 100, month: "2026-08", row: 2 }),
    job({ amount: 40, amount_pre_fee: 40, month: "2026-08", date_sold: "2026-08-02", row: 3 }),
    job({ amount: 999, amount_pre_fee: 999, month: "2025-08", row: 4 }),
    job({ amount: 7, amount_pre_fee: 7, month: "2026-01", row: 5 }),
    job({ amount: 8, amount_pre_fee: 8, month: "2026-03", row: 6 }),
    job({ amount: 50, amount_pre_fee: 50, month: "2026-04", row: 7 }),
    job({ rep: "Cara Sample", amount: 25, amount_pre_fee: 25, month: "2026-08", row: 8 }),
    job({ rep: "Cara Sample", amount: 10, amount_pre_fee: 10, month: "2026-01", row: 9 }),
    job({ rep: "Cara Sample", amount: 5, amount_pre_fee: 5, month: "2026-02", row: 10 }),
    job({ amount: 4, amount_pre_fee: 4, tab: "2025", month: "2025-02", date_sold: "2025-02-01", row: 11 }),
  ];
  const prepared = prepareSnapshot({
    swt_jobs: swtJobs,
    ssg_jobs: ssgJobs,
    shi_jobs: { generated_at: "2026-03-03T00:00:00Z", jobs: shiJobs },
    reps: {
      generated_at: "2026-03-03T00:00:00Z",
      reps: [
        { company: "SWT", rep: "Ada Example", active: true },
        { company: "SHI", rep: "Ada Example", active: true },
        { company: "SHI", rep: "Cara Sample", active: true },
      ],
    },
  });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  assert.equal(prepared.counts.shi, shiJobs.length);
  const jobs = allJobs(prepared.snapshot);
  assert.equal(tabTotals(jobs, "SHI", "2026").jobs, 9);
  assert.equal(tabTotals(jobs, "SHI", "2026").sales, 100 + 40 + 999 + 7 + 8 + 50 + 25 + 10 + 5);

  const admin = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SHI",
    year: "2026",
  });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.companyLabel, "Scottish Home Improvements");
  assert.equal(admin.body.generatedAt, "2026-03-03T00:00:00Z");
  assert.deepEqual(
    admin.body.companies.map((company) => company.id),
    ["SGC", "SWT", "SSG", "SHI"],
  );
  assert.equal(admin.body.kpis.sales, tabTotals(jobs, "SHI", "2026").sales);

  const month = compareReps(
    admin.body.jobs,
    {
      reps: [
        { repKey: repKey("Ada Example"), name: "Ada" },
        { repKey: repKey("Cara Sample"), name: "Cara" },
      ],
      periods: [{ mode: "month", year: "2026", month: 8 }],
    },
  );
  assert.deepEqual(
    month.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Ada", 2, 140],
      ["Cara", 1, 25],
    ],
  );

  const quarter = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SHI",
    compare: "quarter",
    year: "2026",
    quarter: "1",
    reps: `${repKey("Ada Example")},${repKey("Cara Sample")}`,
  });
  assert.deepEqual(
    quarter.body.repCompare.periods[0].rows.map((row) => [row.name, row.jobs, row.sales]),
    [
      ["Ada", 2, 15],
      ["Cara", 2, 15],
    ],
  );

  const year = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {
    company: "SHI",
    compare: "year",
    year: "2026",
    reps: `${repKey("Ada Example")},${repKey("Cara Sample")}`,
  });
  assert.equal(year.body.repCompare.periods[0].rows[0].sales, 100 + 40 + 999 + 7 + 8 + 50);
  assert.equal(year.body.repCompare.periods[0].rows[1].sales, 25 + 10 + 5);

  const ada = buildDashboard(prepared.snapshot, { role: "rep", name: "Ada", rep: "Ada Example" }, { company: "SHI" });
  assert.equal(ada.status, 200);
  assert.deepEqual(
    ada.body.companies.map((company) => company.id),
    ["SWT", "SHI"],
  );
  assert.equal(ada.body.kpis.sales, 100 + 40 + 999 + 7 + 8 + 50);
  assert.equal(JSON.stringify(ada.body).includes("Cara"), false);
});
