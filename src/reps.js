import { createHash } from "node:crypto";

/** Sheet codes that are not a person. They never get a login or a personal dashboard. */
export const NON_PERSON_CODES = ["HOO"];

const COMPANY_LABELS = {
  SWT: "Scottish Window Tinting",
  SSG: "Scottish Stained Glass",
};

export function companyLabel(company) {
  return COMPANY_LABELS[company] || company;
}

export function normalizeCompany(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "SWT" || text === "SSG") return text;
  if (text.includes("STAIN")) return "SSG";
  if (text.includes("TINT")) return "SWT";
  return text;
}

export function firstName(rep) {
  const text = String(rep ?? "").trim();
  if (!text) return "";
  return text.split(/\s+/)[0];
}

export function repKey(rep) {
  return createHash("sha256").update(String(rep).trim()).digest("hex").slice(0, 16);
}

export function excludedReps() {
  const extra = String(process.env.DASHBOARD_EXCLUDE_REPS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set([...NON_PERSON_CODES, ...extra].map((item) => item.toUpperCase()));
}

export function isExcludedRep(rep) {
  const text = String(rep ?? "").trim();
  if (!text) return false;
  return excludedReps().has(text.toUpperCase());
}

/**
 * One login per active person. The same full name at both companies is one login.
 * Inactive reps and non-person codes (HOO, plus DASHBOARD_EXCLUDE_REPS) are omitted.
 */
export function loginCandidates(reps) {
  const byName = new Map();
  for (const row of reps || []) {
    const rep = String(row?.rep ?? "").trim();
    const company = normalizeCompany(row?.company);
    if (!rep || row?.active !== true) continue;
    if (isExcludedRep(rep)) continue;
    if (company !== "SWT" && company !== "SSG") continue;
    const existing = byName.get(rep) || { rep, companies: [] };
    if (!existing.companies.includes(company)) existing.companies.push(company);
    byName.set(rep, existing);
  }

  const used = new Map();
  const logins = [];
  for (const entry of byName.values()) {
    const name = firstName(entry.rep);
    if (!name || isExcludedRep(name)) continue;
    const prior = used.get(name);
    if (prior && prior !== entry.rep) {
      throw new Error(
        `Login name "${name}" is shared by "${prior}" and "${entry.rep}". Set distinct names in logins.local.json.`,
      );
    }
    used.set(name, entry.rep);
    logins.push({
      name,
      role: "rep",
      rep: entry.rep,
      companies: ["SWT", "SSG"].filter((company) => entry.companies.includes(company)),
    });
  }
  logins.sort((a, b) => a.name.localeCompare(b.name));
  return logins;
}
