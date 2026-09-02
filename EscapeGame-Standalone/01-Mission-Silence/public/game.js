"use strict";

const EQUIV = [
  [0, "seuil d'audition"],
  [20, "respiration à 1 m"],
  [30, "chuchotement à 1 m"],
  [40, "voix basse à 1 m"],
  [60, "conversation à 1 m"],
  [70, "voix forte à 1 m"],
  [90, "applaudissement à 1 m"],
  [110, "cri à 1 m"],
  [120, "seuil de douleur"]
];

const EQUIV_GUAGE = [
  [0, "0\nseuil d'audition"],
  [30, "30\nchuchotement à 1 m"],
  [60, "60\nconversation à 1 m"],
  [90, "90\napplaudissement à 1 m"],
  [110, "110\ncri à 1 m"],
  [120, "120\nseuil de douleur"]
];

function equivLabel(d) {
  let best = EQUIV[0];
  for (const [v, l] of EQUIV) {
    if (d >= v) best = [v, l];
  }
  return best[1];
}

// ---- Config & état ----
const CONFIG = {
  word: "TOUCHE",
  code: "4821",
  thresholdDb: 55,
  explodeThresholdDb: 80,
  failDurationMs: 1000,
  codeDisplayMs: 120000,
  timeoutDisplayMs: 30000,
  timeLimitMs: 300000,
  timePenaltyMs: 20000,
  wordPenaltyMs: 10000,
  maxFails: 0
};

let state = "IDLE";
let dbSpl = 0;
let smoothedDb = 0;
let peakDb = -120;
let maxDbRun = 0;
let attempt = 0;
let fails = 0;
let countdownLeft = 3;
let searchStart = 0;
let successDeadline = 0;
let explodeDeadline = 0;
let timeoutDeadline = 0;
let noiseSince = 0;
let noiseAbove = false;
let warningHideAt = 0;
let warningFading = false;
let timeLeftMs = 300000;
let lastFrame = 0;
let penaltyFlashTimer = null;
let countdownTimer = null;
let calOffset = parseFloat(localStorage.getItem("msCalOffset") || "0");
if (localStorage.getItem("msOffset") !== null) {
  calOffset = parseFloat(localStorage.getItem("msOffset") || "0");
  localStorage.removeItem("msOffset");
  localStorage.setItem("msCalOffset", String(calOffset));
}
let rawDb = 0;

// ---- Éléments DOM ----
const $ = (id) => document.getElementById(id);
const screens = {
  IDLE: $("scrIdle"),
  COUNTDOWN: $("scrCountdown"),
  SEARCH: $("scrSearch"),
  EXPLODE: $("scrExplode"),
  SUCCESS: $("scrSuccess"),
  TIMEOUT: $("scrTimeout"),
  DEMO: $("scrDemo")
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("hidden", key !== name);
  }
}

function buildGauge(container, gaugeId, showThreshold) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "gauge";
  wrap.id = gaugeId;
  const fill = document.createElement("div");
  fill.className = "gfill";
  const needle = document.createElement("div");
  needle.className = "gneedle";
  wrap.append(fill, needle);
  if (showThreshold) {
    const t = document.createElement("div");
    t.className = "gthresh";
    t.id = gaugeId + "-th";
    const ex = document.createElement("div");
    ex.className = "gthresh expl";
    ex.id = gaugeId + "-ex";
    wrap.append(t, ex);
  }
  container.append(wrap);
  const labels = document.createElement("div");
  labels.className = "gauge-labels";
  for (let i = 0; i < EQUIV_GUAGE.length; i++) {
    const [v, txt] = EQUIV_GUAGE[i];
    const s = document.createElement("span");
    s.style.left = pct(v) + "%";
    s.style.transform = "translateX(" + (i === EQUIV_GUAGE.length - 1 ? "-100%" : "-50%") + ")";
    s.textContent = txt;
    labels.append(s);
  }
  container.append(labels);
  return wrap;
}

