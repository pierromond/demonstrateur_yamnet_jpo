"use strict";

// EscapeGame Admin — pilote les webapps (Mission Silence, Le Cri du Vivant)
// et leurs tunnels Cloudflare (quick tunnels). Aucune dépendance externe.
//
// API :
//   GET  /api/status                       état global (public)
//   GET  /api/logs?id=<app|admin>          journaux (public)
//   POST /api/app/<id>/<start|stop|restart|autorestart>   (PIN requis)
//   POST /api/all/<start|stop>             (PIN requis)
//   POST /api/admin/tunnel/<restart>       (PIN requis)

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config.json");
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const PORT = config.port || 3100;
const ADMIN_PIN = process.env.ADMIN_PIN || config.adminPin || "";

const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 60000;
const pinAttempts = new Map();

const HEALTH_INTERVAL_MS = 4000;
const HEALTH_TIMEOUT_MS = 2500;
const RESTART_BASE_MS = 3000;
const RESTART_MAX_MS = 30000;
const LOG_MAX_LINES = 500;
const TUNNEL_CHECK_MS = 30000;
const TUNNEL_MAX_FAILS = 2;

function resolve(p) {
  return path.resolve(ROOT, p);
}

function makeLog() {
  const lines = [];
  return {
    push(line) {
      const text = String(line).replace(/\n+$/, "");
      for (const part of text.split("\n")) {
        lines.push(part);
        if (lines.length > LOG_MAX_LINES) lines.shift();
      }
    },
    tail(n) {
      return lines.slice(-n);
    },
    clear() {
      lines.length = 0;
    }
  };
}

function killTree(child, graceMs, cb) {
  if (!child || child.exitCode !== null) {
    if (cb) cb();
    return;
  }
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, graceMs);
  child.once("exit", () => {
    clearTimeout(timer);
    if (cb) cb();
  });
}

// ---------- état par application ----------

const apps = new Map();

const adminState = {
  cfg: { id: "admin", port: PORT, tunnel: true },
  proc: null,
  tunnelProc: null,
  url: null,
  desired: "running",
  stopping: false,
  tunnelStopping: false,
  tunnelMode: null,
  cfFallbackTimer: null,
  tunnelHealthFails: 0,
  restartTimer: null,
  startedAt: null,
  restarts: 0,
  health: { ok: null, lastCheck: null },
  appLog: makeLog(),
  tunnelLog: makeLog()
};

function appInit(cfg) {
  apps.set(cfg.id, {
    cfg,
    proc: null,
    tunnelProc: null,
    url: null,
    desired: "stopped",
    stopping: false,
    tunnelStopping: false,
    tunnelMode: null,
    cfFallbackTimer: null,
    tunnelHealthFails: 0,
    restartTimer: null,
    startedAt: null,
    restarts: 0,
    health: { ok: null, lastCheck: null },
    appLog: makeLog(),
    tunnelLog: makeLog()
  });
}

function stateOf(cfg) {
  return cfg.id === "admin" ? adminState : apps.get(cfg.id);
}

function appStatus(a) {
  const { cfg } = a;
  let status;
  if (a.proc && a.proc.exitCode === null) {
    if (a.health.ok === true) status = "online";
    else if (a.health.ok === false) status = "unreachable";
    else status = "starting";
  } else if (a.desired === "running") {
    status = "restarting";
  } else {
    status = "stopped";
  }
  let tunnel = "off";
  if (a.tunnelProc && a.tunnelProc.exitCode === null) {
    tunnel = a.url ? "online" : "connecting";
  } else if (a.desired === "running" && cfg.tunnel) {
    tunnel = "restarting";
  }
  const baseUrl = adminState.url || "";
  let url = a.url;
  if (!url && baseUrl && cfg.path) url = baseUrl + cfg.path + "/";
  let adminLink = null;
  if (baseUrl && cfg.adminLink) adminLink = { label: cfg.adminLink.label, url: baseUrl + cfg.path + cfg.adminLink.path };
  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    port: cfg.port,
    status,
    tunnel,
    url,
    adminLink,
    localUrl: `http://localhost:${cfg.port}`,
    uptime: a.proc && a.proc.exitCode === null && a.startedAt
      ? Math.round((Date.now() - a.startedAt) / 1000)
      : null,
    restarts: a.restarts,
    autoRestart: cfg.autoRestart,
    desired: a.desired,
    health: a.health
  };
}

