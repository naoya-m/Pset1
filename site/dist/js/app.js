/* =========================================================================
   Yugawara Tourism Policy Dashboard — application code
   ========================================================================= */
(function () {
  "use strict";

  const D = window.DATA;
  const { fmt, slot } = window.Viz;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- sources, for the footnote under each chart ---------- */

  const SRC = {
    pref: { source: 'Kanagawa Prefecture, "Tourist Visitor Survey"',
            sourceUrl: "https://www.pref.kanagawa.jp/docs/b6m/cnt/f80022/r6irikomi.html" },
    town: { source: "Yugawara Town Accommodation Tax Study Committee, report",
            sourceUrl: "https://www.town.yugawara.kanagawa.jp/uploaded/attachment/15537.pdf" },
    tokei: { source: "Yugawara Town Statistical Handbook, 2024 edition",
             sourceUrl: "https://www.town.yugawara.kanagawa.jp/uploaded/attachment/13737.pdf" },
    jr: { source: 'JR East, "Passengers Boarding at Each Station"',
          sourceUrl: "https://www.jreast.co.jp/company/data/passenger/" },
    resasGuest: { source: "RESAS Overnight Guest Analysis (Tourism Forecast Platform)",
                  sourceUrl: "https://resas.go.jp/tourism-guest/",
                  sourceNote: "A sampled estimate from booking data; used here only as a share." },
    resasCard: { source: "RESAS Credit Card Spending Analysis",
                 sourceUrl: "https://resas.go.jp/tourism-credit-consumption-amount/",
                 sourceNote: "Estimated from Visa card-present transactions; transcribed from a screen recording." },
    ageing: { source: "Kanagawa Prefecture Population by Age Survey (via Yugawara Town publication)",
              sourceUrl: "https://www.town.yugawara.kanagawa.jp/uploaded/attachment/13989.pdf" },
  };

  /* ---------- base figures ---------- */

  const annual = D.annual.slice().sort((a, b) => a.year - b.year);
  const annualMap = new Map(annual.map((r) => [r.year, r]));

  // Every year from 1990 to 2024. Years with no published figure stay null, so
  // the gap shows as a gap instead of collapsing into its neighbours.
  const ALL_YEARS = [];
  for (let y = annual[0].year; y <= annual[annual.length - 1].year; y++) ALL_YEARS.push(y);

  const Y_LATEST = annual[annual.length - 1].year;                           // 2024
  const STAY_LATEST = annualMap.get(Y_LATEST).overnight_visitors_thousands * 1000;  // 635,000
  const STAY_2019 = annualMap.get(2019).overnight_visitors_thousands * 1000;        // 674,000

  const budget = D.budget.slice().sort((a, b) => a.fiscal_year - b.fiscal_year);
  const BUDGET_LATEST = budget[budget.length - 1];            // FY2023, ¥362M
  const BUDGET_M = BUDGET_LATEST.tourism_budget_million_yen;
  const GENERAL_ACCOUNT_M = BUDGET_M / (BUDGET_LATEST.share_of_general_account_pct / 100);

  /* =======================================================================
     Tabs
     ======================================================================= */

  const tabs = $$(".tab");
  function selectTab(id) {
    tabs.forEach((t) => {
      const on = t.id === id;
      t.setAttribute("aria-selected", String(on));
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
    // A hidden panel has zero width, so charts have to be redrawn once shown.
    requestAnimationFrame(() => window.Viz.redrawAll());
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t.id));
    t.addEventListener("keydown", (ev) => {
      const d = ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      const n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus();
      selectTab(n.id);
    });
  });

  /* ---------- theme ---------- */

  const themeBtn = $("#themeToggle");
  const THEMES = ["", "light", "dark"];
  const LABEL = { "": "Theme: auto", light: "Theme: light", dark: "Theme: dark" };
  let ti = 0;
  try {
    const saved = localStorage.getItem("yg-theme");
    if (saved != null && THEMES.includes(saved)) ti = THEMES.indexOf(saved);
  } catch (e) { /* private browsing and blocked storage: ignore */ }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", THEMES[ti]);
    themeBtn.textContent = LABEL[THEMES[ti]];
    try { localStorage.setItem("yg-theme", THEMES[ti]); } catch (e) { /* noop */ }
  }
  themeBtn.addEventListener("click", () => {
    ti = (ti + 1) % THEMES.length;
    applyTheme();
  });
  applyTheme();

  function tile(label, value, unit, opts) {
    const o = opts || {};
    const d = document.createElement("div");
    d.className = "tile";
    const l = document.createElement("div");
    l.className = "t-label";
    l.textContent = label;
    d.appendChild(l);
    const v = document.createElement("div");
    v.className = "t-value";
    v.appendChild(document.createTextNode(value));
    if (unit) {
      const u = document.createElement("span");
      u.className = "unit";
      u.textContent = unit;
      v.appendChild(u);
    }
    d.appendChild(v);
    if (o.delta) {
      const dd = document.createElement("div");
      dd.className = "t-delta " + (o.deltaTone || "");
      dd.textContent = o.delta;
      d.appendChild(dd);
    }
    if (o.spark) {
      const s = document.createElement("div");
      s.className = "t-spark";
      s.appendChild(window.Viz.sparkline(o.spark, { color: o.sparkColor || slot(0) }));
      d.appendChild(s);
    }
    if (o.note) {
      const n = document.createElement("div");
      n.className = "t-note";
      n.textContent = o.note;
      d.appendChild(n);
    }
    return d;
  }

  /* =======================================================================
     TAB 1 — accommodation tax simulator
     ======================================================================= */

  const SCENARIOS = [
    { id: "now", label: `2024 actual (${fmt.int(STAY_LATEST)})`, short: "2024 actual", stay: STAY_LATEST },
    { id: "y2019", label: `Recovery to 2019 (${fmt.int(STAY_2019)})`, short: "Back to 2019", stay: STAY_2019 },
    { id: "d1", label: "−1% a year for five years", short: "−1%/yr", stay: Math.round(STAY_LATEST * Math.pow(0.99, 5)) },
    { id: "d3", label: "−3% a year for five years", short: "−3%/yr", stay: Math.round(STAY_LATEST * Math.pow(0.97, 5)) },
  ];

  const sim = { method: "flat", flat: 200, rate: 2, avgPrice: 15000, coverage: 90, cost: 5, scenario: "now" };

  function scenarioStay(id) {
    return (SCENARIOS.find((s) => s.id === id) || SCENARIOS[0]).stay;
  }

  /** Revenue in yen. Net = gross × (1 − collection cost). */
  function revenue(o) {
    const stay = scenarioStay(o.scenario);
    const base = stay * (o.coverage / 100);
    const perNight = o.method === "flat" ? o.flat : o.avgPrice * (o.rate / 100);
    const gross = base * perNight;
    return { stay, base, perNight, gross, net: gross * (1 - o.cost / 100) };
  }

  // --- wire up the controls ---
  const scSel = $("#inScenario");
  SCENARIOS.forEach((s) => {
    const op = document.createElement("option");
    op.value = s.id;
    op.textContent = s.label;
    scSel.appendChild(op);
  });

  $$("#segMethod button").forEach((b) => {
    b.addEventListener("click", () => {
      sim.method = b.dataset.v;
      $$("#segMethod button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("#fieldFlat").hidden = sim.method !== "flat";
      $("#fieldRate").hidden = sim.method !== "rate";
      renderSim();
    });
  });

  const bind = (sel, key, fmtFn) => {
    const inp = $(sel);
    const out = $(sel.replace("#in", "#out"));
    const sync = () => {
      sim[key] = parseFloat(inp.value);
      if (out) out.textContent = fmtFn(sim[key]);
      renderSim();
    };
    inp.addEventListener("input", sync);
    if (out) out.textContent = fmtFn(sim[key]);
  };
  bind("#inFlat", "flat", (n) => "¥" + fmt.int(n));
  bind("#inRate", "rate", (n) => fmt.dec(n, 1) + "%");
  bind("#inAvgPrice", "avgPrice", (n) => "¥" + fmt.int(n));
  bind("#inCoverage", "coverage", (n) => fmt.int(n) + "%");
  bind("#inCost", "cost", (n) => fmt.int(n) + "%");
  scSel.addEventListener("change", () => { sim.scenario = scSel.value; renderSim(); });

  let baseChartDone = false;

  function renderSim() {
    const r = revenue(sim);
    const netM = r.net / 1e6;                       // millions of yen
    const ratio = (netM / BUDGET_M) * 100;

    $("#heroValue").textContent = fmt.yenShort(r.net);
    $("#heroSub").textContent =
      `Tax base ${fmt.int(r.base)} person-nights (${fmt.int(r.stay)} overnight visitors ` +
      `× ${sim.coverage}% taxed) × ¥${fmt.int(r.perNight)} per night. ` +
      `Before the ${sim.cost}% collection cost: ${fmt.yenShort(r.gross)}.`;

    const tiles = $("#simTiles");
    tiles.textContent = "";
    tiles.appendChild(tile("Share of the tourism budget", fmt.dec(ratio, 0), "%", {
      note: `Against FY2023 tourism spending of ${fmt.yenShortFromMillions(BUDGET_M)}`,
      delta: ratio >= 100 ? "Would cover the tourism budget on its own" : "Would replace part of the tourism budget",
      deltaTone: ratio >= 100 ? "good" : "",
    }));
    tiles.appendChild(tile("Share of the general account",
      fmt.dec((netM / GENERAL_ACCOUNT_M) * 100, 2), "%", {
      note: "Against the FY2023 general account",
    }));
    tiles.appendChild(tile("Average per overnight visitor", "¥" + fmt.int(r.gross / r.stay), "", {
      note: "Gross revenue divided by all overnight visitors, exempt ones included",
    }));
    tiles.appendChild(tile("Five-year total, same assumptions", fmt.yenShort(r.net * 5), "", {
      note: "A straight sum, holding visitor numbers constant",
    }));

    // Tourism budget columns, with the simulated revenue as a reference line
    const host = $("#chartBudget");
    host.textContent = "";
    window.Viz.columnChart(host, {
      title: "Town tourism budget and the simulated accommodation tax revenue",
      xTitle: "Fiscal year",
      categories: budget.map((b) => "FY" + b.fiscal_year),
      series: [{ name: "Tourism budget", color: slot(0),
                 values: budget.map((b) => b.tourism_budget_million_yen) }],
      yFormat: (n) => fmt.int(n),
      yUnit: "¥ millions",
      valueSuffix: "M yen",
      height: 250,
      xEvery: 1,
      reference: { value: netM, label: `Simulated revenue ${fmt.yenShortFromMillions(netM)}` },
      tipNote: "The tourism budget is published only for these years.",
      source: SRC.town.source, sourceUrl: SRC.town.sourceUrl,
      ariaLabel: "Town tourism budget compared with the simulated accommodation tax revenue",
    });

    // Sensitivity table
    const rates = [100, 150, 200, 250, 300, 500];
    const rows = rates.map((v) => {
      const cells = SCENARIOS.map((s) => {
        const m = (s.stay * (sim.coverage / 100) * v * (1 - sim.cost / 100)) / 1e6;
        return fmt.dec(m, 0);
      });
      return ["¥" + fmt.int(v)].concat(cells);
    });
    window.Viz.renderTable($("#sensTable"), {
      caption: `With ${sim.coverage}% of nights taxed and a ${sim.cost}% collection cost (¥ millions per year)`,
      headers: ["Tax per person-night"].concat(SCENARIOS.map((s) => s.short)),
      rows,
    });
    $("#sensNote").textContent =
      `For comparison, FY2023 tourism spending by the town was ${fmt.yenShortFromMillions(BUDGET_M)}.`;

    renderRecs(netM, ratio);
  }

  function renderRecs(netM, ratio) {
    const chosen = sim.method === "flat"
      ? "¥" + fmt.int(sim.flat) + " per night"
      : fmt.dec(sim.rate, 1) + "% of the room rate";
    const list = $("#recList");
    list.textContent = "";

    const recs = [
      {
        h: "Start from a flat ¥200 and aim to replace about a third of the tourism budget",
        p: `With 90% of nights taxed and a 5% collection cost, a flat ¥200 raises roughly ¥109M a year, ` +
           `about 30% of the town's FY2023 tourism spending of ¥362M. ¥100 reaches only 15%, which is too ` +
           `little to fund anything new, while ¥500 is heavy against the median room rate. ` +
           `Revenue is also stable month to month: overnight visitors vary only 1.6× across the year ` +
           `against 3.0× for total visitors, so the tax base barely has a season. ` +
           `At the ${chosen} currently selected, revenue is ${fmt.yenShortFromMillions(netM)}, ` +
           `or ${fmt.dec(ratio, 0)}% of the tourism budget.`,
        e: "Evidence: 08_town_tourism_budget.csv (¥362M, FY2023); 01_visitors_annual.csv (635k overnight visitors, 2024); 02_visitors_spending_monthly.csv",
      },
      {
        h: "Spend it on holding prices up in September and October, not on filling the off-season with people",
        p: "In the measured card data, weekday lodging runs at ¥32,828 in January against ¥20,436 in " +
           "September and ¥21,510 in October — a 1.61× spread. What happens in the off-season is a fall " +
           "in price rather than a shortage of demand, and subsidies aimed at headcount would entrench " +
           "the discounting. The money belongs on the price side: higher-value experiences, early-booking " +
           "incentives and similar.",
        e: "Evidence: 11_resas_card_spend_per_visitor_monthly.csv (2025, weekday/weekend, by category)",
      },
      {
        h: "Design weekday policy around lodging and weekend policy around food and drink",
        p: "Lodging is worth more on weekdays (weekend ÷ weekday = 0.947) while food and beverage is worth " +
           "more at weekends (1.084). Because they run in opposite directions, bundling \"fill the weekdays\" " +
           "and \"grow the weekends\" into one campaign cancels part of each. Note that visitors are " +
           "double-counted across the weekday/weekend split, so only the direction of the gap should be " +
           "relied on, not its size.",
        e: "Evidence: 11_resas_card_spend_per_visitor_monthly.csv (2025 averages: lodging ¥27,930 weekday / ¥26,444 weekend; food and beverage ¥4,348 / ¥4,716)",
      },
      {
        h: "Use part of the revenue to keep operators in business — and to start measuring occupancy",
        p: "Accommodation and food service establishments fell from 421 in 2006 to 235 in 2021, down 44% in " +
           "15 years, while the ageing rate reached 43.7% in 2023. The tax base is shrinking on the supply " +
           "side as well as the demand side. At the same time, Yugawara does not know its room occupancy " +
           "rate: no figure is published for the town. Because an accommodation tax makes every operator " +
           "report person-nights monthly, building occupancy reporting into the collection design would " +
           "deliver the tax and the missing statistic at the same time.",
        e: "Evidence: 15b_accommodation_food_establishments_trend.csv; 13_population_by_age_ageing_rate_annual.csv; and the absence of any occupancy figure (see Data and limitations)",
      },
    ];

    recs.forEach((r) => {
      const li = document.createElement("li");
      const h = document.createElement("h4");
      h.textContent = r.h;
      const p = document.createElement("p");
      p.textContent = r.p;
      const e = document.createElement("div");
      e.className = "evidence";
      e.textContent = r.e;
      li.append(h, p, e);
      list.appendChild(li);
    });
  }

  // The tax base over time (drawn once)
  function renderBaseChart() {
    if (baseChartDone) return;
    baseChartDone = true;
    window.Viz.lineChart($("#chartBase"), {
      title: "Overnight visitors, 1990–2024",
      xTitle: "Year",
      categories: ALL_YEARS,
      series: [{ name: "Overnight visitors", color: slot(0),
        values: ALL_YEARS.map((y) => (annualMap.has(y)
          ? annualMap.get(y).overnight_visitors_thousands * 1000 : null)) }],
      yFormat: (n) => fmt.compact(n),
      yUnit: "Visitors",
      valueSuffix: "",
      yZero: true, area: true, height: 250,
      annotations: [{ at: ALL_YEARS.indexOf(2020), label: "COVID-19" }],
      tipNote: "No figures were published for 1991–2002 or 2004, so nothing is measured across those years.",
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      sourceNote: "1990 and 2003 from the town's accommodation tax study report",
      ariaLabel: "Overnight visitors fall from 1.33 million in 1990 to 635,000 in 2024",
    });
  }

  /* =======================================================================
     TAB 2 — why it is needed
     ======================================================================= */

  const resasGuest = D.resasGuest.slice().sort((a, b) => a.year - b.year);
  const station = D.station.slice().sort((a, b) => a.fiscal_year - b.fiscal_year);
  const estabTrend = D.estabTrend.slice().sort((a, b) => a.year - b.year);
  const population = D.population.slice().sort((a, b) => a.year_as_of_jan1 - b.year_as_of_jan1);
  const ageing = D.ageing.slice().sort((a, b) => a.year_as_of_jan1 - b.year_as_of_jan1);
  const peers = D.peers.slice().sort((a, b) => a.year - b.year);

  // RESAS card data: 2025 average, weekday or weekend
  function cardAvg(item, col) {
    const rows = D.resasCard.filter((r) => r.spend_category === item && r.year === 2025 && r[col] != null);
    return rows.reduce((a, r) => a + r[col], 0) / (rows.length || 1);
  }
  const STAY_UNIT_WEEKDAY = cardAvg("Lodging", "weekday_spend_per_visitor_yen");

  function renderWhyTiles() {
    const t = $("#whyTiles");
    t.textContent = "";
    const a24 = annualMap.get(2024), a19 = annualMap.get(2019);
    const g25 = resasGuest[resasGuest.length - 1];
    const g14 = resasGuest.find((r) => r.year === 2014);
    const e06 = estabTrend[0], e21 = estabTrend[estabTrend.length - 1];
    const ageLast = ageing[ageing.length - 1];

    t.appendChild(tile("Total visitors", fmt.dec(a24.visitors_total_thousands / 1000, 2), "M", {
      delta: `${fmt.dec((a24.visitors_total_thousands / a19.visitors_total_thousands - 1) * 100, 1)}% vs. 2019`,
      note: "2024 · Kanagawa Prefecture Tourist Visitor Survey",
      spark: annual.filter((a) => a.year >= 2010).map((a) => a.visitors_total_thousands),
    }));
    t.appendChild(tile("Overnight share", fmt.dec(a24.overnight_share_pct, 1), "%", {
      delta: `${fmt.dec(a19.overnight_share_pct, 1)}% in 2019 → ${fmt.dec(a24.overnight_share_pct - a19.overnight_share_pct, 1)}pt`,
      deltaTone: "bad",
      note: "Hakone Town is at 19.6% (2024)",
      spark: annual.filter((a) => a.year >= 2010).map((a) => a.overnight_share_pct),
    }));
    t.appendChild(tile("Guests staying one night only", fmt.dec(g25.one_night_share_pct, 1), "%", {
      delta: `${fmt.dec(g14.one_night_share_pct, 1)}% in 2014 → +${fmt.dec(g25.one_night_share_pct - g14.one_night_share_pct, 1)}pt`,
      deltaTone: "bad",
      note: "2025 · RESAS overnight guest analysis (share only)",
      spark: resasGuest.map((r) => r.one_night_share_pct),
      sparkColor: slot(1),
    }));
    t.appendChild(tile("Weekday lodging spend, measured", "¥" + fmt.int(STAY_UNIT_WEEKDAY), "", {
      delta: "¥32,828 in Jan ⇄ ¥20,436 in Sep (1.61×)",
      deltaTone: "bad",
      note: "2025 average · RESAS card transactions",
      spark: D.resasCard.filter((r) => r.spend_category === "Lodging" && r.year === 2025)
        .map((r) => r.weekday_spend_per_visitor_yen),
      sparkColor: slot(1),
    }));
    t.appendChild(tile("Accommodation and food establishments", fmt.int(e21.establishments), "", {
      delta: `${fmt.int(e06.establishments)} in 2006 → ${fmt.dec((e21.establishments / e06.establishments - 1) * 100, 0)}%`,
      deltaTone: "bad",
      note: "2021 · Economic Census for Business Activity",
      spark: estabTrend.map((r) => r.establishments),
      sparkColor: slot(1),
    }));
    t.appendChild(tile("Ageing rate", fmt.dec(ageLast.ageing_rate_pct, 1), "%", {
      delta: "Kanagawa 25.8% / Japan 29.0%",
      deltaTone: "bad",
      note: "2023 · Kanagawa Prefecture Population by Age Survey",
      spark: ageing.map((r) => r.ageing_rate_pct),
      sparkColor: slot(1),
    }));
  }

  function renderFindings() {
    const items = [
      { h: "The total recovered; the overnight side did not — and it has halved over 34 years.",
        p: "Total visitors in 2024 were back to 99% of 2019, but overnight visitors only reached 94%. " +
           "Over the longer run, 1,334,000 overnight visitors in 1990 became 635,000 in 2024, a fall of 52%. " +
           "This is structural, not cyclical." },
      { h: "Stays have thinned out: the one-night share went from 32.7% to 56.4%.",
        p: "Two- and three-night stays keep being replaced by single nights (RESAS overnight guest analysis, " +
           "2014 to 2025). Because this is a share within a single source, drift in the sampling rate largely " +
           "cancels out." },
      { h: "In the off-season the problem is not empty rooms, it is cheap rooms.",
        p: "Weekday lodging spend falls from ¥32,828 in January to ¥20,436 in September, a spread of 1.61×. " +
           "Visitor numbers in September are not unusually low, so the measured shortfall is in price." },
      { h: "Weekday guests spend more on lodging. For food and drink it is the other way round.",
        p: "Lodging comes in at a weekend ÷ weekday ratio of 0.947; food and beverage at 1.084. " +
           "Shifting demand into the week therefore helps the average room rate as well as smoothing " +
           "occupancy — but only the direction of the gap should be treated as evidence." },
      { h: "The seasonal swing is almost entirely day trippers. The overnight base is close to flat.",
        p: "In 2024 the busiest month, April, drew 636,000 visitors but only 7.7% of them stayed overnight; " +
           "the quietest, January, drew 209,000 at 26.3%. Across the year total visitors vary by 3.0× while " +
           "overnight visitors move only between 41,000 and 64,000, a range of 1.6×. " +
           "An accommodation tax would therefore yield fairly evenly through the year." },
      { h: "Capacity fell 44% in 15 years, and a quarter of the town's jobs are tourism-related.",
        p: "Accommodation and food establishments went from 421 in 2006 to 235 in 2021. Accommodation alone " +
           "still employs 1,128 people across 82 establishments — 13.8 each, nearly double the town-wide " +
           "average of 7.4 — so the sector shrinking hits local employment directly." },
      { h: "The prefecture's \"tourism spending\" is not measured, so it cannot be used as a spend-per-visitor KPI.",
        p: "It is overnight visitors × ¥10,500 plus day visitors × ¥1,080, an identity that holds with zero " +
           "error for every month and every year checked. That is why measured spend per visitor on this " +
           "site comes from RESAS card data instead." },
    ];
    const ul = $("#findingsList");
    ul.textContent = "";
    items.forEach((it) => {
      const li = document.createElement("li");
      const h = document.createElement("h4");
      h.textContent = it.h;
      const p = document.createElement("p");
      p.textContent = it.p;
      li.append(h, p);
      ul.appendChild(li);
    });
  }

  /* --- indexed comparison --- */

  const IDX_SERIES = [
    { key: "visitors", name: "Total visitors", get: (y) => annualMap.get(y)?.visitors_total_thousands },
    { key: "stay", name: "Overnight visitors", get: (y) => annualMap.get(y)?.overnight_visitors_thousands },
    { key: "nights1", name: "One-night share", get: (y) => resasGuest.find((r) => r.year === y)?.one_night_share_pct },
    { key: "station", name: "Station boardings", get: (y) => station.find((r) => r.fiscal_year === y)?.total_passengers },
    { key: "pop", name: "Population", get: (y) => population.find((r) => r.year_as_of_jan1 === y)?.total_population },
    { key: "spend", name: "Tourism spending (estimated)", get: (y) => annualMap.get(y)?.tourism_spending_million_yen },
  ];
  const idxOn = new Set(["visitors", "stay", "nights1"]);
  const idxBoxes = [];

  function renderIdxControls() {
    const box = $("#idxChecks");
    box.textContent = "";
    IDX_SERIES.forEach((s, i) => {
      const lab = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = idxOn.has(s.key);
      cb.addEventListener("change", () => {
        if (cb.checked) idxOn.add(s.key); else idxOn.delete(s.key);
        renderIndexed();
      });
      const key = document.createElement("span");
      key.className = "key";
      key.style.background = slot(i);      // colour follows the indicator, never its rank
      const t = document.createElement("span");
      t.textContent = s.name;
      lab.append(cb, key, t);
      box.appendChild(lab);
      idxBoxes.push({ s, cb, lab, text: t });
    });
    $("#inBaseYear").addEventListener("change", renderIndexed);
  }

  /** An indicator with no value in the base year cannot be indexed; disable it and say why. */
  function syncIdxAvailability(base) {
    const missing = [];
    idxBoxes.forEach(({ s, cb, lab, text }) => {
      const ok = s.get(base) != null;
      cb.disabled = !ok;
      lab.style.opacity = ok ? "" : "0.45";
      text.textContent = ok ? s.name : `${s.name} (no ${base} figure)`;
      if (!ok) missing.push(s.name);
    });
    const note = $("#idxNote");
    note.textContent = missing.length
      ? `Cannot be indexed because no figure was published for ${base}: ${missing.join(", ")}. Change the base year to use them.`
      : "";
    note.hidden = !missing.length;
  }

  function renderIndexed() {
    const base = parseInt($("#inBaseYear").value, 10);
    syncIdxAvailability(base);
    const years = [];
    for (let y = base; y <= 2025; y++) years.push(y);
    const series = IDX_SERIES
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => idxOn.has(s.key) && s.get(base) != null)
      .map(({ s, i }) => {
        const b = s.get(base);
        return {
          name: s.name,
          color: slot(i),                  // one fixed slot per indicator
          values: years.map((y) => {
            const v = s.get(y);
            return (v == null || b == null) ? null : (v / b) * 100;
          }),
        };
      });

    const host = $("#chartIndexed");
    host.textContent = "";
    if (!series.length) {
      const p = document.createElement("p");
      p.style.cssText = "color:var(--ink-3);font-size:.875rem;margin:24px 0";
      p.textContent = "Select at least one indicator.";
      host.appendChild(p);
      return;
    }
    window.Viz.lineChart(host, {
      title: `Indexed to ${base} = 100`,
      xTitle: "Year",
      categories: years,
      series,
      yFormat: (n) => fmt.dec(n, 0),
      yUnit: "Base year = 100",
      valueSuffix: "",
      height: 300,
      xEvery: 1,
      annotations: [{ at: years.indexOf(base), label: `Base ${base}` }].filter((a) => a.at >= 0),
      tipNote: "Station boardings are fiscal years; the one-night share is a share within the RESAS source; tourism spending is the prefecture's fixed-rate estimate.",
      source: "Multiple sources — see the footnote on each chart and the Data and limitations section",
      ariaLabel: "Key indicators indexed to the base year",
    });
  }

  /* --- structural charts --- */

  function renderStructure() {
    // One column per year. Years with no published figure stay empty rather than
    // being closed up, so the 1990-to-2003 gap stays visible.
    window.Viz.columnChart($("#chartMix"), {
      title: "Overnight and day visitors, 1990–2024",
      xTitle: "Year",
      categories: ALL_YEARS,
      series: [
        { name: "Overnight", color: slot(0),
          values: ALL_YEARS.map((y) => (annualMap.has(y) ? annualMap.get(y).overnight_visitors_thousands * 1000 : null)) },
        { name: "Day trip", color: slot(1),
          values: ALL_YEARS.map((y) => (annualMap.has(y) ? annualMap.get(y).day_visitors_thousands * 1000 : null)) },
      ],
      stacked: true,
      yFormat: (n) => fmt.compact(n),
      yUnit: "Visitors",
      valueSuffix: "",
      height: 260,
      xEvery: 5,
      tipNote: "No figures were published for 1991–2002 or 2004, so those years have no column.",
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      ariaLabel: "Stacked overnight and day visitors over time",
    });

    window.Viz.lineChart($("#chartNights"), {
      title: "Share of overnight guests staying a single night",
      xTitle: "Year",
      categories: resasGuest.map((r) => r.year),
      series: [{ name: "One-night share", color: slot(0),
                 values: resasGuest.map((r) => r.one_night_share_pct) }],
      yFormat: (n) => fmt.dec(n, 1),
      yUnit: "%",
      valueSuffix: "%",
      area: true, height: 260, xEvery: 2,
      tipNote: "Used only as a share within its own source; its levels and trend are not comparable with the prefectural survey.",
      source: SRC.resasGuest.source, sourceUrl: SRC.resasGuest.sourceUrl,
      sourceNote: SRC.resasGuest.sourceNote,
      ariaLabel: "One-night share rises from 32.7% in 2014 to 56.4% in 2025",
    });

    const pYears = Array.from(new Set(peers.map((p) => p.year))).sort((a, b) => a - b);
    const towns = ["Yugawara Town", "Hakone Town", "Manazuru Town"];
    window.Viz.lineChart($("#chartPeers"), {
      title: "Overnight share, three neighbouring towns",
      xTitle: "Year",
      categories: pYears,
      series: towns.map((t, i) => ({
        name: t, color: slot(i),
        values: pYears.map((y) => peers.find((p) => p.year === y && p.municipality === t)?.overnight_share_pct ?? null),
      })),
      yFormat: (n) => fmt.dec(n, 1),
      yUnit: "%",
      valueSuffix: "%",
      height: 260, xEvery: 2,
      tipNote: "A share of total visits. The number and choice of survey points differ by town, so the comparison is kept to shares rather than absolute levels.",
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      ariaLabel: "Overnight share compared across Yugawara, Hakone and Manazuru",
    });

    window.Viz.columnChart($("#chartEstab"), {
      title: "Accommodation and food service establishments",
      xTitle: "Year",
      categories: estabTrend.map((r) => r.year),
      series: [{ name: "Establishments", color: slot(0), values: estabTrend.map((r) => r.establishments) }],
      yFormat: (n) => fmt.int(n),
      yUnit: "Establishments",
      valueSuffix: "",
      height: 240, xEvery: 1,
      tipNote: "The industry classification was revised in 2002, so 2006 is not strictly comparable with later years.",
      source: SRC.tokei.source, sourceUrl: SRC.tokei.sourceUrl,
      sourceNote: "Establishment and Enterprise Census / Economic Census for Business Activity",
      ariaLabel: "Accommodation and food establishments fall from 421 in 2006 to 235 in 2021",
    });

    window.Viz.lineChart($("#chartAgeing"), {
      title: "Ageing rate and the share of children",
      xTitle: "Year",
      categories: ageing.map((r) => r.year_as_of_jan1),
      series: [
        { name: "Aged 65 and over (%)", color: slot(0), values: ageing.map((r) => r.ageing_rate_pct) },
        { name: "Aged 0–14 (%)", color: slot(1), values: ageing.map((r) => r.youth_share_pct) },
      ],
      yFormat: (n) => fmt.dec(n, 1),
      yUnit: "%",
      valueSuffix: "%",
      height: 240, xEvery: 1,
      tipNote: "Population levels differ between statistical series, so only shares are plotted here, on one axis.",
      source: SRC.ageing.source, sourceUrl: SRC.ageing.sourceUrl,
      ariaLabel: "Ageing rate and the share of children over time",
    });

    window.Viz.lineChart($("#chartStation"), {
      title: "JR Yugawara Station, average daily boardings",
      xTitle: "Fiscal year",
      categories: station.map((r) => r.fiscal_year),
      series: [
        { name: "Total", color: slot(0), values: station.map((r) => r.total_passengers) },
        { name: "Without a commuter pass", color: slot(1), values: station.map((r) => r.non_pass_passengers) },
      ],
      yFormat: (n) => fmt.int(n),
      yUnit: "Passengers per day",
      valueSuffix: "",
      height: 240, xEvery: 2,
      tipNote: "Boardings only; this is not the combined boardings-and-alightings figure. FY2011 has no published breakdown.",
      source: SRC.jr.source, sourceUrl: SRC.jr.sourceUrl,
      ariaLabel: "Average daily boardings at JR Yugawara Station over time",
    });
  }

  /* =======================================================================
     TAB 3 — what to spend it on
     ======================================================================= */

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthly = D.monthly.slice().sort((a, b) => (a.year - b.year) || (a.month - b.month));
  const mYears = Array.from(new Set(monthly.map((m) => m.year))).sort((a, b) => a - b);
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const cardItems = Array.from(new Set(D.resasCard.map((r) => r.spend_category)));
  const use = { year: mYears[mYears.length - 1], item: cardItems[0], heat: "total" };

  function initUseControls() {
    const ys = $("#inYear");
    mYears.slice().reverse().forEach((y) => {
      const o = document.createElement("option");
      o.value = y; o.textContent = y;
      ys.appendChild(o);
    });
    ys.value = use.year;
    ys.addEventListener("change", () => { use.year = parseInt(ys.value, 10); renderUse(); });

    const is = $("#inItem");
    cardItems.forEach((it) => {
      const o = document.createElement("option");
      o.value = it; o.textContent = it;
      is.appendChild(o);
    });
    is.value = use.item;
    is.addEventListener("change", () => { use.item = is.value; renderUse(); });

    $$("#segHeat button").forEach((b) => {
      b.addEventListener("click", () => {
        use.heat = b.dataset.v;
        $$("#segHeat button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        renderUse();
      });
    });
  }

  function renderUse() {
    $("#mixYearLabel").textContent = use.year;
    $("#spotYearLabel").textContent = use.year;
    $("#itemLabel").textContent = `Showing: ${use.item}.`;

    // --- heatmap, year × month ---
    const col = use.heat === "total" ? "visitors_total_persons" : "overnight_visitors_persons";
    $("#heatCaption").textContent = use.heat === "total"
      ? "Total visitors by month, in thousands; darker means more. April is by far the largest month, followed by June."
      : "Overnight visitors by month, in thousands; darker means more. The overnight peaks do not line up with the day-trip peaks in April and June, and the whole range is much narrower.";

    const hHost = $("#chartHeat");
    hHost.textContent = "";
    window.Viz.heatmap(hHost, {
      title: (use.heat === "total" ? "Total visitors" : "Overnight visitors") + " by year and month (thousands)",
      rowTitle: "Year",
      rows: mYears.map(String),
      cols: MONTH_NAMES,
      values: mYears.map((y) => MONTHS.map((m) =>
        monthly.find((r) => r.year === y && r.month === m)?.[col] ?? null)),
      valueFormat: (n) => fmt.dec(n / 1000, 0),
      legendTitle: "thousands of visitors",
      rowH: 38,
      tipNote: "In thousands of visitors. Kanagawa Prefecture Tourist Visitor Survey, Table 3.",
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      ariaLabel: "Heatmap of visitors by year and month",
    });

    // --- overnight and day visitors by month ---
    const mm = MONTHS.map((m) => monthly.find((r) => r.year === use.year && r.month === m));
    const mmHost = $("#chartMonthMix");
    mmHost.textContent = "";
    window.Viz.columnChart(mmHost, {
      title: `Overnight and day visitors by month, ${use.year}`,
      xTitle: "Month",
      categories: MONTH_NAMES,
      series: [
        { name: "Overnight", color: slot(0), values: mm.map((r) => r?.overnight_visitors_persons ?? 0) },
        { name: "Day trip", color: slot(1), values: mm.map((r) => r?.day_visitors_persons ?? 0) },
      ],
      stacked: true,
      yFormat: (n) => fmt.compact(n),
      yUnit: "Visitors",
      valueSuffix: "",
      height: 270, xEvery: 1,
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      ariaLabel: `Overnight and day visitors by month in ${use.year}`,
    });

    // --- measured weekday / weekend spend ---
    const cr = D.resasCard.filter((r) => r.spend_category === use.item)
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
    const wHost = $("#chartWeekday");
    wHost.textContent = "";
    window.Viz.lineChart(wHost, {
      title: `Spend per visitor on ${use.item.toLowerCase()} — weekday vs. weekend`,
      xTitle: "Month",
      categories: cr.map((r) => r.year_month),
      series: [
        { name: "Weekday", color: slot(0), values: cr.map((r) => r.weekday_spend_per_visitor_yen) },
        { name: "Weekend", color: slot(1), values: cr.map((r) => r.weekend_spend_per_visitor_yen) },
      ],
      yFormat: (n) => "¥" + fmt.int(n),
      yUnit: "Yen",
      valueSuffix: "",
      height: 270, xEvery: 2,
      tipNote: "Spend per visitor = total spend / visitors counted in that segment. Visitors are double-counted across weekday and weekend, so use the direction of the gap rather than its size.",
      source: SRC.resasCard.source, sourceUrl: SRC.resasCard.sourceUrl,
      sourceNote: SRC.resasCard.sourceNote,
      ariaLabel: `Weekday and weekend spend per visitor on ${use.item}`,
    });

    // --- sites and events, ranked ---
    const spots = D.spots.filter((s) => s.year === use.year && s.visitors_thousands != null)
      .sort((a, b) => b.visitors_thousands - a.visitors_thousands)
      .slice(0, 14);
    const sHost = $("#chartSpots");
    sHost.textContent = "";
    window.Viz.barChart(sHost, {
      title: `Visitors by site, facility and event, ${use.year}`,
      xTitle: "Name",
      valueTitle: "Visitors",
      items: spots.map((s) => ({
        label: s.name,
        value: s.visitors_thousands,
        note: `Category: ${s.category}`,
      })),
      valueFormat: (n) => fmt.int(n),
      valueSuffix: "k",
      rowH: 28, labelW: 200,
      source: SRC.pref.source, sourceUrl: SRC.pref.sourceUrl,
      sourceNote: "Table 4. Top 14. Names follow the original, whose wording varies slightly year to year.",
      ariaLabel: `Visitors by site, facility and event in ${use.year}`,
    });
  }

  /* =======================================================================
     TAB 4 — data and limitations
     ======================================================================= */

  const CATALOG = [
    { file: "01_visitors_annual.csv", name: "Visitors and tourism spending (annual)",
      grain: "Annual, whole town", period: "1990, 2003, 2005–2024", src: SRC.pref,
      freq: "Annual, published the following summer" },
    { file: "02_visitors_spending_monthly.csv", name: "Visitors and tourism spending (monthly)",
      grain: "Monthly, whole town", period: "2019–2024 (72 months)", src: SRC.pref,
      freq: "Annual release with monthly detail" },
    { file: "03_visitors_by_site_facility_event_annual.csv", name: "Visitors by site, facility and event",
      grain: "Site or event × year", period: "2019–2024", src: SRC.pref, freq: "Annual" },
    { file: "04_jr_yugawara_station_daily_boardings_fy.csv", name: "JR Yugawara Station, average daily boardings",
      grain: "Fiscal year, one station", period: "FY2011–FY2024", src: SRC.jr, freq: "Annual" },
    { file: "05_neighbouring_municipalities_annual.csv", name: "Neighbouring towns (Yugawara, Hakone, Manazuru)",
      grain: "Municipality × year", period: "2010–2024", src: SRC.pref, freq: "Annual" },
    { file: "06_lodging_establishments_annual.csv", name: "Lodging establishments by type",
      grain: "Annual, whole town", period: "2006–2016", src: SRC.tokei,
      freq: "Annual, discontinued after 2016" },
    { file: "07_visitors_by_event_fy.csv", name: "Visitors by event (town handbook)",
      grain: "Event × fiscal year", period: "FY2011–FY2015", src: SRC.tokei, freq: "Annual" },
    { file: "08_town_tourism_budget.csv", name: "Town tourism budget and its share of the general account",
      grain: "Fiscal year, whole town", period: "FY2003–FY2023 (selected years)", src: SRC.town,
      freq: "Irregular" },
    { file: "09_derived_kpis_annual.csv", name: "Derived KPIs (seasonality and mix)",
      grain: "Annual", period: "2019–2024",
      src: { source: "Calculated from the sources above", sourceUrl: "" }, freq: "—" },
    { file: "10_guest_nights_resas_annual.csv", name: "Overnight guest analysis (length of stay, demographics)",
      grain: "Annual, whole town", period: "2013–2025", src: SRC.resasGuest, freq: "Annual" },
    { file: "11_resas_card_spend_per_visitor_monthly.csv", name: "Card spend per visitor (weekday / weekend)",
      grain: "Month × category × weekday/weekend", period: "2025 and Jan–Mar 2026", src: SRC.resasCard,
      freq: "Quarterly" },
    { file: "12_population_households_annual.csv", name: "Population and households (Basic Resident Register)",
      grain: "Annual, whole town", period: "2015–2024", src: SRC.tokei, freq: "Annual" },
    { file: "13_population_by_age_ageing_rate_annual.csv", name: "Population by age group and ageing rate",
      grain: "Annual, whole town", period: "2019–2023", src: SRC.ageing, freq: "Annual" },
    { file: "14_household_composition_census2020.csv", name: "Household composition (one-person households etc.)",
      grain: "Single year, by category", period: "2020",
      src: { source: "2020 Population Census, Basic Complete Tabulation, Table 10",
             sourceUrl: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142501&fileKind=0" },
      freq: "Every five years" },
    { file: "15_accommodation_food_establishments_2021.csv", name: "Accommodation and food services: establishments and employees",
      grain: "By industry class", period: "2021",
      src: { source: "2021 Economic Census for Business Activity, Table 31-14",
             sourceUrl: "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040068159&fileKind=0" },
      freq: "Every five years" },
    { file: "15b_accommodation_food_establishments_trend.csv", name: "Accommodation and food establishments over time",
      grain: "Annual", period: "2006, 2012, 2016, 2021", src: SRC.tokei, freq: "Every five years" },
    { file: "16_establishments_by_employee_size.csv", name: "Private establishments by employee size",
      grain: "Annual", period: "2006, 2012, 2016, 2021", src: SRC.tokei, freq: "Every five years" },
  ];

  function renderSources() {
    const wrap = $("#sourcesTable");
    wrap.textContent = "";
    const table = document.createElement("table");
    table.className = "data";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    ["Indicator", "Source", "Period", "Granularity / update", "CSV"].forEach((h) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tb = document.createElement("tbody");
    const manifest = new Map(D._manifest.map((m) => [m.file, m]));
    CATALOG.forEach((c) => {
      const tr = document.createElement("tr");
      const add = (content, cls) => {
        const td = document.createElement("td");
        if (cls) td.className = cls;
        if (content instanceof Node) td.appendChild(content);
        else td.textContent = content;
        tr.appendChild(td);
      };
      const th = document.createElement("th");
      th.scope = "row";
      th.className = "wrap-cell";
      th.textContent = c.name;
      tr.appendChild(th);

      if (c.src.sourceUrl) {
        const a = document.createElement("a");
        a.href = c.src.sourceUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = c.src.source;
        add(a, "wrap-cell");
      } else {
        add(c.src.source, "wrap-cell");
      }
      add(c.period);
      add(c.grain + " / " + c.freq, "wrap-cell");

      const dl = document.createElement("a");
      dl.href = "data/" + encodeURIComponent(c.file);
      dl.setAttribute("download", "");
      dl.textContent = `CSV (${fmt.int(manifest.get(c.file)?.rows ?? 0)} rows)`;
      add(dl);

      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);

    const ul = $("#downloads");
    ul.textContent = "";
    CATALOG.forEach((c) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "data/" + encodeURIComponent(c.file);
      a.setAttribute("download", "");
      a.textContent = c.file;
      li.appendChild(a);
      const span = document.createElement("span");
      span.style.cssText = "color:var(--ink-3);font-size:.75rem";
      span.textContent = `  ${c.name} (${fmt.int(manifest.get(c.file)?.rows ?? 0)} rows)`;
      li.appendChild(span);
      ul.appendChild(li);
    });
  }

  const DEFS = [
    ["Total visitors", "visits", "The sum of visitors recorded at the survey points designated by the prefecture. Somebody who visits several points is counted at each one, so this counts visits, not people."],
    ["Overnight visitors", "visits", "Guest nights at accommodation in the town. One person staying two nights counts as two."],
    ["Overnight share", "%", "Overnight visitors ÷ total visitors. Because the denominator counts visits, use it for trends and for comparison between towns rather than as an absolute level."],
    ["Tourism spending", "¥ millions / ¥ thousands", "The prefecture's estimate: overnight visitors × ¥10,500 + day visitors × ¥1,080. Not a measured figure."],
    ["Spend per visitor (RESAS)", "yen", "Total spend ÷ visitors counted in that segment. Not spend per purchaser. Visa card-present transactions only. A domestic traveller is someone paying at least 30km from home."],
    ["One-night share", "%", "One-night stays ÷ total guest nights in the RESAS overnight guest analysis. Used only as a share within that source."],
    ["Average daily boardings", "passengers/day", "JR East's definition of boardings; alightings are not included, so this is roughly half the boardings-and-alightings figure. Fiscal years."],
    ["Ageing rate", "%", "Population aged 65 and over ÷ total population. Kanagawa Prefecture Population by Age Survey, as of 1 January each year."],
    ["Establishments", "count", "Private establishments. 2006 from the Establishment and Enterprise Census, 2012 onward from the Economic Census. The classification was revised in 2002, so the two are not strictly comparable."],
    ["Tax base (this site's simulator)", "person-nights", "Overnight visitors × the share of nights taxed. The share is an assumption the user sets, not a statistic."],
  ];

  function renderDefs() {
    window.Viz.renderTable($("#defsTable"), {
      caption: "Definitions and units used on this site",
      headers: ["Term", "Unit", "Definition and caveats"],
      rows: DEFS,
    });
    $$("#defsTable tbody tr").forEach((tr) => {
      tr.children[2].className = "wrap-cell";
      tr.children[2].style.textAlign = "left";
    });
  }

  /* =======================================================================
     start
     ======================================================================= */

  renderSim();
  renderBaseChart();
  renderWhyTiles();
  renderFindings();
  renderIdxControls();
  renderIndexed();
  renderStructure();
  initUseControls();
  renderUse();
  renderSources();
  renderDefs();
})();
