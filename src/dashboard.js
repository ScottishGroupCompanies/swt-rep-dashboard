import { comparePeriods, orientPeriods, periodChange, presets, topStates, typeRows } from "./compare.js";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const view = { company: null, year: null, rep: null };
let current = null;
let charts = [];
let requestId = 0;
let rendering = false;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function signedMoney(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? `+${money.format(amount)}` : money.format(amount);
}

function deltaHtml(change, asMoney = true) {
  if (!change) return "—";
  const cls = change.diff > 0 ? "up" : change.diff < 0 ? "down" : "";
  const amount = asMoney ? signedMoney(change.diff) : `${change.diff > 0 ? "+" : ""}${change.diff}`;
  const pct = change.pct == null ? "" : ` / ${change.pct > 0 ? "+" : ""}${change.pct.toFixed(1)}%`;
  return `<span class="delta ${cls}">${amount}${pct}</span>`;
}

function clearCharts() {
  for (const chart of charts) chart.destroy();
  charts = [];
}

function chart(canvas, config) {
  if (!canvas || typeof Chart === "undefined") return;
  const existing = typeof Chart.getChart === "function" ? Chart.getChart(canvas) : null;
  if (existing) existing.destroy();
  charts.push(new Chart(canvas, config));
}

function showGate() {
  document.body.classList.add("locked");
  document.getElementById("gate").classList.remove("hidden");
  document.getElementById("app").classList.remove("visible");
}

function showApp() {
  document.body.classList.remove("locked");
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.add("visible");
}

async function loadNames() {
  const error = document.getElementById("gateError");
  const select = document.getElementById("name");
  try {
    const response = await fetch("/api/auth/names", { credentials: "same-origin" });
    const body = await response.json();
    if (!response.ok) {
      error.textContent = body.error || "Sign-in is not available.";
      select.innerHTML = `<option value="">Sign-in unavailable</option>`;
      return;
    }
    select.innerHTML = `<option value="">Choose your name</option>${body.names
      .map((name) => `<option value="${esc(name)}">${esc(name)}</option>`)
      .join("")}`;
    error.textContent = "";
  } catch {
    error.textContent = "Sign-in is not available.";
  }
}

async function load() {
  const id = ++requestId;
  const params = new URLSearchParams();
  if (view.company) params.set("company", view.company);
  if (view.year) params.set("year", view.year);
  if (view.rep) params.set("rep", view.rep);
  const response = await fetch(`/api/data/dashboard?${params}`, { credentials: "same-origin" });
  if (id !== requestId) return;
  if (response.status === 401) {
    showGate();
    await loadNames();
    return;
  }
  const body = await response.json();
  if (id !== requestId) return;
  if (response.status === 404 && view.rep) {
    view.rep = null;
    await load();
    return;
  }
  if (!response.ok) {
    document.getElementById("dash").innerHTML = `<section class="card"><p>${esc(body.error || "The dashboard could not be loaded.")}</p></section>`;
    return;
  }
  current = body;
  if (body.company) view.company = body.company;
  if (body.year) view.year = body.year;
  render(body);
}

function bars(rows) {
  const max = Math.max(...rows.map((row) => Math.abs(row.sales)), 1);
  if (!rows.length) return `<p class="notice">No rows for this sheet year.</p>`;
  return `<div class="state-bars">${rows
    .map((row) => {
      const width = Math.max(2, Math.round((Math.abs(row.sales) / max) * 100));
      return `<div class="state-row"><span>${esc(row.name)}</span><div class="bar"><div class="fill" style="width:${width}%"></div></div><span class="money">${money.format(row.sales)}</span></div>`;
    })
    .join("")}</div>`;
}

