/* =========================================================================
   Viz — a minimal SVG chart layer (no external dependencies)
   Mark specs:
     - bars at most 24px thick, 4px rounded data end, square at the baseline
     - a 2px surface-colour gap between stacked segments and adjacent bars
     - 2px lines, markers of radius 4px or more with a 2px surface ring
     - gridlines and axes are solid hairlines (never dashed)
     - a legend whenever there are two or more series; direct labels only on
       endpoints and extremes
     - every chart has a hover/focus tooltip and a table-view twin
   ========================================================================= */
(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
  const SEQ = ["--q1", "--q2", "--q3", "--q4", "--q5", "--q6",
               "--q7", "--q8", "--q9", "--q10", "--q11", "--q12"];

  const v = (token) => `var(${token})`;
  const slot = (i) => v(SERIES[i % SERIES.length]);

  /* ---------- number formatting ---------- */

  const fmt = {
    int: (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US")),
    dec: (n, d = 1) => (n == null || !isFinite(n) ? "—" :
      n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })),
    yen: (n) => (n == null || !isFinite(n) ? "—" : "¥" + Math.round(n).toLocaleString("en-US")),
    pct: (n, d = 1) => (n == null || !isFinite(n) ? "—" : fmt.dec(n, d) + "%"),
    /** Yen as a short money figure: ¥109M, ¥1.09B. Rounds, so it never drifts. */
    yenShort(yen) {
      if (yen == null || !isFinite(yen)) return "—";
      const a = Math.abs(yen);
      if (a >= 1e9) return "¥" + fmt.dec(yen / 1e9, 2) + "B";
      if (a >= 1e6) return "¥" + fmt.dec(yen / 1e6, a / 1e6 >= 100 ? 0 : 1) + "M";
      if (a >= 1e3) return "¥" + fmt.dec(yen / 1e3, 0) + "k";
      return "¥" + fmt.int(yen);
    },
    /** Same, for a figure already expressed in millions of yen. */
    yenShortFromMillions(m) {
      return fmt.yenShort(m == null ? null : m * 1e6);
    },
    compact(n) {
      if (n == null || !isFinite(n)) return "—";
      const a = Math.abs(n);
      // Drop the decimal when the value divides evenly, so axis ticks read
      // "800K" rather than "800.0K".
      if (a >= 1e9) {
        const x = n / 1e9;
        return fmt.dec(x, Number.isInteger(x) ? 0 : 2) + "B";
      }
      if (a >= 1e6) {
        const x = n / 1e6;
        return fmt.dec(x, Number.isInteger(x) ? 0 : a / 1e6 >= 100 ? 0 : 2) + "M";
      }
      if (a >= 1e3) {
        const x = n / 1e3;
        return fmt.dec(x, Number.isInteger(x) ? 0 : 1) + "K";
      }
      return fmt.int(n);
    },
  };

  /* ---------- axis ticks ---------- */

  function niceTicks(min, max, target = 5) {
    if (!(isFinite(min) && isFinite(max))) return { lo: 0, hi: 1, ticks: [0, 1] };
    if (min === max) { min = Math.min(0, min); max = max || 1; }
    const raw = (max - min) / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step);
    return { lo, hi, ticks };
  }

  /* ---------- SVG helpers ---------- */

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function txt(parent, x, y, s, attrs) {
    const t = el("text", Object.assign({
      x, y, fill: "var(--ink-3)", "font-size": 11,
      "font-family": "inherit", "dominant-baseline": "middle",
    }, attrs || {}), parent);
    t.textContent = s;          // series names come from CSV headers = untrusted; insert with textContent
    return t;
  }

  /** Approximate rendered width: CJK glyphs are full-width, Latin roughly half. */
  function textWidth(s, fontPx) {
    let w = 0;
    for (const ch of s) {
      w += /[\u1100-\u115f\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(ch)
        ? fontPx : fontPx * 0.55;
    }
    return w;
  }

  /** Truncate to fit `maxPx`, adding an ellipsis. The full text stays in the
      tooltip and the table view, so nothing is lost. */
  function fitText(s, maxPx, fontPx) {
    if (textWidth(s, fontPx) <= maxPx) return s;
    const ell = textWidth("…", fontPx);
    let out = "", w = 0;
    for (const ch of s) {
      const cw = textWidth(ch, fontPx);
      if (w + cw + ell > maxPx) break;
      out += ch;
      w += cw;
    }
    return (out || s.slice(0, 1)) + "…";
  }

  /** Column rounded at the top only; square where it meets the baseline. */
  function colPath(x, y, w, h, r) {
    if (h <= 0.4) return "";
    const rr = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h}L${x},${y + rr}Q${x},${y} ${x + rr},${y}` +
           `L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}L${x + w},${y + h}Z`;
  }

  /** Horizontal bar rounded at the data end only. */
  function rowPath(x, y, w, h, r) {
    if (w <= 0.4) return "";
    const rr = Math.max(0, Math.min(r, h / 2, w));
    return `M${x},${y}L${x + w - rr},${y}Q${x + w},${y} ${x + w},${y + rr}` +
           `L${x + w},${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}L${x},${y + h}Z`;
  }

  /* ---------- tooltip ---------- */

  const tip = {
    node: null,
    ensure() {
      if (!this.node) {
        this.node = document.createElement("div");
        this.node.id = "tooltip";
        this.node.setAttribute("role", "status");
        document.body.appendChild(this.node);
      }
      return this.node;
    },
    /** rows: [{name, value, color}] — everything is inserted with textContent */
    show(ev, head, rows, note) {
      const n = this.ensure();
      n.textContent = "";
      if (head) {
        const h = document.createElement("div");
        h.className = "tt-head";
        h.textContent = head;
        n.appendChild(h);
      }
      rows.forEach((r) => {
        const row = document.createElement("div");
        row.className = "tt-row";
        if (r.color) {
          const k = document.createElement("span");
          k.className = "tt-key";
          k.style.background = r.color;
          row.appendChild(k);
        }
        const val = document.createElement("span");
        val.className = "tt-val";
        val.textContent = r.value;                       // value leads, in the strong style
        row.appendChild(val);
        if (r.name) {
          const nm = document.createElement("span");
          nm.className = "tt-name";
          nm.textContent = r.name;
          row.appendChild(nm);
        }
        n.appendChild(row);
      });
      if (note) {
        const d = document.createElement("div");
        d.className = "tt-note";
        d.textContent = note;
        n.appendChild(d);
      }
      n.dataset.show = "1";
      this.move(ev);
    },
    move(ev) {
      const n = this.ensure();
      const pad = 14;
      const r = n.getBoundingClientRect();
      let x = (ev.clientX ?? 0) + pad;
      let y = (ev.clientY ?? 0) + pad;
      if (x + r.width > innerWidth - 8) x = (ev.clientX ?? 0) - r.width - pad;
      if (y + r.height > innerHeight - 8) y = (ev.clientY ?? 0) - r.height - pad;
      n.style.left = Math.max(8, x) + "px";
      n.style.top = Math.max(8, y) + "px";
    },
    hide() { if (this.node) this.node.dataset.show = "0"; },
  };
  addEventListener("scroll", () => tip.hide(), true);

  /* ---------- chart shell: legend, table view, source line, resize ---------- */

  const registry = [];

  /**
   * Inserts an <svg> into `host` and redraws it when the width changes.
   * Each chart implements spec.render(svg, width).
   * If spec.table = {caption, headers, rows} is given, a table-view twin is added.
   */
  function mount(host, spec) {
    host.textContent = "";

    if (spec.legend && spec.legend.length > 1) {
      const lg = document.createElement("div");
      lg.className = "legend";
      spec.legend.forEach((s) => {
        const it = document.createElement("span");
        it.className = "item";
        const sw = document.createElement("span");
        sw.className = s.line ? "linekey" : "swatch";
        sw.style.background = s.color;
        it.appendChild(sw);
        const label = document.createElement("span");
        label.textContent = s.name;
        it.appendChild(label);
        lg.appendChild(it);
      });
      host.appendChild(lg);
    }

    const plot = document.createElement("div");
    plot.className = "chart-host";
    host.appendChild(plot);

    let tableWrap = null;
    if (spec.table) {
      tableWrap = document.createElement("div");
      tableWrap.className = "tbl-wrap";
      tableWrap.hidden = true;
      tableWrap.style.maxHeight = "340px";
      tableWrap.style.overflowY = "auto";
      host.appendChild(tableWrap);
      renderTable(tableWrap, spec.table);
    }

    const foot = document.createElement("div");
    foot.className = "chart-foot";
    const src = document.createElement("div");
    src.className = "src";
    if (spec.source) {
      src.appendChild(document.createTextNode("Source: "));
      if (spec.sourceUrl) {
        const a = document.createElement("a");
        a.href = spec.sourceUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = spec.source;
        src.appendChild(a);
      } else {
        src.appendChild(document.createTextNode(spec.source));
      }
      if (spec.sourceNote) src.appendChild(document.createTextNode("　" + spec.sourceNote));
    }
    foot.appendChild(src);

    if (tableWrap) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tv-toggle";
      btn.textContent = "Table view";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", () => {
        const open = tableWrap.hidden;
        tableWrap.hidden = !open;
        plot.hidden = open;
        btn.textContent = open ? "Chart view" : "Table view";
        btn.setAttribute("aria-expanded", String(open));
      });
      foot.appendChild(btn);
    }
    host.appendChild(foot);

    const draw = () => {
      const w = Math.max(280, plot.clientWidth || host.clientWidth || 600);
      plot.textContent = "";
      const svg = el("svg", {
        width: w, height: spec.height || 260,
        viewBox: `0 0 ${w} ${spec.height || 260}`,
        role: "img", "aria-label": spec.ariaLabel || spec.title || "Chart",
      }, plot);
      spec.render(svg, w, spec.height || 260);
    };

    draw();
    if (typeof ResizeObserver !== "undefined") {
      let last = plot.clientWidth;
      const ro = new ResizeObserver(() => {
        const now = plot.clientWidth;
        if (Math.abs(now - last) > 2) { last = now; draw(); }
      });
      ro.observe(plot);
    }
    registry.push(draw);
    return { redraw: draw };
  }

  function renderTable(wrap, t) {
    wrap.textContent = "";
    const table = document.createElement("table");
    table.className = "data";
    if (t.caption) {
      const cap = document.createElement("caption");
      cap.textContent = t.caption;
      table.appendChild(cap);
    }
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    t.headers.forEach((h) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    const tb = document.createElement("tbody");
    t.rows.forEach((r) => {
      const tr = document.createElement("tr");
      r.forEach((c, i) => {
        const cell = document.createElement(i === 0 ? "th" : "td");
        if (i === 0) cell.scope = "row";
        cell.textContent = c == null ? "—" : String(c);
        tr.appendChild(cell);
      });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
  }

  /* =======================================================================
     Line / area
     series: [{name, color, values:[number|null]}]; the x axis is `categories`
     ======================================================================= */

  function lineChart(host, opt) {
    const {
      categories, series, yFormat = fmt.int, height = 260,
      yZero = false, area = false, xEvery, valueSuffix = "",
      annotations = [], endLabels = true, tipNote, yUnit,
      // pass xValues to place points at their real numeric position, so that
      // missing years are not collapsed into their neighbours
      xValues = null,
    } = opt;

    const m = { t: yUnit ? 26 : 14, r: 56, b: 28, l: 52 };

    const spec = {
      height, title: opt.title, ariaLabel: opt.ariaLabel,
      source: opt.source, sourceUrl: opt.sourceUrl, sourceNote: opt.sourceNote,
      legend: series.map((s) => ({ name: s.name, color: s.color, line: true })),
      table: opt.table !== false ? {
        caption: opt.title,
        headers: [opt.xTitle || "Category"].concat(series.map((s) => s.name)),
        rows: categories.map((c, i) => [c].concat(
          series.map((s) => (s.values[i] == null ? null : yFormat(s.values[i]))))),
      } : null,
      render(svg, W, H) {
        const iw = W - m.l - m.r, ih = H - m.t - m.b;
        const all = series.flatMap((s) => s.values).filter((n) => n != null && isFinite(n));
        const lo0 = yZero ? 0 : Math.min(...all);
        const { lo, hi, ticks } = niceTicks(lo0, Math.max(...all), 4);
        const xLo = xValues ? Math.min(...xValues) : 0;
        const xHi = xValues ? Math.max(...xValues) : categories.length - 1;
        const X = (i) => {
          if (categories.length <= 1) return m.l + iw / 2;
          const p = xValues ? (xValues[i] - xLo) / ((xHi - xLo) || 1) : i / (categories.length - 1);
          return m.l + p * iw;
        };
        const Y = (val) => m.t + ih - ((val - lo) / (hi - lo || 1)) * ih;

        if (yUnit) txt(svg, 2, 10, yUnit, { "font-size": 10.5 });

        ticks.forEach((t) => {
          el("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t),
            stroke: "var(--grid)", "stroke-width": 1, "shape-rendering": "crispEdges" }, svg);
          txt(svg, m.l - 8, Y(t), fmt.compact(t), { "text-anchor": "end" });
        });

        if (xValues) {
          // real positions, so thin the labels out to keep 44px between them
          let lastX = -Infinity;
          categories.forEach((c, i) => {
            const x = X(i);
            if (x - lastX < 44 && i !== categories.length - 1) return;
            lastX = x;
            txt(svg, x, m.t + ih + 14, String(c), { "text-anchor": "middle" });
          });
        } else {
          const step = xEvery || Math.max(1, Math.ceil(categories.length / (W < 480 ? 5 : 9)));
          categories.forEach((c, i) => {
            if (i % step !== 0 && i !== categories.length - 1) return;
            txt(svg, X(i), m.t + ih + 14, String(c), { "text-anchor": "middle" });
          });
        }

        annotations.forEach((a) => {
          const x = X(a.at);
          el("line", { x1: x, x2: x, y1: m.t, y2: m.t + ih,
            stroke: "var(--axis)", "stroke-width": 1, "shape-rendering": "crispEdges" }, svg);
          txt(svg, x + 4, m.t + 7, a.label, { "font-size": 10, fill: "var(--ink-3)" });
        });

        series.forEach((s) => {
          const segs = [];
          let cur = [];
          s.values.forEach((val, i) => {
            if (val == null || !isFinite(val)) { if (cur.length) segs.push(cur); cur = []; }
            else cur.push([X(i), Y(val)]);
          });
          if (cur.length) segs.push(cur);

          if (area && segs.length) {
            segs.forEach((sg) => {
              if (sg.length < 2) return;
              const d = "M" + sg.map((p) => p.join(",")).join("L") +
                `L${sg[sg.length - 1][0]},${Y(lo)}L${sg[0][0]},${Y(lo)}Z`;
              el("path", { d, fill: s.color, "fill-opacity": 0.10 }, svg);
            });
          }
          segs.forEach((sg) => {
            if (sg.length === 1) {
              el("circle", { cx: sg[0][0], cy: sg[0][1], r: 3.5, fill: s.color }, svg);
              return;
            }
            el("path", { d: "M" + sg.map((p) => p.join(",")).join("L"),
              fill: "none", stroke: s.color, "stroke-width": 2,
              "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
          });
        });

        // direct-label the endpoint only, never every point; nudge apart on collision
        if (endLabels) {
          const ends = series.map((s) => {
            for (let i = s.values.length - 1; i >= 0; i--) {
              if (s.values[i] != null && isFinite(s.values[i])) {
                return { s, i, y: Y(s.values[i]), val: s.values[i] };
              }
            }
            return null;
          }).filter(Boolean).sort((a, b) => a.y - b.y);

          let prev = -Infinity;
          ends.forEach((e) => {
            const y = Math.max(e.y, prev + 13);
            prev = y;
            el("circle", { cx: X(e.i), cy: e.y, r: 4, fill: e.s.color,
              stroke: "var(--surface-1)", "stroke-width": 2 }, svg);
            if (W >= 380) {
              if (Math.abs(y - e.y) > 1.5) {
                el("line", { x1: X(e.i) + 6, y1: e.y, x2: X(e.i) + 10, y2: y,
                  stroke: "var(--axis)", "stroke-width": 1 }, svg);
              }
              txt(svg, X(e.i) + 11, y, yFormat(e.val) + valueSuffix,
                { fill: "var(--ink-2)", "font-size": 11, "font-weight": 650 });
            }
          });
        }

        el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih,
          stroke: "var(--axis)", "stroke-width": 1, "shape-rendering": "crispEdges" }, svg);

        // crosshair, with every series in a single tooltip
        const cross = el("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ih,
          stroke: "var(--axis)", "stroke-width": 1, opacity: 0 }, svg);
        const dots = series.map((s) => el("circle", {
          r: 4.5, fill: s.color, stroke: "var(--surface-1)", "stroke-width": 2, opacity: 0 }, svg));

        const at = (i, ev) => {
          const x = X(i);
          cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.setAttribute("opacity", 1);
          const rows = [];
          series.forEach((s, k) => {
            const val = s.values[i];
            if (val == null || !isFinite(val)) { dots[k].setAttribute("opacity", 0); return; }
            dots[k].setAttribute("cx", x); dots[k].setAttribute("cy", Y(val));
            dots[k].setAttribute("opacity", 1);
            rows.push({ name: s.name, color: s.color, value: yFormat(val) + valueSuffix });
          });
          tip.show(ev, String(categories[i]), rows, tipNote);
        };
        const clear = () => {
          cross.setAttribute("opacity", 0);
          dots.forEach((d) => d.setAttribute("opacity", 0));
          tip.hide();
        };

        let idx = 0;
        const hit = el("rect", { x: m.l, y: m.t, width: iw, height: ih,
          fill: "transparent", tabindex: 0, role: "application",
          "aria-label": (opt.title || "Chart") + " (use the left and right arrow keys to read values)" }, svg);
        hit.style.cursor = "crosshair";
        const nearest = (px) => {
          let best = 0, bd = Infinity;
          for (let i = 0; i < categories.length; i++) {
            const d = Math.abs(X(i) - px);
            if (d < bd) { bd = d; best = i; }
          }
          return best;
        };
        hit.addEventListener("pointermove", (ev) => {
          const r = svg.getBoundingClientRect();
          // the SVG scales to its container, so map back to viewBox coordinates
          const px = (ev.clientX - r.left) * (W / (r.width || W));
          idx = nearest(px);
          at(idx, ev);
        });
        hit.addEventListener("pointerleave", clear);
        hit.addEventListener("focus", () => {
          const r = hit.getBoundingClientRect();
          at(idx, { clientX: r.left + iw / 2, clientY: r.top });
        });
        hit.addEventListener("blur", clear);
        hit.addEventListener("keydown", (ev) => {
          if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
          ev.preventDefault();
          idx = Math.max(0, Math.min(categories.length - 1, idx + (ev.key === "ArrowRight" ? 1 : -1)));
          const r = svg.getBoundingClientRect();
          at(idx, { clientX: r.left + X(idx), clientY: r.top + m.t });
        });
      },
    };
    return mount(host, spec);
  }

  /* =======================================================================
     Columns (stacked or grouped)
     ======================================================================= */

  function columnChart(host, opt) {
    const {
      categories, series, stacked = false, yFormat = fmt.int,
      height = 260, xEvery, valueSuffix = "", tipNote, reference, yUnit,
    } = opt;

    const m = { t: yUnit ? 26 : 16, r: 14, b: 30, l: 52 };
    const GAP = 2;              // surface-colour gap; never a stroke around the mark

    const spec = {
      height, title: opt.title, ariaLabel: opt.ariaLabel,
      source: opt.source, sourceUrl: opt.sourceUrl, sourceNote: opt.sourceNote,
      legend: series.map((s) => ({ name: s.name, color: s.color })),
      table: opt.table !== false ? {
        caption: opt.title,
        headers: [opt.xTitle || "Category"].concat(series.map((s) => s.name))
          .concat(stacked && series.length > 1 ? ["Total"] : []),
        rows: categories.map((c, i) => {
          const vals = series.map((s) => s.values[i]);
          const row = [c].concat(vals.map((n) => (n == null ? null : yFormat(n))));
          if (stacked && series.length > 1) {
            row.push(yFormat(vals.reduce((a, b) => a + (b || 0), 0)));
          }
          return row;
        }),
      } : null,
      render(svg, W, H) {
        const iw = W - m.l - m.r, ih = H - m.t - m.b;
        const tot = categories.map((_, i) => stacked
          ? series.reduce((a, s) => a + (s.values[i] || 0), 0)
          : Math.max(...series.map((s) => s.values[i] || 0)));
        const maxV = Math.max(...tot, reference ? reference.value : 0);
        const { hi, ticks } = niceTicks(0, maxV, 4);
        const Y = (val) => m.t + ih - (val / (hi || 1)) * ih;

        if (yUnit) txt(svg, 2, 10, yUnit, { "font-size": 10.5 });

        ticks.forEach((t) => {
          el("line", { x1: m.l, x2: m.l + iw, y1: Y(t), y2: Y(t),
            stroke: "var(--grid)", "stroke-width": 1, "shape-rendering": "crispEdges" }, svg);
          txt(svg, m.l - 8, Y(t), fmt.compact(t), { "text-anchor": "end" });
        });

        const band = iw / categories.length;
        const nCols = stacked ? 1 : series.length;
        // leave the rest of the band as air; never fill the slot
        const groupW = Math.min(band * 0.68, 24 * nCols + GAP * (nCols - 1));
        const barW = Math.max(3, (groupW - GAP * (nCols - 1)) / nCols);

        categories.forEach((c, i) => {
          const cx = m.l + band * i + band / 2;
          const gx = cx - groupW / 2;

          if (stacked) {
            let acc = 0;
            const parts = series.map((s) => ({ s, val: s.values[i] || 0 }))
              .filter((p) => p.val > 0);
            parts.forEach((p, k) => {
              const y0 = Y(acc), y1 = Y(acc + p.val);
              const isTop = k === parts.length - 1;
              const h = Math.max(0, y0 - y1 - (isTop ? 0 : GAP));
              el("path", { d: colPath(gx, y1, barW, h, 4), fill: p.s.color }, svg);
              acc += p.val;
            });
          } else {
            series.forEach((s, k) => {
              const val = s.values[i];
              if (val == null || val <= 0) return;
              const y1 = Y(val);
              el("path", { d: colPath(gx + k * (barW + GAP), y1, barW, m.t + ih - y1, 4),
                fill: s.color }, svg);
            });
          }

          // the hit target is the whole band, always bigger than the mark
          const hit = el("rect", { x: m.l + band * i, y: m.t, width: band, height: ih,
            fill: "transparent", tabindex: 0, role: "img",
            "aria-label": String(c) }, svg);
          const rows = () => {
            const r = series
              .filter((s) => s.values[i] != null)
              .map((s) => ({ name: s.name, color: s.color, value: yFormat(s.values[i]) + valueSuffix }));
            if (stacked && series.length > 1) {
              r.push({ name: "Total", value: yFormat(tot[i]) + valueSuffix });
            }
            return r;
          };
          const enter = (ev) => {
            hit.setAttribute("fill", "var(--ink-1)");
            hit.setAttribute("fill-opacity", "0.04");
            tip.show(ev, String(c), rows(), tipNote);
          };
          const leave = () => { hit.setAttribute("fill", "transparent"); tip.hide(); };
          hit.addEventListener("pointerenter", enter);
          hit.addEventListener("pointermove", (ev) => tip.move(ev));
          hit.addEventListener("pointerleave", leave);
          hit.addEventListener("focus", () => {
            const r = hit.getBoundingClientRect();
            enter({ clientX: r.left + r.width / 2, clientY: r.top + 20 });
          });
          hit.addEventListener("blur", leave);
        });

        if (reference) {
          const y = Y(reference.value);
          el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y,
            stroke: "var(--critical)", "stroke-width": 2 }, svg);
          // right-align the label so it never sits on a column; a backing plate
          // lifts it clear of the rule
          const label = txt(svg, m.l + iw, y - 10, reference.label,
            { "text-anchor": "end", fill: "var(--ink-1)", "font-size": 11, "font-weight": 650 });
          const bb = label.getBBox ? label.getBBox() : null;
          if (bb) {
            const bg = el("rect", { x: bb.x - 5, y: bb.y - 2, width: bb.width + 10,
              height: bb.height + 4, rx: 4, fill: "var(--surface-1)", "fill-opacity": 0.92 });
            svg.insertBefore(bg, label);
          }
        }

        const step = xEvery || Math.max(1, Math.ceil(categories.length / (W < 480 ? 6 : 12)));
        categories.forEach((c, i) => {
          if (i % step !== 0) return;
          txt(svg, m.l + band * i + band / 2, m.t + ih + 15, String(c), { "text-anchor": "middle" });
        });

        el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih,
          stroke: "var(--axis)", "stroke-width": 1, "shape-rendering": "crispEdges" }, svg);
      },
    };
    return mount(host, spec);
  }

  /* =======================================================================
     Horizontal bars (ranking) — one series, one colour; never coloured by rank
     ======================================================================= */

  function barChart(host, opt) {
    const {
      items, color = slot(0), valueFormat = fmt.int,
      rowH = 26, labelW = 150, valueSuffix = "", tipNote, highlight,
    } = opt;

    const m = { t: 6, r: 62, b: 6, l: 8 };
    const height = m.t + m.b + items.length * rowH;

    const spec = {
      height, title: opt.title, ariaLabel: opt.ariaLabel,
      source: opt.source, sourceUrl: opt.sourceUrl, sourceNote: opt.sourceNote,
      legend: null,
      table: opt.table !== false ? {
        caption: opt.title,
        headers: [opt.xTitle || "Item", opt.valueTitle || "Value"],
        rows: items.map((it) => [it.label, valueFormat(it.value)]),
      } : null,
      render(svg, W) {
        const lw = Math.min(labelW, Math.max(90, W * 0.34));
        const x0 = m.l + lw + 10;
        const iw = Math.max(20, W - x0 - m.r);
        const { hi } = niceTicks(0, Math.max(...items.map((i) => i.value || 0)), 3);
        const barH = Math.min(24, rowH - 8);          // 24px cap

        items.forEach((it, i) => {
          const y = m.t + i * rowH;
          const by = y + (rowH - barH) / 2;
          const w = ((it.value || 0) / (hi || 1)) * iw;
          const isHi = highlight && it.label === highlight;

          // never clip a label: truncate here, keep the full text in the tooltip and table
          const shown = fitText(it.label, lw - 2, 12);
          txt(svg, m.l, y + rowH / 2, shown, {
            fill: isHi ? "var(--ink-1)" : "var(--ink-2)",
            "font-size": 12, "font-weight": isHi ? 650 : 400,
          });

          el("path", { d: rowPath(x0, by, w, barH, 4),
            fill: it.color || color, "fill-opacity": isHi ? 1 : 0.85 }, svg);

          // the value sits outside the bar end, so it is never cropped by the mark
          txt(svg, x0 + w + 7, y + rowH / 2, valueFormat(it.value) + valueSuffix, {
            fill: "var(--ink-2)", "font-size": 11, "font-weight": 650,
          });

          const hit = el("rect", { x: m.l, y, width: Math.max(24, W - m.l - m.r),
            height: rowH, fill: "transparent", tabindex: 0, role: "img",
            "aria-label": it.label }, svg);
          const enter = (ev) => {
            hit.setAttribute("fill", "var(--ink-1)");
            hit.setAttribute("fill-opacity", "0.04");
            tip.show(ev, it.label,
              [{ color: it.color || color, value: valueFormat(it.value) + valueSuffix,
                 name: opt.valueTitle || "" }].concat(it.extra || []), it.note || tipNote);
          };
          const leave = () => { hit.setAttribute("fill", "transparent"); tip.hide(); };
          hit.addEventListener("pointerenter", enter);
          hit.addEventListener("pointermove", (ev) => tip.move(ev));
          hit.addEventListener("pointerleave", leave);
          hit.addEventListener("focus", () => {
            const r = hit.getBoundingClientRect();
            enter({ clientX: r.left + 60, clientY: r.top + 10 });
          });
          hit.addEventListener("blur", leave);
        });
      },
    };
    return mount(host, spec);
  }

  /* =======================================================================
     Heatmap (continuous magnitude -> one-hue sequential ramp)
     ======================================================================= */

  function heatmap(host, opt) {
    const {
      cols, rows, values, valueFormat = fmt.int, rowH = 40,
      labelW = 104, tipNote, legendTitle,
    } = opt;

    const m = { t: 4, r: 8, b: 50, l: 8 };   // two rows below the plot: column labels, then the colour-scale legend
    const height = m.t + m.b + rows.length * rowH;
    const flat = values.flat().filter((n) => n != null && isFinite(n));
    const vmin = Math.min(...flat), vmax = Math.max(...flat);

    const stepFor = (val) => {
      if (val == null || !isFinite(val)) return null;
      const t = (val - vmin) / ((vmax - vmin) || 1);
      return SEQ[Math.min(SEQ.length - 1, Math.max(0, Math.round(t * (SEQ.length - 1))))];
    };

    const spec = {
      height, title: opt.title, ariaLabel: opt.ariaLabel,
      source: opt.source, sourceUrl: opt.sourceUrl, sourceNote: opt.sourceNote,
      legend: null,
      table: {
        caption: opt.title,
        headers: [opt.rowTitle || ""].concat(cols.map(String)),
        rows: rows.map((r, ri) => [r].concat(values[ri].map((n) => (n == null ? null : valueFormat(n))))),
      },
      render(svg, W) {
        // keep row labels tight and give the width to the cells, so values still fit
        const lw = Math.min(labelW, Math.max(58, W * 0.17));
        const x0 = m.l + lw + 6;
        const iw = Math.max(40, W - x0 - m.r);
        const cw = iw / cols.length;
        const GAP = 2;

        rows.forEach((r, ri) => {
          txt(svg, m.l, m.t + ri * rowH + rowH / 2, r,
            { fill: "var(--ink-2)", "font-size": 11.5 });

          cols.forEach((c, ci) => {
            const val = values[ri][ci];
            const x = x0 + ci * cw;
            const y = m.t + ri * rowH;
            const st = stepFor(val);

            el("rect", {
              x: x + GAP / 2, y: y + GAP / 2,
              width: Math.max(1, cw - GAP), height: rowH - GAP, rx: 3,
              fill: st ? v(st) : "var(--surface-2)",
            }, svg);

            // label a cell only when the value fits; otherwise the tooltip and table carry it
            if (val != null && cw >= 30) {
              const dark = SEQ.indexOf(st) >= 6;   // pick ink by the fill's luminance
              txt(svg, x + cw / 2, y + rowH / 2, valueFormat(val), {
                "text-anchor": "middle", "font-size": cw < 38 ? 9.5 : 10.5, "font-weight": 600,
                fill: dark ? "#ffffff" : "#0b0b0b",
              });
            }

            const hit = el("rect", { x, y, width: cw, height: rowH,
              fill: "transparent", tabindex: 0, role: "img",
              "aria-label": `${r} ${c}` }, svg);
            const enter = (ev) => {
              hit.setAttribute("stroke", "var(--ink-1)");
              hit.setAttribute("stroke-width", "1.5");
              tip.show(ev, `${c}・${r}`,
                [{ value: val == null ? "No data" : valueFormat(val), color: st ? v(st) : null }],
                tipNote);
            };
            const leave = () => { hit.removeAttribute("stroke"); tip.hide(); };
            hit.addEventListener("pointerenter", enter);
            hit.addEventListener("pointermove", (ev) => tip.move(ev));
            hit.addEventListener("pointerleave", leave);
            hit.addEventListener("focus", () => {
              const b = hit.getBoundingClientRect();
              enter({ clientX: b.left + b.width / 2, clientY: b.top });
            });
            hit.addEventListener("blur", leave);
          });
        });

        const axisY = m.t + rows.length * rowH + 13;
        cols.forEach((c, ci) => {
          if (cw < 26 && ci % 2) return;
          txt(svg, x0 + ci * cw + cw / 2, axisY, String(c),
            { "text-anchor": "middle", "font-size": 10.5 });
        });

        // the colour-scale legend gets its own row below the column labels
        const lgW = Math.min(170, Math.max(90, iw * 0.5));
        const lgX = x0 + iw - lgW;
        const lgY = axisY + 18;
        SEQ.forEach((s, i) => {
          el("rect", { x: lgX + (i * lgW) / SEQ.length, y: lgY,
            width: lgW / SEQ.length + 0.5, height: 7, fill: v(s) }, svg);
        });
        txt(svg, lgX - 6, lgY + 4, valueFormat(vmin), { "text-anchor": "end", "font-size": 10 });
        txt(svg, lgX + lgW + 6, lgY + 4, valueFormat(vmax), { "font-size": 10 });
        if (legendTitle) txt(svg, m.l, lgY + 4, "Unit: " + legendTitle, { "font-size": 10 });
      },
    };
    return mount(host, spec);
  }

  /* ---------- sparkline (for stat tiles; no hover layer) ---------- */

  function sparkline(values, opts) {
    const o = Object.assign({ w: 104, h: 24, color: slot(0) }, opts || {});
    const nums = values.filter((n) => n != null && isFinite(n));
    if (nums.length < 2) return document.createElement("span");
    const lo = Math.min(...nums), hi = Math.max(...nums);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", o.w);
    svg.setAttribute("height", o.h);
    svg.setAttribute("viewBox", `0 0 ${o.w} ${o.h}`);
    svg.setAttribute("aria-hidden", "true");
    svg.style.display = "block";
    const pts = values.map((val, i) => [
      2 + (i / (values.length - 1)) * (o.w - 4),
      o.h - 3 - ((val - lo) / ((hi - lo) || 1)) * (o.h - 6),
    ]);
    el("path", { d: "M" + pts.map((p) => p.join(",")).join("L"),
      fill: "none", stroke: "var(--axis)", "stroke-width": 1.5,
      "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    const last = pts[pts.length - 1];
    el("circle", { cx: last[0], cy: last[1], r: 2.5, fill: o.color }, svg);
    return svg;
  }

  global.Viz = { fmt, slot, SERIES, SEQ, niceTicks, lineChart, columnChart,
                 barChart, heatmap, sparkline, mount, renderTable, tip,
                 redrawAll: () => registry.forEach((f) => f()) };
})(window);
