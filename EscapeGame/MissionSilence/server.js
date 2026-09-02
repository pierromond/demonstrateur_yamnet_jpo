"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

let config = loadConfig();
const PORT = config.port || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const clients = new Set();
let lastState = null;
let lastTelemetry = null;

const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 60000;
const pinAttempts = new Map();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (err) {
      clients.delete(res);
    }
  }
}

function publicConfig() {
  return {
    word: config.word,
    code: config.code,
    thresholdDb: config.thresholdDb,
    explodeThresholdDb: config.explodeThresholdDb,
    failDurationMs: config.failDurationMs,
    codeDisplayMs: config.codeDisplayMs,
    timeLimitMs: config.timeLimitMs,
    timePenaltyMs: config.timePenaltyMs,
    wordPenaltyMs: config.wordPenaltyMs,
    maxFails: config.maxFails
  };
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function safeJoin(base, rel) {
  const target = path.resolve(base, "." + path.sep + rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function isJsonPost(req) {
  return (req.headers["content-type"] || "").toLowerCase().includes("application/json");
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.host || "");
  } catch (err) {
    return false;
  }
}

function pinLocked(ip) {
  const rec = pinAttempts.get(ip);
  return !!rec && rec.lockedUntil > Date.now();
}

function pinFail(ip) {
  const now = Date.now();
  const rec = pinAttempts.get(ip) || { fails: 0, lockedUntil: 0 };
  if (rec.lockedUntil > now) return;
  rec.fails++;
  if (rec.fails >= PIN_MAX_FAILS) {
    rec.lockedUntil = now + PIN_LOCK_MS;
    rec.fails = 0;
  }
  pinAttempts.set(ip, rec);
}

function pinSuccess(ip) {
  pinAttempts.delete(ip);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "bad path" });
    return;
  }

  if (pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive"
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ state: lastState, telemetry: lastTelemetry, config: publicConfig() })}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (pathname === "/telemetry" && req.method === "POST") {
    if (!isJsonPost(req) || !originAllowed(req)) {
      sendJson(res, 415, { ok: false, error: "content-type ou origine invalide" });
      return;
    }
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      lastTelemetry = body;
      if (body.state) lastState = body.state;
      broadcast("telemetry", body);
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: "bad body" });
    }
    return;
  }

  if (pathname === "/cmd" && req.method === "POST") {
    if (!isJsonPost(req) || !originAllowed(req)) {
      sendJson(res, 415, { ok: false, error: "content-type ou origine invalide" });
      return;
    }
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const ip = req.socket.remoteAddress || "?";
      if (pinLocked(ip)) {
        sendJson(res, 429, { ok: false, error: "trop de tentatives, réessayez dans une minute" });
        return;
      }
      if (body.pin !== config.adminPin) {
        pinFail(ip);
        sendJson(res, 403, { ok: false, error: "pin incorrect" });
        return;
      }
      pinSuccess(ip);
      const action = body.action;
      switch (action) {
        case "ping":
          break;
        case "arm":
          lastState = "COUNTDOWN";
          broadcast("cmd", { action: "arm" });
          break;
        case "stop":
          lastState = "IDLE";
          broadcast("cmd", { action: "stop" });
          break;
        case "demo":
          broadcast("cmd", { action: "demo" });
          break;
        case "resetTimer":
          broadcast("cmd", { action: "resetTimer" });
          break;
        case "threshold": {
          const v = Math.round(Number(body.value));
          if (!Number.isFinite(v)) {
            sendJson(res, 400, { ok: false, error: "valeur invalide" });
            return;
          }
          config.thresholdDb = Math.min(Math.max(v, 20), config.explodeThresholdDb);
          saveConfig();
          broadcast("cmd", { action: "threshold", value: config.thresholdDb });
          break;
        }
        case "explodeThreshold": {
          const v = Math.round(Number(body.value));
          if (!Number.isFinite(v)) {
            sendJson(res, 400, { ok: false, error: "valeur invalide" });
            return;
          }
          config.explodeThresholdDb = Math.min(Math.max(v, config.thresholdDb), 120);
          saveConfig();
          broadcast("cmd", { action: "explodeThreshold", value: config.explodeThresholdDb });
          break;
        }
        case "code": {
          const v = String(body.value).replace(/\D/g, "").slice(0, 4);
          if (v.length !== 4) {
            sendJson(res, 400, { ok: false, error: "code à 4 chiffres requis" });
            return;
          }
          config.code = v;
          saveConfig();
          broadcast("cmd", { action: "code", value: config.code });
          break;
        }
        case "word": {
          const w = String(body.value).toUpperCase().trim().replace(/[^A-Z0-9ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, "");
          if (!w) {
            sendJson(res, 400, { ok: false, error: "mot vide ou invalide" });
            return;
          }
          config.word = w;
          saveConfig();
          broadcast("cmd", { action: "word", value: config.word });
          break;
        }
        default:
          sendJson(res, 400, { ok: false, error: "unknown action" });
          return;
      }
      sendJson(res, 200, { ok: true, config: publicConfig() });
    } catch (err) {
      if (err && err.message === "body too large") {
        sendJson(res, 413, { ok: false, error: "body too large" });
      } else {
        sendJson(res, 500, { ok: false, error: "erreur serveur" });
      }
    }
    return;
  }

  let filePath;
  let baseDir;
  if (pathname === "/" || pathname === "/index.html") {
    baseDir = path.join(ROOT, "public");
    filePath = path.join(baseDir, "index.html");
  } else if (pathname === "/admin" || pathname === "/admin.html") {
    baseDir = path.join(ROOT, "public");
    filePath = path.join(baseDir, "admin.html");
  } else if (pathname.startsWith("/imprimables/")) {
    baseDir = path.join(ROOT, "imprimables");
    filePath = safeJoin(baseDir, pathname.slice("/imprimables/".length));
  } else {
    baseDir = path.join(ROOT, "public");
    filePath = safeJoin(baseDir, pathname);
  }

  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 - " + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: "erreur serveur" });
    } else {
      res.destroy();
    }
  });
});

const ping = setInterval(() => {
  for (const res of clients) {
    try {
      res.write(": ping\n\n");
    } catch (err) {
      clients.delete(res);
    }
  }
}, 25000);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Modifiez "port" dans config.json.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Mission Silence - serveur démarré`);
  console.log(`  Écran de jeu (local) : http://localhost:${PORT}`);
  console.log(`  Télécommande (local) : http://localhost:${PORT}/admin`);
  const os = require("os");
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`  IP locale (WiFi)    : http://${net.address}:${PORT}/admin`);
      }
    }
  }
});