function jobRows(jobs) {
  if (!jobs.length) return `<tr><td colspan="7">No jobs on this sheet year.</td></tr>`;
  return jobs
    .map((job) => {
      const pills = [
        job.changeOrder ? `<span class="pill">Change order</span>` : "",
        job.status ? `<span class="pill ${job.status === "Cancelled" ? "danger" : "muted"}">${esc(job.status)}</span>` : "",
      ].join(" ");
      return `<tr>
        <td>${esc(job.date || "—")}</td>
        <td>${esc(job.month || "—")}</td>
        <td>${esc(job.name)}<div class="caption">${esc(job.quote || "")}</div></td>
        <td>${current.role === "admin" ? esc(job.rep) : ""}</td>
        <td>${esc(job.state)}</td>
        <td>${esc(job.type)} ${pills}</td>
        <td class="money">${money.format(job.amount)}</td>
      </tr>`;
    })
    .join("");
}

function leaderboardHtml(rows) {
  return `<section class="card"><h2>Leaderboard</h2><p class="caption">Everyone on this company sheet, including inactive reps and codes with no login. Names are first names.</p>
    <div class="scroll"><table class="jobs"><thead><tr><th>Rep</th><th>Sales</th><th>Jobs</th><th></th></tr></thead><tbody>
    ${rows
      .map((row) => {
        const flag = !row.active ? `<span class="pill warn">Inactive</span>` : !row.login ? `<span class="pill muted">No login</span>` : "";
        return `<tr><td><button type="button" class="name-button" data-rep="${esc(row.repKey)}">${esc(row.name)}</button> ${flag}</td><td class="money">${money.format(row.sales)}</td><td>${row.jobs}</td><td><button type="button" data-rep="${esc(row.repKey)}">Open</button></td></tr>`;
      })
      .join("")}
    </tbody></table></div>
    <h2 style="margin-top:18px">Compare reps</h2>
    <p class="caption">Pick two or more reps to compare this sheet year.</p>
    <div class="rep-picker" id="repPicker">${rows
      .map((row) => `<label><input type="checkbox" data-compare-rep="${esc(row.repKey)}" /> ${esc(row.name)}</label>`)
      .join("")}</div>
    <div id="repCompare"></div>
    <div class="chart-wrap"><canvas id="repCompareChart"></canvas></div>
  </section>`;
}

function compareMonthKeys(jobs) {
  const years = new Set(
    (jobs || []).map((job) => job.month).filter(Boolean).map((key) => key.slice(0, 4)),
  );
  const keys = [];
  for (const year of [...years].sort()) {
    for (let month = 1; month <= 12; month += 1) {
      keys.push(`${year}-${String(month).padStart(2, "0")}`);
    }
  }
  return keys;
}

function compareHtml(months) {
  if (months.length < 2) return "";
  const options = months
    .map((key) => `<option value="${esc(key)}">${esc(key)}</option>`)
    .join("");
  return `<section class="card" id="compare"><h2>Compare</h2>
    <p class="caption">Change is the later Month Sold period minus the earlier one. Increases are green and decreases are red.</p>
    <div class="compare-toolbar">
      <button type="button" data-preset="month">This month vs last</button>
      <button type="button" data-preset="quarter">This quarter vs last</button>
    </div>
    <div class="compare-ranges">
      <div class="period a"><strong>Period A</strong>
        <label>From<select id="fromA" data-compare="period">${options}</select></label>
        <label>To<select id="toA" data-compare="period">${options}</select></label>
      </div>
      <div class="period b"><strong>Period B</strong>
        <label>From<select id="fromB" data-compare="period">${options}</select></label>
        <label>To<select id="toB" data-compare="period">${options}</select></label>
      </div>
    </div>
    <div id="compareOut"></div></section>`;
}