function pct(dB) {
  return ((dB + 10) / 130) * 100;
}

function setGauge(gaugeId, dB) {
  const needle = document.querySelector("#" + gaugeId + " .gneedle");
  if (needle) needle.style.left = pct(dB) + "%";
}

function setGaugeThresholds(containerId, threshold, explode) {
  const t = $(containerId + "-th");
  const ex = $(containerId + "-ex");
  if (t) t.style.left = pct(threshold) + "%";
  if (ex) ex.style.left = pct(explode) + "%";
}

function dbColor(dB) {
  if (dB >= CONFIG.explodeThresholdDb) return "#e74c3c";
  if (dB >= CONFIG.thresholdDb) return "#f1c40f";
  return "#2ecc71";
}

// ---- Audio ----
let audioCtx = null;
let analyser = null;
let dataArray = null;

async function initMic() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  dataArray = new Float32Array(analyser.fftSize);
}

function measureDb() {
  if (!analyser) return;
  analyser.getFloatTimeDomainData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i];
    sum += v * v;
  }
  const rms = Math.sqrt(sum / dataArray.length);
  const dbfs = 20 * Math.log10(rms + 1e-9);
  rawDb = dbfs;
  dbSpl = dbfs + calOffset;
  smoothedDb = smoothedDb * 0.75 + dbSpl * 0.25;
  peakDb = Math.max(peakDb, dbSpl);
  if (state === "SEARCH" || state === "DEMO") maxDbRun = Math.max(maxDbRun, dbSpl);
}

// ---- Machine à états ----
function fitScreen(el) {
  const shrink = () => {
    if (!el) return;
    el.style.zoom = "1";
    const avail = window.innerHeight - 8;
    const need = el.scrollHeight;
    if (need > avail) el.style.zoom = String(Math.max(0.5, avail / need));
  };
  requestAnimationFrame(() => setTimeout(shrink, 50));
}

function enterState(name, opts) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  state = name;
  showScreen(name);
  const resume = !!(opts && opts.resume);

  if (name === "COUNTDOWN") {
    countdownLeft = 3;
    $("cdNumber").textContent = "3";
    countdownTimer = setInterval(() => {
      countdownLeft--;
      if (countdownLeft <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        startSearch();
        return;
      }
      $("cdNumber").textContent = String(countdownLeft);
    }, 1000);
  }

  if (name === "SEARCH") {
    if (!resume) {
      attempt++;
      fails = 0;
      $("attemptNum").textContent = String(attempt);
    }
    const we = $("wordEntry");
    if (we) {
      if (!resume) we.value = "";
      renderWordBoxes();
      setTimeout(() => we.focus(), 50);
    }
    maxDbRun = 0;
    noiseSince = 0;
    noiseAbove = dbSpl >= CONFIG.thresholdDb;
    searchStart = performance.now();
    lastFrame = 0;
  }

  if (name === "TIMEOUT") {
    timeoutDeadline = performance.now() + CONFIG.timeoutDisplayMs;
    const digits = CONFIG.code.slice(0, 3).split("").join(" ");
    $("timeoutDigits").innerHTML = digits + ' <span class="missing">?</span>';
    $("timeoutCountdown").textContent = String(Math.round(CONFIG.timeoutDisplayMs / 1000));
    noiseAbove = false;
  }

  if (name === "EXPLODE") {
    explodeDeadline = performance.now() + 4200;
    document.body.classList.add("shake");
  }

  if (name === "SUCCESS") {
    successDeadline = performance.now() + CONFIG.codeDisplayMs;
    const digits = CONFIG.code.padEnd(4, "-").split("").join(" ");
    $("codeDigits").textContent = digits;
    $("successAttempt").textContent = String(attempt);
    $("successStats").textContent = "Silence total : " + Math.round(maxDbRun) + " dB = " + equivLabel(maxDbRun) +
      " · Pic : " + Math.round(peakDb) + " dB";
    fitScreen($("scrSuccess"));
  }

  if (name === "IDLE" || name === "DEMO") {
    maxDbRun = 0;
    noiseAbove = false;
  }

  pushState();
}

