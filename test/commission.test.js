import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { computeCommission } from "../src/commission.js";

const NICK = 0.07;

test("$1000 at 5% sold $1100 / $950 / $900 is $55 / $25 / $0", () => {
  const rate = 0.05;
  const list = 1000;

  const over = computeCommission(rate, 1100, list);
  assert.equal(over.status, "oversold");
  assert.equal(over.commissionBase, 1100);
  assert.equal(over.commission.toFixed(2), "55.00");

  const near = computeCommission(rate, 950, list);
  assert.equal(near.status, "undersold");
  assert.equal(near.commissionBase, null);
  assert.equal(near.commission.toFixed(2), "25.00");
  assert.equal(near.commission, rate * list - 0.5 * (list - 950));

  const floor = computeCommission(rate, 900, list);
  assert.equal(floor.status, "below_floor");
  assert.equal(floor.listVerified, true);
  assert.equal(floor.commissionBase, 0);
  assert.equal(floor.commission.toFixed(2), "0.00");
});

test("at list: commission is rate × charged", () => {
  const row = computeCommission(NICK, 500, 500);
  assert.equal(row.status, "ok");
  assert.equal(row.commissionBase, 500);
  assert.equal(row.commission.toFixed(2), "35.00");
});

test("exactly 90% of list is $0 even when the undersold formula would pay", () => {
  const atFloor = computeCommission(NICK, 900, 1000);
  assert.equal(atFloor.status, "below_floor");
  assert.equal(atFloor.commission, 0);

  const justAbove = computeCommission(NICK, 901, 1000);
  assert.equal(justAbove.status, "undersold");
  assert.equal(justAbove.commission.toFixed(2), "20.50");
});

test("no list: commission is rate × charged and list is not verified", () => {
  for (const listPrice of [null, undefined]) {
    const row = computeCommission(NICK, 400, listPrice);
    assert.equal(row.status, "list_not_verified");
    assert.equal(row.listVerified, false);
    assert.equal(row.listPrice, null);
    assert.equal(row.difference, null);
    assert.equal(row.commissionBase, 400);
    assert.equal(row.commission.toFixed(2), "28.00");
  }
});

test("commission clamps at $0", () => {
  const negativeSale = computeCommission(NICK, -420, null);
  assert.equal(negativeSale.status, "list_not_verified");
  assert.equal(negativeSale.commission, 0);

  const penaltyExceedsRate = computeCommission(0.04, 910, 1000);
  assert.equal(penaltyExceedsRate.status, "undersold");
  assert.equal(penaltyExceedsRate.commission, 0);
});

test("invalid charged amount is flagged for review", () => {
  const row = computeCommission(NICK, null, 500);
  assert.equal(row.status, "needs_review");
  assert.equal(row.commission, null);
  assert.equal(row.listVerified, false);
});

test("snapshot jobs and rollups follow the commission engine for Nick at 7%", async () => {
  const raw = await readFile(new URL("../data/nick_dashboard.json", import.meta.url), "utf8");
  const data = JSON.parse(raw);
  assert.equal(data.rep.displayName, "Nick");
  assert.equal(data.rep.rate, NICK);
  assert.equal(data.jobs.length, data.kpis.jobCount);

  const cents = (n) => Math.round(Number(n) * 100);
  let salesCents = 0;
  let commissionCents = 0;
  let belowFloor = 0;
  const byMonth = new Map();

  for (const job of data.jobs) {
    const row = computeCommission(NICK, job.charged, job.listPrice);
    salesCents += cents(job.charged);
    commissionCents += cents(job.commission);
    if (job.status === "below_floor") belowFloor += 1;
    if (job.monthKey) {
      const bucket = byMonth.get(job.monthKey) || { sales: 0, commission: 0, jobs: 0 };
      bucket.sales += cents(job.charged);
      bucket.commission += cents(job.commission);
      bucket.jobs += 1;
      byMonth.set(job.monthKey, bucket);
    }
    assert.equal(row.status, job.status, job.id);
    assert.equal(row.listVerified, job.listVerified, job.id);
    assert.equal(row.commission, job.commission, job.id);
    assert.equal(row.commissionBase, job.commissionBase, job.id);
  }

  assert.equal(data.kpis.belowFloorCount, belowFloor);
  assert.equal(cents(data.kpis.ytdSales), salesCents);
  assert.equal(cents(data.kpis.ytdCommission), commissionCents);
  assert.equal(cents(data.kpis.expectedPayrollCommission), cents(data.kpis.thisMonthCommission));

  for (const month of data.months) {
    const bucket = byMonth.get(month.key);
    assert.ok(bucket, month.key);
    assert.equal(cents(month.sales), bucket.sales, month.key);
    assert.equal(cents(month.commission), bucket.commission, month.key);
    assert.equal(month.jobs, bucket.jobs, month.key);
  }
});
