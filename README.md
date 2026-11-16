# Scottish Group Companies rep dashboard

Sales dashboards for **Scottish Window Tinting (SWT)**, **Scottish Stained Glass (SSG)**, and **Scottish Home Improvements (SHI)**. Each active rep signs in to their own sales. Jenny's login is the admin view for every company. The page shows sales only. Commission is stored for a later update and is not shown.

Real job files, rep codes, and sign-in codes are not part of this repository. The browser downloads no sales file until someone signs in, and the static site contains none.

## Sign-in

The name list is `DASHBOARD_LOGINS`, a server environment variable. It is not written in the app. One login covers a person who sells for more than one company: the company switch then shows each company where that full name appears, including SHI. Reps only receive their own jobs. Inactive reps are not given logins by the generator below. They still appear on the admin leaderboard.

`HOO` is a non-person code. It never gets a login or a personal dashboard, even if a row marks it active and even if it is pasted into `DASHBOARD_LOGINS`. Its sales stay in the admin company totals and leaderboard. Add more non-person codes with `DASHBOARD_EXCLUDE_REPS` (comma-separated). That does not require an application change.

Display names in the dashboard are the first name only (`Ada Example` is shown as Ada). Initials that are a single word stay as written.

On the admin company view, pick two or more reps, then Year vs year, Month vs month, or Quarter vs quarter. Quarters are calendar quarters of Month Sold on that sheet tab. Check “Second period” to put the same reps side by side for another year, month, or quarter. Rep logins cannot request that comparison.

For the first setup, put `0000` in the gitignored login file for every person. Change one person's code later by editing that file and replacing the `DASHBOARD_LOGINS` value. No application change is required.

```bash
cp logins.example.json logins.local.json
# edit codes, then:
node scripts/hash-logins.mjs
```

Or build the list from a local `reps.json` (active people only, one login per person, `HOO` skipped):

```bash
LOGINS_CODE='0000' node scripts/hash-logins.mjs --from-reps /secure/reps.json --admin Jenny
```

Paste the printed JSON into the `DASHBOARD_LOGINS` environment variable. `logins.local.json` is gitignored. The script prints hashes, not the codes.

Login records look like:

```json
{
  "Jenny": { "role": "admin", "codeHash": "scrypt$…" },
  "Ada": { "role": "rep", "rep": "Ada Example", "codeHash": "scrypt$…" }
}
```

`rep` is the Designer value from the sheet, matched across SWT, SSG, and SHI. The dropdown label is the object key.

Codes are checked with scrypt on the server. The session is an httpOnly signed cookie (`SESSION_SECRET`). Eight failed attempts from one address lock that address for 15 minutes.

## Sales files

`swt_jobs.json`, `ssg_jobs.json`, and optional `shi_jobs.json` use the same job shape. SHI job totals already include the contract, permits, and change orders, and they have no separate 4% fee, so `amount` still equals `amount_pre_fee`.

```json
{
  "generated_at": "2026-01-01T00:00:00Z",
  "jobs": [{
    "company": "SWT",
    "rep": "Ada Example",
    "date_sold": "2026-01-15",
    "month": "2026-01",
    "quote_no": "WT-100",
    "job_name": "Sample Shop",
    "state": "CO",
    "location": "CO - Denver",
    "job_type": "Residential",
    "amount": 10,
    "amount_pre_fee": 10,
    "is_change_order": false,
    "status": "",
    "tab": "2026",
    "row": 2
  }]
}
```

`reps.json`:

```json
{
  "generated_at": "2026-01-01T00:00:00Z",
  "reps": [{
    "company": "SWT",
    "rep": "Ada Example",
    "active": true,
    "jobs_2025": 0,
    "sales_2025": 0,
    "jobs_2026_ytd": 1,
    "sales_2026_ytd": 10
  }]
}
```

`amount` and `amount_pre_fee` are the same pre-fee job total. Fees are already excluded. Extra fields are ignored.

