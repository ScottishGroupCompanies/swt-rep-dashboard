import { normalizeCompany } from "./reps.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_JOBS = 20000;

export function sheetYear(job) {
  const tab = String(job?.tab ?? "").trim();
  const match = tab.match(/(?:19|20)\d{2}/);
  return match ? match[0] : null;
}

export function monthKey(job) {
  const month = String(job?.month ?? "").trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

export function monthLabel(key) {
  if (!key) return "No month";
  const [year, month] = key.split("-");
  const name = MONTHS[Number(month) - 1];
  return name ? `${name} ${year}` : key;
}

export function readAmount(job) {
  const amount = job?.amount;
  const pre = job?.amount_pre_fee ?? job?.amountPreFee ?? job?.pre_fee ?? job?.preFee;
  const hasAmount = amount !== undefined && amount !== null && amount !== "";
  const hasPre = pre !== undefined && pre !== null && pre !== "";
  if (!hasAmount && !hasPre) return { error: "amount is required" };
  const primary = hasAmount ? Number(amount) : Number(pre);
  if (!Number.isFinite(primary)) return { error: "amount must be a number" };
  if (hasAmount && hasPre) {
    const other = Number(pre);
    if (!Number.isFinite(other) || Math.round(primary * 100) !== Math.round(other * 100)) {
      return { error: "amount and amount_pre_fee must match" };
    }
  }
  return { amount: primary };
}

function cents(amount) {
  return Math.round(Number(amount) * 100);
}

export function sumCents(jobs) {
  return jobs.reduce((total, job) => total + cents(job.amount), 0);
}

export function dollars(totalCents) {
  return totalCents / 100;
}

export function tabTotals(jobs, company, year) {
  const rows = jobs.filter((job) => job.company === company && job.year === String(year));
  return { jobs: rows.length, sales: dollars(sumCents(rows)) };
}

function blankToNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeJob(raw, company, label, index, errors) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${label}.jobs[${index}] must be an object.`);
    return null;
  }
  const where = `${label}.jobs[${index}]`;
  const local = [];
  const declared = raw.company == null || raw.company === "" ? company : normalizeCompany(raw.company);
  if (declared !== company) local.push(`${where}.company must be ${company}.`);
  const rep = String(raw.rep ?? "").trim();
  if (!rep) local.push(`${where}.rep is required.`);
  const year = sheetYear(raw);
  if (!year) local.push(`${where}.tab must be the sheet year.`);
  const amount = readAmount(raw);
  if (amount.error) local.push(`${where}.${amount.error}.`);
  const month = monthKey(raw);
  if (raw.month != null && String(raw.month).trim() !== "" && !month) {
    local.push(`${where}.month must be YYYY-MM.`);
  }
  if (local.length) {
    errors.push(...local);
    return null;
  }
  const quote = blankToNull(raw.quote_no ?? raw.quoteNo);
  const changeFlag = raw.is_change_order ?? raw.isChangeOrder;
  const changeOrder =
    changeFlag === true || changeFlag === "true" || (quote != null && quote.toUpperCase().includes("-CO"));
  const date = blankToNull(raw.date_sold ?? raw.dateSold);
  return {
    company,
    rep,
    date_sold: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    month,
    quote_no: quote,
    job_name: blankToNull(raw.job_name ?? raw.jobName) || "Untitled job",
    state: blankToNull(raw.state),
    location: blankToNull(raw.location),
    job_type: blankToNull(raw.job_type ?? raw.jobType),
    amount: amount.amount,
    is_change_order: Boolean(changeOrder),
    status: blankToNull(raw.status) || "",
    tab: String(raw.tab).trim(),
    year,
    row: Number.isFinite(Number(raw.row)) ? Number(raw.row) : null,
  };
}

function readCompany(file, company, label, errors) {
  if (!file || typeof file !== "object" || Array.isArray(file) || !Array.isArray(file.jobs)) {
    errors.push(`${label} must be an object with a jobs array.`);
    return { generated_at: null, jobs: [] };
  }
  if (file.jobs.length > MAX_JOBS) {
    errors.push(`${label} has too many jobs.`);
    return { generated_at: null, jobs: [] };
  }
  const jobs = [];
  file.jobs.forEach((raw, index) => {
    const job = normalizeJob(raw, company, label, index, errors);
    if (job) jobs.push(job);
  });
  return { generated_at: file.generated_at ?? null, jobs };
}

function readReps(file, errors) {
  if (!file || typeof file !== "object" || Array.isArray(file) || !Array.isArray(file.reps)) {
    errors.push("reps must be an object with a reps array.");
    return { generated_at: null, reps: [] };
  }
  const reps = [];
  file.reps.forEach((raw, index) => {
    const where = `reps[${index}]`;
    if (!raw || typeof raw !== "object") {
      errors.push(`${where} must be an object.`);
      return;
    }
    const company = normalizeCompany(raw.company);
    const rep = String(raw.rep ?? "").trim();
    if (company !== "SWT" && company !== "SSG") errors.push(`${where}.company must be SWT or SSG.`);
    if (!rep) errors.push(`${where}.rep is required.`);
    const activeFlag = raw.active;
    const activeOk = activeFlag === true || activeFlag === false || activeFlag === "true" || activeFlag === "false";
    if (!activeOk) errors.push(`${where}.active must be true or false.`);
    if (company && rep && activeOk) {
      reps.push({ company, rep, active: activeFlag === true || activeFlag === "true" });
    }
  });
  return { generated_at: file.generated_at ?? null, reps };
}

export function prepareSnapshot(body) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: ["Body must be a JSON object with swt_jobs, ssg_jobs, and reps."] };
  }
  for (const key of ["swt_jobs", "ssg_jobs", "reps"]) {
    if (body[key] == null) errors.push(`${key} is required.`);
  }
  const swt = readCompany(body.swt_jobs, "SWT", "swt_jobs", errors);
  const ssg = readCompany(body.ssg_jobs, "SSG", "ssg_jobs", errors);
  const reps = readReps(body.reps, errors);
  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return {
    ok: true,
    snapshot: {
      swt,
      ssg,
      reps,
      updated_at: new Date().toISOString(),
    },
    counts: { swt: swt.jobs.length, ssg: ssg.jobs.length, reps: reps.reps.length },
  };
}

export function allJobs(snapshot) {
  if (!snapshot) return [];
  return [...(snapshot.swt?.jobs || []), ...(snapshot.ssg?.jobs || [])];
}
