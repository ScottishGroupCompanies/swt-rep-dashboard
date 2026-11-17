import assert from "node:assert/strict";
import test from "node:test";
import { buildSgcReport } from "../src/sgc.js";
import { prepareSnapshot } from "../src/sales.js";
import { buildDashboard } from "../src/view.js";

function job(overrides = {}) {
  return {
    company: "SWT",
    rep: "Ada Example",
    date_sold: "2026-03-15",
    month: "2026-03",
    quote_no: "WT-1",
    job_name: "Sample Shop",
    state: "CO",
    location: "CO",
    job_type: "Residential",
    amount: 10,
    amount_pre_fee: 10,
    is_change_order: false,
    status: "",
    tab: "2026",
    row: 2,
    ...overrides,
  };
}

const raw = [
  job({ amount: 40, amount_pre_fee: 40, date_sold: "2026-11-02", month: "2026-11", job_name: "November Shop", row: 3 }),
  job({ amount: 10, amount_pre_fee: 10, date_sold: "2026-03-15", month: "2026-03", job_name: "March Shop", row: 2 }),
  job({ company: "SHI", rep: "Ada Example", amount: 20, amount_pre_fee: 20, date_sold: "2026-06-01", month: "2026-06", job_name: "Summer Remodel", state: "TX", row: 4 }),
  job({ company: "SSG", rep: "Cara Sample", amount: 100, amount_pre_fee: 100, date_sold: "2026-01-20", month: "2026-01", job_name: "Largest Glass", state: "CO", row: 5 }),
  job({ company: "SWT", rep: "Ben Sample", amount: 30, amount_pre_fee: 30, date_sold: "2026-02-02", month: "2026-02", job_name: "Ben Shop", row: 6 }),
  job({ amount: 5, amount_pre_fee: 5, tab: "2025", date_sold: "2025-03-01", month: "2025-03", job_name: "Old March", row: 7 }),
  job({ amount: 7, amount_pre_fee: 7, tab: "2025", date_sold: "2025-11-02", month: "2025-11", job_name: "Old November", row: 8 }),
  job({ amount: 80, amount_pre_fee: 80, tab: "2025", date_sold: "2025-12-20", month: "2025-12", job_name: "Old December", row: 9 }),
  job({ company: "SSG", rep: "Cara Sample", amount: 4, amount_pre_fee: 4, tab: "2025", date_sold: "2025-04-04", month: "2025-04", row: 10 }),
];

test("combined 2025 and 2026 totals, same-date YTD, top reps, and top job", () => {
  const prepared = prepareSnapshot({
    swt_jobs: { jobs: raw.filter((row) => row.company === "SWT") },
    ssg_jobs: { jobs: raw.filter((row) => row.company === "SSG") },
    shi_jobs: { jobs: raw.filter((row) => row.company === "SHI") },
    reps: { reps: [] },
  });
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  const report = buildSgcReport(
    [...prepared.snapshot.swt.jobs, ...prepared.snapshot.ssg.jobs, ...prepared.snapshot.shi.jobs],
  );

  const swt = report.companies.find((row) => row.id === "SWT");
  assert.equal(swt.sales2026, 40 + 10 + 30);
  assert.equal(swt.sales2025, 5 + 7 + 80);
  assert.equal(swt.jobs2026, 3);
  assert.equal(report.companies.find((row) => row.id === "SSG").sales2026, 100);
  assert.equal(report.companies.find((row) => row.id === "SHI").sales2026, 20);
  assert.equal(report.total.sales2026, 40 + 10 + 20 + 100 + 30);
  assert.equal(report.total.sales2025, 5 + 7 + 80 + 4);
  assert.equal(report.total.yoy.diff, report.total.sales2026 - report.total.sales2025);

  assert.equal(report.ytd.cutoff, "2026-11-02");
  assert.equal(report.ytd.sales2026, 40 + 10 + 20 + 100 + 30);
  assert.equal(report.ytd.sales2025, 5 + 7 + 4);
  assert.notEqual(report.ytd.sales2025, report.total.sales2025);

  assert.equal(report.months[2].label, "Mar");
  assert.equal(report.months[2].sales2026, 10);
  assert.equal(report.months[2].sales2025, 5);
  assert.equal(report.months[10].sales2026, 40);
  assert.equal(report.quarters[0].label, "Q1");
  assert.equal(report.quarters[0].sales2026, 10 + 100 + 30);
  assert.equal(report.quarters[1].sales2026, 20);
  assert.equal(report.quarters[3].sales2026, 40);

  assert.deepEqual(
    report.leaderboard.map((row) => [row.name, row.companies.join("+"), row.sales, row.jobs]),
    [
      ["Cara", "SSG", 100, 1],
      ["Ada", "SWT+SHI", 40 + 10 + 20, 3],
      ["Ben", "SWT", 30, 1],
    ],
  );
  assert.equal(report.leaderboard.length <= 5, true);
  assert.equal(report.topJob.name, "Largest Glass");
  assert.equal(report.topJob.company, "SSG");
  assert.equal(report.topJob.amount, 100);
  assert.deepEqual(
    report.topByCompany.map((row) => [row.company, row.amount]),
    [
      ["SWT", 40],
      ["SSG", 100],
      ["SHI", 20],
    ],
  );
});

test("the combined view is the admin default and hidden from reps", () => {
  const prepared = prepareSnapshot({
    swt_jobs: { jobs: [job()] },
    ssg_jobs: { jobs: [] },
    shi_jobs: { jobs: [] },
    reps: { reps: [{ company: "SWT", rep: "Ada Example", active: true }] },
  });
  const admin = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, {});
  assert.equal(admin.body.sgc, true);
  assert.equal(admin.body.company, "SGC");
  assert.equal(admin.body.leaderboard, undefined);
  assert.equal(admin.body.recent, undefined);
  assert.equal(admin.body.repCompare, undefined);
  assert.equal(admin.body.jobs, undefined);
  assert.equal(admin.body.summary.total.sales2026, 10);

  const rep = buildDashboard(prepared.snapshot, { role: "rep", name: "Ada", rep: "Ada Example" }, { company: "SGC" });
  assert.equal(rep.status, 403);
  assert.equal(JSON.stringify(rep.body).includes("Largest"), false);

  const own = buildDashboard(prepared.snapshot, { role: "rep", name: "Ada", rep: "Ada Example" }, {});
  assert.equal(own.status, 200);
  assert.equal(own.body.sgc, undefined);
  assert.equal(own.body.company, "SWT");
});