The sheet **tab** is the year (`2025` or `2026`). **Month Sold** is the month. SWT and SSG send `YYYY-MM`. SHI's sheet writes Month Sold as `8-August` or `1-January`; the tab supplies the year, so those become `2026-08` and `2026-01`. Date Sold may be `M/D/YYYY`. Do not group by the calendar year of `date_sold`. A later-year tab includes prior-year cancellation credits, and those credits belong to that tab.

Company totals on the admin view add every row on the tab, including inactive reps and `HOO`.

## Upload

The hourly job should send all three files on every run. The handler replaces the stored snapshot in one write. A rejected upload leaves the previous snapshot in place. Sending the same three files again is safe.

`POST /api/ingest/data`

```http
Authorization: Bearer <DATA_INGEST_TOKEN>
Content-Type: application/json
```

```json
{
  "swt_jobs": { "generated_at": "…", "jobs": [] },
  "ssg_jobs": { "generated_at": "…", "jobs": [] },
  "shi_jobs": {
    "generated_at": "…",
    "jobs": [{
      "company": "SHI",
      "rep": "Ada Example",
      "date_sold": "2026-02-01",
      "month": "2026-02",
      "quote_no": "HI-100",
      "job_name": "Sample Remodel",
      "state": "CO",
      "location": "CO - Denver",
      "job_type": "Remodel",
      "amount": 10,
      "amount_pre_fee": 10,
      "is_change_order": false,
      "status": "",
      "tab": "2026",
      "row": 2
    }]
  },
  "reps": { "generated_at": "…", "reps": [] }
}
```

`swt_jobs`, `ssg_jobs`, and `reps` are required. `shi_jobs` is optional: when it is omitted, Scottish Home Improvements is stored with no jobs, so the current SWT and SSG upload still succeeds. Once SHI sales should stay on the dashboard, send `shi_jobs` on every upload, because a payload without it replaces SHI with an empty list. `200` returns `{ "ok": true, "replaced_at": "…", "counts": { "swt": 0, "ssg": 0, "shi": 0, "reps": 0 } }`. `400` means nothing was saved. A missing token is `503`. A wrong token is `401`.

```bash
DATA_INGEST_URL=https://<preview-host> DATA_INGEST_TOKEN=... node scripts/push-data.mjs /path/to/folder
```

The folder contains `swt_jobs.json`, `ssg_jobs.json`, and `reps.json`. Add `shi_jobs.json` when Scottish Home Improvements should be included; the script sends that file only when it is present. The script posts to `/api/ingest/data`. Keep the JSON under about 4 MB.

Commission, when a later job has it, is a separate store:

`POST /api/ingest/commission` with `Authorization: Bearer <COMMISSION_INGEST_TOKEN>` and any JSON object. The dashboard does not read it. The page shows “Commission coming soon”.

## Storage and Vercel

Sales and commission each live in one private Vercel Blob object (`BLOB_READ_WRITE_TOKEN`). Readers see the previous full snapshot or the new one, not a half-written company.

Set these names on the **Preview** environment. Do not redeploy production from this branch. Production on `main` is still the previous demo until this branch is approved.

| Name | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Private Blob store connection |
| `DASHBOARD_LOGINS` | Hashed sign-in records from `scripts/hash-logins.mjs` |
| `SESSION_SECRET` | Signs the session cookie |
| `DATA_INGEST_TOKEN` | Bearer token for the hourly sales upload |
| `COMMISSION_INGEST_TOKEN` | Bearer token for the future commission upload |
| `DASHBOARD_EXCLUDE_REPS` | Optional extra non-person codes, comma-separated |

In the Vercel dashboard, create a **private** Blob store and connect it to this project so `BLOB_READ_WRITE_TOKEN` is created. Add the other values as secrets. `DATA_STORE=memory` is for local tests only.

The build does not need those variables. Sign-in and upload return 503 until they are set.

## Local

```bash
npm test
npm start
```

`npm start` runs the tests, writes `public/`, and serves the site and API at http://localhost:4173. Point `DATA_STORE=memory` plus the auth and ingest variables at the dev server when you want to sign in locally. Do not commit the files you upload.

To check a real upload folder without committing it:

```bash
SGC_DATA_DIR=/path/to/folder npm test
```

That test is skipped when `SGC_DATA_DIR` is unset.
