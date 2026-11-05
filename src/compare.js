/**
 * Period comparison for the rep dashboard.
 * Change is the later period minus the earlier period, as a percent of the
 * earlier period. Ranges are inclusive month keys (YYYY-MM).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function orderRange(start, end) {
  return start <= end ? [start, end] : [end, start];
}

export function rangeLabel(start, end) {
  const [from, to] = orderRange(start, end);
  const fmt = (key) => {
    const [year, month] = key.split("-");
    return `${MONTHS[Number(month) - 1]} ${year}`;
  };
  if (from === to) return fmt(from);
  const [yearA, monthA] = from.split("-");
  const [yearB, monthB] = to.split("-");
  if (yearA === yearB) return `${MONTHS[Number(monthA) - 1]}–${MONTHS[Number(monthB) - 1]} ${yearA}`;
  return `${fmt(from)}–${fmt(to)}`;
}

export function quarterOf(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return { year, quarter, id: `${year}-Q${quarter}` };
}

export function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sortedKeys(monthKeys) {
  return [...new Set(monthKeys)].filter(Boolean).sort();
}

export function listQuarters(monthKeys) {
  const map = new Map();
  for (const key of sortedKeys(monthKeys)) {
    const quarter = quarterOf(key);
    const row = map.get(quarter.id) || { ...quarter, start: key, end: key };
    row.end = key;
    map.set(quarter.id, row);
  }
  return [...map.values()];
}

function quarterBounds(monthKeys, year, quarter) {
  const keys = sortedKeys(monthKeys).filter((key) => {
    const found = quarterOf(key);
    return found.year === year && found.quarter === quarter;
  });
  if (!keys.length) return null;
  return { start: keys[0], end: keys[keys.length - 1], id: `${year}-Q${quarter}` };
}

export function presets(monthKeys) {
  const keys = sortedKeys(monthKeys);
  const latest = keys[keys.length - 1];
  if (!latest) return { month: null, quarter: null };
  const calendarPrev = shiftMonth(latest, -1);
  const previous = keys.includes(calendarPrev) ? calendarPrev : keys[keys.length - 2] || latest;
  const current = quarterOf(latest);
  const prevYear = current.quarter === 1 ? current.year - 1 : current.year;
  const prevQuarter = current.quarter === 1 ? 4 : current.quarter - 1;
  const thisQuarter = quarterBounds(keys, current.year, current.quarter);
  const lastQuarter = quarterBounds(keys, prevYear, prevQuarter);
  return {
    month: {
      a: { start: latest, end: latest },
      b: { start: previous, end: previous },
    },
    quarter: thisQuarter && lastQuarter ? { a: thisQuarter, b: lastQuarter } : null,
  };
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function emptyBucket() {
  return { sales: 0, commission: 0, jobs: 0 };
}

export function summarizePeriod(jobs, start, end) {
  const [from, to] = orderRange(start, end);
  const matched = jobs.filter((job) => job.monthKey && job.monthKey >= from && job.monthKey <= to);
  let salesCents = 0;
  let commissionCents = 0;
  let belowFloor = 0;
  const byType = {};
  const byState = {};
  for (const job of matched) {
    const sale = cents(job.charged);
    const commission = cents(job.commission || 0);
    salesCents += sale;
    commissionCents += commission;
    if (job.status === "below_floor") belowFloor += 1;
    const type = job.jobType || "Unspecified";
    const state = job.state || "Unknown";
    byType[type] = byType[type] || emptyBucket();
    byState[state] = byState[state] || emptyBucket();
    byType[type].sales += sale;
    byType[type].commission += commission;
    byType[type].jobs += 1;
    byState[state].sales += sale;
    byState[state].commission += commission;
    byState[state].jobs += 1;
  }
  const asDollars = (bucket) => ({
    sales: bucket.sales / 100,
    commission: bucket.commission / 100,
    jobs: bucket.jobs,
  });
  return {
    start: from,
    end: to,
    sales: salesCents / 100,
    commission: commissionCents / 100,
    count: matched.length,
    avg: matched.length ? salesCents / matched.length / 100 : 0,
    belowFloor,
    byType: Object.fromEntries(Object.entries(byType).map(([key, bucket]) => [key, asDollars(bucket)])),
    byState: Object.fromEntries(Object.entries(byState).map(([key, bucket]) => [key, asDollars(bucket)])),
  };
}

export function change(current, baseline) {
  const diff = current - baseline;
  if (baseline === 0) return { diff, pct: current === 0 ? 0 : null };
  return { diff, pct: (diff / Math.abs(baseline)) * 100 };
}

export function orientPeriods(summaryA, summaryB) {
  const aIsLater =
    summaryA.start > summaryB.start ||
    (summaryA.start === summaryB.start && summaryA.end > summaryB.end);
  const earlier = aIsLater ? summaryB : summaryA;
  const later = aIsLater ? summaryA : summaryB;
  const earlierLabel = rangeLabel(earlier.start, earlier.end);
  const laterLabel = rangeLabel(later.start, later.end);
  return {
    earlier,
    later,
    earlierLabel,
    laterLabel,
    label: `${earlierLabel} → ${laterLabel}`,
  };
}

export function periodChange(summaryA, summaryB, valueOf) {
  const { earlier, later } = orientPeriods(summaryA, summaryB);
  return change(valueOf(later), valueOf(earlier));
}

export function comparePeriods(jobs, rangeA, rangeB) {
  return {
    a: summarizePeriod(jobs, rangeA.start, rangeA.end),
    b: summarizePeriod(jobs, rangeB.start, rangeB.end),
  };
}

function bucket(summary, group, name) {
  return summary[group][name] || { sales: 0, commission: 0, jobs: 0 };
}

export function typeRows(summaryA, summaryB) {
  const { earlier, later } = orientPeriods(summaryA, summaryB);
  const preferred = ["Residential", "Commercial"];
  const names = [
    ...preferred,
    ...[...new Set([...Object.keys(summaryA.byType), ...Object.keys(summaryB.byType)])]
      .filter((name) => !preferred.includes(name))
      .sort(),
  ];
  return names.map((name) => {
    const earlierValues = bucket(earlier, "byType", name);
    const laterValues = bucket(later, "byType", name);
    return {
      name,
      earlier: earlierValues,
      later: laterValues,
      change: change(laterValues.sales, earlierValues.sales),
    };
  });
}

export function topStates(summaryA, summaryB, limit = 5) {
  const { earlier, later } = orientPeriods(summaryA, summaryB);
  const names = new Set([...Object.keys(summaryA.byState), ...Object.keys(summaryB.byState)]);
  return [...names]
    .map((state) => {
      const earlierValues = bucket(earlier, "byState", state);
      const laterValues = bucket(later, "byState", state);
      return {
        state,
        earlier: earlierValues,
        later: laterValues,
        change: change(laterValues.sales, earlierValues.sales),
      };
    })
    .sort(
      (left, right) =>
        right.earlier.sales + right.later.sales - (left.earlier.sales + left.later.sales),
    )
    .slice(0, limit);
}
