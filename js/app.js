/*
 * Rehab & Testing Dashboard — browser app.
 * Everything is stored in this browser's localStorage (prefix "rehabdash_"); nothing is sent anywhere.
 * The whole UI is rendered from state as an HTML string and patched into the page (morph), so inputs keep
 * focus and every calculated cell updates live as you type.
 */
(function () {
  "use strict";
  const C = window.Calc;
  const APP_VERSION = "1.0.0";

  // ================================================================== storage
  const KEY_INDEX = "rehabdash_index", KEY_PLAYER = "rehabdash_p_", KEY_LISTS = "rehabdash_lists";
  const store = {
    getIndex() { try { return JSON.parse(localStorage.getItem(KEY_INDEX) || "[]"); } catch (e) { return []; } },
    setIndex(a) { localStorage.setItem(KEY_INDEX, JSON.stringify(a)); },
    load(id) {
      try { const raw = localStorage.getItem(KEY_PLAYER + id); return raw ? C.normalizePlayer(JSON.parse(raw)) : null; } catch (e) { return null; }
    },
    save(p) {
      localStorage.setItem(KEY_PLAYER + p.id, JSON.stringify(p));
      const idx = store.getIndex().filter((e) => e.id !== p.id);
      idx.push(indexEntry(p));
      idx.sort((a, b) => b.updated - a.updated);
      store.setIndex(idx);
    },
    remove(id) {
      localStorage.removeItem(KEY_PLAYER + id);
      store.setIndex(store.getIndex().filter((e) => e.id !== id));
    },
    getLists() {
      const d = C.DEFAULT_LISTS;
      try {
        const l = JSON.parse(localStorage.getItem(KEY_LISTS) || "null") || {};
        return { availability: cleanList(l.availability, d.availability), focus: cleanList(l.focus, d.focus), sessionTypes: cleanList(l.sessionTypes, d.sessionTypes) };
      } catch (e) { return JSON.parse(JSON.stringify(d)); }
    },
    setLists(l) { localStorage.setItem(KEY_LISTS, JSON.stringify(l)); },
  };
  function cleanList(v, dflt) { return Array.isArray(v) && v.length ? v.map(String) : dflt.slice(); }

  function indexEntry(p) {
    const c = C.calcPlayer(p);
    return {
      id: p.id, name: p.profile.name, position: p.profile.position, injury: p.profile.injury, injuryDate: p.profile.injuryDate,
      availability: c.status.latest ? c.status.availability : "",
      regions: c.ticked.map((r) => ({ r, phase: c.regions[r].currentPhase, cleared: c.regions[r].clearedText })),
      updated: p.updated,
    };
  }

  // ================================================================== state
  let route = parseHash();
  let player = null;
  let lists = store.getLists();
  const ui = { saveStatus: "", editSlots: {} };

  function parseHash() {
    const h = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    if (h[0] === "settings") return { page: "settings" };
    if (h[0] === "p" && h[1]) return { page: "player", id: h[1], tab: h[2] || "dashboard" };
    return { page: "library" };
  }
  const TABS = [["dashboard", "Dashboard"], ["profile", "Athlete Profile"], ["status", "Status Log"]]
    .concat(C.REGIONS.map((r) => [slug(r), C.regionTitle(r)])).concat([["gps", "GPS"]]);
  function slug(region) { return region.toLowerCase(); }
  function regionFromTab(tab) { return C.REGIONS.find((r) => slug(r) === tab) || null; }
  function go(hash) { if (location.hash === hash) onRoute(); else location.hash = hash; }

  // ================================================================== helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function setPath(obj, path, val) {
    const keys = path.split(".");
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    target[last] = val;
  }
  const isNum = C.isNum;
  const num = (v) => (isNum(v) ? C.fmtNum(v) : "");
  function statusClass(s) {
    const t = String(s || "").toUpperCase().trim();
    if (["READY", "COMPLETE", "MET", "Y"].indexOf(t) >= 0) return "good";
    if (t === "IN PROGRESS") return "warn";
    if (["NOT READY", "NOT STARTED", "BELOW", "N", "NOT MET"].indexOf(t) >= 0) return "bad";
    return "";
  }
  function availClass(s) {
    const t = String(s || "").toLowerCase();
    if (t.indexOf("unavailable") >= 0) return "bad";
    if (t.indexOf("available for selection") >= 0) return "good";
    if (t.indexOf("modified") >= 0 || t.indexOf("not available") >= 0) return "warn";
    return "";
  }
  function ratioClass(v, good, warn) {
    if (!isNum(v)) return "";
    return v >= good ? "good" : v >= warn ? "warn" : "bad";
  }
  function lsiClass(v) { const t = player.settings.lsiTarget; const g = isNum(t) ? t : 0.9; return ratioClass(v, g, g - 0.1); }
  function deltaClass(t) { return t.charAt(0) === "+" ? "up" : t.charAt(0) === "-" ? "down" : ""; }

  // ---- input builders (data-bind = path inside the player; "@lists." = app lists)
  function inText(path, value, o = {}) {
    return `<input class="in ${o.cls || ""}" type="text" data-bind="${path}" data-kind="text" value="${esc(value)}"` +
      `${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.label ? ` aria-label="${esc(o.label)}"` : ""} autocomplete="off">`;
  }
  function inNum(path, value, o = {}) {
    return `<input class="in num ${o.cls || ""}" type="text" inputmode="decimal" pattern="\\s*[\\-+]?[0-9]*[.,]?[0-9]*\\s*" data-bind="${path}" data-kind="num" value="${esc(num(value))}"` +
      `${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.label ? ` aria-label="${esc(o.label)}"` : ""}${o.disabled ? " disabled" : ""} autocomplete="off">`;
  }
  function inPct(path, value, o = {}) {
    const v = isNum(value) ? C.fmtNum(value * 100) : "";
    return `<span class="pct-wrap"><input class="in num ${o.cls || ""}" type="text" inputmode="decimal" pattern="\\s*[0-9]*[.,]?[0-9]*\\s*" data-bind="${path}" data-kind="pct" value="${esc(v)}"${o.label ? ` aria-label="${esc(o.label)}"` : ""} autocomplete="off"><span>%</span></span>`;
  }
  function inDate(path, value, o = {}) {
    return `<input class="in date ${o.cls || ""}" type="date" data-bind="${path}" data-kind="date" value="${esc(value || "")}"${o.label ? ` aria-label="${esc(o.label)}"` : ""}>`;
  }
  function inArea(path, value, o = {}) {
    return `<textarea class="in area ${o.cls || ""}" data-bind="${path}" data-kind="${o.kind || "text"}" rows="${o.rows || 4}"${o.label ? ` aria-label="${esc(o.label)}"` : ""}>${esc(value)}</textarea>`;
  }
  // options: array of strings | {v, t} | {group, items}
  function inSel(path, value, options, o = {}) {
    const val = value == null ? "" : String(value);
    let found = false;
    const opt = (x) => {
      const v = typeof x === "object" ? String(x.v) : String(x), t = typeof x === "object" ? x.t : x;
      if (v === val) found = true;
      return `<option value="${esc(v)}"${v === val ? " selected" : ""}>${esc(t)}</option>`;
    };
    let body = options.map((x) => (x && x.group ? `<optgroup label="${esc(x.group)}">${x.items.map(opt).join("")}</optgroup>` : opt(x))).join("");
    if (!found && val !== "") body += `<option value="${esc(val)}" selected>${esc(val)}</option>`;
    return `<select class="in sel ${o.cls || ""}" data-bind="${path}" data-kind="${o.kind || "sel"}"${o.label ? ` aria-label="${esc(o.label)}"` : ""}>${body}</select>`;
  }
  function inCheck(path, checked, o = {}) {
    return `<input type="checkbox" class="${o.cls || ""}" data-bind="${path}" data-kind="check"${checked ? " checked" : ""}${o.label ? ` aria-label="${esc(o.label)}"` : ""}>`;
  }
  function btn(act, label, o = {}) {
    const data = Object.keys(o.data || {}).map((k) => ` data-${k}="${esc(o.data[k])}"`).join("");
    return `<button type="button" class="btn ${o.cls || ""}" data-act="${act}"${data}${o.title ? ` title="${esc(o.title)}" aria-label="${esc(o.title)}"` : ""}>${label}</button>`;
  }

  // ================================================================== charts (inline SVG, no libraries)
  const SERIES = ["#2F5DAD", "#B98A00", "#C8453F", "#228B6B", "#8A5BB8", "#D9731A", "#2A9DB8", "#A0522D"];
  const SHAPES = ["circle", "triangle", "square", "diamond", "x", "tdown", "plus", "bar"];
  function markerSvg(shape, cx, cy, r, color) {
    const x = Math.round(cx * 10) / 10, y = Math.round(cy * 10) / 10;
    const f = `fill="${color}" stroke="#fff" stroke-width="1.5"`;
    const sk = `stroke="${color}" stroke-width="2.5" stroke-linecap="round" fill="none"`;
    switch (shape) {
      case "triangle": return `<path d="M${x},${y - r * 1.15}L${x + r},${y + r * 0.75}L${x - r},${y + r * 0.75}Z" ${f}/>`;
      case "tdown": return `<path d="M${x},${y + r * 1.15}L${x + r},${y - r * 0.75}L${x - r},${y - r * 0.75}Z" ${f}/>`;
      case "square": return `<rect x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" ${f}/>`;
      case "diamond": return `<path d="M${x},${y - r * 1.2}L${x + r * 1.2},${y}L${x},${y + r * 1.2}L${x - r * 1.2},${y}Z" ${f}/>`;
      case "x": return `<path d="M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}" ${sk}/>`;
      case "plus": return `<path d="M${x - r * 1.1},${y}L${x + r * 1.1},${y}M${x},${y - r * 1.1}L${x},${y + r * 1.1}" ${sk}/>`;
      case "bar": return `<rect x="${x - r * 1.2}" y="${y - r * 0.5}" width="${r * 2.4}" height="${r}" ${f}/>`;
      default: return `<circle cx="${x}" cy="${y}" r="${r}" ${f}/>`;
    }
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function fmtAxis(v, kind) {
    if (kind === "pct") return Math.round(v * 100) + "%";
    if (kind === "dec") return (Math.round(v * 100) / 100).toString();
    return C.fmtInt(v);
  }
  // series: [{name, points:[[x, y|null]]}]; kind: pct | int | dec
  function chart(o) {
    const series = o.series || [];
    const pts = [];
    series.forEach((s) => s.points.forEach((p) => { if (p[1] != null) pts.push(p); }));
    const head = `<figcaption>${o.titleHtml || esc(o.title)}</figcaption>`;
    if (!pts.length) return `<figure class="chart">${head}<div class="chart-empty">${esc(o.empty || "No data yet")}</div></figure>`;
    const W = 560, H = o.height || 250, m = { l: 50, r: 16, t: 14, b: 40 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    let xMin = 0, xMax, xStep;
    if (o.xAuto) {
      const lo = Math.min(...pts.map((p) => p[0])), hiX = Math.max(...pts.map((p) => p[0]));
      xStep = niceStep(Math.max(hiX - lo, 0.5) / 6);
      xMin = Math.floor((lo - xStep * 0.25) / xStep) * xStep;
      xMax = Math.ceil((hiX + xStep * 0.25) / xStep) * xStep;
    } else {
      const xMaxData = Math.max(1, ...pts.map((p) => p[0]));
      xStep = Math.max(1, Math.ceil(niceStep(xMaxData / 8)));
      xMax = Math.ceil((xMaxData + 0.5) / xStep) * xStep;
    }
    let lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
    if (isNum(o.target)) { lo = Math.min(lo, o.target); hi = Math.max(hi, o.target); }
    if (o.zero) lo = Math.min(0, lo);
    if (isNum(o.yMin)) lo = Math.min(o.yMin, lo);
    if (hi === lo) hi = lo + (o.kind === "pct" ? 0.1 : 1);
    const yStep = niceStep((hi - lo) / 5);
    const y0 = Math.floor(lo / yStep) * yStep, y1 = Math.ceil(hi / yStep - 1e-9) * yStep + (o.kind === "pct" ? 0 : 0);
    const X = (x) => m.l + ((x - xMin) / (xMax - xMin)) * iw;
    const Y = (y) => m.t + ih - ((y - y0) / (y1 - y0)) * ih;
    let g = "";
    for (let v = y0; v <= y1 + yStep / 1e6; v += yStep) {
      const yy = Y(v).toFixed(1);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}" class="grid"/><text x="${m.l - 6}" y="${yy}" class="ytick">${esc(fmtAxis(v, o.kind))}</text>`;
    }
    for (let v = xMin; v <= xMax + xStep / 1e6; v += xStep) {
      g += `<text x="${X(v).toFixed(1)}" y="${m.t + ih + 16}" class="xtick">${Math.round(v * 100) / 100}</text>`;
    }
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" class="axis"/>`;
    g += `<text x="${m.l + iw / 2}" y="${H - 4}" class="xtitle">${esc(o.xTitle || "Rehab week")}</text>`;
    if (isNum(o.target)) {
      const ty = Y(o.target).toFixed(1);
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${ty}" y2="${ty}" class="target"/><text x="${m.l + 4}" y="${ty - 5}" class="tlabel">${esc(o.targetLabel || "target " + fmtAxis(o.target, o.kind))}</text>`;
    }
    let marks = "", hits = "";
    series.forEach((s, si) => {
      const color = SERIES[si % SERIES.length], shape = SHAPES[si % SHAPES.length];
      let d = "", pen = false;
      s.points.forEach((p) => {
        if (p[1] == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`;
        pen = true;
      });
      marks += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
      s.points.forEach((p) => {
        if (p[1] == null) return;
        const x = X(p[0]), y = Y(p[1]);
        marks += markerSvg(shape, x, y, 4.5, color);
        hits += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" class="hit" data-tip="${esc(`${s.name} · ${o.xTip ? o.xTip(p[0]) : "wk " + p[0]} · ${o.fmtTip ? o.fmtTip(p[1]) : fmtAxis(p[1], o.kind)}`)}"/>`;
      });
    });
    const legend = series.length > 1 || o.legend ? `<div class="legend">${series.map((s, si) =>
      `<span><svg width="22" height="12" aria-hidden="true"><line x1="0" x2="22" y1="6" y2="6" stroke="${SERIES[si % SERIES.length]}" stroke-width="2"/>${markerSvg(SHAPES[si % SHAPES.length], 11, 6, 3.6, SERIES[si % SERIES.length])}</svg>${esc(s.name)}</span>`).join("")}</div>` : "";
    return `<figure class="chart">${head}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "")}">${g}${marks}${hits}</svg>${legend}</figure>`;
  }

  // ================================================================== render: shell
  function render() {
    const app = document.getElementById("app");
    const tpl = document.createElement("template");
    tpl.innerHTML = renderShell();
    morphChildren(app, tpl.content);
  }

  const BRAND = `<a class="brand" href="#/" aria-label="Rehab Dashboard home"><img class="mark" src="icons/icon-192.png" alt="">` +
    `<span class="brand-txt"><span class="brand-top">Leeds United Academy</span><span class="brand-main">Rehab<b>Dashboard</b></span></span></a>`;
  const FOOT = `<footer class="foot"><span>Marching on Together</span><i></i><span>Leeds United Academy · Sports Medicine</span></footer>`;

  function renderShell() {
    if (route.page === "player" && player) {
      const tabs = TABS.map(([k, t]) => {
        const reg = regionFromTab(k);
        const dot = reg && player.settings.ticks[reg] ? `<i class="dot" title="Shown on dashboard"></i>` : "";
        return `<a href="#/p/${encodeURIComponent(player.id)}/${k}" class="tab${route.tab === k ? " on" : ""}"${route.tab === k ? ' aria-current="page"' : ""}>${esc(t)}${dot}</a>`;
      }).join("");
      return `<header class="toolbar">
        ${BRAND}
        <span class="who">${esc(player.profile.name || "Unnamed player")}</span>
        <span class="save" id="saveStatus">${esc(ui.saveStatus)}</span>
        <span class="spacer"></span>
        <a class="btn ghost" href="#/">← Players</a>
        ${btn("print", "Print / PDF", { cls: "ghost" })}
        ${btn("exportPlayer", "Export", { cls: "ghost", title: "Download this player's data as a backup file" })}
      </header>
      <nav class="tabs" aria-label="Sections">${tabs}</nav>
      <main class="page">${renderTab()}</main>${FOOT}`;
    }
    if (route.page === "settings") {
      return `<header class="toolbar">${BRAND}<span class="spacer"></span><a class="btn ghost" href="#/">← Players</a></header>
        <main class="page narrow">${renderSettings()}</main>${FOOT}`;
    }
    return `<header class="toolbar">${BRAND}<span class="spacer"></span>
      <a class="btn ghost" href="#/settings">Settings</a></header>
      <main class="page narrow">${renderLibrary()}</main>${FOOT}`;
  }

  function renderTab() {
    const tab = route.tab;
    const calc = C.calcPlayer(player);
    if (tab === "status") return renderStatusLog(calc);
    if (tab === "profile") return renderAthlete(calc);
    if (tab === "gps") return renderGps(calc);
    const reg = regionFromTab(tab);
    if (reg) return renderRegion(reg, calc);
    return renderDashboard(calc);
  }

  // ================================================================== library
  function renderLibrary() {
    const idx = store.getIndex();
    const today = C.todayNum();
    const cards = idx.map((e) => {
      const inj = C.dnum(e.injuryDate);
      const wk = inj == null ? null : Math.floor((today - inj) / 7) + 1;
      const meta = [e.position, e.injury].filter(Boolean).map(esc).join(" · ");
      const regs = (e.regions || []).map((r) => `<span class="pill">${esc(C.regionTitle(r.r))} · ${esc(r.phase)} <em>${esc(r.cleared)}</em></span>`).join("");
      return `<article class="pcard" data-key="${esc(e.id)}">
        <a class="pcard-main" href="#/p/${encodeURIComponent(e.id)}/dashboard">
          <div class="pname">${esc(e.name || "Unnamed player")}</div>
          ${meta ? `<div class="pmeta">${meta}</div>` : ""}
          <div class="pmeta">${inj == null ? "No injury date" : `Injured ${esc(C.fmtDate(e.injuryDate, true))} · week ${wk} of rehab`}</div>
          <div class="pfoot">${e.availability ? `<span class="badge ${availClass(e.availability)}">${esc(e.availability)}</span>` : `<span class="badge">No status yet</span>`}${regs}</div>
        </a>
        ${btn("deletePlayer", "Delete", { cls: "link danger", data: { id: e.id, name: e.name || "Unnamed player" } })}
      </article>`;
    }).join("");
    return `<section class="hero">
        <div class="hero-txt"><span class="hero-kicker">Leeds United Academy · Sports Medicine</span>
          <h1>Rehab <span>Dashboard</span></h1>
          <span class="hero-tag">Marching on Together · Est. 1919</span></div>
      </section>
      <div class="lib-head"><h2 class="sec-h">Players</h2><p class="sub">Saved privately on this device. Nothing is uploaded or shared.</p></div>
      ${btn("newPlayer", "+ New player", { cls: "primary big" })}
      <div class="plist">${cards || `<div class="empty"><div class="empty-ico">＋</div><h2>No players yet</h2><p>Add a player, or load the worked example from the spreadsheet to see how everything fits together.</p></div>`}</div>
      <div class="lib-tools">
        ${btn("loadExample", "Load example player")}
        ${btn("exportAll", "Back up all players")}
        ${btn("importFile", "Restore from backup")}
      </div>
      <p class="fine">Your data lives only in this browser on this device. Use <b>Back up all players</b> regularly and keep the file somewhere safe. Clearing your browser data deletes it, and other devices can't see it. To move players to another device, restore the backup file there.</p>`;
  }

  // ================================================================== settings (dropdown lists)
  function renderSettings() {
    return `<div class="lib-head"><h1>Settings</h1><p class="sub">Dropdown lists shared by every player on this device</p></div>
      <section class="card">
        <h2 class="ttl">Dropdown lists</h2>
        <p class="fine">One item per line. You can reword items, but keep the order. The dashboard treats a focus starting with “Pitch” as running volume. It colours availability that mentions “Unavailable” red, “Modified” or “not available” amber, and “Available for selection” green.</p>
        <div class="grid-3">
          <label class="field"><span>Availability</span>${inArea("@lists.availability", lists.availability.join("\n"), { kind: "lines", rows: 6 })}</label>
          <label class="field"><span>Current focus (base)</span>${inArea("@lists.focus", lists.focus.join("\n"), { kind: "lines", rows: 6 })}</label>
          <label class="field"><span>GPS session types</span>${inArea("@lists.sessionTypes", lists.sessionTypes.join("\n"), { kind: "lines", rows: 6 })}</label>
        </div>
        <div class="row-actions">${btn("resetLists", "Reset lists to defaults")}</div>
      </section>
      <section class="card">
        <h2 class="ttl">Data on this device</h2>
        <p class="fine">${store.getIndex().length} player(s) stored in this browser. Nothing leaves the device unless you export a backup file yourself.</p>
        <div class="row-actions">${btn("exportAll", "Back up all players")}${btn("importFile", "Restore from backup")}${btn("eraseAll", "Erase all data on this device", { cls: "danger" })}</div>
      </section>
      <p class="fine center">Rehab Dashboard v${APP_VERSION} · works offline once loaded · install it from your browser's “Add to Home Screen” / “Install app” menu</p>`;
  }

  // ================================================================== dashboard
  function tile(label, inner, o = {}) {
    return `<div class="tile ${o.cls || ""}"><span class="tlbl">${esc(label)}</span>${inner}${o.hint ? `<span class="thint">${esc(o.hint)}</span>` : ""}</div>`;
  }
  const out = (v, cls) => `<div class="out ${cls || ""}">${v === "" || v == null ? "&nbsp;" : esc(v)}</div>`;

  function renderDashboard(calc) {
    const p = player, pr = p.profile, st = calc.status;
    const tgt = isNum(p.settings.lsiTarget) ? p.settings.lsiTarget : 0.9;
    const gr = calc.growth;
    const unit = (v, f, u) => (v == null ? "" : f(v) + (u ? (u === "%" ? "" : " ") + u : ""));
    const profile = `<div class="profile-grid">
      <section class="card">
        <h2 class="ttl">Player & injury</h2>
        <div class="tiles">
          ${tile("Player", inText("profile.name", pr.name, { ph: "Name", label: "Player" }), { cls: "w2" })}
          ${tile("Position · squad", inText("profile.position", pr.position, { ph: "e.g. CM · U16", label: "Position and squad" }))}
          ${tile("Injury / diagnosis", inText("profile.injury", pr.injury, { ph: "e.g. L ACL reconstruction", label: "Injury or diagnosis" }), { cls: "w2" })}
          ${tile("Injured side", inSel("profile.side", pr.side, [{ v: "", t: "—" }, "L", "R"], { label: "Injured side" }))}
          ${tile("Injury date", inDate("profile.injuryDate", pr.injuryDate, { label: "Injury date" }))}
          ${tile("Week of rehab", out(calc.weekOfRehab, "big"), { cls: "hi" })}
          ${tile("Days post injury", out(calc.daysPost))}
          ${tile("Expected RTP", inDate("profile.rtpDate", pr.rtpDate, { label: "Expected return to play" }), { hint: calc.weeksToRtp == null ? "" : calc.weeksToRtp >= 0 ? `${calc.weeksToRtp} wks to go` : `${-calc.weeksToRtp} wks past` })}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="ttl">Athlete profile</h2><a class="btn" href="#/p/${encodeURIComponent(p.id)}/profile">Update measurements →</a></div>
        <div class="tiles">
          ${tile("DOB", inDate("profile.dob", pr.dob, { label: "Date of birth" }))}
          ${tile("Age (yrs)", out(C.fmt1(calc.age)))}
          ${tile("Age at injury", out(C.fmt1(calc.ageAtInjury)))}
          ${tile("Height", out(unit(gr.height, C.fmt1, "cm")))}
          ${tile("Body mass", out(unit(gr.mass, C.fmt1, "kg")))}
          ${tile("Predicted adult ht", out(unit(gr.predicted, C.fmt1, "cm")))}
          ${tile("% PAH", out(unit(gr.pctPah, C.fmt1, "%")))}
          ${tile("Mat. offset", out(gr.matOffset == null ? "" : C.fmtSigned(gr.matOffset, 1)))}
          ${tile("Maturity", out(calc.maturity), { cls: "hi2" })}
          ${tile("Last measured", out(C.fmtDate(gr.measuredOn, true)))}
        </div>
        <p class="fine">Latest values from the Athlete Profile tab. Maturity uses % predicted adult height if available (&lt;85% pre · 85–95% circa · &gt;95% post), otherwise maturity offset (&lt; −1 pre · −1 to +1 circa · &gt; +1 post).</p>
      </section>
    </div>`;

    const since = st.baseSince == null ? "Set availability and focus on the Status Log tab (newest entry by date drives this headline)."
      : `In current focus since ${C.fmtDate(st.baseSince)}${st.baseSinceWk == null ? "" : ` (wk ${st.baseSinceWk})`}   ·   set on the Status Log tab`;
    const chips = st.chips.map((c) => `<div class="chip${c.active ? " on" : ""}"><div class="chip-n">${esc(c.name)}</div><div class="chip-v">${esc(c.value) || "&nbsp;"}</div><div class="chip-s">${esc(c.sinceText)}</div></div>`).join("");
    const hist = st.history.length ? st.history.map((h) => `<div class="hist"><div class="hist-d">${esc(h.label)}</div><div class="hist-h">${esc(h.headline)}</div><div class="hist-a">${esc(h.avail)}</div></div>`).join("")
      : `<p class="fine">No Status Log entries yet.</p>`;
    const status = `<section class="card">
      <h2 class="ttl">Current status</h2>
      <div class="status-row">
        <div class="status-box"><span class="tlbl">Availability</span><div class="avail ${availClass(st.availability)}">${esc(st.availability)}</div></div>
        <div class="status-box wide"><span class="tlbl">Current focus</span><div class="focus">${esc(st.headline)}</div></div>
      </div>
      <p class="fine">${esc(since)} <a href="#/p/${encodeURIComponent(p.id)}/status" class="inline">Open Status Log →</a></p>
      <div class="tlbl sp">Pitch exposure   ·   ${esc(st.gpsWeekText ? st.gpsWeekText.toUpperCase() : "NO GPS SESSIONS LOGGED YET")}</div>
      <div class="chips">${chips}</div>
      <div class="tlbl sp">Stage history   ·   last six Status Log entries, oldest → newest</div>
      <div class="hists">${hist}</div>
    </section>`;

    const ticks = C.REGIONS.map((r) => `<label class="tick">${inCheck(`settings.ticks.${r}`, !!p.settings.ticks[r], { label: `Show ${r}` })}<span>${esc(C.regionTitle(r))}</span></label>`).join("");
    const regionsCard = `<section class="card">
      <h2 class="ttl">Regions shown on this dashboard</h2>
      <div class="ticks-row"><div class="ticks">${ticks}</div>
        <div class="tick-opts">
          ${tile("LSI target", inPct("settings.lsiTarget", p.settings.lsiTarget, { label: "LSI target" }))}
          ${tile("Charts show", inSel("settings.chartRegion", p.settings.chartRegion, [{ v: "", t: "First ticked region" }].concat(C.REGIONS.map((r) => ({ v: r, t: C.regionTitle(r) }))), { label: "Region shown in progression charts" }), { cls: "w2" })}
        </div></div>
      <p class="fine">Tick the regions relevant to this player. Only ticked regions appear below, stacked in this order. “Charts show” picks the region the progression charts plot.</p>
    </section>`;

    const open = calc.ticked.map((r) => {
      const rc = calc.regions[r];
      return `<tr><td><a href="#/p/${encodeURIComponent(p.id)}/${slug(r)}" class="inline b">${esc(C.regionTitle(r))}</a></td><td class="blue">${esc(rc.currentPhase)}</td><td class="c">${esc(rc.clearedText)}</td><td>${esc(rc.openText)}</td></tr>`;
    }).join("");
    const openCard = `<section class="card">
      <h2 class="ttl">What's open — criteria still to meet for the current phase</h2>
      ${calc.ticked.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Region</th><th>Current phase</th><th class="c">Cleared</th><th>Open criteria</th></tr></thead><tbody>${open}</tbody></table></div>`
        : `<p class="fine">Tick at least one region above.</p>`}
    </section>`;

    const hideEmpty = !!p.settings.hideEmpty;
    const latestRows = calc.ticked.map((r) => {
      const rc = calc.regions[r];
      let rows = rc.list;
      if (hideEmpty) rows = rows.filter((s) => s.l != null || s.r != null);
      let lastBlock = null;
      const body = rows.map((s) => {
        const first = s.block !== lastBlock;
        lastBlock = s.block;
        const empty = s.l == null && s.r == null;
        return `<tr class="${empty ? "muted" : ""}"><td class="blk">${first ? esc(s.blockLabel) : ""}</td><td>${esc(s.name)}</td><td class="c">${esc(num(s.l))}</td><td class="c">${s.bilateral ? "" : esc(num(s.r))}</td>` +
          `<td class="c b ${lsiClass(s.lsi)}">${esc(C.fmtPct(s.lsi))}</td><td class="c ${deltaClass(s.deltaText)}">${esc(s.deltaText)}</td><td class="c mute">${esc(C.fmtDate(s.date))}</td></tr>`;
      }).join("");
      return `<tr class="band"><td>${esc(r.toUpperCase())}</td><td colspan="5">${esc(rc.currentPhase)}  ·  ${esc(rc.clearedText)}</td><td class="c">${esc(C.fmtDate(rc.lastTest))}</td></tr>${body}`;
    }).join("");
    const latestCard = `<section class="card">
      <div class="card-head"><h2 class="ttl">Latest tests   ·   ticked regions</h2>
        <label class="tick small">${inCheck("settings.hideEmpty", hideEmpty, { label: "Hide tests with no data" })}<span>Hide tests with no data</span></label></div>
      ${calc.ticked.length ? `<div class="scroll"><table class="tbl latest"><thead><tr><th>Block</th><th>Test</th><th class="c">L / score</th><th class="c">R</th><th class="c">LSI</th><th class="c">Δ prev</th><th class="c">Date</th></tr></thead><tbody>${latestRows}</tbody></table></div>`
        : `<p class="fine">Tick at least one region above.</p>`}
    </section>`;

    const gps = calc.gps, base = p.gps.baseline;
    const gcols = C.GPS_METRICS;
    const fmtG = (m, v) => (m.key === "top" ? C.fmt1(v) : C.fmtInt(v));
    const grow = (label, cells) => `<tr><th class="rowh">${esc(label)}</th>${cells}</tr>`;
    const gpsTable = `<table class="tbl gps-mini"><thead><tr><th></th>${gcols.map((m) => `<th class="c">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>
      ${grow("Pre-injury baseline", gcols.map((m) => `<td class="c">${esc(fmtG(m, base[m.key]))}</td>`).join(""))}
      ${grow(`Latest week${gps.latestWeek ? ` (wk ${gps.latestWeek})` : ""}`, gcols.map((m) => `<td class="c">${gps.latest ? esc(fmtG(m, gps.latest[m.key])) : ""}</td>`).join(""))}
      ${grow("% of baseline", gcols.map((m) => `<td class="c b ${ratioClass(gps.latestRatio[m.key], 1, 0.8)}">${esc(C.fmtPct(gps.latestRatio[m.key]))}</td>`).join(""))}
      ${grow("Best week to date", gcols.map((m) => `<td class="c">${esc(fmtG(m, gps.best[m.key]))}</td>`).join(""))}
    </tbody></table>`;
    const gpsCard = `<section class="card">
      <h2 class="ttl">GPS   ·   weekly pitch load</h2>
      <div class="scroll">${gpsTable}</div>
      <p class="fine">Speeds in m/s. Criteria, baseline and the session log are on the <a class="inline" href="#/p/${encodeURIComponent(p.id)}/gps">GPS tab</a>. GPS return-to-sport criteria: <b>${gps.yCount} / 6</b> · <span class="badge ${statusClass(gps.rtsStatus)}">${esc(gps.rtsStatus)}</span></p>
      ${chart({ title: "Weekly total distance (m)", kind: "int", zero: true, series: [{ name: "TD (m)", points: gps.weeks.map((w) => [w.wk, w.n ? w.td : 0]) }], empty: "No GPS sessions logged yet", fmtTip: (v) => C.fmtInt(v) + " m" })}
    </section>`;

    const chRegion = calc.regions[calc.chartRegion];
    const prog = C.BLOCKS.map((b) => chart({
      title: `${b.label} — LSI`, kind: "pct", yMin: 0.4, target: tgt,
      series: C.lsiSeries(chRegion, b.key), empty: "No LSI values yet",
    })).join("");
    const progCard = `<section class="card">
      <h2 class="ttl">Progression   ·   LSI by rehab week   ·   ${esc(C.regionTitle(calc.chartRegion))}   (target ${esc(C.fmtPct(tgt))})</h2>
      <div class="charts">${prog}</div>
    </section>`;

    const glance = C.REGIONS.map((r) => {
      const rc = calc.regions[r];
      return `<tr><td class="b"><a class="inline" href="#/p/${encodeURIComponent(p.id)}/${slug(r)}">${esc(C.regionTitle(r))}</a></td><td>${esc(rc.currentPhase)}</td><td class="c">${esc(rc.clearedText)}</td><td class="c"><span class="badge ${statusClass(rc.status)}">${esc(rc.status)}</span></td><td class="c mute">${esc(C.fmtDate(rc.lastTest))}</td></tr>`;
    }).join("");
    const notes = ["Cream boxes are inputs. Everything else updates from the region tabs, the Status Log and the GPS tab.",
      "Status headline = newest Status Log entry. Pitch add-ons stack; chips light up when ticked and show the latest GPS week.",
      "Tick regions to show them; each region's tests stack under a blue band with its phase and cleared count.",
      "LSI = injured ÷ uninjured side (can exceed 100%). Δ prev = change since the previous test of that metric.",
      "Exit criteria evaluate live on each region tab; “What's open” lists what's left in the current phase.",
      "Data is saved automatically in this browser only. Back up regularly from the Players page."];
    const foot = `<div class="grid-2">
      <section class="card"><h2 class="ttl">All regions at a glance</h2><div class="scroll"><table class="tbl"><thead><tr><th>Region</th><th>Current phase</th><th class="c">Cleared</th><th class="c">Status</th><th class="c">Last test</th></tr></thead><tbody>${glance}</tbody></table></div></section>
      <section class="card"><h2 class="ttl">How it works</h2><ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>
    </div>
    <div class="row-actions end no-print">${btn("deleteCurrent", "Delete this player", { cls: "danger" })}</div>`;

    return `<div class="dash-head"><div class="dash-title"><span class="club">Leeds United Academy  ·  Sports Medicine</span><h1>Rehabilitation Dashboard</h1></div><span class="est">Est. 1919</span></div>
      ${profile}${status}${regionsCard}${openCard}
      <div class="grid-2 top">${latestCard}${gpsCard}</div>
      ${progCard}${foot}`;
  }

  // ================================================================== athlete profile (growth & maturation log)
  function renderAthlete(calc) {
    const p = player, pr = p.profile, gr = calc.growth;
    const f1 = (v, u) => (v == null ? "" : C.fmt1(v) + (u ? (u === "%" ? "" : " ") + u : ""));
    const matCls = (m) => (m === "Circa-PHV" ? "warn" : "");
    const rows = p.growth.map((g, i) => {
      const r = gr.rows[i], base = `growth.${i}`;
      return `<tr data-key="${esc(g.id)}">
        <td>${inDate(`${base}.date`, g.date, { label: "Measurement date" })}</td>
        <td class="calc c">${esc(C.fmt1(r.age))}</td>
        <td>${inNum(`${base}.height`, g.height, { label: "Height cm" })}</td>
        <td>${inNum(`${base}.sitting`, g.sitting, { label: "Sitting height cm" })}</td>
        <td class="calc c">${esc(C.fmt1(r.leg))}</td>
        <td>${inNum(`${base}.mass`, g.mass, { label: "Body mass kg" })}</td>
        <td>${inNum(`${base}.predicted`, g.predicted, { label: "Predicted adult height cm" })}</td>
        <td class="calc c b">${esc(f1(r.pctPah, "%"))}</td>
        <td>${inNum(`${base}.matOffset`, g.matOffset, { label: "Maturity offset" })}</td>
        <td class="calc c b ${matCls(r.maturity)}">${esc(r.maturity)}</td>
        <td class="calc c">${esc(f1(r.rate))}</td>
        <td>${inText(`${base}.notes`, g.notes, { cls: "notes", label: "Notes" })}</td>
        <td>${btn("delRow", "✕", { cls: "x", data: { path: "growth", idx: i }, title: "Delete measurement" })}</td>
      </tr>`;
    }).join("");
    const summary = `<section class="card">
      <h2 class="ttl">Current profile</h2>
      <div class="tiles">
        ${tile("Date of birth", inDate("profile.dob", pr.dob, { label: "Date of birth" }))}
        ${tile("Age (yrs)", out(C.fmt1(calc.age)))}
        ${tile("Height", out(f1(gr.height, "cm")))}
        ${tile("Sitting height", out(f1(gr.sitting, "cm")))}
        ${tile("Body mass", out(f1(gr.mass, "kg")))}
        ${tile("Predicted adult ht", out(f1(gr.predicted, "cm")))}
        ${tile("% PAH", out(f1(gr.pctPah, "%")))}
        ${tile("Mat. offset", out(gr.matOffset == null ? "" : C.fmtSigned(gr.matOffset, 1)))}
        ${tile("Maturity", out(calc.maturity), { cls: "hi2" })}
        ${tile("Growth rate", out(f1(gr.rate, "cm/yr")))}
      </div>
      <p class="fine">Each box shows the most recent value entered for that measure, and feeds the Dashboard automatically. Growth rate compares each height with the previous measurement (at least two weeks apart) and is shown in cm per year.</p>
    </section>`;
    const log = `<section class="card">
      <div class="card-head"><h2 class="ttl">Measurements log</h2>${btn("addGrowth", "+ Add measurement", { cls: "primary" })}</div>
      ${rows ? `<div class="scroll" data-scroll="growth"><table class="tbl entry"><thead><tr><th>Date</th><th class="c">Age</th><th class="c">Height (cm)</th><th class="c">Sitting ht (cm)</th><th class="c">Leg length (cm)</th><th class="c">Body mass (kg)</th><th class="c">Predicted adult ht (cm)</th><th class="c">% PAH</th><th class="c">Mat. offset</th><th class="c">Maturity</th><th class="c">Growth (cm/yr)</th><th>Notes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="fine">No measurements yet. Add the first one; new rows copy the previous predicted adult height.</p>`}
    </section>`;
    const noDob = "Add a date of birth to plot against age";
    const charts = `<section class="card">
      <h2 class="ttl">Growth charts</h2>
      <div class="charts">
        ${chart({ title: "Height (cm)", kind: "dec", xAuto: true, xTitle: "Age (years)", xTip: (x) => `age ${x.toFixed(1)}`, series: [{ name: "Height (cm)", points: gr.series("height") }], empty: pr.dob ? "No heights logged yet" : noDob, fmtTip: (v) => C.fmt1(v) + " cm" })}
        ${chart({ title: "Body mass (kg)", kind: "dec", xAuto: true, xTitle: "Age (years)", xTip: (x) => `age ${x.toFixed(1)}`, series: [{ name: "Body mass (kg)", points: gr.series("mass") }], empty: pr.dob ? "No body mass logged yet" : noDob, fmtTip: (v) => C.fmt1(v) + " kg" })}
        ${chart({ title: "% predicted adult height", kind: "dec", xAuto: true, xTitle: "Age (years)", xTip: (x) => `age ${x.toFixed(1)}`, target: 85, targetLabel: "85% (circa-PHV starts)", series: [{ name: "% PAH", points: gr.series(null, (r) => gr.rows[r.i].pctPah) }], empty: pr.dob ? "Needs height and predicted adult height" : noDob, fmtTip: (v) => C.fmt1(v) + "%" })}
      </div>
    </section>`;
    return `<div class="pg-head"><h1>Athlete Profile — growth & maturation</h1>
      <p class="fine">Log height, sitting height, body mass and predicted adult height whenever you measure. % PAH, maturity status and growth rate are calculated, and the latest values appear on the Dashboard.</p></div>
      ${summary}${log}${charts}`;
  }

  // ================================================================== status log
  function renderStatusLog() {
    const p = player, inj = p.profile.injuryDate;
    const rows = p.statusLog.map((e, i) => {
      const base = `statusLog.${i}`;
      const wk = C.weekOf(e.date, inj);
      return `<tr data-key="${esc(e.id)}">
        <td>${inDate(`${base}.date`, e.date, { label: "Date" })}</td>
        <td class="calc c">${wk == null ? "" : wk}</td>
        <td>${inSel(`${base}.avail`, e.avail, [""].concat(lists.availability), { cls: "avail-sel " + availClass(e.avail), label: "Availability" })}</td>
        <td>${inSel(`${base}.focus`, e.focus, [""].concat(lists.focus), { label: "Current focus" })}</td>
        ${C.ADDONS.map((a) => `<td class="c">${inCheck(`${base}.addons.${a.key}`, !!e.addons[a.key], { cls: "tickbox", label: a.label })}</td>`).join("")}
        <td class="calc headline">${esc(C.headline(e))}</td>
        <td>${inText(`${base}.notes`, e.notes, { label: "Notes" })}</td>
        <td>${btn("delRow", "✕", { cls: "x", data: { path: "statusLog", idx: i }, title: "Delete entry" })}</td>
      </tr>`;
    }).join("");
    return `<div class="pg-head"><h1>Status Log — availability & current focus</h1>
        <p class="fine">Add an entry whenever the player's availability or focus changes. The newest entry (by date) drives the Dashboard headline, and the list itself is the stage history. Pitch add-ons stack, so keep earlier ticks on as you add new ones. New entries copy the previous one.</p></div>
      <section class="card">
        <div class="card-head"><h2 class="ttl">Entries</h2>${btn("addStatus", "+ Add entry", { cls: "primary" })}</div>
        ${rows ? `<div class="scroll" data-scroll="status"><table class="tbl entry status-tbl"><thead><tr><th>Date</th><th class="c">Wk</th><th>Availability</th><th>Current focus (base)</th>${C.ADDONS.map((a) => `<th class="c rot">${esc(a.label)}</th>`).join("")}<th>Headline (auto)</th><th>Notes</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<p class="fine">No entries yet. Add the first one to set the dashboard headline.</p>`}
      </section>`;
  }

  // ================================================================== region tab
  function testOptions(reg) {
    const groups = [{ v: "", t: "" }, { v: C.MANUAL, t: C.MANUAL }, { group: "GPS (best week vs baseline)", items: C.GPS_LABELS }];
    C.BLOCKS.forEach((b) => {
      const items = reg.blocks[b.key].slots.filter((s) => !C.isSpare(s.name)).map((s) => s.name);
      if (items.length) groups.push({ group: b.label, items });
    });
    return groups;
  }

  function renderRegion(name, calc) {
    const p = player, reg = p.regions[name], rc = calc.regions[name], spec = C.REGION_SPEC[name];
    const base = `regions.${name}`;
    const opts = testOptions(reg);
    // ---- exit criteria
    const critRows = reg.criteria.map((c, j) => {
      const cc = rc.criteria[j], ph = Math.floor(j / C.CRIT_PER_PHASE), first = j % C.CRIT_PER_PHASE === 0;
      const cb = `${base}.criteria.${j}`;
      return `<tr class="${first ? "ph-first" : ""}">
        <td class="c mute">${j + 1}</td>
        ${first ? `<td rowspan="${C.CRIT_PER_PHASE}" class="phase-cell">${inText(`${base}.phases.${ph}`, reg.phases[ph], { cls: "b", label: `Phase ${ph + 1} name` })}</td>` : ""}
        <td>${inText(`${cb}.text`, c.text, { cls: "wide", label: "Criterion" })}</td>
        <td>${inSel(`${cb}.test`, c.test, opts, { cls: "test-sel", label: "Test" })}</td>
        <td>${inSel(`${cb}.measure`, c.measure, ["", "LSI", "Injured", "L", "R"], { cls: "meas", label: "Measure" })}</td>
        <td>${inSel(`${cb}.op`, c.op, ["≥", "≤"], { label: "Operator" })}</td>
        <td>${inNum(`${cb}.thr`, c.thr, { cls: "thr", label: "Threshold" })}</td>
        <td class="calc c b">${esc(cc.curText)}</td>
        <td class="calc c b ${statusClass(cc.auto)}">${esc(cc.auto)}</td>
        <td>${inSel(`${cb}.override`, c.override, ["", "Y", "N"], { cls: "ovr " + statusClass(c.override), label: "Override" })}</td>
        <td class="calc c b ${statusClass(cc.met)}">${esc(cc.met)}</td>
        <td class="calc c">${esc(C.fmtDate(cc.dateMet, true))}</td>
        <td>${inText(`${cb}.notes`, c.notes, { label: "Notes" })}</td>
      </tr>`;
    }).join("");
    const phaseRows = rc.phases.map((ph) => `<tr><td class="c mute">${ph.p + 1}</td><td class="b">${esc(ph.name)}</td><td class="c">${esc(ph.metText)}</td><td class="c b ${ph.cleared ? "good" : "bad"}">${ph.cleared ? "Y" : "N"}</td><td class="mute">${esc(ph.next)}</td></tr>`).join("");
    const critCard = `<section class="card">
      <h2 class="ttl">Phase progression — exit criteria</h2>
      <div class="strip">
        <div class="strip-box hi"><span class="tlbl">Current phase</span><div class="out big">${esc(rc.currentPhase)}</div></div>
        <div class="strip-box"><span class="tlbl">Phases cleared</span><div class="out">${esc(rc.clearedText)}</div></div>
        <div class="strip-box"><span class="tlbl">Status</span><div class="out"><span class="badge ${statusClass(rc.status)}">${esc(rc.status)}</span></div></div>
        <div class="strip-box grow"><span class="tlbl">Open now</span><div class="out sm">${esc(rc.openNow) || "&nbsp;"}</div></div>
      </div>
      <p class="fine">Live: pick test · measure · operator · threshold; use Override (Y/N) for manual items like pain or gait. LSI and GPS thresholds are decimals (0.9 = 90%). “Injured”, “L” or “R” compare the raw value (e.g. 120°).</p>
      <div class="scroll" data-scroll="crit"><table class="tbl entry crit">
        <thead><tr><th class="c">#</th><th>Phase</th><th>Criterion</th><th>Test</th><th>Measure</th><th>Op</th><th>Threshold</th><th class="c">Current</th><th class="c">Auto result</th><th class="c">Override</th><th class="c">Met?</th><th class="c">Date met</th><th>Notes</th></tr></thead>
        <tbody>${critRows}</tbody></table></div>
      <h3 class="sub-ttl">Phase status</h3>
      <div class="scroll"><table class="tbl"><thead><tr><th class="c">#</th><th>Phase</th><th class="c">Criteria met</th><th class="c">Cleared?</th><th>Next outstanding criterion</th></tr></thead><tbody>${phaseRows}</tbody></table></div>
    </section>`;

    // ---- test blocks
    const blocks = C.BLOCKS.map((b) => renderBlock(name, b, reg.blocks[b.key], rc.blocks[b.key], spec)).join("");

    // ---- progression charts (one chosen test per block, L vs R)
    const charts = C.BLOCKS.map((b) => {
      const bc = rc.blocks[b.key], blk = reg.blocks[b.key];
      const inUse = bc.slots.filter((s) => s.inUse);
      if (!inUse.length) return chart({ title: `${b.label}`, series: [], empty: "No tests in this block" });
      const key = `${name}_${b.key}`;
      let k = p.settings.chartSlot[key];
      if (!isNum(k) || C.isSpare(blk.slots[k] && blk.slots[k].name)) k = inUse[0].k;
      const sel = inSel(`settings.chartSlot.${key}`, k, inUse.map((s) => ({ v: s.k, t: s.name })), { kind: "selnum", cls: "chart-sel", label: `${b.label} chart test` });
      const s = blk.slots[k];
      return chart({ titleHtml: `<span>${esc(b.label)}:</span> ${sel}`, title: `${b.label}: ${s.name}`, kind: "dec", legend: true,
        series: C.slotSeries(rc, b.key, k), empty: "No dated results for this test yet (needs an injury date too)" });
    }).join("");
    const chartCard = `<section class="card">
      <h2 class="ttl">Progression — L vs R (or score for bilateral tests) against rehab week</h2>
      <div class="charts">${charts}</div>
      <p class="fine">Pick the test to plot in each chart. The Dashboard shows LSI over time for every test in use.</p>
    </section>`;

    return `<div class="pg-head"><h1>${esc(C.regionTitle(name))} — Rehabilitation Testing</h1><p class="fine">${esc(spec.focus)}</p></div>
      ${critCard}${blocks}${chartCard}`;
  }

  function renderBlock(region, b, blk, bc, spec) {
    const base = `regions.${region}.blocks.${b.key}`;
    const ukey = `${region}_${b.key}`;
    const show = bc.slots.filter((s) => s.inUse || blk.rows.some((r) => isNum(r.vals[s.k][0]) || isNum(r.vals[s.k][1])));
    const editing = !!ui.editSlots[ukey];
    const title = `${C.blockTitle(region, b.key)}`;
    const slotEditor = editing ? `<div class="slot-ed">
        <p class="fine">Rename a spare slot to start using it — it appears in the table, the Dashboard and the criteria Test list. Clear a name to retire a slot (its data is kept). Bilateral tests take one score (entered in L) and have no LSI.</p>
        <div class="slot-grid">${blk.slots.map((s, k) => `<div class="slot-row"><span class="mute">${k + 1}</span>
          ${inText(`${base}.slots.${k}.name`, C.isSpare(s.name) ? "" : s.name, { ph: C.SPARE, label: `Test slot ${k + 1}` })}
          <label class="tick small">${inCheck(`${base}.slots.${k}.bilateral`, !!s.bilateral, { label: "Bilateral" })}<span>Bilateral</span></label></div>`).join("")}</div>
      </div>` : "";
    let table;
    if (!show.length) {
      table = `<p class="fine">No tests set up in this block. Use “Edit tests” to name one.</p>`;
    } else {
      const head1 = show.map((s) => `<th colspan="3" class="c slot-h">${esc(s.name)}</th>`).join("");
      const head2 = show.map((s) => s.bilateral ? `<th class="c">Score</th><th class="c">—</th><th class="c">—</th>` : `<th class="c">L</th><th class="c">R</th><th class="c">LSI</th>`).join("");
      const rows = blk.rows.map((row, i) => {
        const rr = bc.rows[i];
        const cells = show.map((s) => {
          const vb = `${base}.rows.${i}.vals.${s.k}`;
          if (s.bilateral) return `<td>${inNum(`${vb}.0`, row.vals[s.k][0], { label: `${s.name} score` })}</td><td class="grey"></td><td class="grey"></td>`;
          return `<td>${inNum(`${vb}.0`, row.vals[s.k][0], { label: `${s.name} L` })}</td><td>${inNum(`${vb}.1`, row.vals[s.k][1], { label: `${s.name} R` })}</td><td class="calc c ${lsiClass(rr.lsi[s.k])}">${esc(C.fmtPct(rr.lsi[s.k]))}</td>`;
        }).join("");
        return `<tr data-key="${esc(row.id)}"><td class="sticky">${inDate(`${base}.rows.${i}.date`, row.date, { label: "Test date" })}</td><td class="calc c">${rr.wk == null ? "" : rr.wk}</td>${cells}<td>${inText(`${base}.rows.${i}.notes`, row.notes, { cls: "notes", label: "Notes" })}</td><td>${btn("delRow", "✕", { cls: "x", data: { path: `${base}.rows`, idx: i }, title: "Delete row" })}</td></tr>`;
      }).join("");
      const latest = show.map((s) => s.bilateral ? `<td class="c b">${esc(num(s.l))}</td><td class="grey"></td><td class="grey"></td>`
        : `<td class="c b">${esc(num(s.l))}</td><td class="c b">${esc(num(s.r))}</td><td class="c b ${lsiClass(s.lsi)}">${esc(C.fmtPct(s.lsi))}</td>`).join("");
      const dates = show.map((s) => `<td colspan="3" class="c">${esc(C.fmtDate(s.date, true))}${s.deltaText ? ` <span class="${deltaClass(s.deltaText)}">(${esc(s.deltaText)})</span>` : ""}</td>`).join("");
      table = `<div class="scroll" data-scroll="${esc(ukey)}"><table class="tbl entry data">
        <thead><tr><th rowspan="2" class="sticky">Date</th><th rowspan="2" class="c">Wk</th>${head1}<th rowspan="2">Notes</th><th rowspan="2"></th></tr><tr>${head2}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${show.length * 3 + 4}" class="fine">No results yet — add a test date.</td></tr>`}</tbody>
        <tfoot><tr class="latest-row"><td class="sticky b">Latest</td><td></td>${latest}<td class="fine">Most recent entry by date, per column</td><td></td></tr>
        <tr><td class="sticky mute">Date of latest</td><td></td>${dates}<td></td><td></td></tr></tfoot>
      </table></div>`;
    }
    return `<section class="card">
      <div class="card-head"><h2 class="ttl">${esc(title)} <span class="ttl-hint">— ${esc(b.hint)}</span></h2>
        <div class="row-actions">${btn("toggleSlots", editing ? "Done" : "Edit tests", { data: { key: ukey } })}${btn("addRow", "+ Add test date", { cls: "primary", data: { region, block: b.key } })}</div></div>
      ${slotEditor}${table}
    </section>`;
  }

  // ================================================================== GPS
  function renderGps(calc) {
    const p = player, g = p.gps, gc = calc.gps, inj = p.profile.injuryDate;
    const crit = C.GPS_RTS.map((c, i) => {
      const cb = `gps.criteria.${i}`, m = C.GPS_METRICS[i];
      return `<tr><td class="c mute">${i + 1}</td><td class="b">${esc(c.measure)}</td><td>${inText(`${cb}.goal`, g.criteria[i].goal, { label: "Goal" })}</td>
        <td>${inSel(`${cb}.achieved`, g.criteria[i].achieved, ["", "Y", "N"], { cls: "ovr " + statusClass(g.criteria[i].achieved), label: "Achieved" })}</td>
        <td class="calc c b ${ratioClass(gc.bestRatio[m.key], 1, 0.8)}">${esc(C.fmtPct(gc.bestRatio[m.key]))}</td>
        <td>${inDate(`${cb}.dateMet`, g.criteria[i].dateMet, { label: "Date met" })}</td><td>${inText(`${cb}.notes`, g.criteria[i].notes, { label: "Notes" })}</td></tr>`;
    }).join("");
    const critCard = `<section class="card">
      <h2 class="ttl">Return-to-sport GPS criteria</h2>
      <div class="scroll"><table class="tbl entry"><thead><tr><th class="c">#</th><th>Outcome measure</th><th>Goal</th><th class="c">Achieved?</th><th class="c">Best week vs baseline</th><th>Date met</th><th>Notes</th></tr></thead><tbody>${crit}</tbody>
        <tfoot><tr><td></td><td class="b" colspan="2">Ready for return to sport (GPS)?</td><td class="c b">${gc.yCount} / 6</td><td class="c"><span class="badge ${statusClass(gc.rtsStatus)}">${esc(gc.rtsStatus)}</span></td><td colspan="2"></td></tr></tfoot></table></div>
    </section>`;
    const baseCard = `<section class="card">
      <h2 class="ttl">Pre-injury baseline <span class="ttl-hint">— typical weekly load; the target the Dashboard compares against</span></h2>
      <div class="scroll"><table class="tbl entry"><thead><tr><th>Date range / source</th>${C.GPS_METRICS.map((m) => `<th class="c">${esc(m.label)}</th>`).join("")}<th>Notes</th></tr></thead>
      <tbody><tr><td>${inText("gps.baseline.source", g.baseline.source, { ph: "e.g. 4-wk pre-injury avg", label: "Baseline source" })}</td>${C.GPS_METRICS.map((m) => `<td>${inNum(`gps.baseline.${m.key}`, g.baseline[m.key], { label: `Baseline ${m.label}` })}</td>`).join("")}<td>${inText("gps.baseline.notes", g.baseline.notes, { cls: "notes", label: "Notes" })}</td></tr></tbody></table></div>
    </section>`;
    const weeks = gc.weeks;
    const weekPts = (key, gap) => weeks.map((w) => [w.wk, w.n ? w[key] : gap ? null : 0]);
    const charts = `<section class="card">
      <h2 class="ttl">Weekly charts</h2>
      <div class="charts">
        ${chart({ title: "Weekly total distance (m)", kind: "int", zero: true, series: [{ name: "TD (m)", points: weekPts("td") }], empty: "No sessions logged yet", fmtTip: (v) => C.fmtInt(v) + " m" })}
        ${chart({ title: "Weekly HSR & sprint distance (m)", kind: "int", zero: true, series: [{ name: "HSR (m)", points: weekPts("hsr") }, { name: "SD (m)", points: weekPts("sd") }], empty: "No sessions logged yet", fmtTip: (v) => C.fmtInt(v) + " m" })}
        ${chart({ title: "Weekly top speed (m/s)", kind: "dec", series: [{ name: "Top speed (m/s)", points: weekPts("top", true) }], empty: "No sessions logged yet", fmtTip: (v) => C.fmt1(v) + " m/s" })}
      </div>
      <p class="fine">Lines stop at the latest logged week; a week with no sessions plots as 0 (top speed leaves a gap).</p>
    </section>`;
    const pctCell = (v) => `<td class="c ${ratioClass(v, 1, 0.8)}">${esc(C.fmtPct(v))}</td>`;
    const ratio = (w, k) => (w.n && isNum(g.baseline[k]) && g.baseline[k] !== 0 ? w[k] / g.baseline[k] : null);
    const weekRows = weeks.map((w) => `<tr class="${w.n ? "" : "muted"}"><td class="c b">${w.wk}</td><td class="c">${w.n}</td>${C.GPS_METRICS.map((m) => `<td class="c">${w.n ? esc(m.key === "top" ? C.fmt1(w[m.key]) : C.fmtInt(w[m.key])) : ""}</td>`).join("")}${pctCell(ratio(w, "td"))}${pctCell(ratio(w, "hsr"))}${pctCell(ratio(w, "sd"))}</tr>`).join("");
    const weekCard = `<section class="card">
      <h2 class="ttl">Weekly totals <span class="ttl-hint">— auto-calculated from the session log</span></h2>
      ${weeks.length ? `<div class="scroll"><table class="tbl"><thead><tr><th class="c">Week #</th><th class="c"># Sessions</th>${C.GPS_METRICS.map((m) => `<th class="c">${esc(m.label)}</th>`).join("")}<th class="c">% Baseline TD</th><th class="c">% Baseline HSR</th><th class="c">% Baseline SD</th></tr></thead><tbody>${weekRows}</tbody></table></div>`
        : `<p class="fine">${inj ? "No sessions logged on or after the injury date yet." : "Set the injury date on the Dashboard — week numbers count from it."}</p>`}
    </section>`;
    const sess = g.sessions.map((s, i) => {
      const sb = `gps.sessions.${i}`, wk = C.weekOf(s.date, inj);
      return `<tr data-key="${esc(s.id)}"><td>${inDate(`${sb}.date`, s.date, { label: "Session date" })}</td><td class="calc c">${wk == null ? "" : wk}</td>
        <td>${inSel(`${sb}.type`, s.type, [""].concat(lists.sessionTypes), { label: "Session type" })}</td>
        ${C.GPS_METRICS.map((m) => `<td>${inNum(`${sb}.${m.key}`, s[m.key], { label: m.label })}</td>`).join("")}
        <td>${inText(`${sb}.notes`, s.notes, { cls: "notes", label: "Notes" })}</td><td>${btn("delRow", "✕", { cls: "x", data: { path: "gps.sessions", idx: i }, title: "Delete session" })}</td></tr>`;
    }).join("");
    const logCard = `<section class="card">
      <div class="card-head"><h2 class="ttl">Session log <span class="ttl-hint">— one row per pitch session</span></h2>${btn("addSession", "+ Add session", { cls: "primary" })}</div>
      ${sess ? `<div class="scroll" data-scroll="sessions"><table class="tbl entry"><thead><tr><th>Date</th><th class="c">Wk</th><th>Session type</th>${C.GPS_METRICS.map((m) => `<th class="c">${esc(m.label)}</th>`).join("")}<th>Notes</th><th></th></tr></thead><tbody>${sess}</tbody></table></div>`
        : `<p class="fine">No sessions yet.</p>`}
    </section>`;
    return `<div class="pg-head"><h1>GPS — Pitch Load & Return-to-Sport Metrics</h1>
      <p class="fine">Log every pitch session in the session log. Week # fills in from the injury date on the Dashboard. Weekly totals, % of baseline, the charts, the Dashboard and any GPS-based exit criteria update automatically. Speeds in m/s (km/h ÷ 3.6).</p></div>
      ${critCard}${baseCard}${charts}${weekCard}${logCard}`;
  }

  // ================================================================== DOM morph (keeps focus, caret and scroll)
  function morphChildren(from, to) {
    const a = from.childNodes, b = to.childNodes;
    for (let i = 0; i < b.length; i++) {
      const nb = b[i], na = a[i];
      if (!na) { from.appendChild(nb.cloneNode(true)); continue; }
      if (na.nodeType === nb.nodeType && na.nodeName === nb.nodeName &&
        (na.nodeType !== 1 || (na.getAttribute("data-key") || "") === (nb.getAttribute("data-key") || ""))) {
        if (na.nodeType === 1) morphEl(na, nb);
        else if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue;
      } else {
        from.replaceChild(nb.cloneNode(true), na);
      }
    }
    while (a.length > b.length) from.removeChild(from.lastChild);
  }
  function morphEl(el, to) {
    const focused = el === document.activeElement;
    for (const at of Array.from(to.attributes)) {
      if (focused && at.name === "value") continue;
      if (el.getAttribute(at.name) !== at.value) el.setAttribute(at.name, at.value);
    }
    for (const at of Array.from(el.attributes)) if (!to.hasAttribute(at.name)) el.removeAttribute(at.name);
    const tag = el.nodeName;
    if (tag === "INPUT") {
      if (el.type === "checkbox") el.checked = to.hasAttribute("checked");
      else if (!focused) { const v = to.getAttribute("value") || ""; if (el.value !== v) el.value = v; }
      return;
    }
    if (tag === "TEXTAREA") { if (!focused && el.value !== to.textContent) el.value = to.textContent; return; }
    morphChildren(el, to);
    if (tag === "SELECT") {
      const sel = to.querySelector("option[selected]");
      const v = sel ? sel.getAttribute("value") : (to.querySelector("option") ? to.querySelector("option").getAttribute("value") : "");
      if (el.value !== v) el.value = v;
    }
  }

  // ================================================================== saving
  let saveTimer = null, renderTimer = null;
  function touch() {
    if (!player) return;
    player.updated = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!player) return;
    try {
      store.save(player);
      setStatus("Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      requestPersistence();
    } catch (e) {
      setStatus("⚠ Not saved — storage full?");
      toast("Couldn't save: this browser's storage may be full. Export a backup now.");
    }
  }
  function setStatus(msg) {
    ui.saveStatus = msg;
    const el = document.getElementById("saveStatus");
    if (el) el.textContent = msg;
  }
  let persistAsked = false;
  function requestPersistence() {
    if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
    persistAsked = true;
    navigator.storage.persist().catch(() => {});
  }
  function scheduleRender(ms) { clearTimeout(renderTimer); renderTimer = setTimeout(render, ms); }
  function renderNow() { clearTimeout(renderTimer); render(); }

  // ================================================================== events
  function parseNumber(s) {
    const t = String(s).trim().replace(",", ".");
    if (t === "") return { ok: true, v: null };
    const v = Number(t);
    return isFinite(v) ? { ok: true, v } : { ok: false };
  }
  function applyBind(el) {
    const path = el.getAttribute("data-bind"), kind = el.getAttribute("data-kind");
    let v;
    switch (kind) {
      case "num": { const r = parseNumber(el.value); if (!r.ok) return false; v = r.v; break; }
      case "pct": { const r = parseNumber(el.value); if (!r.ok) return false; v = r.v == null ? null : r.v / 100; break; }
      case "check": v = el.checked; break;
      case "selnum": v = el.value === "" ? null : Number(el.value); break;
      case "lines": v = el.value.split("\n").map((x) => x.trim()).filter(Boolean); break;
      default: v = el.value;
    }
    if (path.indexOf("@lists.") === 0) {
      const k = path.slice(7);
      lists[k] = v.length ? v : C.DEFAULT_LISTS[k].slice();
      store.setLists(lists);
      return true;
    }
    if (!player) return false;
    if (/\.slots\.\d+\.name$/.test(path) && String(v).trim() === "") v = C.SPARE;
    setPath(player, path, v);
    touch();
    return true;
  }

  document.addEventListener("input", (e) => {
    const el = e.target.closest && e.target.closest("[data-bind]");
    if (!el || el.type === "checkbox" || el.tagName === "SELECT") return;
    if (applyBind(el)) scheduleRender(180);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest && e.target.closest("[data-bind]");
    if (!el) return;
    applyBind(el);
    renderNow();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-act]");
    if (!b) return;
    const fn = actions[b.getAttribute("data-act")];
    if (fn) { e.preventDefault(); fn(b.dataset, b); }
  });

  function rowHasData(row) {
    if (!row || typeof row !== "object") return false;
    return Object.keys(row).some((k) => {
      if (k === "id" || k === "date") return false;
      const v = row[k];
      if (Array.isArray(v)) return v.some((x) => (Array.isArray(x) ? x.some(isNum) : isNum(x)));
      if (v && typeof v === "object") return Object.values(v).some(Boolean);
      return isNum(v) || (typeof v === "string" && v.trim() !== "");
    });
  }

  const actions = {
    newPlayer() {
      const p = C.newPlayer();
      store.save(p);
      go(`#/p/${encodeURIComponent(p.id)}/dashboard`);
    },
    loadExample() {
      const p = C.examplePlayer();
      store.save(p);
      go(`#/p/${encodeURIComponent(p.id)}/dashboard`);
    },
    deletePlayer(d) {
      confirmModal(`Delete ${d.name}?`, "This removes the player and all their data from this device. It cannot be undone.", "Delete", () => {
        store.remove(d.id);
        render();
      });
    },
    deleteCurrent() {
      if (!player) return;
      const p = player;
      confirmModal(`Delete ${p.profile.name || "this player"}?`, "This removes the player and all their data from this device. It cannot be undone.", "Delete", () => {
        clearTimeout(saveTimer);
        store.remove(p.id);
        player = null;
        go("#/");
      });
    },
    print() { saveNow(); window.print(); },
    exportPlayer() {
      if (!player) return;
      saveNow();
      download(`rehab-${fileSafe(player.profile.name || "player")}-${C.todayIso()}.json`, { app: "rehab-dashboard", schema: 1, exported: new Date().toISOString(), players: [player] });
    },
    exportAll() {
      if (player) saveNow();
      const players = store.getIndex().map((e) => store.load(e.id)).filter(Boolean);
      if (!players.length) { toast("There are no players to back up yet."); return; }
      download(`rehab-dashboard-backup-${C.todayIso()}.json`, { app: "rehab-dashboard", schema: 1, exported: new Date().toISOString(), lists, players });
    },
    importFile() { document.getElementById("importInput").click(); },
    addRow(d) {
      player.regions[d.region].blocks[d.block].rows.push(C.newBlockRow(C.todayIso()));
      touch(); renderNow();
      focusLast(`[data-scroll="${d.region}_${d.block}"] tbody tr:last-child input[type=date]`);
    },
    addStatus() {
      const log = player.statusLog;
      const dated = log.filter((e) => C.dnum(e.date) != null).sort((a, b) => C.dnum(a.date) - C.dnum(b.date));
      const prev = dated.length ? dated[dated.length - 1] : log[log.length - 1];
      log.push(C.newStatusRow(C.todayIso(), prev));
      touch(); renderNow();
      focusLast(`[data-scroll="status"] tbody tr:last-child input[type=date]`);
    },
    addGrowth() {
      const dated = player.growth.filter((g) => C.dnum(g.date) != null).sort((a, b) => C.dnum(a.date) - C.dnum(b.date));
      player.growth.push(C.newGrowthRow(C.todayIso(), dated[dated.length - 1]));
      touch(); renderNow();
      focusLast(`[data-scroll="growth"] tbody tr:last-child input[type=date]`);
    },
    addSession() {
      player.gps.sessions.push(C.newSession(C.todayIso()));
      touch(); renderNow();
      focusLast(`[data-scroll="sessions"] tbody tr:last-child input[type=date]`);
    },
    delRow(d) {
      const arr = getPath(player, d.path), i = Number(d.idx);
      if (!Array.isArray(arr) || !arr[i]) return;
      const doIt = () => { arr.splice(i, 1); touch(); renderNow(); };
      if (rowHasData(arr[i])) confirmModal("Delete this row?", "Its values will be removed. This cannot be undone.", "Delete", doIt);
      else doIt();
    },
    toggleSlots(d) { ui.editSlots[d.key] = !ui.editSlots[d.key]; renderNow(); },
    resetLists() {
      confirmModal("Reset the dropdown lists?", "Availability, focus and session-type lists go back to the spreadsheet defaults. Player data is not changed.", "Reset", () => {
        lists = JSON.parse(JSON.stringify(C.DEFAULT_LISTS));
        store.setLists(lists);
        render();
      });
    },
    eraseAll() {
      confirmModal("Erase all Rehab Dashboard data?", "Every player and setting stored by this app in this browser will be deleted. Back up first if you might need them. This cannot be undone.", "Erase everything", () => {
        Object.keys(localStorage).filter((k) => k.indexOf("rehabdash_") === 0).forEach((k) => localStorage.removeItem(k));
        lists = store.getLists();
        go("#/");
        render();
      });
    },
  };

  function focusLast(sel) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    // on touch screens focusing would pop the date picker; the row already has today's date
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) el.focus({ preventScroll: true });
  }

  // ================================================================== import / export
  function fileSafe(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player"; }
  function download(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Downloaded ${name}`);
  }
  document.getElementById("importInput").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (err) { toast("That file isn't a Rehab Dashboard backup (not valid JSON)."); return; }
      const raw = Array.isArray(data && data.players) ? data.players : data && data.profile ? [data] : null;
      if (!raw || !raw.length) { toast("No players found in that file."); return; }
      const players = raw.map(C.normalizePlayer);
      const existing = new Set(store.getIndex().map((e) => e.id));
      const clash = players.filter((p) => existing.has(p.id)).length;
      const msg = `${players.length} player(s) found.` + (clash ? ` ${clash} already exist on this device and will be replaced with the version in the file.` : "") +
        (data.lists ? " The dropdown lists in the file will also be restored." : "");
      confirmModal("Restore from backup?", msg, "Restore", () => {
        try {
          players.forEach((p) => store.save(p));
          if (data.lists) { lists = { availability: cleanList(data.lists.availability, C.DEFAULT_LISTS.availability), focus: cleanList(data.lists.focus, C.DEFAULT_LISTS.focus), sessionTypes: cleanList(data.lists.sessionTypes, C.DEFAULT_LISTS.sessionTypes) }; store.setLists(lists); }
          toast(`Restored ${players.length} player(s).`);
        } catch (err) { toast("Restore failed: this browser's storage may be full."); }
        if (route.page === "player" && player) player = store.load(player.id) || player;
        render();
      });
    };
    reader.readAsText(file);
  });

  // ================================================================== modal, toast, tooltip
  function confirmModal(title, msg, okLabel, onOk) {
    const m = document.getElementById("modal");
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalMsg").textContent = msg;
    const ok = document.getElementById("modalOk");
    ok.textContent = okLabel || "OK";
    ok.className = "btn " + (/delete|erase/i.test(okLabel) ? "danger" : "primary");
    ok.onclick = () => { closeModal(); onOk(); };
    m.hidden = false;
    ok.focus();
  }
  function closeModal() { document.getElementById("modal").hidden = true; }
  document.getElementById("modalCancel").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  }

  const tip = document.getElementById("tip");
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) return;
    tip.textContent = t.getAttribute("data-tip");
    tip.hidden = false;
    placeTip(e);
  });
  document.addEventListener("pointermove", (e) => { if (!tip.hidden) placeTip(e); });
  document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest("[data-tip]")) tip.hidden = true; });
  function placeTip(e) {
    const w = tip.offsetWidth, x = Math.min(window.innerWidth - w - 8, Math.max(8, e.clientX - w / 2));
    tip.style.left = x + "px";
    tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 14) + "px";
  }

  // ================================================================== routing
  function sortByDate(arr) {
    arr.sort((a, b) => {
      const da = C.dnum(a.date), db = C.dnum(b.date);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }
  function onRoute() {
    const prev = route;
    route = parseHash();
    if (route.page === "player") {
      if (!player || player.id !== route.id) {
        if (player) saveNow();
        player = store.load(route.id);
        ui.saveStatus = "";
        ui.editSlots = {};
      }
      if (!player) { route = { page: "library" }; history.replaceState(null, "", "#/"); }
      else {
        // tidy entry order when a tab is opened (not while typing)
        const reg = regionFromTab(route.tab);
        if (reg) C.BLOCKS.forEach((b) => sortByDate(player.regions[reg].blocks[b.key].rows));
        if (route.tab === "status") sortByDate(player.statusLog);
        if (route.tab === "profile") sortByDate(player.growth);
        if (route.tab === "gps") sortByDate(player.gps.sessions);
      }
    } else if (player) {
      saveNow();
      player = null;
    }
    if (route.page === "settings") lists = store.getLists();
    renderNow();
    if (!prev || prev.page !== route.page || prev.tab !== route.tab || prev.id !== route.id) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("pagehide", () => { if (saveTimer) saveNow(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && saveTimer) saveNow(); });
  window.addEventListener("storage", (e) => {
    // another tab changed data: refresh lists / library (the open player keeps this tab's edits)
    if (e.key === KEY_LISTS) { lists = store.getLists(); render(); }
    else if (e.key === KEY_INDEX && route.page !== "player") render();
  });

  // ================================================================== boot
  try { localStorage.setItem("rehabdash_probe", "1"); localStorage.removeItem("rehabdash_probe"); }
  catch (e) { document.getElementById("storageWarn").hidden = false; }
  onRoute();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
})();