const CLOUDFLARE_URL_RE = /(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i;
const LHR_URL_RE = /(https:\/\/[a-z0-9-]+\.lhr\.life)/i;
const CLOUDFLARE_GRACE_MS = 60000;

function startTunnel(cfg, log, onUrl) {
  const a = stateOf(cfg);
  if (a.tunnelProc && a.tunnelProc.exitCode === null) return;
  a.tunnelStopping = false;
  clearTimeout(a.cfFallbackTimer);
  a.cfFallbackTimer = null;
  const mode = a.tunnelMode || (cfg.tunnel === "localhostrun" ? "localhostrun" : "cloudflare");
  const localPort = cfg.id === "admin" ? PORT : cfg.port;
  const target = `http://localhost:${localPort}`;

  let child;
  let urlRe;
  if (mode === "localhostrun") {
    log.push(`[tunnel] démarrage localhost.run (SSH 443) → ${target}`);
    child = spawn("ssh", [
      "-o", "ServerAliveInterval=60",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=15",
      "-R", `80:localhost:${localPort}`,
      "nokey@localhost.run"
    ], { stdio: ["ignore", "pipe", "pipe"] });
    urlRe = LHR_URL_RE;
  } else {
    log.push(`[tunnel] démarrage cloudflared → ${target}`);
    child = spawn(config.cloudflared, ["tunnel", "--url", target, "--protocol", "http2", "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    urlRe = CLOUDFLARE_URL_RE;
    a.cfFallbackTimer = setTimeout(() => {
      if (a.url || a.tunnelStopping || !a.tunnelProc) return;
      log.push("[tunnel] cloudflared sans URL après 25 s (port 7844 bloqué ?) → bascule localhost.run");
      const proc = a.tunnelProc;
      a.tunnelStopping = true;
      a.tunnelProc = null;
      killTree(proc, 2000);
      setTimeout(() => {
        a.tunnelStopping = false;
        a.tunnelMode = "localhostrun";
        startTunnel(cfg, log, onUrl);
      }, 1500);
    }, CLOUDFLARE_GRACE_MS);
  }
  a.tunnelMode = mode;
  a.tunnelProc = child;
  child.stdout.on("data", (d) => {
    const text = d.toString();
    log.push("[tunnel] " + text.trimEnd());
    if (!a.url) {
      const m = text.match(urlRe);
      if (m) {
        a.url = m[1];
        log.push(`[tunnel] URL publique : ${a.url}`);
        if (onUrl) onUrl(a.url);
      }
    }
  });
  child.stderr.on("data", (d) => log.push("[tunnel] " + d.toString().trimEnd()));
  child.on("error", (err) => {
    log.push(`[tunnel] erreur : ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    a.tunnelProc = null;
    a.url = null;
    log.push(`[tunnel] arrêté (code=${code} signal=${signal})`);
    if (!a.tunnelStopping && a.desired === "running" && cfg.tunnel) {
      log.push("[tunnel] relance dans 3 s…");
      setTimeout(() => startTunnel(cfg, log, onUrl), 3000);
    }
  });
}

function stopTunnel(cfg) {
  const a = stateOf(cfg);
  clearTimeout(a.cfFallbackTimer);
  a.cfFallbackTimer = null;
  if (!a.tunnelProc) return;
  a.tunnelStopping = true;
  const child = a.tunnelProc;
  a.tunnelProc = null;
  killTree(child, 3000);
}

function checkPublicTunnel(cfg) {
  const a = stateOf(cfg);
  if (!a.tunnelProc || a.tunnelProc.exitCode !== null || !a.url) return;
  if (cfg.id !== "admin" && a.health.ok !== true) return;
  const target = cfg.id === "admin" ? a.url + "/api/status" : a.url;
  const log = cfg.id === "admin" ? adminState.tunnelLog : a.tunnelLog;
  const fail = () => {
    a.tunnelHealthFails++;
    if (a.tunnelHealthFails >= TUNNEL_MAX_FAILS) {
      a.tunnelHealthFails = 0;
      log.push("[tunnel] URL publique injoignable → relance du tunnel");
      stopTunnel(cfg);
      setTimeout(() => startTunnel(cfg, log, () => {}), 1500);
    }
  };
  const req = https.get(target, { timeout: 15000 }, (res) => {
    res.resume();
    if (res.statusCode === 502 || res.statusCode === 503) fail();
    else a.tunnelHealthFails = 0;
  });
  req.on("timeout", () => req.destroy());
  req.on("error", fail);
}

function startApp(cfg, viaRestart) {
  const a = apps.get(cfg.id);
  if (a.proc && a.proc.exitCode === null) return;
  clearTimeout(a.restartTimer);
  a.restartTimer = null;
  a.desired = "running";
  a.stopping = false;
  if (viaRestart) {
    a.restarts++;
    a.appLog.push(`[admin] redémarrage automatique #${a.restarts}`);
  } else {
    a.restarts = 0;
  }
  const cwd = resolve(cfg.dir);
  const command = /^[./]/.test(cfg.command) ? resolve(cfg.command) : cfg.command;
  a.appLog.push(`[admin] lancement : ${command} ${cfg.args.join(" ")} (${cwd})`);
  const child = spawn(command, cfg.args, {
    cwd,
    env: Object.assign({}, process.env),
    stdio: ["ignore", "pipe", "pipe"]
  });
  a.proc = child;
  a.startedAt = Date.now();
  a.health = { ok: null, lastCheck: Date.now() };
  child.stdout.on("data", (d) => a.appLog.push(d.toString().trimEnd()));
  child.stderr.on("data", (d) => a.appLog.push(d.toString().trimEnd()));
  child.on("error", (err) => {
    a.appLog.push(`[admin] erreur de lancement : ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    a.proc = null;
    a.startedAt = null;
    if (a.stopping) return;
    a.appLog.push(`[admin] sortie inattendue (code=${code} signal=${signal})`);
    if (a.desired === "running" && cfg.autoRestart) {
      const delay = Math.min(RESTART_BASE_MS * Math.pow(2, Math.min(a.restarts, 5)), RESTART_MAX_MS);
      a.appLog.push(`[admin] relance dans ${Math.round(delay / 1000)} s…`);
      a.restartTimer = setTimeout(() => startApp(cfg, true), delay);
    } else {
      a.desired = "stopped";
      if (cfg.tunnel) stopTunnel(cfg);
    }
  });
  if (cfg.tunnel) startTunnel(cfg, a.tunnelLog, () => {});
}

function stopApp(cfg) {
  const a = apps.get(cfg.id);
  clearTimeout(a.restartTimer);
  a.restartTimer = null;
  a.desired = "stopped";
  a.stopping = true;
  a.appLog.push("[admin] arrêt demandé");
  if (cfg.tunnel) stopTunnel(cfg);
  if (a.proc) {
    const child = a.proc;
    a.proc = null;
    killTree(child, 3000);
  }
}

function checkHealth(cfg) {
  const a = apps.get(cfg.id);
  if (!a.proc || a.proc.exitCode !== null) return;
  const req = http.get({ host: "127.0.0.1", port: cfg.port, path: "/", timeout: HEALTH_TIMEOUT_MS }, (res) => {
    a.health = { ok: res.statusCode >= 200 && res.statusCode < 500, lastCheck: Date.now() };
    res.resume();
  });
  req.on("timeout", () => req.destroy());
  req.on("error", () => {
    a.health = { ok: false, lastCheck: Date.now() };
  });
}

// ---------- HTTP ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolvePromise(data));
    req.on("error", reject);
  });
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

function safeJoin(base, rel) {
  const target = path.resolve(base, "." + path.sep + rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

async function requirePin(req, res, ip) {
  if (pinLocked(ip)) {
    sendJson(res, 429, { ok: false, error: "trop de tentatives, réessayez dans une minute" });
    return null;
  }
  if (!isJsonPost(req) || !originAllowed(req)) {
    sendJson(res, 415, { ok: false, error: "content-type ou origine invalide" });
    return null;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req) || "{}");
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "bad body" });
    return null;
  }
  if (body.pin !== ADMIN_PIN) {
    pinFail(ip);
    sendJson(res, 403, { ok: false, error: "pin incorrect" });
    return null;
  }
  pinSuccess(ip);
  return body;
}

function proxyRequest(req, res, targetPort, prefix) {
  const url = new URL(req.url, "http://proxy");
  let rest = url.pathname.slice(prefix.length);
  if (!rest.startsWith("/")) rest = "/" + rest;
  const headers = Object.assign({}, req.headers);
  const preq = http.request({
    host: "127.0.0.1",
    port: targetPort,
    method: req.method,
    path: rest + (url.search || ""),
    headers
  }, (pres) => {
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res);
  });
  preq.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("502 - application indisponible");
    } else {
      res.destroy();
    }
  });
  req.pipe(preq);
}

function proxyUpgrade(req, socket, head) {
  const url = new URL(req.url, "http://proxy");
  let target = null;
  for (const cfg of config.apps || []) {
    if (cfg.path && url.pathname.startsWith(cfg.path + "/")) {
      target = cfg;
      break;
    }
  }
  if (!target) {
    socket.destroy();
    return;
  }
  const rest = url.pathname.slice(target.path.length);
  const headers = Object.assign({}, req.headers);
  const preq = http.request({
    host: "127.0.0.1",
    port: target.port,
    method: "GET",
    path: rest + (url.search || ""),
    headers
  });
  preq.on("upgrade", (pres, psock, phead) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\n");
    for (const [name, value] of Object.entries(pres.headers)) {
      socket.write(`${name}: ${value}\r\n`);
    }
    socket.write("\r\n");
    if (head && head.length) psock.write(head);
    if (phead && phead.length) socket.write(phead);
    psock.pipe(socket);
    socket.pipe(psock);
    psock.on("error", () => socket.destroy());
    socket.on("error", () => psock.destroy());
  });
  preq.on("response", () => socket.destroy());
  preq.on("error", () => socket.destroy());
  preq.end();
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;
  const ip = req.socket.remoteAddress || "?";

  if (pathname === "/api/status") {
    sendJson(res, 200, {
      ok: true,
      admin: { url: adminState.url, port: PORT },
      apps: [...apps.values()].map((a) => appStatus(a))
    });
    return;
  }

  if (pathname === "/api/logs") {
    const id = url.searchParams.get("id") || "";
    const n = Math.min(Number(url.searchParams.get("n")) || 200, 500);
    if (id === "admin") {
      sendJson(res, 200, { ok: true, lines: adminState.tunnelLog.tail(n) });
      return;
    }
    const a = apps.get(id);
    if (!a) {
      sendJson(res, 404, { ok: false, error: "app inconnue" });
      return;
    }
    sendJson(res, 200, { ok: true, app: a.appLog.tail(n), tunnel: a.tunnelLog.tail(n) });
    return;
  }

  const appMatch = pathname.match(/^\/api\/app\/([^/]+)\/([^/]+)$/);
  if (appMatch) {
    const pinBody = await requirePin(req, res, ip);
    if (!pinBody) return;
    const [, id, action] = appMatch;
    const a = apps.get(id);
    if (!a) {
      sendJson(res, 404, { ok: false, error: "app inconnue" });
      return;
    }
    const cfg = a.cfg;
    switch (action) {
      case "start":
        startApp(cfg, false);
        break;
      case "stop":
        stopApp(cfg);
        break;
      case "restart":
        stopApp(cfg);
        setTimeout(() => startApp(cfg, false), 500);
        break;
      case "autorestart":
        cfg.autoRestart = !!pinBody.value;
        break;
      default:
        sendJson(res, 400, { ok: false, error: "unknown action" });
        return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  const allMatch = pathname.match(/^\/api\/all\/([^/]+)$/);
  if (allMatch) {
    if (!(await requirePin(req, res, ip))) return;
    const action = allMatch[1];
    if (action === "start") {
      for (const a of apps.values()) startApp(a.cfg, false);
    } else if (action === "stop") {
      for (const a of apps.values()) stopApp(a.cfg);
    } else {
      sendJson(res, 400, { ok: false, error: "unknown action" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  const adminMatch = pathname.match(/^\/api\/admin\/tunnel\/([^/]+)$/);
  if (adminMatch) {
    if (!(await requirePin(req, res, ip))) return;
    const action = adminMatch[1];
    if (action !== "restart") {
      sendJson(res, 400, { ok: false, error: "unknown action" });
      return;
    }
    if (adminState.tunnelProc) {
      stopTunnel({ id: "admin" });
    }
    adminState.url = null;
    setTimeout(() => startTunnel(adminState.cfg, adminState.tunnelLog), 500);
    sendJson(res, 200, { ok: true });
    return;
  }

  // proxy inverse : adresse unique avec chemins (/missionSilence/, /criVivant/, …)
  for (const cfg of config.apps || []) {
    if (!cfg.path) continue;
    if (pathname === cfg.path) {
      res.writeHead(301, { Location: cfg.path + "/" });
      res.end();
      return;
    }
    if (pathname.startsWith(cfg.path + "/")) {
      proxyRequest(req, res, cfg.port, cfg.path);
      return;
    }
  }

  // fichiers statiques
  let filePath;
  if (pathname === "/" || pathname === "/admin") {
    filePath = path.join(ROOT, "public", "index.html");
  } else {
    filePath = safeJoin(path.join(ROOT, "public"), pathname);
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

server.on("upgrade", (req, socket, head) => {
  proxyUpgrade(req, socket, head);
});

// ---------- démarrage ----------

for (const cfg of config.apps || []) {
  appInit(cfg);
}

if (config.adminTunnel && config.adminTunnel.enabled) {
  adminState.cfg.tunnel = config.adminTunnel.mode || "cloudflare";
  startTunnel(adminState.cfg, adminState.tunnelLog, (u) => {
    console.log(`  URL publique (admin) : ${u}`);
  });
}

for (const a of apps.values()) {
  if (a.cfg.autoStart) startApp(a.cfg, false);
}

setInterval(() => {
  for (const a of apps.values()) checkHealth(a.cfg);
}, HEALTH_INTERVAL_MS);

setInterval(() => {
  checkPublicTunnel(adminState.cfg);
  for (const a of apps.values()) checkPublicTunnel(a.cfg);
}, TUNNEL_CHECK_MS);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Modifiez "port" dans config.json.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Escape Game Admin — pilotage des webapps");
  console.log(`  Interface locale : http://localhost:${PORT}`);
  if (!ADMIN_PIN) console.warn("  ATTENTION : aucun PIN configuré (config.json → adminPin)");
});

function shutdown() {
  console.log("\nArrêt — fermeture des applications et tunnels…");
  for (const a of apps.values()) {
    clearTimeout(a.restartTimer);
    a.restartTimer = null;
    a.desired = "stopped";
    a.stopping = true;
    if (a.tunnelProc) {
      a.tunnelStopping = true;
      killTree(a.tunnelProc, 2000);
    }
    if (a.proc) killTree(a.proc, 3000);
  }
  if (adminState.tunnelProc) {
    adminState.tunnelStopping = true;
    killTree(adminState.tunnelProc, 2000);
  }
  setTimeout(() => process.exit(0), 3500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
