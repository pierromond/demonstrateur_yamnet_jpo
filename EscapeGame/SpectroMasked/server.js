"use strict";

// Spectro Masked — déclencheur de sons (clavier / launchpad MIDI).
// Aucun écran requis : la page joue les sons localement (Web Audio),
// pilotée par les touches du clavier ou un launchpad branché (Web MIDI).
// Aucune dépendance externe.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));
const PORT = config.port || 4000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4"
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
    const audioDir = path.join(ROOT, "audio");
    let files = [];
    try {
      files = fs.readdirSync(audioDir).filter((f) => /\.(wav|mp3|ogg|flac|m4a)$/i.test(f));
    } catch (err) { /* audio absent */ }
    sendJson(res, 200, { ok: true, sounds: config.sounds, pads: config.pads || [], audioFiles: files });
    return;
  }

  let filePath;
  let baseDir;
  if (pathname === "/" || pathname === "/index.html") {
    baseDir = path.join(ROOT, "public");
    filePath = path.join(baseDir, "index.html");
  } else if (pathname.startsWith("/audio/")) {
    baseDir = path.join(ROOT, "audio");
    filePath = safeJoin(baseDir, pathname.slice("/audio/".length));
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
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Le port ${PORT} est déjà utilisé. Modifiez "port" dans config.json.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Spectro Masked - déclencheur de sons`);
  console.log(`  Page : http://localhost:${PORT} (garder la fenêtre ouverte ; pas d'écran requis)`);
  console.log(`  Sons : ${config.sounds.length} dans config.json`);
});
