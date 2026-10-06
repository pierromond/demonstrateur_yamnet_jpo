"use strict";

// Le Cri du Vivant — version autonome (hors-ligne).
// La reconnaissance YAMNet tourne dans le navigateur (TensorFlow.js + WASM).
// Aucun serveur applicatif : la page, le modèle et les libs sont servis en local.

let config = null;
let tfliteModel = null;
let scoresOutputName = null;
let audioContext = null;
let processor = null;
let stream = null;
let lastTimestamp = null;
let unlocked = false;
let sustainTimers = [];
let currentRound = 0;
let solvedRounds = new Set();
let CONFIDENCE_THRESHOLD = 0.15;
let HUMAN_THRESHOLD = 0.5;
let SUSTAIN_DURATION = 0.5;

// Fenêtrage identique au serveur d'origine : fenêtre 0,96 s, saut 0,48 s.
let WINDOW_SAMPLES = 15360;
let HOP_SAMPLES = 7680;
let windowBuffer = null;
let windowIndex = 0;

const MODEL_URL = "yamnet.tflite";
const MAX_GAIN = 24.0; // gain appliqué par l'ancien classificateur avant l'inférence

const HUMAN_CLASS = "Speech";

const micStatus = document.getElementById("micStatus");
const secretDisplay = document.getElementById("secretDisplay");
const infoBox = document.getElementById("infoBox");
const finalHint = document.getElementById("finalHint");
const statusBar = document.getElementById("statusBar");
const bigMessage = document.getElementById("bigMessage");
const riddleZone = document.getElementById("riddleZone");
const heardZone = document.getElementById("heardZone");
const riddleNum = document.getElementById("riddleNum");
const riddleText = document.getElementById("riddleText");
const progressBar = document.getElementById("progressBar");
const heardIdle = document.getElementById("heardIdle");
const heardResult = document.getElementById("heardResult");
const heardEmoji = document.getElementById("heardEmoji");
const heardName = document.getElementById("heardName");
const heardMsg = document.getElementById("heardMsg");
const targetBarZone = document.getElementById("targetBarZone");
const targetFill = document.getElementById("targetFill");
const targetTh = document.getElementById("targetTh");
const targetPct = document.getElementById("targetPct");
const humanBanner = document.getElementById("humanBanner");
const humanBannerText = document.getElementById("humanBannerText");
let messageTimer = null;
let heardHideTimer = null;
let heardHidePending = false;
let humanFadeTimer = null;
let humanFadePending = false;
let congratsShowing = false;
let congratsTimer = null;

function setMicStatus(text, cls) {
  micStatus.textContent = text;
  micStatus.className = "mic-status" + (cls ? " " + cls : "");
}

function currentTarget() {
  return config.rounds[currentRound];
}

function showHeardIdle() {
  clearTimeout(heardHideTimer);
  heardHidePending = false;
  heardIdle.classList.remove("hidden");
  heardResult.classList.add("hidden");
  heardResult.classList.remove("fading");
}

function showHeard(animal, msg, good) {
  clearTimeout(heardHideTimer);
  heardHidePending = false;
  heardIdle.classList.add("hidden");
  heardResult.classList.remove("hidden", "fading");
  heardEmoji.textContent = animal.emoji;
  heardName.textContent = animal.display_name_fr;
  heardMsg.textContent = msg;
  heardResult.classList.toggle("good", !!good);
  heardResult.classList.toggle("bad", !good);
}

function hideHeardSoon() {
  if (heardHidePending) return;
  heardHidePending = true;
  clearTimeout(heardHideTimer);
  heardHideTimer = setTimeout(() => {
    heardHidePending = false;
    heardResult.classList.add("fading");
    setTimeout(() => {
      heardResult.classList.add("hidden");
      heardResult.classList.remove("fading");
      heardIdle.classList.remove("hidden");
    }, 500);
  }, 1200);
}

