import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { computeCommission } from "../src/commission.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data/nick_dashboard.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));

if (data.rep.displayName !== "Nick" || data.rep.rate !== 0.07) {
  throw new Error("Presentation snapshot must stay rep Nick at rate 0.07");
}

const dollars = (cents) => cents / 100;
const cents = (n) => Math.round(Number(n) * 100);
const labels = new Map(data.months.map((month) => [month.key, month.label]));
const thisMonth = data.months.find((month) => month.label === data.kpis.thisMonthLabel);
if (!thisMonth) throw new Error(`No month matches ${data.kpis.thisMonthLabel}`);

for (const job of data.jobs) {
  const row = computeCommission(data.rep.rate, job.charged, job.listPrice);
  job.listPrice = row.listPrice;
  job.charged = row.charged;
  job.difference = row.difference;
  job.commissionBase = row.commissionBase;
  job.commission = row.commission;
  job.status = row.status;
  job.listVerified = row.listVerified;
}

const monthBuckets = new Map();
for (const job of data.jobs) {
  if (!job.monthKey) continue;
  const bucket = monthBuckets.get(job.monthKey) || { sales: 0, commission: 0, jobs: 0 };
  bucket.sales += cents(job.charged);
  bucket.commission += cents(job.commission);
  bucket.jobs += 1;
  monthBuckets.set(job.monthKey, bucket);
}

let cumSales = 0;
let cumCommission = 0;
let previousSales = null;
data.months = [...monthBuckets.keys()].sort().map((key) => {
  const bucket = monthBuckets.get(key);
  cumSales += bucket.sales;
  cumCommission += bucket.commission;
  const momPct =
    previousSales === null || previousSales === 0
      ? null
      : Math.round(((bucket.sales - previousSales) / previousSales) * 1000) / 10;
  previousSales = bucket.sales;
  return {
    key,
    label: labels.get(key) || key,
    sales: dollars(bucket.sales),
    commission: dollars(bucket.commission),
    jobs: bucket.jobs,
    momPct,
    cumSales: dollars(cumSales),
    cumCommission: dollars(cumCommission),
  };
});

function rollup(keyOf) {
  const groups = new Map();
  for (const job of data.jobs) {
    const key = keyOf(job);
    const group = groups.get(key) || { sales: 0, jobs: 0, commission: 0 };
    group.sales += cents(job.charged);
    group.commission += cents(job.commission);
    group.jobs += 1;
    groups.set(key, group);
  }
  return [...groups.entries()].sort((a, b) => b[1].sales - a[1].sales || a[0].localeCompare(b[0]));
}

data.byState = rollup((job) => job.state || "Unknown").map(([state, group]) => ({
  state,
  sales: dollars(group.sales),
  jobs: group.jobs,
  commission: dollars(group.commission),
}));
data.byJobType = rollup((job) => job.jobType || "Unspecified").map(([type, group]) => ({
  type,
  sales: dollars(group.sales),
  jobs: group.jobs,
}));
data.byFilmType = rollup((job) => job.filmType || "Unspecified").map(([film, group]) => ({
  film,
  sales: dollars(group.sales),
  jobs: group.jobs,
}));

const salesCents = data.jobs.reduce((sum, job) => sum + cents(job.charged), 0);
const commissionCents = data.jobs.reduce((sum, job) => sum + cents(job.commission), 0);
const month = data.months.find((entry) => entry.key === thisMonth.key);
const belowFloorCount = data.jobs.filter((job) => job.status === "below_floor").length;

data.kpis = {
  ytdSales: dollars(salesCents),
  ytdCommission: dollars(commissionCents),
  thisMonthSales: month.sales,
  thisMonthCommission: month.commission,
  thisMonthLabel: data.kpis.thisMonthLabel,
  jobCount: data.jobs.length,
  avgJobSize: dollars(Math.round(salesCents / data.jobs.length)),
  expectedPayrollCommission: month.commission,
  listVerifiedCount: data.jobs.filter((job) => job.listVerified).length,
  listNotVerifiedCount: data.jobs.filter((job) => !job.listVerified).length,
  belowFloorCount,
};

data.meta.note =
  "Demo dashboard. Commission rate and rep name are for presentation. Gate code is client-side only (not real security). Prices exclude 4% fees. At/over list: rate × charged. Undersold by less than 10%: rate × list − 0.5 × shortfall. At or under 90% of list: $0. No list: rate × charged.";
data.meta.commissionRule = {
  oversoldOrAtList: "rate × charged",
  undersoldUnder10: "rate × list − 0.5 × (list − charged)",
  belowFloor: "$0 when charged ≤ 90% of list",
  noList: "rate × charged (list not verified)",
};

await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);

const counts = data.jobs.reduce((acc, job) => {
  acc[job.status] = (acc[job.status] || 0) + 1;
  return acc;
}, {});
console.log(
  JSON.stringify(
    {
      ytdSales: data.kpis.ytdSales,
      ytdCommission: data.kpis.ytdCommission,
      thisMonthCommission: data.kpis.thisMonthCommission,
      belowFloorCount,
      counts,
    },
    null,
    2,
  ),
);
