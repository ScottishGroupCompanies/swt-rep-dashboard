/**
 * Admin rep-vs-rep totals.
 * A job counts toward a year when its sheet tab (`year`) matches.
 * A month or quarter also requires Month Sold (`month`, YYYY-MM) in that same year.
 * date_sold is not used.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodLabel(period) {
  if (period.mode === "year") return String(period.year);
  if (period.mode === "quarter") return `Q${period.quarter} ${period.year}`;
  return `${MONTHS[Number(period.month) - 1]} ${period.year}`;
}

export function jobInPeriod(job, period) {
  if (String(job.year) !== String(period.year)) return false;
  if (period.mode === "year") return true;
  const match = /^(\d{4})-(\d{2})$/.exec(String(job.month || ""));
  if (!match || match[1] !== String(period.year)) return false;
  const month = Number(match[2]);
  if (period.mode === "month") return month === Number(period.month);
  if (period.mode === "quarter") return Math.floor((month - 1) / 3) + 1 === Number(period.quarter);
  return false;
}

function salesOf(jobs) {
  const cents = jobs.reduce((total, job) => total + Math.round(Number(job.amount) * 100), 0);
  return cents / 100;
}

export function compareReps(jobs, { reps, periods }) {
  return {
    periods: (periods || []).map((period) => ({
      label: periodLabel(period),
      mode: period.mode,
      rows: (reps || []).map((rep) => {
        const mine = (jobs || []).filter((job) => job.repKey === rep.repKey && jobInPeriod(job, period));
        return { repKey: rep.repKey, name: rep.name, jobs: mine.length, sales: salesOf(mine) };
      }),
    })),
  };
}
