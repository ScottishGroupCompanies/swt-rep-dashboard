import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { allJobs, prepareSnapshot, tabTotals } from "../src/sales.js";

const dir = process.env.SGC_DATA_DIR;

test(
  "uploaded sheet tabs match the official company totals",
  { skip: dir ? false : "Set SGC_DATA_DIR to a folder with swt_jobs.json, ssg_jobs.json, and reps.json" },
  async () => {
    const [swt, ssg, reps] = await Promise.all(
      ["swt_jobs.json", "ssg_jobs.json", "reps.json"].map((name) =>
        readFile(join(dir, name), "utf8").then((text) => JSON.parse(text)),
      ),
    );
    const prepared = prepareSnapshot({ swt_jobs: swt, ssg_jobs: ssg, reps });
    assert.equal(prepared.ok, true, prepared.errors?.join("\n"));
    const jobs = allJobs(prepared.snapshot);
    const expected = [
      ["SWT", "2026", 983, "2866531.81"],
      ["SWT", "2025", 1180, "3589759.75"],
      ["SSG", "2026", 278, "4628544.24"],
      ["SSG", "2025", 304, "5703592.89"],
    ];
    for (const [company, year, count, sales] of expected) {
      const totals = tabTotals(jobs, company, year);
      assert.equal(totals.jobs, count, `${company} ${year} jobs`);
      assert.equal(totals.sales.toFixed(2), sales, `${company} ${year} sales`);
    }
  },
);
