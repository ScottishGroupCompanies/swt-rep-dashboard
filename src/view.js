import { change } from "./compare.js";
import { compareReps } from "./rep-compare.js";
import { companyLabel, firstName, isExcludedRep, repKey } from "./reps.js";
import { allJobs, dollars, monthLabel, sumCents } from "./sales.js";

function companyOption(id) {
  return { id, label: companyLabel(id) };
}

function fullNames(snapshot) {
  const names = new Set();
  for (const row of snapshot?.reps?.reps || []) names.add(row.rep);
  for (const job of allJobs(snapshot)) names.add(job.rep);
  return [...names];
}

export function fullNameForKey(snapshot, key) {
  if (!key) return null;
  return fullNames(snapshot).find((name) => repKey(name) === key) || null;
}

export function companiesForRep(snapshot, fullName) {
  const found = new Set();
  for (const row of snapshot?.reps?.reps || []) {
    if (row.rep === fullName) found.add(row.company);
  }
  for (const job of allJobs(snapshot)) {
    if (job.rep === fullName) found.add(job.company);
  }
  return ["SWT", "SSG"].filter((company) => found.has(company));
}

function activeByRep(snapshot, company) {
  const map = new Map();
  for (const row of snapshot?.reps?.reps || []) {
    if (row.company !== company) continue;
    map.set(row.rep, row.active === true);
  }
  return map;
}

function publicJob(job) {
  return {
    rep: firstName(job.rep),
    repKey: repKey(job.rep),
    month: job.month,
    year: job.year,
    date: job.date_sold,
    quote: job.quote_no,
    name: job.job_name,
    state: job.state || "Unknown",
    location: job.location,
    type: job.job_type || "Unspecified",
    amount: job.amount,
    changeOrder: job.is_change_order,
    status: job.status,
  };
}

