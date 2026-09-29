"use strict";

// Plaque de Chladni — module cymatique de l'escape game.
// L'écran (PC, enceintes sous la plaque) joue un sinus entre 20 Hz et 5 kHz
// par pas de demi-ton (échelle logarithmique). Les enfants défilent avec + / -
// pour trouver les 4 fréquences de résonance. Le code final est géré à la main
// par l'animateur (aucune révélation automatique).
// Aucune dépendance externe.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const PORT = config.port || 4500;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function safeJoin(base, rel) {
  const target = path.resolve(base, "." + path.sep + rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function publicConfig() {
  const freqs = config.frequencies || [];
  return {
    min_hz: freqs.length ? freqs[0] : (config.min_hz || 20),
    max_hz: freqs.length ? freqs[freqs.length - 1] : (config.max_hz || 5000),
    frequencies: freqs,
    references: config.references
  };
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (err) {
    sendJson(res, 400, { ok: false, error: "bad path" });
    return;
  }
  if (/[\u0000-\u001f\u007f]/.test(pathname)) {
    sendJson(res, 400, { ok: false, error: "bad path" });
    return;
  }

  if (pathname === "/config") {
    sendJson(res, 200, Object.assign({ ok: true }, publicConfig()));
    return;
  }

  let filePath;
  if (pathname === "/" || pathname === "/index.html") {
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
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Modifiez "port" dans config.json.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Plaque de Chladni - cymatique`);
  console.log(`  Page : http://localhost:${PORT}`);
  console.log(`  Résonances : ${(config.frequencies || []).length} fréquences · ${config.references.length} références`);
});