function render(data) {
  rendering = true;
  try {
  clearCharts();
  document.getElementById("pageTitle").textContent = data.viewing
    ? `${data.viewing} · ${data.companyLabel}`
    : data.role === "admin"
      ? data.companyLabel || "Sales"
      : `${data.viewer} · ${data.companyLabel || "Sales"}`;
  document.getElementById("pageSub").textContent = data.empty
    ? "No sales file has been uploaded yet."
    : `Sheet ${data.year || "—"} · Month Sold · pre-fee totals`;
  document.getElementById("back").hidden = !data.viewing;
  const yearSelect = document.getElementById("yearSelect");
  yearSelect.innerHTML = (data.years || []).map((year) => `<option value="${esc(year)}">${esc(year)}</option>`).join("");
  if (data.year) yearSelect.value = data.year;
  yearSelect.disabled = !(data.years || []).length;
  document.getElementById("companySwitch").innerHTML = (data.companies || [])
    .map(
      (company) =>
        `<button type="button" data-company="${esc(company.id)}" class="${company.id === data.company ? "active" : ""}" aria-pressed="${company.id === data.company}">${esc(company.label)}</button>`,
    )
    .join("");

  if (data.empty) {
    document.getElementById("dash").innerHTML = `<section class="card"><h2>Waiting for sales data</h2><p>${esc(data.message || "No sales file has been uploaded yet.")}</p></section>${commissionCard()}`;
    return;
  }

  const kpis = data.kpis;
  const monthKeys = [...new Set((data.jobs || []).map((job) => job.month).filter(Boolean))].sort();
  const compareMonths = compareMonthKeys(data.jobs || []);
  document.getElementById("dash").innerHTML = `
    <section class="kpi-grid">
      <article class="kpi accent"><div class="label">Sales</div><div class="value" id="kpiSales">${money.format(kpis.sales)}</div><div class="hint">${kpis.jobs} jobs on sheet ${esc(data.year || "")}</div></article>
      <article class="kpi"><div class="label">Jobs</div><div class="value">${kpis.jobs}</div><div class="hint">Every row on this sheet tab</div></article>
      <article class="kpi"><div class="label">Average job</div><div class="value">${money.format(kpis.avg)}</div></article>
      <article class="kpi"><div class="label">${esc(kpis.monthLabel || "Latest month")}</div><div class="value">${money.format(kpis.monthSales)}</div><div class="hint">${kpis.monthJobs} jobs</div></article>
      <article class="kpi"><div class="label">Vs prior month</div><div class="value">${deltaHtml(kpis.mom)}</div></article>
      <article class="kpi"><div class="label">${kpis.priorYear ? `Vs sheet ${esc(kpis.priorYear)}` : "Prior sheet"}</div><div class="value">${kpis.yoy ? deltaHtml(kpis.yoy) : "—"}</div><div class="hint">${kpis.priorYear ? `${money.format(kpis.priorSales)} · ${kpis.priorJobs} jobs` : "No prior sheet tab"}</div></article>
    </section>
    ${kpis.noMonthJobs ? `<p class="notice">${kpis.noMonthJobs} jobs on this sheet have no Month Sold (${money.format(kpis.noMonthSales)}). They stay in the sheet total.</p>` : ""}
    <section class="grid-2">
      <article class="card"><h2>Monthly sales</h2><p class="caption">Grouped by Month Sold. Prior-year credits stay on this sheet tab.</p><div class="chart-wrap"><canvas id="monthChart"></canvas></div></article>
      <article class="card"><h2>Cumulative sales</h2><p class="caption">Running total for sheet ${esc(data.year || "")}.</p><div class="chart-wrap"><canvas id="cumChart"></canvas></div></article>
    </section>
    <section class="grid-2">
      <article class="card"><h2>States</h2><p class="caption">Top states by sales on this sheet.</p>${bars(data.states)}</article>
      <article class="card"><h2>Job type</h2><p class="caption">Residential, commercial, and the other types on the sheet.</p>${bars(data.types)}</article>
    </section>
    ${data.yoyMonths ? `<section class="card"><h2>Year over year</h2><p class="caption">Sheet ${esc(data.year)} against sheet ${esc(kpis.priorYear)}, matched on calendar month.</p><div class="chart-wrap"><canvas id="yoyChart"></canvas></div></section>` : ""}
    ${compareHtml(compareMonths)}
    ${data.leaderboard ? leaderboardHtml(data.leaderboard) : ""}
    <section class="card"><h2>Recent jobs</h2><p class="caption">Latest dates on this sheet year.</p>
      <div class="scroll"><table class="jobs"><thead><tr><th>Date sold</th><th>Month sold</th><th>Job</th><th>${data.role === "admin" ? "Rep" : ""}</th><th>State</th><th>Type</th><th>Amount</th></tr></thead><tbody>${jobRows(data.recent || [])}</tbody></table></div>
    </section>
    ${commissionCard()}`;

  const latest = monthKeys[monthKeys.length - 1];
  const previous = monthKeys[monthKeys.length - 2];
  if (latest && previous) {
    document.getElementById("fromA").value = latest;
    document.getElementById("toA").value = latest;
    document.getElementById("fromB").value = previous;
    document.getElementById("toB").value = previous;
    renderCompare();
  }
  drawCharts(data);
  renderRepCompare();
  } finally {
    rendering = false;
  }
}