function setHumanActive(active) {
  if (active) {
    clearTimeout(humanFadeTimer);
    humanFadeTimer = null;
    humanFadePending = false;
    humanBanner.classList.remove("fading");
    humanBanner.classList.add("shown");
  } else if (humanBanner.classList.contains("shown") && !humanFadePending) {
    humanFadePending = true;
    humanFadeTimer = setTimeout(() => {
      humanFadePending = false;
      humanBanner.classList.add("fading");
      setTimeout(() => {
        humanBanner.classList.remove("shown", "fading");
      }, 500);
    }, 1200);
  }
}

function renderRiddle() {
  const r = currentTarget();
  riddleNum.textContent = "Énigme " + (currentRound + 1) + "/" + config.rounds.length;
  riddleText.textContent = "« " + r.riddle + " »";
  const tTh = r.threshold || CONFIDENCE_THRESHOLD;
  targetTh.style.left = (tTh * 100) + "%";
  targetTh.style.display = (r.assist || "full") === "full" ? "" : "none";
  targetBarZone.classList.toggle("hidden", (r.assist || "full") === "none");
  progressBar.innerHTML = "";
  for (let i = 0; i < config.rounds.length; i++) {
    const seg = document.createElement("div");
    seg.className = "segment";
    seg.textContent = String(i + 1);
    if (solvedRounds.has(i)) seg.classList.add("filled");
    else if (i === currentRound) seg.classList.add("current");
    progressBar.append(seg);
  }
}

function markRoundSolved() {
  if (unlocked || congratsShowing) return;
  solvedRounds.add(currentRound);
  congratsShowing = true;
  showHeardIdle();
  riddleZone.classList.remove("hot");
  renderRiddle();

  const animal = config.animals.find((a) => a.yamnet_class === currentTarget().yamnet_class);
  const isLast = solvedRounds.size >= config.rounds.length;
  document.getElementById("congratsEmoji").textContent = animal ? animal.emoji : "🎉";
  document.getElementById("congratsText").textContent = isLast
    ? "🎉 Bravo ! Toutes les énigmes sont résolues !"
    : "Énigme résolue !";
  document.getElementById("congratsOverlay").classList.remove("hidden");

  clearTimeout(congratsTimer);
  congratsTimer = setTimeout(() => {
    document.getElementById("congratsOverlay").classList.add("hidden");
    congratsShowing = false;
    if (isLast) {
      unlock();
    } else {
      currentRound++;
      renderRiddle();
      statusBar.textContent = solvedRounds.size + "/" + config.rounds.length + " énigmes résolues";
      statusBar.className = "status-bar";
    }
  }, 2000);
}

riddleZone.addEventListener("dblclick", () => {
  if (!unlocked) markRoundSolved();
});

function resetWindow() {
  windowBuffer = new Float32Array(WINDOW_SAMPLES);
  windowIndex = 0;
}

function restartGame() {
  unlocked = false;
  congratsShowing = false;
  currentRound = 0;
  solvedRounds = new Set();
  sustainTimers = new Array(config.animals.length).fill(0);
  lastTimestamp = null;
  resetWindow();
  document.getElementById("congratsOverlay").classList.add("hidden");
  riddleZone.classList.remove("hidden");
  heardZone.classList.remove("hidden");
  targetBarZone.classList.remove("hidden");
  humanBanner.classList.remove("shown");
  infoBox.classList.add("hidden");
  finalHint.classList.add("hidden");
  secretDisplay.textContent = "";
  bigMessage.textContent = "";
  statusBar.textContent = "";
  statusBar.className = "status-bar";
  showHeardIdle();
  renderRiddle();
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && (e.key === "c" || e.key === "C") && !unlocked) {
    unlock();
  }
  if (e.ctrlKey && e.altKey && (e.key === "v" || e.key === "V")) {
    restartGame();
  }
});

// ---- Pré-traitement identique à l'ancien classificateur (classifier.py) ----
function preprocessWindow(buf) {
  const x = Float32Array.from(buf);
  let maxValue = 1e-12;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > maxValue) maxValue = a;
  }
  const gain = Math.min(MAX_GAIN, 20 * Math.log10(1 / maxValue));
  const factor = Math.pow(10, gain / 20);
  if (factor !== 1) {
    for (let i = 0; i < x.length; i++) x[i] *= factor;
  }
  return x;
}