function startSearch() {
  enterState("SEARCH");
}

function explodeNow() {
  applyPenalty(CONFIG.timePenaltyMs);
  if (state !== "TIMEOUT") enterState("EXPLODE");
}

function explodeFinished() {
  document.body.classList.remove("shake");
  enterState("SEARCH", { resume: true });
}

function successNow() {
  enterState("SUCCESS");
}

function applyPenalty(ms) {
  fails++;
  timeLeftMs = Math.max(0, timeLeftMs - ms);
  const p = $("timePenalty");
  if (p) {
    p.textContent = "-" + Math.round(ms / 1000) + " s";
    p.classList.remove("hidden");
    clearTimeout(penaltyFlashTimer);
    penaltyFlashTimer = setTimeout(() => p.classList.add("hidden"), 1200);
  }
  if (timeLeftMs <= 0) {
    timeLeftMs = 0;
    enterState("TIMEOUT");
  }
}

// ---- Logique de bruit (état SEARCH) ----
function checkNoise() {
  if (state !== "SEARCH") return;
  const w = $("noiseWarning");
  if (dbSpl >= CONFIG.explodeThresholdDb) {
    if (!noiseAbove) {
      noiseAbove = true;
      explodeNow();
    }
    if (w) w.classList.add("hidden");
    return;
  }
  noiseAbove = false;
  const now = performance.now();
  if (dbSpl >= CONFIG.thresholdDb) {
    warningHideAt = 0;
    warningFading = false;
    w.classList.remove("hidden", "hiding");
  } else if (!w.classList.contains("hidden") && !warningFading) {
    if (!warningHideAt) {
      warningHideAt = now + 1000;
    } else if (now >= warningHideAt) {
      warningFading = true;
      w.classList.add("hiding");
      setTimeout(() => {
        w.classList.add("hidden");
        w.classList.remove("hiding");
        warningFading = false;
      }, 650);
    }
  }
}

// ---- Affichage ----
function render() {
  const shown = Math.round(smoothedDb);
  const color = dbColor(shown);

  const setDb = (el, value) => {
    el.textContent = value;
    el.style.color = color;
  };

  if (state === "IDLE") {
    setDb($("idleDb"), shown);
    setGauge("gIdle", shown);
  } else if (state === "SEARCH") {
    setDb($("searchDb"), shown);
    setGauge("gSearch", shown);
  } else if (state === "DEMO") {
    setDb($("demoDb"), shown);
    setGauge("gDemo", shown);
  } else if (state === "SUCCESS") {
    const left = Math.max(0, Math.ceil((successDeadline - performance.now()) / 1000));
    $("codeCountdown").textContent = String(left);
  } else if (state === "TIMEOUT") {
    const left = Math.max(0, Math.ceil((timeoutDeadline - performance.now()) / 1000));
    $("timeoutCountdown").textContent = String(left);
  } else if (state === "EXPLODE") {
    const phase = performance.now() > explodeDeadline - 1500;
    const penalty = Math.round(CONFIG.timePenaltyMs / 1000);
    $("explodePhase").innerHTML = phase
      ? '<h1 class="explode-title" style="animation:none;color:#666;">REDÉMARRAGE…</h1>' +
        '<p class="explode-penalty">-' + penalty + ' s sur le compteur !</p>'
      : '<h1 class="explode-title">BZZZT !</h1><p class="explode-sub">Explosion sonore — le système se brouille…</p>' +
        '<p class="explode-penalty">-' + penalty + ' s sur le compteur !</p>';
  }
}

// ---- Chrono (temps restant) ----
function fmtTime(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
}

