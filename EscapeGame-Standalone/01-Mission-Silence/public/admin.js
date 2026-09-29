"use strict";

const $ = (id) => document.getElementById(id);

let pin = localStorage.getItem("msAdminPin") || "";
let config = { thresholdDb: 55, explodeThresholdDb: 65, code: "----", word: "—", calibration: null };
let state = "IDLE";
let telemetry = { db: 0, maxDb: 0, peak: 0, attempt: 0, fails: 0, timeLeft: null, calibrated: false };

const CAL_LABELS = { ambient: "bruit de fond", clap: "claquement", reference94: "source 94 dB" };

const STATE_LABELS = {
  IDLE: "REPOS",
  COUNTDOWN: "PRÊTS ?",
  SEARCH: "EN COURS",
  EXPLODE: "EXPLOSION",
  SUCCESS: "CODE TROUVÉ",
  TIMEOUT: "TEMPS ÉCOULÉ",
  DEMO: "DÉMO"
};

function fmtTime(secs) {
  if (secs == null) return "--";
  return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
}

function pct(dB) {
  return Math.min(100, Math.max(0, ((dB + 10) / 130) * 100));
}

function stateBadgeClass(s) {
  if (["FAIL", "EXPLODE", "TIMEOUT"].includes(s)) return "fail";
  if (["SEARCH", "SUCCESS"].includes(s)) return "search";
  if (["COUNTDOWN", "DEMO"].includes(s)) return "countdown";
  return "idle";
}

function render() {
  const badge = $("stateBadge");
  badge.textContent = STATE_LABELS[state] || state;
  badge.className = "badge " + stateBadgeClass(state);

  const db = Math.round(telemetry.db);
  $("dbNum").textContent = db;
  $("dbNum").style.color = db >= config.explodeThresholdDb ? "#e74c3c"
    : db >= config.thresholdDb ? "#f1c40f" : "#2ecc71";
  $("needle").style.left = pct(db) + "%";
  $("thMark").style.left = pct(config.thresholdDb) + "%";
  $("exMark").style.left = pct(config.explodeThresholdDb) + "%";
  $("dbMax").textContent = "max : " + telemetry.maxDb + " dB";

  $("stState").textContent = STATE_LABELS[state] || state;
  $("stAttempt").textContent = telemetry.attempt;
  $("stFails").textContent = telemetry.fails;
  $("stTime").textContent = fmtTime(telemetry.timeLeft);
  $("stPeak").textContent = telemetry.peak + " dB";

  $("btnArm").textContent = state === "FAIL" || state === "EXPLODE" ? "Relancer" : "Armer";

  $("cfgTh").textContent = config.thresholdDb;
  $("cfgEx").textContent = config.explodeThresholdDb;
  if (document.activeElement !== $("cfgCode")) $("cfgCode").value = config.code;
  $("cfgWord").textContent = config.word;
  const cal = config.calibration;
  $("cfgCalib").textContent = (cal && Number.isFinite(cal.offsetDb))
    ? (CAL_LABELS[cal.method] || cal.method || "?") + " (" + Math.round(cal.offsetDb) + " dB)"
    : (telemetry.calibrated ? "locale (non enregistrée)" : "non faite");
}

function post(action, value) {
  return fetch("cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, action, value })
  }).then((r) => r.json());
}

// ---- Connexion ----
function connect() {
  const es = new EventSource("events");
  $("connStatus").textContent = "connexion…";

  es.addEventListener("hello", (e) => {
    const d = JSON.parse(e.data);
    if (d.config) {
      config = Object.assign(config, d.config);
      $("cfgCode").value = config.code;
    }
    if (d.state) state = d.state;
    if (d.telemetry) telemetry = d.telemetry;
    $("connStatus").textContent = "connecté";
    render();
  });

  es.addEventListener("telemetry", (e) => {
    const t = JSON.parse(e.data);
    if (t.state) state = t.state;
    telemetry = t;
    if ((t.state === "FAIL" || t.state === "EXPLODE") && navigator.vibrate) {
      navigator.vibrate(t.state === "EXPLODE" ? [300, 100, 300] : 350);
    }
    render();
  });

  es.addEventListener("cmd", (e) => {
    const d = JSON.parse(e.data);
    if (d.action === "threshold") config.thresholdDb = d.value;
    else if (d.action === "explodeThreshold") config.explodeThresholdDb = d.value;
    else if (d.action === "code") config.code = d.value;
    else if (d.action === "word") config.word = d.value;
    else if (d.action === "calibration") {
      config.calibration = d.value;
      telemetry.calibrated = !!(d.value && Number.isFinite(d.value.offsetDb));
    }
    render();
  });
  es.onerror = () => { $("connStatus").textContent = "déconnecté — reconnexion…"; };
}

// ---- PIN ----
$("pinGo").addEventListener("click", async () => {
  pin = $("pinInput").value.trim();
  const r = await post("ping", null).catch(() => null);
  if (r && r.ok) {
    localStorage.setItem("msAdminPin", pin);
    $("pinGate").classList.add("hidden");
    $("app").classList.remove("hidden");
    connect();
  } else {
    $("pinError").classList.remove("hidden");
  }
});
$("pinInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("pinGo").click();
});

// ---- Boutons ----
$("btnArm").addEventListener("click", () => post("arm"));
$("btnResetTimer").addEventListener("click", () => post("resetTimer"));
$("btnDemo").addEventListener("click", () => post("demo"));
$("btnStop").addEventListener("click", () => post("stop"));

$("thMinus").addEventListener("click", () => post("threshold", config.thresholdDb - 1));
$("thPlus").addEventListener("click", () => post("threshold", config.thresholdDb + 1));
$("exMinus").addEventListener("click", () => post("explodeThreshold", config.explodeThresholdDb - 1));
$("exPlus").addEventListener("click", () => post("explodeThreshold", config.explodeThresholdDb + 1));

$("codeOk").addEventListener("click", () => {
  const v = $("cfgCode").value.replace(/\D/g, "").slice(0, 4);
  if (v.length < 4) { alert("4 chiffres requis."); return; }
  post("code", v).then((r) => { if (r.ok) $("cfgCode").value = r.config.code; });
});