function scoresForAnimals(rawScores) {
  const out = {};
  for (const animal of config.animals) {
    const idx = animal.yamnet_index;
    out[animal.yamnet_class] = Number.isFinite(idx) ? (rawScores[idx] || 0) : 0;
  }
  return out;
}

function runInference(buf) {
  if (!tfliteModel || unlocked) return;
  let scores = null;
  try {
    const x = preprocessWindow(buf);
    const values = tf.tidy(() => {
      const input = tf.tensor1d(x);
      const out = tfliteModel.predict(input);
      const tensor = scoresOutputName && out ? (out[scoresOutputName] || out) : out;
      return Array.from(tensor.dataSync());
    });
    scores = scoresForAnimals(values);
  } catch (err) {
    console.error("Erreur d'inférence YAMNet :", err);
    return;
  }
  updateUI(scores);
}

function feedAudio(samples) {
  let offset = 0;
  while (offset < samples.length) {
    const space = WINDOW_SAMPLES - windowIndex;
    const n = Math.min(samples.length - offset, space);
    windowBuffer.set(samples.subarray(offset, offset + n), windowIndex);
    windowIndex += n;
    offset += n;

    if (windowIndex >= WINDOW_SAMPLES) {
      runInference(windowBuffer);
      windowBuffer.copyWithin(0, HOP_SAMPLES);
      windowIndex = WINDOW_SAMPLES - HOP_SAMPLES;
    }
  }
}

function updateUI(scores) {
  const now = performance.now() / 1000;
  if (lastTimestamp === null) { lastTimestamp = now; return; }
  const dt = now - lastTimestamp;
  lastTimestamp = now;

  const humanScore = scores[HUMAN_CLASS] || 0;
  setHumanActive(humanScore >= HUMAN_THRESHOLD);

  const target = currentTarget();
  const tIdx = config.animals.findIndex((a) => a.yamnet_class === target.yamnet_class);
  const tScore = scores[target.yamnet_class] || 0;
  const tTh = target.threshold || CONFIDENCE_THRESHOLD;

  targetFill.style.width = Math.round(tScore * 100) + "%";
  targetPct.textContent = Math.round(tScore * 100) + " %";
  const tGood = tScore >= tTh;
  targetBarZone.classList.toggle("good", tGood);
  targetBarZone.classList.toggle("hot", tGood);

  if (tScore >= tTh) {
    sustainTimers[tIdx] += dt;
    const targetAnimal = config.animals[tIdx];
    showHeard(targetAnimal, "C\u2019est lui ! Continue…", true);
    riddleZone.classList.add("hot");
    if (sustainTimers[tIdx] >= SUSTAIN_DURATION) {
      markRoundSolved();
    }
    return;
  }

  sustainTimers[tIdx] = Math.max(0, sustainTimers[tIdx] - dt * 2);
  riddleZone.classList.remove("hot");

  let wrong = null;
  let best = 0;
  for (let i = 0; i < config.animals.length; i++) {
    if (i === tIdx) continue;
    const animal = config.animals[i];
    if (animal.yamnet_class === HUMAN_CLASS) continue;
    const s = scores[animal.yamnet_class] || 0;
    if (s >= tTh && s > best) {
      best = s;
      wrong = animal;
    }
  }

  if (wrong) {
    showHeard(wrong, "Pas le bon ! Réessayez…", false);
    hideHeardSoon();
  } else {
    hideHeardSoon();
  }
}

function showBigMessage(text, duration) {
  if (messageTimer) clearTimeout(messageTimer);
  bigMessage.textContent = text;
  bigMessage.classList.remove("fade");
  if (duration > 0) {
    messageTimer = setTimeout(() => {
      bigMessage.classList.add("fade");
      messageTimer = setTimeout(() => { bigMessage.textContent = ""; }, 500);
    }, duration);
  }
}

