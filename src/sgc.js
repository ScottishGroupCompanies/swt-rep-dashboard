import { change } from "./compare.js";
import { canonicalMonth } from "./months.js";
import { COMPANIES, companyLabel, firstName } from "./reps.js";
import { dollars } from "./sales.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function centsOf(amount) {
  return Math.round(Number(amount) * 100);
}

function sumSales(jobs) {
  return dollars(jobs.reduce((total, job) => total + centsOf(job.amount), 0));
}

function onSheet(job, year) {
  return String(job.year) === String(year);
}

function calendarMonth(job, year) {
  const key = canonicalMonth(job.month, job.year);
  if (!key?.startsWith(`${year}-`)) return null;
  return Number(key.slice(5, 7));
}

function activityDate(job) {
  const dated = job.date_sold || job.date;
  if (typeof dated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dated)) return dated;
  const key = canonicalMonth(job.month, job.year);
  return key ? `${key}-01` : null;
}

export function sameDateCutoff(jobs2026) {
  const dates = jobs2026.map(activityDate).filter(Boolean).sort();
  return dates.at(-1) || null;
}

function through(job, year, cutoff) {
  if (!onSheet(job, year) || !cutoff) return false;
  const date = activityDate(job);
  if (!date) return false;
  return date <= `${year}-${cutoff.slice(5)}`;
}

function companyRow(jobs, company) {
  const prior = jobs.filter((job) => job.company === company && onSheet(job, "2025"));
  const current = jobs.filter((job) => job.company === company && onSheet(job, "2026"));
  const sales2025 = sumSales(prior);
  const sales2026 = sumSales(current);
  return {
    id: company,
    label: companyLabel(company),
    jobs2025: prior.length,
    sales2025,
    jobs2026: current.length,
    sales2026,
    avg2026: current.length ? sales2026 / current.length : 0,
    yoy: change(sales2026, sales2025),
  };
}

function largest(jobs) {
  if (!jobs.length) return null;
  const winner = [...jobs].sort((a, b) => centsOf(b.amount) - centsOf(a.amount) || String(b.date_sold || b.date || "").localeCompare(String(a.date_sold || a.date || "")))[0];
  return {
    name: winner.job_name || winner.name || "Untitled job",
    company: winner.company,
    companyLabel: companyLabel(winner.company),
    rep: firstName(winner.rep),
    amount: Number(winner.amount),
    date: winner.date_sold || winner.date || null,
  };
}

export function buildSgcReport(jobs) {
  const rows = (jobs || []).filter((job) => COMPANIES.includes(job.company));
  const companies = COMPANIES.map((company) => companyRow(rows, company));
  const prior = rows.filter((job) => onSheet(job, "2025"));
  const current = rows.filter((job) => onSheet(job, "2026"));
  const sales2025 = sumSales(prior);
  const sales2026 = sumSales(current);
  const total = {
    jobs2025: prior.length,
    sales2025,
    jobs2026: current.length,
    sales2026,
    avg2026: current.length ? sales2026 / current.length : 0,
    yoy: change(sales2026, sales2025),
  };
  const cutoff = sameDateCutoff(current);
  const ytd2026 = cutoff ? current.filter((job) => through(job, "2026", cutoff)) : [];
  const ytd2025 = cutoff ? prior.filter((job) => through(job, "2025", cutoff)) : [];
  const ytdSales2026 = sumSales(ytd2026);
  const ytdSales2025 = sumSales(ytd2025);
  const months = MONTHS.map((label, index) => {
    const month = index + 1;
    const salesFor = (year) =>
      sumSales(rows.filter((job) => onSheet(job, year) && calendarMonth(job, year) === month));
    return { month, label, sales2025: salesFor("2025"), sales2026: salesFor("2026") };
  });
  const quarters = [1, 2, 3, 4].map((quarter) => {
    const salesFor = (year) =>
      sumSales(
        rows.filter((job) => {
          const month = calendarMonth(job, year);
          return onSheet(job, year) && month && Math.floor((month - 1) / 3) + 1 === quarter;
        }),
      );
    const jobsFor = (year) =>
      rows.filter((job) => {
        const month = calendarMonth(job, year);
        return onSheet(job, year) && month && Math.floor((month - 1) / 3) + 1 === quarter;
      }).length;
    return {
      quarter,
      label: `Q${quarter}`,
      sales2025: salesFor("2025"),
      sales2026: salesFor("2026"),
      jobs2025: jobsFor("2025"),
      jobs2026: jobsFor("2026"),
    };
  });
  const byRep = new Map();
  for (const job of current) {
    const key = String(job.rep || "").trim();
    if (!key) continue;
    const row = byRep.get(key) || { name: firstName(key), companies: new Set(), cents: 0, jobs: 0 };
    row.companies.add(job.company);
    row.cents += centsOf(job.amount);
    row.jobs += 1;
    byRep.set(key, row);
  }
  const leaderboard = [...byRep.values()]
    .map((row) => ({
      name: row.name,
      companies: COMPANIES.filter((company) => row.companies.has(company)),
      sales: dollars(row.cents),
      jobs: row.jobs,
    }))
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
    .slice(0, 5);
  const states = new Map();
  for (const job of current) {
    const name = job.state || "Unknown";
    const row = states.get(name) || { name, cents: 0, jobs: 0 };
    row.cents += centsOf(job.amount);
    row.jobs += 1;
    states.set(name, row);
  }
  return {
    companies,
    total,
    ytd: cutoff
      ? {
          cutoff,
          through: cutoff.slice(5),
          jobs2026: ytd2026.length,
          sales2026: ytdSales2026,
          jobs2025: ytd2025.length,
          sales2025: ytdSales2025,
          yoy: change(ytdSales2026, ytdSales2025),
        }
      : null,
    months,
    quarters,
    mix: companies.map((company) => ({
      id: company.id,
      label: company.label,
      sales: company.sales2026,
      jobs: company.jobs2026,
      share: sales2026 ? (company.sales2026 / sales2026) * 100 : 0,
    })),
    leaderboard,
    topJob: largest(current),
    topByCompany: COMPANIES.map((company) => largest(current.filter((job) => job.company === company))).filter(Boolean),
    states: [...states.values()]
      .map((row) => ({ name: row.name, sales: dollars(row.cents), jobs: row.jobs }))
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name))
      .slice(0, 5),
  };
}