function ranked(jobs, pick, limit) {
  const map = new Map();
  for (const job of jobs) {
    const name = pick(job);
    const row = map.get(name) || { name, jobs: 0, cents: 0 };
    row.jobs += 1;
    row.cents += Math.round(Number(job.amount) * 100);
    map.set(name, row);
  }
  const all = [...map.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const asDollars = (row) => ({ name: row.name, jobs: row.jobs, sales: dollars(row.cents) });
  if (all.length <= limit) return all.map(asDollars);
  const rest = all.slice(limit).reduce(
    (total, row) => ({ name: "Other", jobs: total.jobs + row.jobs, cents: total.cents + row.cents }),
    { name: "Other", jobs: 0, cents: 0 },
  );
  return [...all.slice(0, limit).map(asDollars), asDollars(rest)];
}

function leaderboard(jobs, snapshot, company, year) {
  const active = activeByRep(snapshot, company);
  const names = new Set(active.keys());
  for (const job of jobs) {
    if (job.company === company) names.add(job.rep);
  }
  return [...names]
    .map((rep) => {
      const mine = jobs.filter((job) => job.company === company && job.rep === rep && job.year === year);
      const isActive = active.get(rep) === true;
      return {
        repKey: repKey(rep),
        name: firstName(rep),
        active: isActive,
        login: isActive && !isExcludedRep(rep),
        jobs: mine.length,
        sales: dollars(sumCents(mine)),
      };
    })
    .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
}

function yearView(jobs, year) {
  const rows = jobs.filter((job) => job.year === String(year));
  const byMonth = new Map();
  let noMonthJobs = 0;
  let noMonthCents = 0;
  for (const job of rows) {
    const sale = Math.round(Number(job.amount) * 100);
    if (!job.month) {
      noMonthJobs += 1;
      noMonthCents += sale;
      continue;
    }
    const bucket = byMonth.get(job.month) || { key: job.month, jobs: 0, cents: 0 };
    bucket.jobs += 1;
    bucket.cents += sale;
    byMonth.set(job.month, bucket);
  }
  const months = [...byMonth.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((bucket, index, list) => {
      const sales = dollars(bucket.cents);
      const previous = index > 0 ? dollars(list[index - 1].cents) : null;
      return {
        key: bucket.key,
        label: monthLabel(bucket.key),
        jobs: bucket.jobs,
        sales,
        mom: previous == null ? null : change(sales, previous),
      };
    });
  let running = 0;
  const cumulative = months.map((month) => {
    running += Math.round(month.sales * 100);
    return { key: month.key, label: month.label, sales: dollars(running) };
  });
  if (noMonthJobs) {
    running += noMonthCents;
    cumulative.push({ key: "", label: "No month", sales: dollars(running) });
  }
  const salesCents = sumCents(rows);
  const latest = months[months.length - 1] || null;
  return {
    rows,
    sales: dollars(salesCents),
    jobs: rows.length,
    avg: rows.length ? dollars(salesCents) / rows.length : 0,
    months,
    cumulative,
    noMonthJobs,
    noMonthSales: dollars(noMonthCents),
    monthKey: latest?.key || null,
    monthLabel: latest?.label || null,
    monthSales: latest?.sales || 0,
    monthJobs: latest?.jobs || 0,
    mom: latest?.mom || null,
    states: ranked(rows, (job) => job.state || "Unknown", 8),
    types: ranked(rows, (job) => job.job_type || "Unspecified", 8),
  };
}

function yoyMonths(currentRows, previousRows, currentYear, previousYear) {
  const months = [];
  for (let month = 1; month <= 12; month += 1) {
    const mm = String(month).padStart(2, "0");
    const currentKey = `${currentYear}-${mm}`;
    const previousKey = `${previousYear}-${mm}`;
    const current = currentRows.filter((job) => job.month === currentKey);
    const previous = previousRows.filter((job) => job.month === previousKey);
    if (!current.length && !previous.length) continue;
    const currentSales = dollars(sumCents(current));
    const previousSales = dollars(sumCents(previous));
    months.push({
      month: mm,
      label: monthLabel(currentKey).replace(` ${currentYear}`, ""),
      current: currentSales,
      previous: previousSales,
      change: change(currentSales, previousSales),
    });
  }
  return months;
}

function recentJobs(rows) {
  return [...rows]
    .sort((a, b) => {
      const date = String(b.date_sold || "").localeCompare(String(a.date_sold || ""));
      if (date) return date;
      return (b.row || 0) - (a.row || 0);
    })
    .slice(0, 20)
    .map(publicJob);
}

function comparisonFromQuery(query, jobs, roster) {
  const mode = query.compare;
  if (!["year", "month", "quarter"].includes(mode)) return null;
  const keys = String(query.reps || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  const reps = keys.map((key) => roster.find((rep) => rep.repKey === key)).filter(Boolean);
  const period = {
    mode,
    year: String(query.year || ""),
    month: Number(query.month),
    quarter: Number(query.quarter),
  };
  const periods = [period];
  if (query.year2) {
    periods.push({
      mode,
      year: String(query.year2),
      month: Number(query.month2 || query.month),
      quarter: Number(query.quarter2 || query.quarter),
    });
  }
  return compareReps(jobs, { reps, periods });
}

export function buildDashboard(snapshot, session, query) {
  if (query.compare && session.role !== "admin") {
    return { status: 403, body: { error: "Rep comparisons are admin only." } };
  }
  const allowed = session.role === "admin" ? ["SWT", "SSG"] : companiesForRep(snapshot, session.rep);
  if (session.role !== "admin" && (isExcludedRep(session.rep) || isExcludedRep(session.name))) {
    return { status: 403, body: { error: "This login has no personal dashboard." } };
  }
  if (!allowed.length) {
    return {
      status: 200,
      body: {
        empty: true,
        role: session.role,
        viewer: session.name,
        companies: [],
        commission: { status: "coming_soon" },
        message: "No sales are assigned to this login yet.",
      },
    };
  }
  const requested = String(query.company || allowed[0] || "SWT").toUpperCase();
  if (!allowed.includes(requested)) {
    return { status: 403, body: { error: "That company is not on this login." } };
  }

  const generatedAt = requested === "SSG" ? snapshot.ssg?.generated_at : snapshot.swt?.generated_at;
  let scope = allJobs(snapshot).filter((job) => job.company === requested);
  let viewing = null;
  let viewingKey = null;

  if (session.role === "admin") {
    if (query.rep) {
      const full = fullNameForKey(snapshot, String(query.rep));
      if (!full) return { status: 404, body: { error: "Unknown rep." } };
      viewing = firstName(full);
      viewingKey = repKey(full);
      scope = scope.filter((job) => job.rep === full);
    }
  } else {
    scope = allJobs(snapshot).filter((job) => job.rep === session.rep && job.company === requested);
  }

  const years = [...new Set(scope.map((job) => job.year).filter(Boolean))].sort().reverse();
  const year = years.includes(String(query.year || "")) ? String(query.year) : years[0] || null;
  const current = year ? yearView(scope, year) : yearView([], "");
  const priorYear = year ? String(Number(year) - 1) : null;
  const hasPrior = priorYear && years.includes(priorYear);
  const prior = hasPrior ? yearView(scope, priorYear) : null;

  const showLeaderboard = session.role === "admin" && !viewing;
  const companyJobs = allJobs(snapshot).filter((job) => job.company === requested);
  const roster = showLeaderboard ? leaderboard(companyJobs, snapshot, requested, year) : [];
  const repCompare =
    session.role === "admin" && query.compare
      ? comparisonFromQuery(query, companyJobs.map(publicJob), roster.length ? roster : leaderboard(companyJobs, snapshot, requested, year))
      : null;
  return {
    status: 200,
    body: {
      empty: false,
      company: requested,
      companyLabel: companyLabel(requested),
      companies: allowed.map(companyOption),
      year,
      years,
      role: session.role,
      viewer: session.name,
      viewing,
      repKey: viewingKey,
      generatedAt: generatedAt || snapshot.updated_at || null,
      kpis: {
        sales: current.sales,
        jobs: current.jobs,
        avg: current.avg,
        monthKey: current.monthKey,
        monthLabel: current.monthLabel,
        monthSales: current.monthSales,
        monthJobs: current.monthJobs,
        mom: current.mom,
        priorYear: hasPrior ? priorYear : null,
        priorSales: prior?.sales ?? null,
        priorJobs: prior?.jobs ?? null,
        yoy: hasPrior ? change(current.sales, prior.sales) : null,
        noMonthJobs: current.noMonthJobs,
        noMonthSales: current.noMonthSales,
      },
      months: current.months,
      cumulative: current.cumulative,
      states: current.states,
      types: current.types,
      yoyMonths: hasPrior ? yoyMonths(current.rows, prior.rows, year, priorYear) : null,
      recent: recentJobs(current.rows),
      leaderboard: showLeaderboard ? roster : null,
      repCompare,
      jobs: scope.map(publicJob),
      commission: { status: "coming_soon" },
    },
  };
}
