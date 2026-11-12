import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("hash-logins emits one login per active person and skips HOO", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sgc-logins-"));
  const repsPath = join(dir, "reps.json");
  await writeFile(
    repsPath,
    JSON.stringify({
      reps: [
        { company: "SWT", rep: "Ada Example", active: true },
        { company: "SSG", rep: "Ada Example", active: true },
        { company: "SSG", rep: "HOO", active: true },
        { company: "SWT", rep: "Ben Sample", active: false },
      ],
    }),
  );
  const result = spawnSync(process.execPath, ["scripts/hash-logins.mjs", "--from-reps", repsPath, "--admin", "Jenny"], {
    encoding: "utf8",
    env: { ...process.env, LOGINS_CODE: "local-only-code", DASHBOARD_EXCLUDE_REPS: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Skipped HOO/);
  assert.equal(result.stdout.includes("local-only-code"), false);
  const logins = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(logins).sort(), ["Ada", "Jenny"]);
  assert.equal(logins.Ada.role, "rep");
  assert.equal(logins.Ada.rep, "Ada Example");
  assert.equal(logins.Ada.company, undefined);
  assert.equal(logins.Jenny.role, "admin");
  assert.match(logins.Ada.codeHash, /^scrypt\$/);
});