function fitFinalPage() {
  const shrink = () => {
    document.body.style.zoom = "1";
    const avail = window.innerHeight - 8;
    const need = document.body.scrollHeight;
    if (need > avail) document.body.style.zoom = String(Math.max(0.5, avail / need));
  };
  requestAnimationFrame(() => setTimeout(shrink, 50));
}

function unlock() {
  unlocked = true;
  riddleZone.classList.add("hidden");
  heardZone.classList.add("hidden");
  targetBarZone.classList.add("hidden");
  humanBanner.classList.add("hidden");
  infoBox.classList.remove("hidden");
  finalHint.classList.remove("hidden");
  showBigMessage("🎉 Bravo !", 0);
  fitFinalPage();
  statusBar.textContent = "🎉 Bravo ! Le code secret est révélé !";
  statusBar.className = "status-bar success";
  for (const seg of progressBar.children) seg.classList.add("filled");

  if (processor) { processor.disconnect(); processor = null; }
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }

  showSecret(config.code);
}

function showSecret(code) {
  secretDisplay.textContent = code;
}

async function startMicrophone() {
  try {
    const constraints = {
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const actualSampleRate = audioContext.sampleRate;

    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (unlocked || !tfliteModel) return;
      const inputBuffer = event.inputBuffer.getChannelData(0);
      const samples = actualSampleRate === 16000
        ? new Float32Array(inputBuffer)
        : downsample(inputBuffer, actualSampleRate, 16000);
      feedAudio(samples);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    setMicStatus("🎤 Micro actif", "active");
  } catch (err) {
    console.error("Erreur microphone:", err);
    setMicStatus("🔇 Erreur micro: " + err.message, "error");
  }
}

function downsample(buffer, fromRate, toRate) {
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i * ratio;
    const srcFloor = Math.floor(srcIdx);
    const srcCeil = Math.min(srcFloor + 1, buffer.length - 1);
    const frac = srcIdx - srcFloor;
    result[i] = buffer[srcFloor] * (1 - frac) + buffer[srcCeil] * frac;
  }
  return result;
}

async function loadModel() {
  const tflite = window.tflite;
  if (!tflite || !tflite.loadTFLiteModel) {
    throw new Error("tfjs-tflite non chargé");
  }
  tflite.setWasmPath("vendor/wasm/");
  await tf.setBackend("cpu");
  await tf.ready();
  tfliteModel = await tflite.loadTFLiteModel(MODEL_URL);
  const outs = tfliteModel.outputs || [];
  const scoresOut = outs.find((o) => Array.isArray(o.shape) && o.shape[o.shape.length - 1] === 521);
  scoresOutputName = scoresOut ? scoresOut.name : (outs[0] ? outs[0].name : null);
}

async function init() {
  setMicStatus("⏳ Chargement du modèle…");
  const resp = await fetch("config.json");
  config = await resp.json();
  CONFIDENCE_THRESHOLD = config.confidence_threshold;
  HUMAN_THRESHOLD = config.human_threshold || 0.5;
  SUSTAIN_DURATION = config.sustain_duration;
  if (config.server) {
    const sr = config.server.yamnet_sample_rate || 16000;
    if (config.server.yamnet_window_seconds) WINDOW_SAMPLES = Math.round(config.server.yamnet_window_seconds * sr);
    if (config.server.yamnet_hop_seconds) HOP_SAMPLES = Math.round(config.server.yamnet_hop_seconds * sr);
  }
  resetWindow();
  sustainTimers = new Array(config.animals.length).fill(0);
  const human = config.animals.find((a) => a.yamnet_class === HUMAN_CLASS);
  humanBannerText.textContent = (human && human.trigger_message) || "";
  renderRiddle();

  try {
    await loadModel();
  } catch (err) {
    console.error("Erreur de chargement du modèle :", err);
    setMicStatus("🔇 Modèle indisponible: " + err.message, "error");
    return;
  }

  startMicrophone();
}

init();
