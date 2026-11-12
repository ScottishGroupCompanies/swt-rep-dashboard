import { readFile } from "node:fs/promises";
import { hashCode } from "../src/auth.js";
import { isExcludedRep, loginCandidates } from "../src/reps.js";

const args = process.argv.slice(2);
const fromReps = args.includes("--from-reps");

function flag(name) {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
}

function warnSkipped(reps) {
  const seen = new Set();
  for (const row of reps || []) {
    const rep = String(row?.rep ?? "").trim();
    if (row?.active === true && rep && isExcludedRep(rep) && !seen.has(rep.toUpperCase())) {
      seen.add(rep.toUpperCase());
      console.error(
        `Skipped ${rep} (non-person code). Sales stay on the admin company totals and leaderboard. No login is created.`,
      );
    }
  }
}

let entries;
if (fromReps) {
  const path = flag("--from-reps");
  const code = process.env.LOGINS_CODE;
  const admin = flag("--admin") || "Jenny";
  if (!path || !code) {
    console.error("Usage: LOGINS_CODE=... node scripts/hash-logins.mjs --from-reps reps.json [--admin Jenny]");
    process.exit(1);
  }
  if (isExcludedRep(admin)) {
    console.error(`Refusing to create a login for non-person code ${admin}.`);
    process.exit(1);
  }
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const reps = Array.isArray(parsed) ? parsed : parsed.reps;
  warnSkipped(reps);
  let candidates;
  try {
    candidates = loginCandidates(reps);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  entries = [
    { name: admin, role: "admin", rep: null, code },
    ...candidates.map((login) => ({ ...login, code })),
  ];
} else {
  const path = args.find((arg) => !arg.startsWith("--")) || "logins.local.json";
  const parsed = JSON.parse(await readFile(path, "utf8"));
  const admin = parsed.admin;
  if (!admin?.name || !admin?.code) {
    console.error("logins file needs admin.name and admin.code.");
    process.exit(1);
  }
  if (isExcludedRep(admin.name)) {
    console.error(`Refusing to create a login for non-person code ${admin.name}.`);
    process.exit(1);
  }
  warnSkipped(parsed.reps);
  const reps = [];
  for (const row of parsed.reps || []) {
    if (isExcludedRep(row?.rep) || isExcludedRep(row?.name)) continue;
    if (!row?.name || !row?.rep || !row?.code) {
      console.error("Each rep needs name, rep, and code.");
      process.exit(1);
    }
    reps.push({ name: row.name, role: "rep", rep: row.rep, code: row.code });
  }
  const names = new Set([admin.name]);
  for (const row of reps) {
    if (names.has(row.name)) {
      console.error(`Duplicate login name ${row.name}.`);
      process.exit(1);
    }
    names.add(row.name);
  }
  entries = [{ name: admin.name, role: "admin", rep: null, code: admin.code }, ...reps];
}

const out = {};
for (const entry of entries) {
  out[entry.name] =
    entry.role === "admin"
      ? { role: "admin", codeHash: hashCode(entry.code) }
      : { role: "rep", rep: entry.rep, codeHash: hashCode(entry.code) };
}
process.stdout.write(`${JSON.stringify(out)}\n`);