function commissionCard() {
  return `<section class="card"><h2>Commission</h2><p class="caption">Commission coming soon. Payout figures are not loaded on this dashboard.</p></section>`;
}

function drawCharts(data) {
  const labels = data.months.map((month) => month.label);
  chart(document.getElementById("monthChart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Sales", data: data.months.map((month) => month.sales), backgroundColor: "#1B2A4A" }] },
    options: {
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const mom = data.months[items[0].dataIndex]?.mom;
              if (!mom) return "";
              const pct = mom.pct == null ? "" : ` / ${mom.pct > 0 ? "+" : ""}${mom.pct.toFixed(1)}%`;
              return `MoM ${signedMoney(mom.diff)}${pct}`;
            },
          },
        },
      },
    },
  });
  chart(document.getElementById("cumChart"), {
    type: "line",
    data: {
      labels: data.cumulative.map((month) => month.label),
      datasets: [{ label: "Cumulative sales", data: data.cumulative.map((month) => month.sales), borderColor: "#1B2A4A", backgroundColor: "#1B2A4A", tension: 0.25 }],
    },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } },
  });
  if (data.yoyMonths) {
    chart(document.getElementById("yoyChart"), {
      type: "bar",
      data: {
        labels: data.yoyMonths.map((month) => month.label),
        datasets: [
          { label: data.kpis.priorYear, data: data.yoyMonths.map((month) => month.previous), backgroundColor: "#8B98B3" },
          { label: data.year, data: data.yoyMonths.map((month) => month.current), backgroundColor: "#1B2A4A" },
        ],
      },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }
}

function salesJobs() {
  return (current?.jobs || [])
    .filter((job) => job.month)
    .map((job) => ({
      monthKey: job.month,
      charged: job.amount,
      commission: 0,
      jobType: job.type,
      state: job.state,
      status: "ok",
    }));
}

function renderCompare() {
  const root = document.getElementById("compareOut");
  if (!root || !current) return;
  const jobs = salesJobs();
  const rangeA = { start: document.getElementById("fromA").value, end: document.getElementById("toA").value };
  const rangeB = { start: document.getElementById("fromB").value, end: document.getElementById("toB").value };
  const { a, b } = comparePeriods(jobs, rangeA, rangeB);
  const direction = orientPeriods(a, b);
  const sales = periodChange(a, b, (period) => period.sales);
  const count = periodChange(a, b, (period) => period.count);
  const avg = periodChange(a, b, (period) => period.avg);
  const types = typeRows(a, b);
  const states = topStates(a, b);
  root.innerHTML = `
    <h2 style="margin-top:16px">${esc(direction.label)}</h2>
    <div class="scroll"><table class="compare-table"><thead><tr><th></th><th>${esc(direction.earlierLabel)}</th><th>${esc(direction.laterLabel)}</th><th>Change</th></tr></thead><tbody>
      <tr><td>Sales</td><td class="money">${money.format(direction.earlier.sales)}</td><td class="money">${money.format(direction.later.sales)}</td><td>${deltaHtml(sales)}</td></tr>
      <tr><td>Jobs</td><td>${direction.earlier.count}</td><td>${direction.later.count}</td><td>${deltaHtml(count, false)}</td></tr>
      <tr><td>Average</td><td class="money">${money.format(direction.earlier.avg)}</td><td class="money">${money.format(direction.later.avg)}</td><td>${deltaHtml(avg)}</td></tr>
      ${types
        .map(
          (row) =>
            `<tr><td>${esc(row.name)}</td><td class="money">${money.format(row.earlier.sales)}</td><td class="money">${money.format(row.later.sales)}</td><td>${deltaHtml(row.change)}</td></tr>`,
        )
        .join("")}
      ${states
        .map(
          (row) =>
            `<tr><td>${esc(row.state)}</td><td class="money">${money.format(row.earlier.sales)}</td><td class="money">${money.format(row.later.sales)}</td><td>${deltaHtml(row.change)}</td></tr>`,
        )
        .join("")}
    </tbody></table></div>
    <div class="chart-wrap" style="margin-top:12px"><canvas id="compareChart"></canvas></div>`;
  chart(document.getElementById("compareChart"), {
    type: "bar",
    data: {
      labels: ["Sales"],
      datasets: [
        { label: direction.earlierLabel, data: [direction.earlier.sales], backgroundColor: "#4E628A" },
        { label: direction.laterLabel, data: [direction.later.sales], backgroundColor: "#1B2A4A" },
      ],
    },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

function renderRepCompare() {
  const root = document.getElementById("repCompare");
  const canvas = document.getElementById("repCompareChart");
  if (!root || !current?.leaderboard) return;
  const selected = [...document.querySelectorAll("[data-compare-rep]:checked")].map((box) => box.dataset.compareRep);
  const rows = current.leaderboard.filter((row) => selected.includes(row.repKey));
  if (rows.length < 2) {
    root.innerHTML = `<p class="notice">Select at least two reps.</p>`;
    return;
  }
  root.innerHTML = `<div class="scroll"><table class="jobs"><thead><tr><th>Rep</th><th>Sales</th><th>Jobs</th></tr></thead><tbody>${rows
    .map((row) => `<tr><td>${esc(row.name)}</td><td class="money">${money.format(row.sales)}</td><td>${row.jobs}</td></tr>`)
    .join("")}</tbody></table></div>`;
  chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((row) => row.name),
      datasets: [{ label: "Sales", data: rows.map((row) => row.sales), backgroundColor: "#1B2A4A" }],
    },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } },
  });
}

