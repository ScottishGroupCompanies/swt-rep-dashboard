# SWT Rep Dashboard

Presentation demo for Scottish Window Tinting, under the Scottish Group Companies mark. A 4-digit gate opens a one-page commission report for sales rep **Nick** at **7%**.

The access code is `1234`. The check runs in the browser only and is not authentication.

## What the page shows

- KPIs: year-to-date sales, year-to-date commission, this month, jobs, below-10% floor count, average job, expected payroll
- Monthly sales (bars) and commission (line), with month-over-month sales change in the tooltip
- Year-to-date cumulative sales and commission
- Sales by state, residential vs commercial, and film mix
- Month, job type, and state filters
- Compare: two month ranges (or a quarter) side by side. Change is the later period minus the earlier period, labeled by period name, with a grouped sales/commission chart
- Recent jobs

Prices exclude the 4% processing fee. Commission is pre-fee:

| Case | Commission |
| --- | --- |
| Charged at or above list | rate × charged |
| Undersold by less than 10% | rate × list − 0.5 × (list − charged) |
| Charged at or under 90% of list | $0 |
| No list price | rate × charged, marked list not verified |

Commission is clamped at $0. Jobs at or under 90% of list are counted on the **Below 10% floor** card. This demo has no manager-approval overrides.

Example: list $1,000 at 5% → sold $1,100 is **$55**, sold $950 is **$25**, sold $900 is **$0**.

## Project layout

| Path | Role |
| --- | --- |
| `src/index.html` | Page, styles, and charts |
| `src/commission.js` | Commission rule |
| `src/compare.js` | Period comparison |
| `data/nick_dashboard.json` | Snapshot the page reads |
| `scripts/build.mjs` | Writes the static site into `public/` |
| `test/` | Commission unit tests and a build check |
| `vercel.json` | Vercel build and output settings |

`public/` is generated. Chart.js loads from the jsDelivr CDN at runtime.

## Local

```bash
npm test
npm start
```

`npm start` runs the tests, builds `public/`, and serves http://localhost:4173. `npm test` also checks that the build output includes `index.html`, `commission.js`, and `data.json`.

## Deploy on Vercel

`vercel.json` sets the framework to Other, the build command to `npm run build`, and the output directory to `public`. No environment variables are required.

1. Import this Git repository in the Vercel dashboard.
2. Keep the production branch as `main`. Vercel reads the build settings from `vercel.json`.
3. Deploy. The build runs the commission tests, then publishes `public/index.html`, `public/commission.js`, and `public/data.json`.

Pushes to other branches get preview deployments with the same build.

## Refresh the data

Replace `data/nick_dashboard.json` with a new snapshot in the same shape:

- `asOf` and `timezone`
- `rep.displayName` of `Nick` and `rep.rate` of `0.07` (the build rejects any other presentation identity)
- `kpis`, `months`, `jobs`, and `meta`
- Optional rollups: `byState`, `byJobType`, `byFilmType`

Each job needs `charged` and `listPrice` (`null` when the list was not verified). Recompute commission, the monthly rollups, and the KPIs from those prices:

```bash
node scripts/recompute.mjs
npm test
```

`src/commission.js` is the rule. The unit tests recompute every job and fail if the snapshot drifts from it.

The sales-rep identity in this repository stays **Nick**. Customer names on the jobs are part of the snapshot.

After updating the file:

```bash
npm test
```

Commit `data/nick_dashboard.json`. The next Vercel deployment publishes it as `data.json`.
