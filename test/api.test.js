import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hashCode } from "../src/auth.js";
import { handle as dashboard } from "../api/data/dashboard.js";
import { handle as login } from "../api/auth/login.js";
import { handle as names } from "../api/auth/names.js";
import { handle as ingest } from "../api/ingest/data.js";
import { handle as commission } from "../api/ingest/commission.js";
import { resetRateLimit } from "../api/lib/ratelimit.js";
import { memoryCommission, readSnapshot, resetMemoryStore } from "../api/lib/store.js";

const codeHash = hashCode("test-code");

process.env.DATA_STORE = "memory";
process.env.SESSION_SECRET = "test-session-secret";
process.env.DATA_INGEST_TOKEN = "ingest-test-token";
process.env.COMMISSION_INGEST_TOKEN = "commission-test-token";
process.env.DASHBOARD_LOGINS = JSON.stringify({
  Jenny: { role: "admin", codeHash },
  Ada: { role: "rep", rep: "Ada Example", codeHash },
  HOO: { role: "rep", rep: "HOO", codeHash },
});

function job(overrides = {}) {
  return {
    company: "SWT",
    rep: "Ada Example",
    date_sold: "2026-03-01",
    month: "2026-03",
    quote_no: "WT-1",
    job_name: "Sample Shop",
    state: "CO",
    location: "CO - Denver",
    job_type: "Residential",
    amount: 90,
    amount_pre_fee: 90,
    is_change_order: false,
    status: "",
    tab: "2026",
    row: 2,
    ...overrides,
  };
}

const upload = {
  swt_jobs: {
    generated_at: "2026-03-01T00:00:00Z",
    jobs: [
      job(),
      job({
        rep: "Ben Sample",
        amount: 40,
        amount_pre_fee: 40,
        tab: "2025",
        month: "2025-05",
        date_sold: "2025-05-02",
        row: 9,
      }),
    ],
  },
  ssg_jobs: {
    generated_at: "2026-03-01T00:00:00Z",
    jobs: [
      job({ company: "SSG", rep: "HOO", amount: 70, amount_pre_fee: 70, job_name: "Shared Code Job" }),
      job({ company: "SSG", rep: "Ada Example", amount: 25, amount_pre_fee: 25, month: "2026-04", job_name: "Glass Sample" }),
    ],
  },
  reps: {
    generated_at: "2026-03-01T00:00:00Z",
    reps: [
      { company: "SWT", rep: "Ada Example", active: true },
      { company: "SSG", rep: "Ada Example", active: true },
      { company: "SWT", rep: "Ben Sample", active: false },
      { company: "SSG", rep: "HOO", active: true },
    ],
  },
};

function post(body, headers = {}, ip = "10.0.0.8") {
  return {
    method: "POST",
    headers: { authorization: headers.authorization || "", "x-forwarded-for": ip, ...headers },
    body,
    socket: { remoteAddress: ip },
  };
}

describe("api", { concurrency: false }, () => {
test.beforeEach(() => {
  resetMemoryStore();
  resetRateLimit();
});

test("login names come from the env and skip non-person codes", async () => {
  const response = await names({ method: "GET", headers: {} });
  assert.deepEqual(response.body.names, ["Ada", "Jenny"]);
});

test("a full upload replaces the snapshot once and a bad upload does not", async () => {
  const first = await ingest(post(upload, { authorization: "Bearer ingest-test-token" }));
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.counts, { swt: 2, ssg: 2, reps: 4 });
  const again = await ingest(post(upload, { authorization: "Bearer ingest-test-token" }));
  assert.equal(again.status, 200);
  assert.equal((await readSnapshot()).swt.jobs.length, 2);

  const rejected = await ingest(
    post({ swt_jobs: upload.swt_jobs, reps: upload.reps }, { authorization: "Bearer ingest-test-token" }),
  );
  assert.equal(rejected.status, 400);
  assert.equal((await readSnapshot()).ssg.jobs.length, 2);

  const wrong = await ingest(post(upload, { authorization: "Bearer nope" }));
  assert.equal(wrong.status, 401);
});

test("reps only receive their own companies and HOO has no personal dashboard", async () => {
  await ingest(post(upload, { authorization: "Bearer ingest-test-token" }));
  const adaLogin = await login(post({ name: "Ada", code: "test-code" }, {}, "10.1.0.1"));
  assert.equal(adaLogin.status, 200);
  const cookie = adaLogin.headers["Set-Cookie"];
  const ada = await dashboard({
    method: "GET",
    headers: { cookie },
    url: "/api/data/dashboard?company=SSG",
  });
  assert.equal(ada.status, 200);
  assert.equal(ada.body.kpis.sales, 25);
  assert.equal(JSON.stringify(ada.body).includes("HOO"), false);
  assert.equal(JSON.stringify(ada.body).includes("Ada Example"), false);

  const hooLogin = await login(post({ name: "HOO", code: "test-code" }, {}, "10.1.0.2"));
  assert.equal(hooLogin.status, 401);

  const jenny = await login(post({ name: "Jenny", code: "test-code" }, {}, "10.1.0.3"));
  const admin = await dashboard({
    method: "GET",
    headers: { cookie: jenny.headers["Set-Cookie"] },
    url: "/api/data/dashboard?company=SSG&year=2026",
  });
  assert.equal(admin.body.kpis.sales, 95);
  assert.equal(admin.body.leaderboard.find((row) => row.name === "HOO").sales, 70);
});

test("failed codes are rate limited", async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await login(post({ name: "Ada", code: "wrong" }, {}, "10.9.0.9"));
    assert.equal(response.status, 401);
  }
  const blocked = await login(post({ name: "Ada", code: "test-code" }, {}, "10.9.0.9"));
  assert.equal(blocked.status, 429);
});

test("commission is stored and never returned to the dashboard", async () => {
  await ingest(post(upload, { authorization: "Bearer ingest-test-token" }));
  const saved = await commission(
    post({ marker: "secret-payout-999" }, { authorization: "Bearer commission-test-token" }),
  );
  assert.equal(saved.status, 200);
  assert.equal(memoryCommission().payload.marker, "secret-payout-999");
  const jenny = await login(post({ name: "Jenny", code: "test-code" }, {}, "10.4.0.4"));
  const admin = await dashboard({
    method: "GET",
    headers: { cookie: jenny.headers["Set-Cookie"] },
    url: "/api/data/dashboard?company=SWT",
  });
  assert.equal(JSON.stringify(admin.body).includes("secret-payout-999"), false);
  assert.deepEqual(admin.body.commission, { status: "coming_soon" });
});
});
