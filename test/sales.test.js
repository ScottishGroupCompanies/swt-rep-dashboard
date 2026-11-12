import assert from "node:assert/strict";
import test from "node:test";
import { firstName, isExcludedRep, loginCandidates } from "../src/reps.js";
import { allJobs, prepareSnapshot, tabTotals } from "../src/sales.js";
import { buildDashboard } from "../src/view.js";

function job(overrides = {}) {
  return {
    company: "SWT",
    rep: "Ada Example",
    date_sold: "2026-01-15",
    month: "2026-01",
    quote_no: "WT-100",
    job_name: "Sample Shop",
    state: "CO",
    location: "CO - Denver",
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

function payload(swtJobs, ssgJobs, reps) {
  return {
    swt_jobs: { generated_at: "2026-01-01T00:00:00Z", jobs: swtJobs },
    ssg_jobs: { generated_at: "2026-01-01T00:00:00Z", jobs: ssgJobs },
    reps: { generated_at: "2026-01-01T00:00:00Z", reps },
  };
}

const reps = [
  { company: "SWT", rep: "Ada Example", active: true },
  { company: "SSG", rep: "Ada Example", active: true },
  { company: "SWT", rep: "Ben Sample", active: false },
  { company: "SSG", rep: "HOO", active: true },
  { company: "SSG", rep: "Old Timer", active: false },
];

test("first names stay the first word and initials stay whole", () => {
  assert.equal(firstName("Ada Example"), "Ada");
  assert.equal(firstName("QX"), "QX");
});

test("years follow the sheet tab and months follow Month Sold", () => {
  const prepared = prepareSnapshot(
    payload(
      [
        job({
          amount: -25,
          amount_pre_fee: -25,
          date_sold: "2025-11-02",
          month: "2026-02",
          tab: "2026",
          row: 3,
        }),
        job({ amount: 40, amount_pre_fee: 40, date_sold: "2026-01-04", month: "2026-01", row: 4 }),
        job({
          amount: 10,
          amount_pre_fee: 10,
          rep: "Ben Sample",
          date_sold: "2025-06-01",
          month: "2025-06",
          tab: "2025",
          row: 8,
        }),
      ],
      [job({ company: "SSG", rep: "HOO", amount: 70, amount_pre_fee: 70, month: "2026-03", tab: "2026" })],
      reps,
    ),
  );
  assert.equal(prepared.ok, true, prepared.errors?.join(" "));
  const jobs = allJobs(prepared.snapshot);
  const swt2026 = tabTotals(jobs, "SWT", "2026");
  assert.equal(swt2026.jobs, 2);
  assert.equal(swt2026.sales, 15);
  const soldIn2026 = jobs.filter((row) => row.company === "SWT" && row.date_sold?.startsWith("2026"));
  assert.equal(tabTotals(soldIn2026, "SWT", "2026").sales, 40);
  assert.notEqual(soldIn2026.reduce((sum, row) => sum + row.amount, 0), swt2026.sales);

  const view = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, { company: "SWT", year: "2026" });
  assert.deepEqual(
    view.body.months.map((month) => month.key),
    ["2026-01", "2026-02"],
  );
  assert.equal(view.body.months[1].sales, -25);
  assert.equal(view.body.kpis.sales, 15);
  assert.equal(view.body.leaderboard.some((row) => row.name === "Ben" && row.active === false), true);
});

test("HOO stays in company totals and off the login list", () => {
  assert.equal(isExcludedRep("HOO"), true);
  assert.equal(isExcludedRep("hoo"), true);
  const logins = loginCandidates(reps);
  assert.deepEqual(logins, [{ name: "Ada", role: "rep", rep: "Ada Example", companies: ["SWT", "SSG"] }]);

  const prepared = prepareSnapshot(
    payload(
      [job({ amount: 90, amount_pre_fee: 90 })],
      [
        job({ company: "SSG", rep: "HOO", amount: 70, amount_pre_fee: 70, job_type: "New Glass" }),
        job({ company: "SSG", rep: "Ada Example", amount: 25, amount_pre_fee: 25, month: "2026-04" }),
        job({ company: "SSG", rep: "Old Timer", amount: 5, amount_pre_fee: 5 }),
      ],
      reps,
    ),
  );
  const jobs = allJobs(prepared.snapshot);
  assert.equal(tabTotals(jobs, "SSG", "2026").jobs, 3);
  assert.equal(tabTotals(jobs, "SSG", "2026").sales, 100);

  const admin = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, { company: "SSG", year: "2026" });
  assert.equal(admin.body.kpis.sales, 100);
  const hoo = admin.body.leaderboard.find((row) => row.name === "HOO");
  assert.equal(hoo.sales, 70);
  assert.equal(hoo.login, false);
  assert.equal(hoo.active, true);
  assert.equal(JSON.stringify(admin.body).includes("Old Timer"), false);

  const ada = buildDashboard(prepared.snapshot, { role: "rep", name: "Ada", rep: "Ada Example" }, { company: "SSG" });
  assert.equal(ada.body.kpis.sales, 25);
  assert.equal(ada.body.leaderboard, null);
  assert.equal(JSON.stringify(ada.body).includes("HOO"), false);
  assert.deepEqual(
    ada.body.companies.map((company) => company.id),
    ["SWT", "SSG"],
  );

  const hooKey = hoo.repKey;
  const drilled = buildDashboard(prepared.snapshot, { role: "admin", name: "Jenny", rep: null }, { company: "SSG", rep: hooKey });
  assert.equal(drilled.body.kpis.sales, 70);
  assert.equal(drilled.body.viewing, "HOO");
  const blocked = buildDashboard(
    prepared.snapshot,
    { role: "rep", name: "Ada", rep: "Ada Example" },
    { company: "SSG", rep: hooKey },
  );
  assert.equal(blocked.body.kpis.sales, 25);
});

test("a mismatched amount is rejected and an empty file is not a partial wipe", () => {
  const bad = prepareSnapshot(
    payload([job({ amount: 10, amount_pre_fee: 12 })], [], reps),
  );
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(" "), /amount and amount_pre_fee/);

  const missing = prepareSnapshot({ swt_jobs: { jobs: [] }, reps: { reps: [] } });
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(" "), /ssg_jobs/);
});