function applyPreset(kind) {
  const keys = [...new Set((current?.jobs || []).map((job) => job.month).filter(Boolean))].sort();
  const preset = presets(keys)[kind];
  if (!preset) return;
  document.getElementById("fromA").value = preset.a.start;
  document.getElementById("toA").value = preset.a.end;
  document.getElementById("fromB").value = preset.b.start;
  document.getElementById("toB").value = preset.b.end;
  renderCompare();
}

document.getElementById("signIn").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("gateError");
  const button = document.getElementById("signInBtn");
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("name").value,
        code: document.getElementById("code").value,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      error.textContent = body.error || "That name or code is not valid.";
      return;
    }
    error.textContent = "";
    document.getElementById("code").value = "";
    view.company = null;
    view.year = null;
    view.rep = null;
    showApp();
    await load();
  } catch {
    error.textContent = "Sign-in is not available.";
  } finally {
    button.disabled = false;
  }
});

document.body.addEventListener("click", (event) => {
  const company = event.target.closest("[data-company]");
  if (company) {
    view.company = company.dataset.company;
    view.year = null;
    load();
    return;
  }
  const rep = event.target.closest("[data-rep]");
  if (rep && current?.role === "admin") {
    view.rep = rep.dataset.rep;
    load();
    return;
  }
  if (event.target.id === "back") {
    view.rep = null;
    load();
  }
  if (event.target.id === "signOut") {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
      current = null;
      view.company = null;
      view.year = null;
      view.rep = null;
      showGate();
      loadNames();
    });
  }
  if (event.target.dataset.preset) applyPreset(event.target.dataset.preset);
});

document.body.addEventListener("change", (event) => {
  if (event.target.id === "yearSelect" && !rendering) {
    view.year = event.target.value;
    load();
  }
  if (event.target.matches?.("[data-compare]")) renderCompare();
  if (event.target.dataset.compareRep != null) renderRepCompare();
});

showGate();
loadNames().then(async () => {
  const response = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (response.ok) {
    showApp();
    await load();
  }
});
