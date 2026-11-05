import { computeCommission } from "./commission.js";

/** First names only. Codes without a confirmed first name stay as the sheet code. */
export const FIRST_NAMES = {
  BP: "Blake",
  AH: "Amy",
  DH: "Dana",
  SG: "Scott",
  JB: "John",
  KF: "Katie",
};

const DEMO_RATES = [0.045, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08, 0.085];

export function hashString(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

export function fakeCharged(seed) {
  const hash = hashString(seed);
  return 800 + (hash % 180) * 50;
}

export function fakeRate(designer) {
  return DEMO_RATES[hashString(designer) % DEMO_RATES.length];
}

export function fakeList(seed, charged) {
  const swing = (hashString(`${seed}:list`) % 35) - 15;
  return Math.round(charged * (1 + swing / 100));
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[Number(month) - 1]} ${year}`;
}

function stateOf(location) {
  if (!location) return "Unknown";
  const token = location.split("-")[0].trim();
  return token || "Unknown";
}

function priceJob(raw, seed) {
  const charged = fakeCharged(seed);
  const listPrice = fakeList(seed, charged);
  const rate = fakeRate(raw.designer);
  const row = computeCommission(rate, charged, listPrice);
  return {
    id: seed,
    client: raw.client,
    zoho: raw.zoho || "",
    jobNumber: raw.jobNumber || "",
    jobType: raw.segment || "Unspecified",
    filmType: raw.jobType || "Unspecified",
    location: raw.location || "",
    state: stateOf(raw.location),
    dateSold: raw.date || "",
    dateSoldIso: raw.month ? `${raw.month}-01` : "",
    monthKey: raw.month,
    charged: row.charged,
    listPrice: row.listPrice,
    commissionBase: row.commissionBase,
    commission: row.commission,
    difference: row.difference,
    status: row.status,
    listVerified: row.listVerified,
    designer: raw.designer,
  };
}

export function synthesizePriorYear(jobs) {
  return jobs.flatMap((job) => {
    const [year, month] = job.month.split("-");
    if (hashString(`${job.zoho}:keep`) % 5 === 0) return [];
    const prior = { ...job, month: `${Number(year) - 1}-${month}` };
    return [priceJob(prior, `${job.zoho || job.client}:2025`)];
  });
}

export function buildDemo(rawJobs) {
  const jobs2026 = rawJobs
    .filter((job) => job.client && job.designer && job.month)
    .map((job) => priceJob(job, `${job.zoho || job.client}:2026`));
  const jobs2025 = synthesizePriorYear(rawJobs.filter((job) => job.client && job.designer && job.month));
  const codes = [...new Set(jobs2026.map((job) => job.designer))].sort();
  const reps = codes.map((code) => {
    const name = FIRST_NAMES[code] || code;
    const rate = fakeRate(code);
    const jobs = jobs2026.filter((job) => job.designer === code);
    const sales = jobs.reduce((sum, job) => sum + job.charged, 0);
    const commission = jobs.reduce((sum, job) => sum + (job.commission || 0), 0);
    return {
      code,
      name,
      rate,
      rateLabel: `Demo ${(rate * 100).toFixed(1)}%`,
      jobs,
      sales,
      commission,
      count: jobs.length,
    };
  }).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  const sales = jobs2026.reduce((sum, job) => sum + job.charged, 0);
  const commission = jobs2026.reduce((sum, job) => sum + (job.commission || 0), 0);
  return { reps, jobs2026, jobs2025, sales, commission };
}

export function repDashboard(rep) {
  const jobs = rep.jobs;
  const months = [...new Set(jobs.map((job) => job.monthKey))].sort().map((key) => ({
    key,
    label: monthLabel(key),
  }));
  const latest = months[months.length - 1];
  const thisMonthJobs = latest ? jobs.filter((job) => job.monthKey === latest.key) : [];
  const sales = rep.jobs.reduce((sum, job) => sum + job.charged, 0);
  const commission = rep.jobs.reduce((sum, job) => sum + (job.commission || 0), 0);
  const thisSales = thisMonthJobs.reduce((sum, job) => sum + job.charged, 0);
  const thisCommission = thisMonthJobs.reduce((sum, job) => sum + (job.commission || 0), 0);
  return {
    asOf: "Demo snapshot",
    rep: { displayName: rep.name, rate: rep.rate, rateLabel: rep.rateLabel },
    kpis: {
      ytdSales: sales,
      ytdCommission: commission,
      thisMonthSales: thisSales,
      thisMonthCommission: thisCommission,
      thisMonthLabel: latest ? latest.label : "",
      jobCount: rep.jobs.length,
      avgJobSize: rep.jobs.length ? sales / rep.jobs.length : 0,
      expectedPayrollCommission: thisCommission,
      listVerifiedCount: rep.jobs.filter((job) => job.listVerified).length,
      listNotVerifiedCount: rep.jobs.filter((job) => !job.listVerified).length,
      belowFloorCount: rep.jobs.filter((job) => job.status === "below_floor").length,
    },
    months,
    jobs,
    meta: {
      note: "Demo data. Dollar amounts and commission rates are simulated. Job and client names are from 2026.",
    },
  };
}