function renderTimer() {
  const el = $("searchTimer");
  if (!el) return;
  el.textContent = fmtTime(timeLeftMs);
  const wrap = el.parentElement;
  if (wrap) wrap.classList.toggle("low", timeLeftMs <= 60000);
}

// ---- Boucle principale ----
function tick() {
  measureDb();
  checkNoise();

  const now = performance.now();
  if (state === "SEARCH") {
    if (lastFrame) timeLeftMs -= now - lastFrame;
    lastFrame = now;
    if (timeLeftMs <= 0) {
      timeLeftMs = 0;
      enterState("TIMEOUT");
    }
  } else {
    lastFrame = 0;
  }

  if (state === "EXPLODE" && now >= explodeDeadline) {
    explodeFinished();
  }
  if (state === "SUCCESS" && now >= successDeadline) {
    enterState("IDLE");
  }
  if (state === "TIMEOUT" && now >= timeoutDeadline) {
    enterState("IDLE");
  }

  render();
  renderTimer();
  requestAnimationFrame(tick);
}

// ---- Télémesure vers le serveur ----
let lastTelemetryJson = "";
function pushState() {
  sendTelemetry(true);
}
function sendTelemetry(force) {
  const t = {
    state,
    db: Math.round(smoothedDb),
    maxDb: Math.round(maxDbRun),
    peak: Math.round(peakDb),
    attempt,
    fails,
    timeLeft: Math.max(0, Math.ceil(timeLeftMs / 1000))
  };
  const json = JSON.stringify(t);
  if (!force && json === lastTelemetryJson) return;
  lastTelemetryJson = json;
  fetch("telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json
  }).catch(() => {});
}

// ---- Serveur (commandes) ----
const sse = new EventSource("events");

sse.addEventListener("hello", (e) => {
  const d = JSON.parse(e.data);
  if (d.config) Object.assign(CONFIG, d.config);
  syncPanelFromConfig();
});

sse.addEventListener("cmd", (e) => {
  const d = JSON.parse(e.data);
  switch (d.action) {
    case "arm":
      if (state === "IDLE" || state === "FAIL" || state === "TIMEOUT") enterState("COUNTDOWN");
      break;
    case "resetTimer":
      resetTimerLocal();
      break;
    case "stop":
      enterState("IDLE");
      break;
    case "demo":
      enterState(state === "DEMO" ? "IDLE" : "DEMO");
      break;
    case "threshold":
      CONFIG.thresholdDb = d.value;
      $("thSlider").value = d.value;
      $("thLabel").textContent = d.value;
      break;
    case "explodeThreshold":
      CONFIG.explodeThresholdDb = d.value;
      $("exSlider").value = d.value;
      $("exLabel").textContent = d.value;
      break;
    case "code":
      CONFIG.code = d.value;
      $("codeInput").value = d.value;
      break;
    case "word":
      CONFIG.word = d.value;
      $("wordInput").value = d.value;
      break;
  }
  refreshGaugeMarkers();
});

function refreshGaugeMarkers() {
  setGaugeThresholds("gIdle", CONFIG.thresholdDb, CONFIG.explodeThresholdDb);
  setGaugeThresholds("gSearch", CONFIG.thresholdDb, CONFIG.explodeThresholdDb);
  setGaugeThresholds("gDemo", CONFIG.thresholdDb, CONFIG.explodeThresholdDb);
}

