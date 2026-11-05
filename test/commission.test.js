import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { computeCommission } from "../src/commission.js";

const RATE = 0.07;

test("at list: commission is rate × charged", () => {
  const row = computeCommission(RATE, 500, 500);
  assert.equal(row.listVerified, true);
  assert.equal(row.status, "ok");
  assert.equal(row.commissionBase, 500);
  assert.equal(row.commission, 35);
  assert.equal(row.commission, Math.round(RATE * 500 * 100) / 100);
});

test("over list: commission is rate × charged", () => {
  const row = computeCommission(RATE, 650, 500);
  assert.equal(row.status, "oversold");
  assert.equal(row.commissionBase, 650);
  assert.equal(row.commission, 45.5);
  assert.equal(row.commission, Math.round(RATE * 650 * 100) / 100);
});

test("undersold: list $500, sold $400, 7% is $31.50", () => {
  const list = 500;
  const charged = 400;
  const base = list - 0.5 * (list - charged);
  const row = computeCommission(RATE, charged, list);
  assert.equal(base, 450);
  assert.equal(row.status, "undersold");
  assert.equal(row.difference, -100);
  assert.equal(row.commissionBase, base);
  assert.equal(row.commission, Math.round(RATE * base * 100) / 100);
  assert.equal(row.commission.toFixed(2), "31.50");
});

test("no list: commission is rate × charged and list is not verified", () => {
  for (const listPrice of [null, undefined]) {
    const row = computeCommission(RATE, 400, listPrice);
    assert.equal(row.status, "list_not_verified");
    assert.equal(row.listVerified, false);
    assert.equal(row.listPrice, null);
    assert.equal(row.difference, null);
    assert.equal(row.commissionBase, 400);
    assert.equal(row.commission, 28);
    assert.equal(row.commission, Math.round(RATE * 400 * 100) / 100);
  }
});

test("invalid charged amount is flagged for review", () => {
  const row = computeCommission(RATE, null, 500);
  assert.equal(row.status, "needs_review");
  assert.equal(row.commission, null);
  assert.equal(row.listVerified, false);
});

test("snapshot jobs follow the commission engine for Nick at 7%", async () => {
  const raw = await readFile(new URL("../data/nick_dashboard.json", import.meta.url), "utf8");
  const data = JSON.parse(raw);
  assert.equal(data.rep.displayName, "Nick");
  assert.equal(data.rep.rate, RATE);
  assert.equal(data.jobs.length, data.kpis.jobCount);

  const cents = (n) => Math.round(n * 100);
  let sales = 0;
  let commission = 0;
  for (const job of data.jobs) {
    const row = computeCommission(RATE, job.charged, job.listPrice);
    sales += job.charged;
    commission += job.commission;
    assert.equal(row.status, job.status, job.id);
    assert.equal(row.listVerified, job.listVerified, job.id);
    // Source rounding can land one cent away from Math.round on x.xx5 bases.
    assert.ok(Math.abs(cents(row.commission) - cents(job.commission)) <= 1, job.id);
    assert.ok(
      job.commissionBase == null ||
        Math.abs(cents(row.commissionBase) - cents(job.commissionBase)) <= 1,
      job.id,
    );
  }

  assert.equal(cents(sales), cents(data.kpis.ytdSales));
  assert.equal(cents(commission), cents(data.kpis.ytdCommission));
});
