/*
 * CSV import helpers (no DOM): parse exports from GPS units (Catapult, STATSports, …) and force plates / testing
 * software, guess which columns hold what, and turn rows into GPS sessions or test-block rows.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ parsing
  function detectDelimiter(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
    let best = ",", bestScore = -1;
    [",", ";", "\t"].forEach((d) => {
      const counts = lines.map((l) => splitLine(l, d).length);
      const score = counts.filter((c) => c > 1).length * 100 + Math.max(0, ...counts);
      if (score > bestScore) { best = d; bestScore = score; }
    });
    return best;
  }
  function splitLine(line, d) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { out.push(cur); cur = ""; } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }
  // full parser (quoted fields may contain newlines)
  function parseRows(text, d) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur.trim()); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur.trim()); cur = "";
        if (row.some((c) => c !== "")) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur.trim());
    if (row.some((c) => c !== "")) rows.push(row);
    return rows;
  }

  const DATE_HEADERS = ["date", "session date", "start date", "activity date", "test date", "day", "datetime", "timestamp", "start time"];
  // header row = first row (within the first 20) that names a date column; exports often start with metadata lines
  function parse(text) {
    text = String(text || "").replace(/^\uFEFF/, "").replace(/^sep=.\r?\n/i, "");
    if (!text.trim()) return { headers: [], rows: [], delimiter: ",", headerRow: 0 };
    const delimiter = detectDelimiter(text);
    const all = parseRows(text, delimiter);
    let h = all.slice(0, 20).findIndex((r) => r.filter(Boolean).length >= 2 && r.some((c) => DATE_HEADERS.indexOf(norm(c)) >= 0 || /\bdate\b/.test(norm(c))));
    if (h < 0) h = all.findIndex((r) => r.filter(Boolean).length >= 2);
    if (h < 0) h = 0;
    const headers = (all[h] || []).map((c, i) => c || `Column ${i + 1}`);
    const rows = all.slice(h + 1).filter((r) => r.some((c) => c !== ""));
    return { headers, rows, delimiter, headerRow: h };
  }

  // ------------------------------------------------------------------ values
  const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function toNumber(s, delimiter) {
    if (s == null) return null;
    let t = String(s).trim();
    if (!t || t === "-" || t === "—") return null;
    t = t.replace(/[^\d.,\-+eE]/g, "");
    if (delimiter === ";") t = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
    else t = t.replace(",", ".");
    const v = Number(t);
    return t !== "" && isFinite(v) ? v : null;
  }
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const iso = (y, m, d) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? dt.toISOString().slice(0, 10) : null;
  };
  // order: "dmy" (UK) or "mdy" (US) for ambiguous 01/02/2026-style dates
  function toDate(s, order) {
    const t = String(s || "").trim();
    if (!t) return null;
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t);
    if (m) return order === "mdy" ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
    m = /^(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s,-]+(\d{2,4})/i.exec(t);
    if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
    m = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})/i.exec(t);
    if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
    if (/^\d{10}(\.\d+)?$/.test(t)) return new Date(Number(t) * 1000).toISOString().slice(0, 10); // Unix seconds
    if (/^\d{13}$/.test(t)) return new Date(Number(t)).toISOString().slice(0, 10); // Unix milliseconds
    if (/^\d{5}(\.\d+)?$/.test(t)) { // Excel serial date
      const n = Math.floor(Number(t));
      if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
    }
    return null;
  }
  // which way round are the slash dates? (any first part > 12 => UK, any second part > 12 => US)
  function guessDateOrder(values) {
    let dmy = 0, mdy = 0;
    values.forEach((v) => {
      const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(String(v || "").trim());
      if (!m) return;
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    });
    return mdy > dmy ? "mdy" : "dmy";
  }

  // ------------------------------------------------------------------ column guessing
  const GPS_FIELDS = [
    { key: "date", label: "Date", required: true, words: [["date"], ["session", "date"], ["day"], ["start", "time"], ["timestamp"]] },
    { key: "player", label: "Player name", words: [["player"], ["athlete"], ["player", "name"], ["athlete", "name"], ["name"]] },
    { key: "type", label: "Session type / title", words: [["session", "type"], ["session", "title"], ["activity"], ["session"], ["tag"], ["drill"]] },
    { key: "td", label: "Total distance (m)", words: [["total", "distance"], ["distance"], ["td"], ["total", "dist"]] },
    { key: "hsr", label: "HSR (m)", words: [["hsr"], ["high", "speed", "running"], ["high", "speed", "distance"], ["hsr", "distance"], ["hsd"]] },
    { key: "sd", label: "Sprint distance (m)", words: [["sprint", "distance"], ["sprint"], ["vhsr"], ["very", "high", "speed"]] },
    { key: "acc", label: "Accelerations (#)", words: [["accelerations"], ["accels"], ["acc"], ["acceleration", "efforts"], ["accel"]] },
    { key: "dec", label: "Decelerations (#)", words: [["decelerations"], ["decels"], ["dec"], ["deceleration", "efforts"], ["decel"]] },
    { key: "top", label: "Top speed", words: [["max", "speed"], ["top", "speed"], ["max", "velocity"], ["peak", "speed"], ["vmax"], ["maximum", "velocity"]] },
    { key: "notes", label: "Notes", words: [["notes"], ["comment"], ["comments"]] },
  ];
  const tokens = (s) => norm(s).split(" ").filter(Boolean);
  // score how well a header matches one of a field's word groups (exact header beats partial)
  function headerScore(header, words) {
    const ht = tokens(header);
    let best = 0;
    words.forEach((ws) => {
      if (ws.every((w) => ht.indexOf(w) >= 0)) best = Math.max(best, ws.length * 10 + (ws.length === ht.length ? 5 : 0) - ht.length * 0.1);
    });
    return best;
  }
  function guessGpsMap(headers) {
    const map = {}, used = new Set();
    GPS_FIELDS.forEach((f) => {
      let best = -1, bestScore = 0;
      headers.forEach((h, i) => {
        if (used.has(i)) return;
        if (f.key === "td" && /zone|band|per min|\/min|rate|hsr|sprint|high/.test(norm(h))) return;
        if (f.key === "player" && /session|drill/.test(norm(h))) return;
        const sc = headerScore(h, f.words);
        if (sc > bestScore) { best = i; bestScore = sc; }
      });
      if (best >= 0) { map[f.key] = best; used.add(best); }
    });
    return map;
  }
  // km/h if the header says so, or speeds look too big to be m/s
  function guessSpeedUnit(header, values) {
    const h = norm(header);
    if (/\b(km h|kmh|kph|km hr)\b/.test(h)) return "kmh";
    if (/\b(m s|ms|mps)\b/.test(h)) return "ms";
    const nums = values.filter((v) => v != null);
    return nums.length && Math.max(...nums) > 13 ? "kmh" : "ms";
  }

  // test-block columns: match slot names, with left/right picked out from the header
  const UNIT_WORDS = new Set(["cm", "n", "kg", "deg", "degrees", "s", "ms", "m", "reps", "rep", "rsi", "of", "the", "at", "and"]);
  const LEFT = ["left", "l", "lt", "lhs", "inj", "injured"], RIGHT = ["right", "r", "rt", "rhs"];
  function slotWords(name) {
    return tokens(name).filter((w) => !UNIT_WORDS.has(w));
  }
  function guessSlotMap(headers, slots) {
    const out = {};
    slots.forEach((s) => {
      const key = slotWords(s.name);
      if (!key.length) return;
      const cand = headers.map((h, i) => ({ i, t: tokens(h) }))
        .filter((c) => key.every((w) => c.t.indexOf(w) >= 0));
      const side = (c, list) => c.t.some((w) => list.indexOf(w) >= 0);
      const left = cand.find((c) => side(c, LEFT)), right = cand.find((c) => side(c, RIGHT));
      const neither = cand.find((c) => !side(c, LEFT) && !side(c, RIGHT));
      if (s.bilateral) { const c = neither || left; if (c) out[s.k] = { l: c.i }; }
      else if (left || right) out[s.k] = { l: left ? left.i : null, r: right ? right.i : null };
    });
    return out;
  }

  // Performance metrics (e.g. Hawkin Dynamics): one row per trial; a test-type / tags column says which test it was
  // (CMJ, iso squat, hip, ankle…), and several tests can share one column (e.g. "Peak Force").
  const TYPE_HEADERS = [["type"], ["test", "type"], ["testtypename"], ["test", "type", "name"], ["tags"], ["tag"], ["test"], ["test", "name"], ["protocol"], ["exercise"], ["movement"]];
  const PREFIX = new Set(["iso", "isometric", "test", "cmj", "countermovement", "jump"]);
  // other words a tag or column might use for ours
  const ALIASES = {
    adduction: ["add", "adductor", "adductors", "adduct"], abduction: ["abd", "abductor", "abductors", "abduct"],
    squat: ["sq", "imtp"], ankle: ["soleus", "calf", "plantarflexion", "pf"], plantarflexion: ["pf", "plantar", "soleus", "calf"],
    relative: ["rel", "bm", "bw"], mrsi: ["rsimod", "rsimodified"], power: ["pwr"], height: ["ht", "jh"],
  };
  const compact = (s) => norm(s).replace(/ /g, "");
  const unbracket = (t) => String(t).replace(/[([][^)\]]*[)\]]/g, " ");
  // which piece of `text` stands for word w (the word itself or an alias)? the matched string, or null
  function hit(w, text) {
    const c = compact(text), tk = tokens(text);
    if (tk.indexOf(w) >= 0 || (w.length >= 3 && c.indexOf(w) >= 0)) return w;
    for (const a of ALIASES[w] || []) if (tk.indexOf(a) >= 0 || (a.length >= 3 && c.indexOf(a) >= 0)) return a;
    return null;
  }
  // a row's test-type / tag cell passes the filter when every word of the filter appears in it
  function filterMatch(cell, filter) {
    const f = tokens(filter);
    if (!f.length) return true;
    const c = compact(cell);
    return f.every((w) => c.indexOf(w) >= 0);
  }
  function headerTokens(h) {
    const t = tokens(unbracket(h)).map((w) => (w === "rel" ? "relative" : w));
    const c = compact(h);
    if (t.indexOf("mrsi") < 0 && (c.indexOf("rsimod") >= 0 || (t.indexOf("rsi") >= 0 && (t.indexOf("modified") >= 0 || t.indexOf("mod") >= 0)))) t.push("mrsi");
    if (t.indexOf("relative") < 0 && (/\b(bm|bw)\b/.test(norm(h)) || /\/ ?kg/i.test(h))) t.push("relative");
    return t;
  }
  function guessPerfMap(headers, rows, metrics) {
    const typeCols = [];
    headers.forEach((h, i) => { if (headerScore(h, TYPE_HEADERS) > 0) typeCols.push(i); });
    const values = typeCols.map((c) => ({ c, vals: Array.from(new Set(rows.map((r) => r[c]).filter(Boolean))) }));
    const slots = {};
    metrics.forEach((m) => {
      if (!m.name || m.name.charAt(0) === "(") return;
      const all = tokens(unbracket(m.name)).filter((w) => !UNIT_WORDS.has(w));
      const isCmj = all.indexOf("cmj") >= 0 || all.indexOf("countermovement") >= 0;
      const isIso = all.indexOf("iso") >= 0 || all.indexOf("isometric") >= 0;
      const words = all.filter((w) => !PREFIX.has(w));
      // 1. the test-type / tag value for this metric, kept as a short filter of the words that matched
      let filter = "", typeCol = null, used = [], tBest = 0;
      const nRows = rows.length || 1;
      values.forEach(({ c, vals }) => vals.forEach((t) => {
        const found = [], usedW = [];
        // test-name words only (not the measure words like peak / force / height)
        words.forEach((w) => { if (["peak", "force", "power", "relative", "height", "mrsi", "rsi"].indexOf(w) >= 0) return; const h = hit(w, t); if (h) { found.push(h); usedW.push(w); } });
        let sc = found.length;
        const tc = compact(t);
        let cm = null;
        if (isCmj) { cm = tc.indexOf("countermovement") >= 0 ? "countermovement" : tc.indexOf("cmj") >= 0 ? "cmj" : null; if (cm) sc += 2; }
        else if (tc.indexOf("countermovement") >= 0 || tc.indexOf("cmj") >= 0 || tc.indexOf("jump") >= 0) sc -= 2;
        if (!found.length && !cm) return; // the value must actually name this test
        if (isIso && /iso|imtp/.test(tc)) sc += 0.25;
        // prefer the filter that keeps the most rows: e.g. Type "Countermovement Jump" (every CMJ) over a tag
        // like "CMJ - with Arms" that only some sessions carry
        const f = (cm ? [cm] : []).concat(found).join(" ");
        const cover = rows.filter((r) => filterMatch(r[c], f)).length / nRows;
        sc += 1.5 * cover;
        if (sc > tBest) { tBest = sc; typeCol = c; filter = f; used = usedW; }
      }));
      if (tBest < 1) { filter = ""; typeCol = null; used = []; }
      // 2. the measure column: the remaining words (aliases allowed), fewest extra words;
      //    steer away from inch, left / right, asymmetry and braking duplicates; allow a close partial match
      const rest = words.filter((w) => used.indexOf(w) < 0);
      let col = null, cBest = -Infinity;
      headers.forEach((h, i) => {
        if (typeCols.indexOf(i) >= 0 || !rest.length) return;
        const ht = headerTokens(h), hc = compact(ht.join(" "));
        const got = rest.filter((w) => ht.indexOf(w) >= 0 || (ALIASES[w] || []).some((a) => ht.indexOf(a) >= 0) || (w.length >= 4 && hc.indexOf(w) >= 0)).length;
        const frac = got / rest.length;
        if (frac < 0.67) return;
        let sc = frac * 20 - (ht.length - got) * 0.6;
        if (ht.indexOf("propulsive") >= 0) sc += 0.5;
        if (ht.indexOf("braking") >= 0 || ht.indexOf("landing") >= 0) sc -= 2;
        if (/\b(inch|inches|in|ft)\b/.test(norm(h))) sc -= 5;
        if (/\b(left|right|l|r|asym|asymmetry|imbalance|diff)\b/.test(norm(h))) sc -= 4;
        if (rest.indexOf("relative") < 0 && ht.indexOf("relative") >= 0) sc -= 3;
        if (sc > cBest) { cBest = sc; col = i; }
      });
      // 3. jump height exported in metres but logged in cm
      let scale = 1;
      if (col != null && /\(cm\)/i.test(m.name)) {
        const vals = rows.filter((r) => typeCol == null || filterMatch(r[typeCol], filter)).map((r) => toNumber(r[col])).filter((v) => v != null);
        if (/\(m\)|\[m\]/.test(String(headers[col]).toLowerCase()) || (vals.length && Math.max(...vals) < 1.5)) scale = 100;
      }
      slots[m.k] = { col, typeCol, type: filter, scale };
    });
    return { typeCols, slots };
  }

  // Hawkin's "Excluded" column marks trials rejected in their app
  const excludedCol = (headers) => headers.findIndex((h) => norm(h) === "excluded" || norm(h) === "is excluded");
  const isExcluded = (v) => /^(true|yes|y|1|x|excluded)$/i.test(String(v || "").trim());

  // ------------------------------------------------------------------ zip exports (Hawkin sends a .zip with one CSV per test type)
  async function unzip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a zip file");
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!/\.(csv|txt)$/i.test(name) || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const raw = u8.subarray(start, start + csize);
      let data;
      if (method === 0) data = raw;
      else if (method === 8 && typeof DecompressionStream !== "undefined") {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } else throw new Error("this zip uses compression the browser can't open — unzip it and choose the CSV instead");
      out.push({ name: name.split("/").pop(), text: new TextDecoder().decode(data) });
    }
    return out;
  }
  // several CSVs (one per test type) -> one table with every column
  function mergeCsv(texts) {
    if (texts.length === 1) return texts[0];
    const parts = texts.map(parse).filter((P) => P.headers.length);
    const headers = [];
    parts.forEach((P) => P.headers.forEach((h) => { if (headers.indexOf(h) < 0) headers.push(h); }));
    const q = (v) => (/[",\n\r]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : v);
    const lines = [headers.map(q).join(",")];
    parts.forEach((P) => P.rows.forEach((r) => {
      lines.push(headers.map((h) => { const i = P.headers.indexOf(h); return q(i < 0 ? "" : r[i] || ""); }).join(","));
    }));
    return lines.join("\n");
  }

  root.CSVImport = { parse, toNumber, toDate, guessDateOrder, GPS_FIELDS, guessGpsMap, guessSpeedUnit, guessSlotMap, guessPerfMap, filterMatch, excludedCol, isExcluded, unzip, mergeCsv, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CSVImport;
})(typeof window !== "undefined" ? window : globalThis);
