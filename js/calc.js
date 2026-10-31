/*
 * Rehab & Testing Dashboard — data model and calculations.
 * Pure logic (no DOM) so it runs in the browser and in Node for testing.
 * Mirrors the formulas of Rehab_Testing_Dashboard_LUFC_v5_TickBox.xlsx:
 * injured-side LSI, latest-by-date, live exit criteria, rehab-week stamping,
 * GPS weekly totals, Status Log headline / exposure chips / stage history.
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ constants
  const REGIONS = ["Hip", "Hamstring", "Knee", "Ankle-Foot", "Shoulder"];
  const PHASES = ["1. Protection", "2. Load Introduction", "3. Specific Loading", "4. Performance Loading",
    "5. Return to Training", "6. Return to Play"];
  const CRIT_PER_PHASE = 3;
  const SLOTS = 8;
  const SPARE = "(spare slot — rename)";
  const MANUAL = "Manual";
  const JUMP_BATTERY = ["DL CMJ Height (cm)", "SL CMJ Height (cm)", "SL Hop Distance (cm)", "Triple Hop Distance (cm)",
    "Lateral Capacity", "DL Drop Jump RSI", "SL Drop Jump RSI", "10-5 Repeated Hops RSI"];
  const BILATERAL = ["DL CMJ Height (cm)", "DL Drop Jump RSI", "10-5 Repeated Hops RSI"];
  const GPS_LABELS = ["GPS: TD % baseline (best week)", "GPS: HSR % baseline (best week)", "GPS: SD % baseline (best week)",
    "GPS: Acc % baseline (best week)", "GPS: Dec % baseline (best week)", "GPS: Top speed % baseline (best week)"];
  const [GPS_TD, GPS_HSR, GPS_SD] = GPS_LABELS;

  const BLOCKS = [
    { key: "rom", label: "ROM", hint: "degrees / cm as labelled" },
    { key: "str", label: "Strength", hint: "L / R values as labelled" },
    { key: "jmp", label: "Jump / Power", hint: "force plate / tape / timing gates" },
  ];

  // GPS metrics in workbook order (TD, HSR, SD, Acc, Dec, Top speed) — index matches GPS_LABELS
  const GPS_METRICS = [
    { key: "td", label: "TD (m)", short: "TD" },
    { key: "hsr", label: "HSR (m)", short: "HSR" },
    { key: "sd", label: "SD (m)", short: "SD" },
    { key: "acc", label: "Acc (#)", short: "Acc" },
    { key: "dec", label: "Dec (#)", short: "Dec" },
    { key: "top", label: "Top Speed (m/s)", short: "Top speed", max: true },
  ];
  const GPS_RTS = [
    { measure: "Total Distance — % of baseline", goal: "≥ 100% baseline" },
    { measure: "HSR (m) — % of baseline", goal: "≥ 100% baseline" },
    { measure: "Sprint Distance (m) — % of baseline", goal: "≥ 95% baseline" },
    { measure: "Accelerations — % of baseline", goal: "≥ 95% baseline" },
    { measure: "Decelerations — % of baseline", goal: "≥ 95% baseline" },
    { measure: "Top Speed (m/s) — % of baseline", goal: "≥ 95% baseline" },
  ];

  const AVAIL = ["Unavailable — training & fixtures", "Modified / partial training",
    "Full training — not available for fixtures", "Available for selection"];
  const FOCUS = ["Gym-based — strength focus", "Gym-based — strength + plyometric focus",
    "Pitch-based — linear running / volume focus", "Full training — cleared"];
  const SESSION_TYPES = ["Rehab", "Training", "Match", "Individual", "Other"];
  const DEFAULT_LISTS = { availability: AVAIL, focus: FOCUS, sessionTypes: SESSION_TYPES };

  const ADDONS = [
    { key: "acc", label: "Accel / decel", text: "accel/decel" },
    { key: "cod", label: "Change of direction", text: "change of direction" },
    { key: "hsr", label: "High-speed running", text: "high-speed running" },
    { key: "sd", label: "Sprint distance", text: "sprint distance" },
    { key: "top", label: "Top speed", text: "top-speed exposure" },
  ];

  // criteria rows: test MANUAL => manual item (use Override); null => blank row
  const M = (text) => ({ text, test: MANUAL, measure: "", op: "≥", thr: null });
  const C = (text, test, thr, measure = "LSI", op = "≥") => ({ text, test, measure, op, thr });

  const REGION_SPEC = {
    "Hip": {
      focus: "Hip & groin tracker. ROM in degrees; strength = KangaTech hip profile in kg. LSI = injured ÷ uninjured side " +
        "(set the Injured side on the Dashboard). Wk = rehab week, stamped automatically from the date.",
      rom: ["Hip Flexion (°)", "Hip Extension (°)", "Hip IR @ 90° (°)", "Hip ER @ 90° (°)", "Active Abduction (°)", "Passive Abduction (°)"],
      str: ["Hip Flexion @ 90° (kg)", "Hip Extension (kg)", "Hip IR @ 90° (kg)", "Hip ER @ 90° (kg)", "Adduction @ 30° (kg)", "Abduction @ 30° (kg)", "Hip Flexion @ 60° (kg)"],
      strTitle: "Strength — KangaTech Hip Profile (kg)",
      criteria: [
        [M("Pain ≤ 2/10 with ADLs, full weight-bearing"), M("No night pain"), null],
        [C("Hip flexion ROM ≥ 90% of other side", "Hip Flexion (°)", 0.9), C("Adduction @ 30° ≥ 70% LSI", "Adduction @ 30° (kg)", 0.7), C("Abduction @ 30° ≥ 70% LSI", "Abduction @ 30° (kg)", 0.7)],
        [C("Adduction @ 30° ≥ 80% LSI", "Adduction @ 30° (kg)", 0.8), C("Hip flexion @ 90° ≥ 80% LSI", "Hip Flexion @ 90° (kg)", 0.8), M("Pain-free linear running")],
        [C("Adduction @ 30° ≥ 90% LSI", "Adduction @ 30° (kg)", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9), C("SL hop ≥ 90% LSI", "SL Hop Distance (cm)", 0.9)],
        [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
        [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Psychological readiness confirmed")],
      ],
    },
    "Hamstring": {
      focus: "Hamstring tracker — phases follow the Aspetar pathway names (edit freely). LSI = injured ÷ uninjured side " +
        "(set the Injured side on the Dashboard). Wk = rehab week, stamped automatically from the date.",
      phases: ["1. Foundation", "2. Reload", "3. Accumulation", "4. Transition", "5. Simulation", "6. Resilience"],
      rom: ["Active Knee Extension (°)", "Passive SLR (°)", "Hip Flexion (°)"],
      str: ["NordBord Eccentric (N)", "Iso Hamstring 90/90 (N)", "Iso Hamstring 30° (N)", "SL Hamstring Bridge (reps)", "Quadriceps Iso (N)"],
      strTitle: "Strength — NordBord / force frame / HHD",
      criteria: [
        [M("Pain-free walking & ADLs"), C("AKE ≥ 80% of other side", "Active Knee Extension (°)", 0.8), null],
        [C("Iso 90/90 ≥ 80% LSI", "Iso Hamstring 90/90 (N)", 0.8), C("AKE ≥ 90% of other side", "Active Knee Extension (°)", 0.9), M("Pain-free jogging")],
        [C("NordBord eccentric ≥ 80% LSI", "NordBord Eccentric (N)", 0.8), C("Iso 30° ≥ 85% LSI", "Iso Hamstring 30° (N)", 0.85), M("Progressive running tolerated")],
        [C("NordBord eccentric ≥ 90% LSI", "NordBord Eccentric (N)", 0.9), C("SL bridge ≥ 90% LSI", "SL Hamstring Bridge (reps)", 0.9), C("Top speed ≥ 90% of baseline", GPS_LABELS[5], 0.9, "")],
        [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
        [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Match minutes progressed")],
      ],
    },
    "Knee": {
      focus: "Knee tracker (ACL, meniscus, PFJ, tendinopathy) — Melbourne-guide style battery. LSI = injured ÷ uninjured side " +
        "(set the Injured side on the Dashboard). Wk = rehab week, stamped automatically from the date.",
      rom: ["Knee Flexion (°)", "Knee Extension (° hyperext = +)", "Ankle DF Knee-to-Wall (cm)", "Thigh Circumference 10 cm (cm)"],
      str: ["Quadriceps Iso (N)", "Hamstrings Iso / NordBord (N)", "Calf Iso (N)", "Iso Hip Abduction (N)"],
      strTitle: "Strength — HHD / force frame / NordBord",
      criteria: [
        [M("Full extension — no lag on SLR"), M("Effusion ≤ trace (stroke test)"), null],
        [C("Knee flexion ≥ 120° on injured side", "Knee Flexion (°)", 120, "Injured"), C("Quadriceps ≥ 70% LSI", "Quadriceps Iso (N)", 0.7), M("Normalised gait")],
        [C("Quadriceps ≥ 80% LSI", "Quadriceps Iso (N)", 0.8), C("Hamstrings ≥ 80% LSI", "Hamstrings Iso / NordBord (N)", 0.8), M("Pain-free jogging")],
        [C("Quadriceps ≥ 90% LSI", "Quadriceps Iso (N)", 0.9), C("SL hop ≥ 90% LSI", "SL Hop Distance (cm)", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9)],
        [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
        [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("ACL-RSI / psychological readiness")],
      ],
    },
    "Ankle-Foot": {
      focus: "Ankle & foot tracker (lateral ligament, syndesmosis, Achilles, foot). LSI = injured ÷ uninjured side " +
        "(set the Injured side on the Dashboard). Wk = rehab week, stamped automatically from the date.",
      rom: ["Ankle DF Knee-to-Wall (cm)", "Ankle Plantarflexion (°)", "Inversion (°)", "Eversion (°)"],
      str: ["SL Heel Raise (reps)", "Iso Plantarflexion (N)", "Iso Inversion (N)", "Iso Eversion (N)"],
      strTitle: "Strength — HHD / force frame / endurance",
      criteria: [
        [M("Pain & swelling controlled; full weight-bearing"), C("Knee-to-wall ≥ 50% of other side", "Ankle DF Knee-to-Wall (cm)", 0.5), null],
        [C("Knee-to-wall ≥ 85% of other side", "Ankle DF Knee-to-Wall (cm)", 0.85), C("SL heel raise ≥ 15 reps on injured side", "SL Heel Raise (reps)", 15, "Injured"), null],
        [C("Plantarflexion strength ≥ 80% LSI", "Iso Plantarflexion (N)", 0.8), M("Pain-free jogging"), M("SL balance eyes closed ≥ 30 s")],
        [C("Lateral capacity ≥ 90% LSI", "Lateral Capacity", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9), C("SL drop jump RSI ≥ 90% LSI", "SL Drop Jump RSI", 0.9)],
        [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
        [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Match minutes progressed")],
      ],
    },
    "Shoulder": {
      focus: "Shoulder tracker (instability, AC joint, rotator cuff, goalkeepers). LSI = injured ÷ uninjured side " +
        "(set the Injured side on the Dashboard). Bilateral tests: enter the score in L. Wk = rehab week.",
      rom: ["Shoulder Flexion (°)", "ER @ 90° abd (°)", "IR @ 90° abd (°)", "Abduction (°)"],
      str: ["Iso ER (N)", "Iso IR (N)", "ASH Test — I position (N)", "ASH Test — Y position (N)"],
      strTitle: "Strength — HHD / force plate",
      criteria: [
        [M("Pain controlled; protected ROM per protocol"), M("Scapular control restored"), null],
        [C("ER @ 90° ROM ≥ 90% of other side", "ER @ 90° abd (°)", 0.9), C("Iso ER ≥ 70% LSI", "Iso ER (N)", 0.7), C("Iso IR ≥ 70% LSI", "Iso IR (N)", 0.7)],
        [C("Iso ER ≥ 80% LSI", "Iso ER (N)", 0.8), C("ASH I-position ≥ 80% LSI", "ASH Test — I position (N)", 0.8), M("Closed-chain loading tolerated")],
        [C("Iso ER ≥ 90% LSI", "Iso ER (N)", 0.9), C("ASH Y-position ≥ 90% LSI", "ASH Test — Y position (N)", 0.9), M("Contact / landing drills completed")],
        [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), M("Full training incl. contact"), null],
        [M("Match minutes progressed"), M("Psychological readiness confirmed"), null],
      ],
    },
  };

  function regionTitle(name) { return name.replace("-", " & "); }
  function blockTitle(regionName, key) {
    if (key === "rom") return "Range of Motion";
    if (key === "str") return REGION_SPEC[regionName].strTitle;
    return "Jump Testing — standardised battery";
  }

  // ------------------------------------------------------------------ small utils
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const str = (v) => (v == null ? "" : String(v));
  const norm = (s) => str(s).trim().toLowerCase();
  const isSpare = (name) => { const s = str(name).trim(); return s === "" || s.charAt(0) === "("; };
  const isGpsTest = (t) => norm(t).slice(0, 4) === "gps:";
  const isManual = (t) => norm(t) === norm(MANUAL);
  function uid(prefix) { return (prefix || "r") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }

  // ------------------------------------------------------------------ dates (ISO yyyy-mm-dd <-> day numbers)
  let todayOverride = null;
  function dnum(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(iso));
    if (!m) return null;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
  }
  function todayNum() {
    if (todayOverride != null) return todayOverride;
    const d = new Date();
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  }
  function setToday(iso) { todayOverride = iso ? dnum(iso) : null; }
  function isoFromNum(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function todayIso() { return isoFromNum(todayNum()); }
  function fmtDate(v, long) {
    const n = typeof v === "number" ? v : dnum(v);
    if (n == null) return "";
    const d = new Date(n * 864e5);
    const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(d.getUTCFullYear());
    return `${dd}/${mm}/${long ? yy : yy.slice(2)}`;
  }
  function weekOf(dateIso, injIso) {
    const d = dnum(dateIso), i = dnum(injIso);
    if (d == null || i == null) return null;
    return Math.floor((d - i) / 7) + 1;
  }

  // ------------------------------------------------------------------ number formatting
  function fmtInt(v) { return isNum(v) ? Math.round(v).toLocaleString("en-GB") : ""; }
  function fmt1(v) { return isNum(v) ? v.toFixed(1) : ""; }
  function fmtPct(v) { return isNum(v) ? Math.round(v * 100) + "%" : ""; }
  function fmtNum(v) {
    if (!isNum(v)) return "";
    return String(Math.round(v * 1e6) / 1e6);
  }
  function fmtSigned(v, dp) {
    const r = Math.round(v * 1e9) / 1e9;
    const a = Math.abs(r).toFixed(dp);
    return r > 0 ? "+" + a : r < 0 ? "-" + a : (0).toFixed(dp);
  }

  // ------------------------------------------------------------------ factories
  function blankCriterion() { return { text: "", test: "", measure: "", op: "≥", thr: null, override: "", notes: "" }; }

  function newRegion(name) {
    const spec = REGION_SPEC[name];
    const criteria = [];
    for (let p = 0; p < PHASES.length; p++) {
      const rows = (spec.criteria[p] || []).concat([null, null, null]).slice(0, CRIT_PER_PHASE);
      rows.forEach((c) => criteria.push(c ? Object.assign(blankCriterion(), c) : blankCriterion()));
    }
    const slots = (names) => names.concat(Array(SLOTS).fill(SPARE)).slice(0, SLOTS)
      .map((n) => ({ name: n, bilateral: BILATERAL.indexOf(n) >= 0, pain: false }));
    return {
      phases: (spec.phases || PHASES).slice(),
      criteria,
      blocks: { rom: { slots: slots(spec.rom), rows: [] }, str: { slots: slots(spec.str), rows: [] }, jmp: { slots: slots(JUMP_BATTERY), rows: [] } },
    };
  }

  function newPlayer() {
    const now = Date.now();
    const regions = {};
    REGIONS.forEach((r) => { regions[r] = newRegion(r); });
    return {
      id: uid("p"), schema: 1, created: now, updated: now, archivedOn: "",
      profile: { name: "", position: "", injury: "", side: "", injuryDate: "", rtpDate: "", dob: "" },
      growth: [],
      wellness: [],
      perf: newPerf(),
      settings: { ticks: {}, lsiTarget: 0.9, chartRegion: "", chartSlot: {} },
      statusLog: [],
      regions,
      gps: {
        criteria: GPS_RTS.map((c) => ({ goal: c.goal, achieved: "", dateMet: "", notes: "" })),
        baseline: { source: "", td: null, hsr: null, sd: null, acc: null, dec: null, top: null, notes: "" },
        sessions: [],
      },
    };
  }

  // nrs[k] = symptom response (0–10 NRS) for slot k, used only on tests with "Record pain" switched on
  function newBlockRow(date) {
    return { id: uid("t"), date: date || "", notes: "", vals: Array.from({ length: SLOTS }, () => [null, null]), nrs: Array(SLOTS).fill(null) };
  }
  // Wellness log: 0–10 NRS pain at rest, during activity and the next morning (24 h response)
  const WELLNESS = [
    { key: "rest", label: "Pain at rest" },
    { key: "activity", label: "Pain during activity" },
    { key: "morning", label: "Pain next morning (24 h)" },
  ];
  // Performance testing (Athlete Profile): metrics are created from imported files (e.g. Hawkin), named exactly as the
  // file names them and grouped by test ("Countermovement Jump", "Iso Squat"…); rows hold values keyed by metric id
  function newPerf() { return { metrics: [], rows: [] }; }
  // lower: smaller is better (timings) — "best" is the lowest value
  function newPerfMetric(test, name, lower) { return { id: uid("m"), test: test || "", name: name || "", base: null, lower: !!lower }; }
  function newPerfRow(date) { return { id: uid("f"), date: date || "", vals: {}, notes: "" }; }
  function newWellnessRow(date) { return { id: uid("w"), date: date || "", rest: null, activity: null, morning: null, notes: "" }; }
  function newStatusRow(date, prev) {
    const addons = {};
    ADDONS.forEach((a) => { addons[a.key] = !!(prev && prev.addons && prev.addons[a.key]); });
    return { id: uid("s"), date: date || "", avail: prev ? prev.avail : "", focus: prev ? prev.focus : "", addons, notes: "" };
  }
  // Athlete profile log: one row per measurement day. % PAH = height ÷ predicted adult height.
  function newGrowthRow(date, prev) {
    return { id: uid("h"), date: date || "", height: null, sitting: null, mass: null,
      predicted: prev && isNum(prev.predicted) ? prev.predicted : null, matOffset: null, notes: "" };
  }
  function newSession(date) {
    // alterg: anti-gravity treadmill session (kept apart from true on-pitch load); bw = % body weight on the Alter-G
    return { id: uid("g"), date: date || "", type: "", alterg: false, bw: null, td: null, hsr: null, sd: null, acc: null, dec: null, top: null, notes: "" };
  }

  // Fill in anything missing (older saves, imported backups) without touching existing values.
  function normalizePlayer(raw) {
    const p = newPlayer();
    if (!raw || typeof raw !== "object") return p;
    if (raw.id) p.id = str(raw.id);
    p.created = raw.created || p.created;
    p.updated = raw.updated || p.updated;
    p.archivedOn = typeof raw.archivedOn === "string" ? raw.archivedOn : "";
    Object.keys(p.profile).forEach((k) => { if (raw.profile && raw.profile[k] !== undefined) p.profile[k] = raw.profile[k]; });
    if (raw.perf && typeof raw.perf === "object") {
      const rawRows = Array.isArray(raw.perf.rows) ? raw.perf.rows : [];
      const ids = [];
      // older saves used ten fixed slots with values in arrays; keep the slots that were named or hold data
      (Array.isArray(raw.perf.metrics) ? raw.perf.metrics : []).forEach((m, i) => {
        if (!m || typeof m !== "object") return;
        const id = m.id ? str(m.id) : "m" + i;
        const hasData = rawRows.some((r) => r && r.vals && isNum(Array.isArray(r.vals) ? r.vals[i] : r.vals[id]));
        if (!m.id && isSpare(m.name) && !hasData) return;
        ids.push({ from: m.id ? id : i, id });
        p.perf.metrics.push({ id, test: str(m.test), name: str(m.name) || "Metric " + (i + 1), base: isNum(m.base) ? m.base : null, lower: !!m.lower });
      });
      p.perf.rows = rawRows.map((r) => {
        const row = newPerfRow(r.date);
        row.id = r.id || row.id;
        row.notes = str(r.notes);
        ids.forEach(({ from, id }) => { const v = r.vals ? r.vals[from] : null; if (isNum(v)) row.vals[id] = v; });
        return row;
      });
    }
    if (Array.isArray(raw.wellness)) {
      p.wellness = raw.wellness.map((w) => {
        const row = newWellnessRow(w.date);
        row.id = w.id || row.id;
        row.notes = str(w.notes);
        WELLNESS.forEach((m) => { row[m.key] = isNum(w[m.key]) ? w[m.key] : null; });
        return row;
      });
    }
    if (Array.isArray(raw.growth)) {
      p.growth = raw.growth.map((g) => {
        const row = newGrowthRow(g.date);
        row.id = g.id || row.id;
        row.notes = str(g.notes);
        ["height", "sitting", "mass", "predicted", "matOffset"].forEach((k) => { row[k] = isNum(g[k]) ? g[k] : null; });
        return row;
      });
    } else if (raw.profile && ["height", "mass", "matOffset", "pah"].some((k) => isNum(raw.profile[k]))) {
      // older saves kept a single set of measurements on the profile — turn it into the first log entry
      const pr = raw.profile, row = newGrowthRow(str(pr.measuredOn));
      row.height = isNum(pr.height) ? pr.height : null;
      row.mass = isNum(pr.mass) ? pr.mass : null;
      row.matOffset = isNum(pr.matOffset) ? pr.matOffset : null;
      if (isNum(pr.pah) && pr.pah > 0 && isNum(pr.height)) row.predicted = Math.round(pr.height / (pr.pah <= 1.5 ? pr.pah : pr.pah / 100) * 10) / 10;
      p.growth = [row];
    }
    if (raw.settings) {
      if (raw.settings.ticks) REGIONS.forEach((r) => { p.settings.ticks[r] = !!raw.settings.ticks[r]; });
      if (isNum(raw.settings.lsiTarget)) p.settings.lsiTarget = raw.settings.lsiTarget;
      p.settings.chartRegion = REGIONS.indexOf(raw.settings.chartRegion) >= 0 ? raw.settings.chartRegion : "";
      if (raw.settings.chartSlot && typeof raw.settings.chartSlot === "object") p.settings.chartSlot = Object.assign({}, raw.settings.chartSlot);
    }
    if (Array.isArray(raw.statusLog)) {
      p.statusLog = raw.statusLog.map((e) => {
        const row = newStatusRow(e.date);
        row.id = e.id || row.id;
        ["avail", "focus", "notes"].forEach((k) => { row[k] = str(e[k]); });
        ADDONS.forEach((a) => { row.addons[a.key] = !!(e.addons && e.addons[a.key]); });
        return row;
      });
    }
    if (raw.regions) {
      REGIONS.forEach((name) => {
        const src = raw.regions[name], dst = p.regions[name];
        if (!src) return;
        if (Array.isArray(src.phases)) src.phases.slice(0, PHASES.length).forEach((ph, i) => { dst.phases[i] = str(ph); });
        if (Array.isArray(src.criteria)) {
          src.criteria.slice(0, dst.criteria.length).forEach((c, i) => {
            const b = blankCriterion();
            Object.keys(b).forEach((k) => { if (c && c[k] !== undefined) b[k] = c[k]; });
            if (!isNum(b.thr)) b.thr = null;
            dst.criteria[i] = b;
          });
        }
        BLOCKS.forEach(({ key }) => {
          const sb = src.blocks && src.blocks[key], db = dst.blocks[key];
          if (!sb) return;
          if (Array.isArray(sb.slots)) {
            sb.slots.slice(0, SLOTS).forEach((s, i) => {
              if (s && typeof s === "object") db.slots[i] = { name: str(s.name), bilateral: !!s.bilateral, pain: !!s.pain };
            });
          }
          if (Array.isArray(sb.rows)) {
            db.rows = sb.rows.map((r) => {
              const row = newBlockRow(r.date);
              row.id = r.id || row.id;
              row.notes = str(r.notes);
              (r.vals || []).slice(0, SLOTS).forEach((pair, k) => {
                if (Array.isArray(pair)) row.vals[k] = [isNum(pair[0]) ? pair[0] : null, isNum(pair[1]) ? pair[1] : null];
              });
              (r.nrs || []).slice(0, SLOTS).forEach((v, k) => { row.nrs[k] = isNum(v) ? v : null; });
              return row;
            });
          }
        });
      });
    }
    if (raw.gps) {
      if (Array.isArray(raw.gps.criteria)) {
        raw.gps.criteria.slice(0, GPS_RTS.length).forEach((c, i) => {
          Object.keys(p.gps.criteria[i]).forEach((k) => { if (c && c[k] !== undefined) p.gps.criteria[i][k] = c[k]; });
        });
      }
      if (raw.gps.baseline) Object.keys(p.gps.baseline).forEach((k) => { if (raw.gps.baseline[k] !== undefined) p.gps.baseline[k] = raw.gps.baseline[k]; });
      if (Array.isArray(raw.gps.sessions)) {
        p.gps.sessions = raw.gps.sessions.map((s) => {
          const row = newSession(s.date);
          Object.keys(row).forEach((k) => { if (s[k] !== undefined && k !== "date") row[k] = s[k]; });
          GPS_METRICS.forEach((m) => { if (!isNum(row[m.key])) row[m.key] = null; });
          row.alterg = !!s.alterg;
          row.bw = isNum(s.bw) ? s.bw : null;
          return row;
        });
      }
    }
    return p;
  }

  // The worked example shipped in the workbook (Knee + Hip tabs, GPS log, Status Log).
  function examplePlayer() {
    const p = newPlayer();
    Object.assign(p.profile, { name: "Example Player", position: "CM · U16", injury: "e.g. L ACL reconstruction", side: "L",
      injuryDate: "2026-08-10", rtpDate: "2027-02-01", dob: "2011-03-14" });
    const g = newGrowthRow("2026-09-01");
    Object.assign(g, { height: 171.4, mass: 58.2, matOffset: 0.6, notes: "EXAMPLE ROW — overwrite / delete" });
    p.growth.push(g);
    p.settings.ticks = { Hip: true, Knee: true };
    p.settings.chartRegion = "Knee";
    const NOTE = "EXAMPLE ROW — overwrite / delete";
    const fill = (block, rows) => rows.forEach(([date, vals]) => {
      const row = newBlockRow(date);
      vals.forEach((pair, k) => { row.vals[k] = pair.slice(); });
      row.notes = NOTE;
      block.rows.push(row);
    });
    const knee = p.regions.Knee.blocks;
    fill(knee.rom, [["2026-08-24", [[118, 140], [2, 3], [9.5, 12], [44.5, 47.0]]], ["2026-09-21", [[135, 141], [3, 3], [11, 12], [45.5, 47.0]]]]);
    fill(knee.str, [["2026-09-07", [[312, 480], [255, 300], [1210, 1500], [260, 280]]], ["2026-10-12", [[395, 490], [281, 305], [1380, 1520], [272, 285]]]]);
    fill(knee.jmp, [["2026-10-12", [[27.5, null], [14.2, 19.0], [128, 160], [null, null], [null, null], [1.62, null], [null, null], [1.85, null]]]]);
    [0, 1, 5].forEach((i) => { p.regions.Knee.criteria[i].override = "Y"; });
    // pain response recorded on the quadriceps test
    knee.str.slots[0].pain = true;
    knee.str.rows[0].nrs[0] = 3;
    knee.str.rows[1].nrs[0] = 1;
    // performance testing: pre-season (pre-injury) and two tests during rehab
    const pm = [["Countermovement Jump", "Jump Height"], ["Countermovement Jump", "mRSI"], ["Countermovement Jump", "Peak Relative Propulsive Power"],
      ["Iso Squat", "Peak Force"], ["Iso Squat", "Relative Peak Force"], ["Hip Adduction", "Peak Force"], ["Hip Abduction", "Peak Force"],
      ["Ankle Iso", "Peak Force"]].map(([t, n]) => newPerfMetric(t, n));
    p.perf.metrics = pm;
    [["2026-07-20", [0.385, 0.52, 58.1, 2650, 46.0, 410, 395, 1720]], ["2026-09-28", [null, null, null, 1980, 34.4, 330, 340, 1310]],
      ["2026-10-19", [0.29, 0.38, 47.5, 2240, 38.5, 365, 372, 1455]]].forEach(([date, vals]) => {
      const r = newPerfRow(date);
      vals.forEach((v, k) => { if (v != null) r.vals[pm[k].id] = v; });
      r.notes = NOTE;
      p.perf.rows.push(r);
    });
    // wellness log: symptoms settling over the first 11 weeks
    [["2026-08-12", 4, 6, 5], ["2026-08-19", 3, 5, 5], ["2026-08-26", 3, 5, 4], ["2026-09-02", 2, 4, 3], ["2026-09-09", 2, 4, 4],
      ["2026-09-16", 1, 3, 3], ["2026-09-23", 1, 3, 2], ["2026-09-30", 1, 2, 2], ["2026-10-07", 0, 3, 2], ["2026-10-14", 0, 2, 1],
      ["2026-10-21", 0, 2, 1]].forEach(([date, rest, activity, morning]) => {
      const w = newWellnessRow(date);
      Object.assign(w, { rest, activity, morning, notes: NOTE });
      p.wellness.push(w);
    });
    fill(p.regions.Hip.blocks.str, [
      ["2026-09-28", [[20.1, 24.0], [29.0, 31.0], [11.2, 12.8], [13.0, 13.1], [25.9, 30.2], [24.1, 27.5], [18.7, 21.9]]],
      ["2026-10-19", [[22.6, 24.3], [30.4, 31.2], [12.1, 12.9], [13.4, 13.2], [28.1, 30.4], [25.8, 27.6], [20.5, 22.0]]]]);
    Object.assign(p.gps.baseline, { source: "e.g. 4-wk pre-injury avg", td: 20000, hsr: 800, sd: 300, acc: 80, dec: 80, top: 8.9,
      notes: "EXAMPLE values — replace with the player's own baseline" });
    [["2026-10-13", "Training", 4850, 210, 45, 22, 19, 7.4], ["2026-10-15", "Training", 5620, 265, 80, 25, 23, 7.9],
      ["2026-10-19", "Rehab", 3900, 140, 30, 15, 14, 7.1]].forEach(([date, type, ...v]) => {
      const s = newSession(date);
      s.type = type;
      GPS_METRICS.forEach((m, i) => { s[m.key] = v[i]; });
      s.notes = NOTE;
      p.gps.sessions.push(s);
    });
    // Alter-G (anti-gravity treadmill) block before returning to the pitch
    [["2026-09-22", 70, 2400, 4.5], ["2026-09-29", 80, 3100, 5.0], ["2026-10-06", 90, 3600, 5.4]].forEach(([date, bw, td, top]) => {
      const s = newSession(date);
      Object.assign(s, { type: "Rehab", alterg: true, bw, td, top, notes: NOTE });
      p.gps.sessions.push(s);
    });
    [["2026-08-10", AVAIL[0], FOCUS[0], []], ["2026-09-14", AVAIL[0], FOCUS[1], []], ["2026-10-12", AVAIL[0], FOCUS[2], []],
      ["2026-10-19", AVAIL[0], FOCUS[2], ["acc"]]].forEach(([date, avail, focus, ticks]) => {
      const e = newStatusRow(date);
      e.avail = avail; e.focus = focus; e.notes = NOTE;
      ticks.forEach((k) => { e.addons[k] = true; });
      p.statusLog.push(e);
    });
    return p;
  }

  // ------------------------------------------------------------------ core calculations
  // LSI = injured ÷ uninjured side; side not set -> MIN / MAX
  function lsi(l, r, side) {
    if (!isNum(l) || !isNum(r)) return null;
    if (side === "L") return r === 0 ? null : l / r;
    if (side === "R") return l === 0 ? null : r / l;
    const mx = Math.max(l, r);
    return mx === 0 ? null : Math.min(l, r) / mx;
  }

  // Most recent entry by date (undated rows count as oldest; ties -> later row)
  function latestOf(entries) {
    let best = null;
    entries.forEach((e) => { if (!best || e.d > best.d || (e.d === best.d && e.i > best.i)) best = e; });
    return best;
  }

  function calcBlock(block, side, injIso) {
    const rows = block.rows.map((row, i) => {
      const d = dnum(row.date);
      return { row, i, d: d == null ? 0 : d, wk: weekOf(row.date, injIso),
        lsi: block.slots.map((s, k) => lsi(row.vals[k][0], row.vals[k][1], side)) };
    });
    const slots = block.slots.map((s, k) => {
      const L = [], R = [], X = [], N = [];
      rows.forEach((r) => {
        const [l, rv] = r.row.vals[k];
        if (isNum(l)) L.push({ d: r.d, i: r.i, v: l });
        if (isNum(rv)) R.push({ d: r.d, i: r.i, v: rv });
        if (r.lsi[k] != null) X.push({ d: r.d, i: r.i, v: r.lsi[k] });
        if (r.row.nrs && isNum(r.row.nrs[k])) N.push({ d: r.d, i: r.i, v: r.row.nrs[k] });
      });
      const lL = latestOf(L), lR = latestOf(R), lX = latestOf(X), lN = latestOf(N);
      // Δ vs previous test of the same metric (score for bilateral tests, LSI otherwise)
      const series = (s.bilateral ? L : X).slice().sort((a, b) => a.d - b.d || a.i - b.i);
      let delta = null, deltaText = "";
      if (series.length >= 2) {
        const lat = series[series.length - 1].v, prev = series[series.length - 2].v;
        delta = s.bilateral ? lat - prev : (lat - prev) * 100;
        deltaText = s.bilateral ? fmtSigned(delta, 1) : fmtSigned(delta, 0) + " pts";
      }
      return {
        k, name: s.name, bilateral: !!s.bilateral, inUse: !isSpare(s.name),
        l: lL ? lL.v : null, r: lR ? lR.v : null, lsi: lX ? lX.v : null,
        date: lL && lL.d > 0 ? lL.d : null,
        delta, deltaText,
        pain: !!s.pain, nrs: lN ? lN.v : null,
      };
    });
    const lastTest = rows.reduce((m, r) => (r.d > 0 && (m == null || r.d > m) ? r.d : m), null);
    return { rows, slots, lastTest };
  }

  // Weekly totals by rehab week (sum per metric, max for top speed)
  function weeklyTotals(sessions, inj) {
    const byWeek = {};
    let latestWeek = 0;
    sessions.forEach((s) => {
      const wk = weekOf(s.date, inj);
      if (wk == null || wk < 1) return;
      const w = byWeek[wk] || (byWeek[wk] = { wk, n: 0, td: 0, hsr: 0, sd: 0, acc: 0, dec: 0, top: 0, bw: null, has: {} });
      w.n++;
      GPS_METRICS.forEach((m) => {
        if (isNum(s[m.key])) w.has[m.key] = true;
        const v = isNum(s[m.key]) ? s[m.key] : 0;
        w[m.key] = m.max ? Math.max(w[m.key], v) : w[m.key] + v;
      });
      if (isNum(s.bw)) w.bw = w.bw == null ? s.bw : Math.max(w.bw, s.bw);
      latestWeek = Math.max(latestWeek, wk);
    });
    return { byWeek, latestWeek };
  }

  // On-pitch sessions drive every GPS figure (baseline %, criteria, chips); Alter-G sessions are tracked alongside.
  function calcGps(player) {
    const inj = player.profile.injuryDate, base = player.gps.baseline;
    const pitch = weeklyTotals(player.gps.sessions.filter((s) => !s.alterg), inj);
    const ag = weeklyTotals(player.gps.sessions.filter((s) => s.alterg), inj);
    const byWeek = pitch.byWeek, latestWeek = pitch.latestWeek;
    const lastWeek = Math.max(latestWeek, ag.latestWeek);
    const weeks = [];
    for (let wk = 1; wk <= lastWeek; wk++) weeks.push(byWeek[wk] || { wk, n: 0 });
    const agWeeks = [];
    for (let wk = 1; wk <= lastWeek; wk++) agWeeks.push(ag.byWeek[wk] || { wk, n: 0 });
    const logged = weeks.filter((w) => w.n > 0);
    const best = {}, bestRatio = {};
    GPS_METRICS.forEach((m) => {
      best[m.key] = logged.length ? Math.max.apply(null, logged.map((w) => w[m.key])) : null;
      const b = base[m.key];
      bestRatio[m.key] = isNum(b) && b !== 0 && best[m.key] != null ? best[m.key] / b : null;
    });
    const latest = latestWeek ? byWeek[latestWeek] : null;
    const latestRatio = {};
    GPS_METRICS.forEach((m) => {
      const b = base[m.key];
      latestRatio[m.key] = latest && isNum(b) && b !== 0 ? latest[m.key] / b : null;
    });
    const yCount = player.gps.criteria.filter((c) => c.achieved === "Y").length;
    const rtsStatus = yCount === GPS_RTS.length ? "READY" : yCount === 0 ? "NOT READY" : "IN PROGRESS";
    return {
      weeks, latestWeek, latest, best, bestRatio, latestRatio, yCount, rtsStatus,
      ag: { weeks: agWeeks, latestWeek: ag.latestWeek, latest: ag.latestWeek ? ag.byWeek[ag.latestWeek] : null,
        any: player.gps.sessions.some((s) => s.alterg) },
    };
  }

  function criterionCurrent(c, feed, side, gps) {
    const T = str(c.test).trim();
    if (!T || isManual(T)) return null;
    if (isGpsTest(T)) {
      const i = GPS_LABELS.findIndex((g) => norm(g) === norm(T));
      return i < 0 ? null : gps.bestRatio[GPS_METRICS[i].key];
    }
    const slot = feed.find((s) => norm(s.name) === norm(T));
    if (!slot) return null;
    const M = c.measure;
    if (M === "LSI") return slot.lsi;
    if (M === "L") return slot.l;
    if (M === "R") return slot.r;
    return side === "L" ? slot.l : side === "R" ? slot.r : null;
  }

  function calcRegion(player, name, gps) {
    const reg = player.regions[name], side = player.profile.side, inj = player.profile.injuryDate;
    const blocks = {};
    BLOCKS.forEach(({ key }) => { blocks[key] = calcBlock(reg.blocks[key], side, inj); });
    const feed = [];
    BLOCKS.forEach(({ key, label }) => blocks[key].slots.forEach((s) => feed.push(Object.assign({ block: key, blockLabel: label }, s))));

    const criteria = reg.criteria.map((c, j) => {
      const cur = criterionCurrent(c, feed, side, gps);
      const asPct = c.measure === "LSI" || isGpsTest(c.test);
      const curText = cur == null ? "" : asPct ? fmtPct(cur) : fmt1(cur);
      const auto = cur == null || !isNum(c.thr) ? "" : (c.op === "≤" ? cur <= c.thr : cur >= c.thr) ? "MET" : "NOT MET";
      const met = c.override ? c.override : auto === "MET" ? "Y" : auto === "NOT MET" ? "N" : "";
      let dateMet = null;
      if (met === "Y" && !isGpsTest(c.test)) {
        const slot = feed.find((s) => norm(s.name) === norm(c.test));
        dateMet = slot ? slot.date : null;
      }
      return { j, phase: Math.floor(j / CRIT_PER_PHASE), cur, curText, auto, met, dateMet, defined: str(c.text).trim() !== "" };
    });

    const phases = reg.phases.map((ph, p) => {
      const rows = criteria.slice(p * CRIT_PER_PHASE, (p + 1) * CRIT_PER_PHASE);
      const defined = rows.filter((r) => r.defined).length;
      const met = rows.filter((r) => r.defined && r.met === "Y").length;
      const cleared = defined > 0 && met === defined;
      const open = rows.filter((r) => r.defined && r.met !== "Y").map((r) => str(reg.criteria[r.j].text));
      return { p, name: ph, defined, met, cleared, metText: defined === 0 ? "No criteria defined" : `${met} / ${defined}`,
        next: cleared ? "—" : (open[0] || ""), open };
    });
    const curIdx = phases.findIndex((ph) => !ph.cleared);
    const clearedCount = phases.filter((ph) => ph.cleared).length;
    const status = clearedCount >= PHASES.length ? "COMPLETE" : clearedCount === 0 ? "NOT STARTED" : "IN PROGRESS";
    const openNow = curIdx >= 0 ? phases[curIdx].open.join("   ·   ") : "";
    const lastTest = BLOCKS.reduce((m, { key }) => {
      const d = blocks[key].lastTest;
      return d != null && (m == null || d > m) ? d : m;
    }, null);
    const list = feed.filter((s) => s.inUse);
    list.forEach((s, i) => { s.blockFirst = i === 0 || list[i - 1].block !== s.block; });
    return {
      name, blocks, feed, list, criteria, phases, curIdx,
      currentPhase: curIdx >= 0 ? phases[curIdx].name : "Rehab complete — RTP",
      clearedCount, clearedText: `${clearedCount} / ${PHASES.length}`, status, openNow,
      openText: openNow === "" ? (status === "COMPLETE" ? "All phases cleared" : "—") : openNow,
      lastTest,
    };
  }

  function headline(e) {
    if (!e.date || !e.focus) return "";
    const parts = ADDONS.filter((a) => e.addons && e.addons[a.key]).map((a) => a.text);
    return e.focus + (parts.length ? " + " + parts.join(" + ") : "");
  }

  // Squad board colour for an availability: red = unavailable, amber = modified, green = full training / available
  function availGroup(text) {
    const t = str(text).toLowerCase();
    if (!t.trim()) return "";
    if (t.indexOf("unavailable") >= 0) return "red";
    if (t.indexOf("modified") >= 0 || t.indexOf("partial") >= 0) return "amber";
    if (t.indexOf("full training") >= 0 || t.indexOf("available") >= 0) return "green";
    return "";
  }
  // within green: return to training first, then available for selection
  const availStage = (text) => (/available for selection/i.test(str(text)) ? 2 : availGroup(text) === "green" ? 1 : 0);

  // the current colour group, when this spell in it began, and when the current green spell (return to training) began
  function boardStatus(sorted) {
    if (!sorted.length) return { group: "", groupSince: null, rttDate: null, stage: 0 };
    const last = sorted[sorted.length - 1].e, group = availGroup(last.avail);
    let j = sorted.length - 1;
    while (j > 0 && availGroup(sorted[j - 1].e.avail) === group) j--;
    return { group, groupSince: sorted[j].d, rttDate: group === "green" ? sorted[j].d : null, stage: availStage(last.avail) };
  }

  function calcStatus(player, gps) {
    const inj = player.profile.injuryDate;
    const log = player.statusLog.map((e, i) => ({ e, i, d: dnum(e.date) })).filter((x) => x.d != null);
    const sorted = log.slice().sort((a, b) => a.d - b.d || a.i - b.i);
    const latest = sorted.length ? sorted[sorted.length - 1].e : null;
    const earliest = (pred) => { const x = sorted.find((s) => pred(s.e)); return x ? x.d : null; };
    const baseFocus = latest ? str(latest.focus) : "";
    const baseSince = baseFocus ? earliest((e) => e.focus === baseFocus) : null;
    const injN = dnum(inj);
    const wkOf = (d) => (d == null || injN == null ? null : Math.floor((d - injN) / 7) + 1);
    const sinceText = (d) => d == null ? "not yet introduced" : "since " + fmtDate(d) + (injN == null ? "" : " · wk " + wkOf(d));
    const nog = !gps.latestWeek;
    const w = gps.latest;
    const isPitch = (f) => norm(f).slice(0, 5) === "pitch";
    const topBase = player.gps.baseline.top;
    const chips = [
      { name: "Running volume", active: isPitch(baseFocus), value: nog ? "no GPS logged" : fmtInt(w.td) + " m total",
        since: earliest((e) => isPitch(e.focus)) },
      { name: "Accel / decel", key: "acc", value: nog ? "" : fmtInt(w.acc + w.dec) + " acc + dec" },
      { name: "Change of direction", key: "cod", value: "not GPS-tracked" },
      { name: "High-speed running", key: "hsr", value: nog ? "" : fmtInt(w.hsr) + " m HSR" },
      { name: "Sprint distance", key: "sd", value: nog ? "" : fmtInt(w.sd) + " m sprint" },
      { name: "Top speed", key: "top", value: nog ? "" : fmt1(w.top) + " m/s" + (isNum(topBase) && topBase !== 0 ? " · " + fmtPct(w.top / topBase) : "") },
    ];
    chips.forEach((c) => {
      if (c.key) {
        c.active = !!(latest && latest.addons && latest.addons[c.key]);
        c.since = earliest((e) => !!(e.addons && e.addons[c.key]));
      }
      c.sinceText = sinceText(c.since);
    });
    const history = sorted.slice(-6).map((s) => {
      const wk = weekOf(s.e.date, inj);
      return { date: s.d, label: fmtDate(s.d) + (wk == null ? "" : "   ·   wk " + wk), headline: headline(s.e), avail: str(s.e.avail) };
    });
    return {
      latest,
      availability: latest ? str(latest.avail) : "Not set — add an entry on the Status Log tab",
      headline: latest ? headline(latest) : "—",
      baseFocus, baseSince, baseSinceWk: wkOf(baseSince),
      gpsWeekText: nog ? "" : "Latest logged GPS week: wk " + gps.latestWeek,
      chips, history,
      ...boardStatus(sorted),
    };
  }

  function maturity(pr) {
    if (isNum(pr.pah)) {
      const v = pr.pah <= 1.5 ? pr.pah * 100 : pr.pah;
      return v < 85 ? "Pre-PHV" : v <= 95 ? "Circa-PHV" : "Post-PHV";
    }
    if (isNum(pr.matOffset)) return pr.matOffset < -1 ? "Pre-PHV" : pr.matOffset <= 1 ? "Circa-PHV" : "Post-PHV";
    return "";
  }

  // Growth log: per-row % PAH, maturity and growth rate, plus the latest value of each measure
  function calcGrowth(player) {
    const dob = dnum(player.profile.dob);
    const rows = player.growth.map((g, i) => ({ g, i, d: dnum(g.date) }));
    const dated = rows.filter((r) => r.d != null).sort((a, b) => a.d - b.d || a.i - b.i);
    const byIndex = {};
    rows.forEach((r) => {
      const g = r.g;
      const pctPah = isNum(g.height) && isNum(g.predicted) && g.predicted > 0 ? (g.height / g.predicted) * 100 : null;
      byIndex[r.i] = { pctPah, maturity: maturity({ pah: pctPah, matOffset: g.matOffset }),
        age: dob != null && r.d != null ? (r.d - dob) / 365.25 : null, rate: null };
      if (isNum(g.height) && isNum(g.sitting)) byIndex[r.i].leg = g.height - g.sitting;
    });
    // growth rate (cm / year) against the previous dated height
    let prev = null;
    dated.forEach((r) => {
      if (!isNum(r.g.height)) return;
      if (prev && r.d - prev.d >= 14) byIndex[r.i].rate = (r.g.height - prev.g.height) / ((r.d - prev.d) / 365.25);
      prev = r;
    });
    const latest = (pick) => {
      for (let k = dated.length - 1; k >= 0; k--) { const v = pick(dated[k]); if (v != null) return { v, d: dated[k].d }; }
      return null;
    };
    const L = {
      height: latest((r) => (isNum(r.g.height) ? r.g.height : null)),
      sitting: latest((r) => (isNum(r.g.sitting) ? r.g.sitting : null)),
      mass: latest((r) => (isNum(r.g.mass) ? r.g.mass : null)),
      predicted: latest((r) => (isNum(r.g.predicted) ? r.g.predicted : null)),
      matOffset: latest((r) => (isNum(r.g.matOffset) ? r.g.matOffset : null)),
      pctPah: latest((r) => byIndex[r.i].pctPah),
      rate: latest((r) => byIndex[r.i].rate),
    };
    const v = (k) => (L[k] ? L[k].v : null);
    return {
      rows: byIndex, dated,
      height: v("height"), sitting: v("sitting"), mass: v("mass"), predicted: v("predicted"), matOffset: v("matOffset"),
      pctPah: v("pctPah"), rate: v("rate"),
      measuredOn: dated.length ? dated[dated.length - 1].d : null,
      maturity: maturity({ pah: v("pctPah"), matOffset: v("matOffset") }),
      series: (k, f) => dated.filter((r) => byIndex[r.i].age != null && (f ? f(r) : r.g[k]) != null && isNum(f ? f(r) : r.g[k]))
        .map((r) => [Math.round(byIndex[r.i].age * 100) / 100, f ? f(r) : r.g[k]]),
    };
  }

  // Wellness: daily NRS trend. x = rehab week with decimals so daily entries spread out on the chart.
  function calcWellness(player) {
    const inj = dnum(player.profile.injuryDate);
    const dated = player.wellness.map((w, i) => ({ w, i, d: dnum(w.date) })).filter((r) => r.d != null)
      .sort((a, b) => a.d - b.d || a.i - b.i);
    const measures = WELLNESS.map((m) => {
      const pts = dated.filter((r) => isNum(r.w[m.key]));
      const last = pts.length ? pts[pts.length - 1] : null;
      // compare with the most recent entry at least a week before the latest one
      let prev = null;
      if (last) for (let j = pts.length - 2; j >= 0; j--) if (last.d - pts[j].d >= 7) { prev = pts[j]; break; }
      return {
        key: m.key, label: m.label,
        latest: last ? last.w[m.key] : null, latestDate: last ? last.d : null,
        change: last && prev ? last.w[m.key] - prev.w[m.key] : null,
        fromStart: last && pts.length > 1 ? last.w[m.key] - pts[0].w[m.key] : null,
        points: inj == null ? [] : pts.map((r) => [Math.round(((r.d - inj) / 7 + 1) * 100) / 100, r.w[m.key], fmtDate(r.d)]),
      };
    });
    return { measures, count: dated.length, lastDate: dated.length ? dated[dated.length - 1].d : null };
  }

  // per metric: pre-injury (typed, else the last test dated before injury), latest, best since injury, % of pre-injury
  function calcPerf(player) {
    const inj = dnum(player.profile.injuryDate), P = player.perf;
    const rows = P.rows.map((r, i) => ({ r, i, d: dnum(r.date), wk: weekOf(r.date, player.profile.injuryDate) }));
    const dated = rows.filter((x) => x.d != null).sort((a, b) => a.d - b.d || a.i - b.i);
    const metrics = P.metrics.map((m) => {
      const k = m.id;
      const pts = dated.filter((x) => isNum(x.r.vals[k]));
      const pre = inj == null ? [] : pts.filter((x) => x.d < inj);
      const post = inj == null ? pts : pts.filter((x) => x.d >= inj);
      const base = isNum(m.base) ? m.base : pre.length ? pre[pre.length - 1].r.vals[k] : null;
      const baseFrom = isNum(m.base) ? "entered" : pre.length ? pre[pre.length - 1].d : null;
      const last = post.length ? post[post.length - 1] : null, prev = post.length > 1 ? post[post.length - 2] : null;
      const latest = last ? last.r.vals[k] : null;
      const best = post.length ? (m.lower ? Math.min : Math.max).apply(null, post.map((x) => x.r.vals[k])) : null;
      const pctOf = (v) => (isNum(base) && base !== 0 && isNum(v) ? v / base : null);
      return {
        k, id: m.id, test: m.test, name: m.name, lower: !!m.lower, label: m.test ? `${m.test} · ${m.name}` : m.name, inUse: true, base, baseFrom, latest, latestDate: last ? last.d : null,
        best, pct: pctOf(latest), bestPct: pctOf(best),
        delta: last && prev ? latest - prev.r.vals[k] : null,
        pctPoints: post.filter((x) => x.wk != null && x.wk >= 0).map((x) => [x.wk, pctOf(x.r.vals[k]), fmtDate(x.d)]).filter((p) => p[1] != null),
        rawPoints: post.filter((x) => x.wk != null && x.wk >= 0).map((x) => [x.wk, x.r.vals[k], fmtDate(x.d)]),
      };
    });
    return { metrics, rows: Object.fromEntries(rows.map((x) => [x.i, x])) };
  }

  function calcPlayer(player) {
    const pr = player.profile, today = todayNum();
    const growth = calcGrowth(player);
    const inj = dnum(pr.injuryDate), dob = dnum(pr.dob), rtp = dnum(pr.rtpDate);
    const gps = calcGps(player);
    const regions = {};
    REGIONS.forEach((r) => { regions[r] = calcRegion(player, r, gps); });
    const ticked = REGIONS.filter((r) => player.settings.ticks[r]);
    const chartRegion = player.settings.chartRegion || ticked[0] || REGIONS[0];
    return {
      gps, regions, ticked, chartRegion,
      status: calcStatus(player, gps),
      weekOfRehab: inj == null ? null : Math.floor((today - inj) / 7) + 1,
      daysPost: inj == null ? null : today - inj,
      weeksToRtp: rtp == null ? null : Math.round(((rtp - today) / 7) * 10) / 10,
      age: dob == null ? null : (today - dob) / 365.25,
      ageAtInjury: dob == null || inj == null ? null : (inj - dob) / 365.25,
      maturity: growth.maturity,
      growth,
      wellness: calcWellness(player),
      perf: calcPerf(player),
    };
  }

  // Progression: LSI by rehab week for every in-use, non-bilateral slot of a block
  function lsiSeries(regionCalc, key) {
    const b = regionCalc.blocks[key];
    return b.slots.filter((s) => s.inUse && !s.bilateral).map((s) => ({
      name: s.name, k: s.k,
      points: b.rows.filter((r) => r.wk != null && r.lsi[s.k] != null)
        .sort((x, y) => x.wk - y.wk || x.i - y.i).map((r) => [r.wk, r.lsi[s.k]]),
    })).filter((s) => s.points.length);
  }

  // L vs R (or score) of one slot by rehab week
  function slotSeries(regionCalc, key, k) {
    const b = regionCalc.blocks[key], s = b.slots[k];
    const pts = (idx) => b.rows.filter((r) => r.wk != null && isNum(r.row.vals[k][idx]))
      .sort((x, y) => x.wk - y.wk || x.i - y.i).map((r) => [r.wk, r.row.vals[k][idx]]);
    if (s.bilateral) return [{ name: "Score", points: pts(0) }];
    return [{ name: "L", points: pts(0) }, { name: "R", points: pts(1) }];
  }

  const Calc = {
    REGIONS, PHASES, CRIT_PER_PHASE, SLOTS, SPARE, MANUAL, JUMP_BATTERY, BILATERAL, GPS_LABELS, BLOCKS, GPS_METRICS, GPS_RTS,
    DEFAULT_LISTS, ADDONS, REGION_SPEC,
    regionTitle, blockTitle, isNum, isSpare, isGpsTest, isManual, uid,
    dnum, todayNum, todayIso, setToday, isoFromNum, fmtDate, weekOf,
    fmtInt, fmt1, fmtPct, fmtNum, fmtSigned,
    newPlayer, newRegion, newBlockRow, newStatusRow, newSession, newGrowthRow, calcGrowth, newWellnessRow, calcWellness, WELLNESS, newPerfRow, newPerfMetric, calcPerf, normalizePlayer, examplePlayer,
    availGroup, lsi, calcBlock, calcGps, calcRegion, calcStatus, calcPlayer, headline, maturity, lsiSeries, slotSeries,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(typeof window !== "undefined" ? window : globalThis);