// ---- Clavier (PC) ----
function resetTimerLocal() {
  timeLeftMs = CONFIG.timeLimitMs;
  const el = $("searchTimer");
  if (el) {
    el.textContent = fmtTime(timeLeftMs);
    const wrap = el.parentElement;
    if (wrap) wrap.classList.remove("low");
  }
  if (state === "TIMEOUT") enterState("IDLE");
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "d") {
    resetTimerLocal();
    e.preventDefault();
    return;
  }
  if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (state === "IDLE" || state === "FAIL" || state === "TIMEOUT") enterState("COUNTDOWN");
    e.preventDefault();
    return;
  }
  if (e.key === "F8") {
    togglePanel();
    e.preventDefault();
    return;
  }
  if (e.key === "F9") {
    if (state === "IDLE" || state === "FAIL" || state === "TIMEOUT") enterState("COUNTDOWN");
    e.preventDefault();
    return;
  }
  if (e.key === "F10") {
    enterState(state === "DEMO" ? "IDLE" : "DEMO");
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    if (state !== "IDLE") enterState("IDLE");
    e.preventDefault();
    return;
  }
  if (state === "SEARCH") {
    if (e.key === "Backspace") {
      const input = $("wordEntry");
      if (document.activeElement !== input) {
        e.preventDefault();
        input.value = input.value.slice(0, -1);
        checkWordEntry();
      }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toLowerCase();
      if (!/^[a-z0-9àâäéèêëîïôöùûüç]$/.test(ch)) return;
      const input = $("wordEntry");
      if (document.activeElement !== input) {
        e.preventDefault();
        input.value = (input.value + ch).slice(-CONFIG.word.length);
      }
      checkWordEntry();
      return;
    }
  }
  if (state !== "IDLE") e.preventDefault();
});

// ---- Saisie du mot (écran de recherche) ----
function checkWordEntry() {
  const input = $("wordEntry");
  if (!input) return;
  renderWordBoxes();
  if (input.value.toLowerCase() === CONFIG.word.toLowerCase()) {
    successNow();
  }
}

function renderWordBoxes() {
  const boxesEl = $("wordBoxes");
  if (!boxesEl) return;
  const input = $("wordEntry");
  const value = input.value.toLowerCase();
  const target = CONFIG.word.toLowerCase();
  boxesEl.innerHTML = "";
  for (let i = 0; i < CONFIG.word.length; i++) {
    const box = document.createElement("div");
    box.className = "word-box";
    if (i < value.length) box.textContent = value[i];
    boxesEl.append(box);
  }
  if (value.length === target.length && value !== target) {
    applyPenalty(CONFIG.wordPenaltyMs || CONFIG.timePenaltyMs);
    boxesEl.classList.add("wrong");
    setTimeout(() => {
      boxesEl.classList.remove("wrong");
      if (input.value.toLowerCase() === value) {
        input.value = "";
        renderWordBoxes();
      }
    }, 700);
  }
}

$("wordEntry").addEventListener("input", (e) => {
  e.target.value = e.target.value.toLowerCase()
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç]/g, "").slice(-CONFIG.word.length);
  checkWordEntry();
});

// ---- Panneau animateur ----
function togglePanel() {
  $("panelAdmin").classList.toggle("hidden");
}

function saveCal() {
  localStorage.setItem("msCalOffset", String(calOffset));
}

function applyCal(ref, raw) {
  calOffset = ref - raw;
  saveCal();
}

function updateCalStatus() {
  const s = $("calStatus");
  if (!s) return;
  s.textContent = "Calibration : décalage " + Math.round(calOffset) + " dB · gain 1 · valeur affichée sans limite basse/haute.";
}
function syncPanelFromConfig() {
  $("thSlider").value = CONFIG.thresholdDb;
  $("thLabel").textContent = CONFIG.thresholdDb;
  $("exSlider").value = CONFIG.explodeThresholdDb;
  $("exLabel").textContent = CONFIG.explodeThresholdDb;
  $("codeInput").value = CONFIG.code;
  $("wordInput").value = CONFIG.word;
  refreshGaugeMarkers();
  updateCalStatus();
}

function postCmd(action, value) {
  const pin = prompt("Code animateur (config.json → adminPin) :", "");
  if (pin === null) return;
  fetch("cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, action, value })
  })
    .then((r) => r.json())
    .then((d) => {
      if (!d.ok) alert("Erreur : " + (d.error || "inconnue"));
      else if (d.config) Object.assign(CONFIG, d.config), syncPanelFromConfig();
    })
    .catch(() => alert("Serveur injoignable."));
}

