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

  // Hawkin's "Excluded" column marks trials rejected in their app
  const excludedCol = (headers) => headers.findIndex((h) => norm(h) === "excluded" || norm(h) === "is excluded");
  const isExcluded = (v) => /^(true|yes|y|1|x|excluded)$/i.test(String(v || "").trim());

  // Performance metrics (e.g. Hawkin Dynamics): one row per trial. Trials are grouped by test using the Type column
  // ("Countermovement Jump", "Isometric Test"…); isometric tests are told apart by their first tag ("Iso Squat",
  // "Hip Add"…). Every numeric column becomes a metric, named exactly as in the file.
  const TYPE_HEADERS = [["type"], ["test", "type"], ["testtypename"], ["test", "type", "name"], ["test"], ["test", "name"], ["protocol"], ["exercise"], ["movement"]];
  const META = new Set(["testid", "test id", "id", "date", "time", "name", "athlete", "athlete name", "player", "player name", "teams", "team",
    "groups", "group", "position", "birthdate", "dob", "date of birth", "segment", "type", "test type", "excluded", "tags", "tag", "timestamp",
    "trial", "trial number", "rep", "notes", "comment", "comments", "external id", "externalid"]);
  // key measures ticked by default when they're in the file
  const KEY_METRICS = ["jump height", "mrsi", "rsi modified", "rsi", "peak relative propulsive power", "relative peak propulsive power",
    "peak propulsive power", "braking rfd", "time to takeoff", "peak force", "relative peak force", "peak force bm", "net peak force", "contact time"];
  const baseName = (h) => norm(String(h).replace(/[([][^)\]]*[)\]]/g, " "));
  // timings: smaller is better
  const lowerIsBetter = (h) => /\b(time|contact|duration|phase)\b/.test(baseName(h)) && !/%/.test(h);
  const isPlainNumber = (v) => /^\s*-?\d+(\.\d+)?\s*$/.test(String(v == null ? "" : v));
  function guessTestCols(headers) {
    let testCol = null, best = 0;
    headers.forEach((h, i) => { if (norm(h) === "tags" || norm(h) === "tag") return; const sc = headerScore(h, TYPE_HEADERS); if (sc > best) { best = sc; testCol = i; } });
    const tagCol = headers.findIndex((h) => norm(h) === "tags" || norm(h) === "tag");
    return { testCol, tagCol: tagCol < 0 ? null : tagCol };
  }
  // o: { dateCol, playerCol, playerVal, testCol, tagCol, dateOrder }
  function perfGroups(P, o) {
    const ex = excludedCol(P.headers);
    const groups = {}, order = [];
    let skipped = { player: 0, excluded: 0, date: 0 };
    P.rows.forEach((r) => {
      if (o.playerCol != null && o.playerVal && r[o.playerCol] !== o.playerVal) { skipped.player++; return; }
      if (ex >= 0 && isExcluded(r[ex])) { skipped.excluded++; return; }
      const date = toDate(r[o.dateCol], o.dateOrder);
      if (!date) { skipped.date++; return; }
      let label = o.testCol != null ? String(r[o.testCol] || "").trim() : "";
      if (o.tagCol != null && /iso/i.test(label)) {
        const tag = String(r[o.tagCol] || "").split(/[,;|]/)[0].trim();
        if (tag) label = tag;
      }
      if (!label) label = "Tests";
      if (!groups[label]) { groups[label] = { label, rows: [] }; order.push(label); }
      groups[label].rows.push({ r, date });
    });
    const list = order.map((label) => {
      const g = groups[label];
      const cols = [];
      P.headers.forEach((h, i) => {
        if (META.has(norm(h)) || i === o.testCol || i === o.tagCol || i === o.dateCol || i === o.playerCol || i === ex) return;
        const vals = g.rows.map((x) => x.r[i]).filter((v) => String(v || "").trim() !== "");
        if (!vals.length || !vals.every(isPlainNumber)) return; // text or "L|R"-style columns are left out
        // example = best trial on the most recent day
        const latestDay = g.rows.filter((x) => isPlainNumber(x.r[i])).map((x) => x.date).sort().pop();
        const dayVals = g.rows.filter((x) => x.date === latestDay && isPlainNumber(x.r[i])).map((x) => Number(x.r[i]));
        const lower = lowerIsBetter(h);
        cols.push({ i, name: h.trim(), n: vals.length, lower, example: dayVals.length ? (lower ? Math.min(...dayVals) : Math.max(...dayVals)) : null,
          key: KEY_METRICS.indexOf(baseName(h)) >= 0 });
      });
      return { label, trials: g.rows.length, days: new Set(g.rows.map((x) => x.date)).size, rows: g.rows, cols };
    }).filter((g) => g.cols.length);
    return { groups: list, skipped };
  }

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

  root.CSVImport = { parse, toNumber, toDate, guessDateOrder, GPS_FIELDS, guessGpsMap, guessSpeedUnit, guessSlotMap, guessTestCols, perfGroups, excludedCol, isExcluded, unzip, mergeCsv, norm };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CSVImport;
})(typeof window !== "undefined" ? window : globalThis);
