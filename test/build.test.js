import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build publishes the sign-in shell without sales data", async () => {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const names = await readdir(new URL("../public/", import.meta.url));
  assert.deepEqual(names.sort(), ["compare.js", "dashboard.js", "favicon.svg", "index.html"]);

  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const client = await readFile(new URL("../public/dashboard.js", import.meta.url), "utf8");
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  const published = `${html}\n${client}`;
  assert.match(html, /SCOTTISH/);
  assert.match(html, /GROUP COMPANIES/);
  assert.match(html, /id="name"/);
  assert.match(html, /type="password"/);
  assert.match(favicon, /#1B2A4A/);
  assert.match(client, /Commission coming soon/);
  assert.match(client, /\/api\/auth\/login/);
  assert.equal(published.includes("nick_dashboard"), false);
  assert.equal(published.includes("admin-jobs"), false);
  assert.equal(published.includes("REP_CODE"), false);
  assert.equal(published.includes("ADMIN_CODE"), false);
  assert.equal(published.includes("#1f6feb"), false);
  assert.equal(html.includes("1234"), false);
});
