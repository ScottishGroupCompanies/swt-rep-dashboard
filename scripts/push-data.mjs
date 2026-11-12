import { readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] || process.env.DATA_DIR;
const token = process.env.DATA_INGEST_TOKEN;
const rawUrl = process.env.DATA_INGEST_URL;

if (!dir || !token || !rawUrl) {
  console.error("Usage: DATA_INGEST_URL=https://<host> DATA_INGEST_TOKEN=... node scripts/push-data.mjs <folder>");
  console.error("The folder must contain swt_jobs.json, ssg_jobs.json, and reps.json.");
  process.exit(1);
}

const endpoint = new URL(rawUrl);
if (!endpoint.pathname.replace(/\/$/, "").endsWith("/api/ingest/data")) {
  endpoint.pathname = "/api/ingest/data";
  endpoint.search = "";
  endpoint.hash = "";
}

const [swt, ssg, reps] = await Promise.all(
  ["swt_jobs.json", "ssg_jobs.json", "reps.json"].map((name) =>
    readFile(join(dir, name), "utf8").then((text) => JSON.parse(text)),
  ),
);

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ swt_jobs: swt, ssg_jobs: ssg, reps }),
});

const text = await response.text();
console.log(`${response.status} ${endpoint.pathname}`);
console.log(text);
if (!response.ok) process.exit(1);
