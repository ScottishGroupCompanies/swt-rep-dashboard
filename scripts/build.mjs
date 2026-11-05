import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

const data = JSON.parse(await readFile(join(root, "data/nick_dashboard.json"), "utf8"));

for (const key of ["asOf", "rep", "kpis", "months", "jobs", "meta"]) {
  if (data[key] == null) {
    throw new Error(`data/nick_dashboard.json is missing "${key}"`);
  }
}
if (data.rep.displayName !== "Nick" || data.rep.rate !== 0.07) {
  throw new Error("Presentation snapshot must stay rep Nick at rate 0.07");
}
if (!Array.isArray(data.jobs) || data.jobs.length === 0) {
  throw new Error("Snapshot must include at least one job");
}
if (!Array.isArray(data.months) || data.months.length === 0) {
  throw new Error("Snapshot must include months");
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, "src/index.html"), join(out, "index.html"));
await cp(join(root, "src/commission.js"), join(out, "commission.js"));
await cp(join(root, "src/compare.js"), join(out, "compare.js"));
await cp(join(root, "src/favicon.svg"), join(out, "favicon.svg"));
await writeFile(join(out, "data.json"), JSON.stringify(data));
