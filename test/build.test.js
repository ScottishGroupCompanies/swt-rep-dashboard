import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("build writes the static site Vercel publishes", async () => {
  const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /import \{ computeCommission \} from "\.\/commission\.js"/);
  assert.match(html, /const CODE = "1234"/);
  assert.match(html, /Nick · Commission Dashboard/);
  assert.match(html, /chart\.umd\.min\.js/);
  assert.match(html, /MoM /);
  assert.match(html, /Below 10% floor/);
  assert.match(html, /at or under 90% of list/);
  assert.match(html, /id="compare"/);
  assert.match(html, /from "\.\/compare\.js"/);
  assert.match(html, /SCOTTISH/);
  assert.match(html, /GROUP COMPANIES/);
  assert.match(html, /favicon\.svg/);
  assert.equal(html.includes("#1f6feb"), false);
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /#1B2A4A/);

  const commission = await readFile(new URL("../public/commission.js", import.meta.url), "utf8");
  assert.match(commission, /export function computeCommission/);
  const compare = await readFile(new URL("../public/compare.js", import.meta.url), "utf8");
  assert.match(compare, /export function comparePeriods/);

  const data = JSON.parse(
    await readFile(new URL("../public/data.json", import.meta.url), "utf8"),
  );
  assert.equal(data.rep.displayName, "Nick");
  assert.equal(data.rep.rate, 0.07);
  assert.ok(data.jobs.length > 0);
  assert.ok(data.months.length > 0);
});