$("calFloor").addEventListener("click", async () => {
  if (!analyser) return;
  $("calResult").textContent = "Silence… attendez 3 s.";
  const samples = [];
  for (let i = 0; i < 12; i++) {
    measureDb();
    samples.push(rawDb);
    await new Promise((r) => setTimeout(r, 250));
  }
  samples.sort((a, b) => a - b);
  applyCal(40, samples[Math.floor(samples.length / 2)]);
  updateCalStatus();
  $("calResult").textContent = "Calibré : le calme doit afficher ~40 dB.";
});

$("calClap").addEventListener("click", async () => {
  if (!analyser) return;
  $("calResult").textContent = "Tapez des mains fort, près du micro !";
  let peak = -120;
  for (let i = 0; i < 30; i++) {
    measureDb();
    peak = Math.max(peak, rawDb);
    await new Promise((r) => setTimeout(r, 50));
  }
  applyCal(90, peak);
  updateCalStatus();
  $("calResult").textContent = "Calibré : un claquement doit afficher ~90 dB.";
});

$("cal94").addEventListener("click", async () => {
  if (!analyser) return;
  $("calResult").textContent = "Allumez le calibrateur 94 dB (1 kHz) contre le micro… mesure en cours (3 s).";
  let sum = 0;
  let n = 0;
  for (let i = 0; i < 60; i++) {
    measureDb();
    sum += rawDb;
    n++;
    await new Promise((r) => setTimeout(r, 50));
  }
  applyCal(94, sum / n);
  updateCalStatus();
  $("calResult").textContent = "Calibré : le calibrateur doit afficher ~94 dB.";
});

$("calReset").addEventListener("click", () => {
  calOffset = 0;
  saveCal();
  updateCalStatus();
  $("calResult").textContent = "Calibration réinitialisée : décalage 0 dB.";
});

$("thSlider").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  CONFIG.thresholdDb = v;
  $("thLabel").textContent = v;
  refreshGaugeMarkers();
});
$("thSlider").addEventListener("change", (e) => postCmd("threshold", e.target.value));

$("exSlider").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  CONFIG.explodeThresholdDb = Math.max(v, CONFIG.thresholdDb);
  $("exLabel").textContent = v;
  refreshGaugeMarkers();
});
$("exSlider").addEventListener("change", (e) => postCmd("explodeThreshold", e.target.value));

$("codeApply").addEventListener("click", () => {
  const v = $("codeInput").value.replace(/\D/g, "").slice(0, 4);
  if (v.length < 4) { alert("Le code doit faire 4 chiffres."); return; }
  postCmd("code", v);
});

$("wordApply").addEventListener("click", () => {
  const v = $("wordInput").value.trim().toUpperCase();
  if (!v) { alert("Mot vide."); return; }
  postCmd("word", v);
});

$("panelArm").addEventListener("click", () => postCmd("arm"));
$("panelResetTimer").addEventListener("click", () => postCmd("resetTimer"));
$("panelDemo").addEventListener("click", () => postCmd("demo"));
$("panelStop").addEventListener("click", () => postCmd("stop"));
$("panelClose").addEventListener("click", togglePanel);

// ---- Démarrage ----
async function boot() {
  try {
    await initMic();
  } catch (err) {
    $("btnStart").classList.add("hidden");
    $("micError").classList.remove("hidden");
    return;
  }
  $("btnStart").classList.add("hidden");
  $("app").classList.remove("hidden");
  buildGauge($("gaugeIdle"), "gIdle", true);
  buildGauge($("gaugeSearch"), "gSearch", true);
  buildGauge($("gaugeDemo"), "gDemo", true);
  refreshGaugeMarkers();
  enterState("IDLE");
  setInterval(() => sendTelemetry(false), 300);
  tick();
}

$("btnStart").addEventListener("click", boot);
