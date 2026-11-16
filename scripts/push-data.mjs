import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] || process.env.DATA_DIR;
const token = process.env.DATA_INGEST_TOKEN;
const rawUrl = process.env.DATA_INGEST_URL;

if (!dir || !token || !rawUrl) {
  console.error("Usage: DATA_INGEST_URL=https://<host> DATA_INGEST_TOKEN=... node scripts/push-data.mjs <folder>");
  console.error("The folder must contain swt_jobs.json, ssg_jobs.json, and reps.json. shi_jobs.json is optional.");
  process.exit(1);
}

const endpoint = new URL(rawUrl);
if (!endpoint.pathname.replace(/\/$/, "").endsWith("/api/ingest/data")) {
  endpoint.pathname = "/api/ingest/data";
  endpoint.search = "";
  endpoint.hash = "";
}

async function readJson(name) {
  return JSON.parse(await readFile(join(dir, name), "utf8"));
}

const [swt, ssg, reps] = await Promise.all(["swt_jobs.json", "ssg_jobs.json", "reps.json"].map((name) => readJson(name)));
const body = { swt_jobs: swt, ssg_jobs: ssg, reps };
try {
  await access(join(dir, "shi_jobs.json"));
  body.shi_jobs = await readJson("shi_jobs.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await response.text();
console.log(`${response.status} ${endpoint.pathname}`);
console.log(text);
if (!response.ok) process.exit(1);
