"use strict";

// Micro-serveur statique local pour Le Cri du Vivant (version navigateur).
// Il sert uniquement les fichiers du dossier sur http://localhost afin que le
// navigateur autorise le micro et le chargement du module WebAssembly.
// Aucune dépendance, aucun accès réseau.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 8765;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function safeJoin(base, rel) {
  const target = path.resolve(base, "." + path.sep + rel);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Requête invalide");
    return;
  }
  if (/[\u0000-\u001f\u007f]/.test(pathname)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Chemin invalide");
    return;
  }

  const filePath = (pathname === "/" || pathname === "/index.html")
    ? path.join(ROOT, "index.html")
    : safeJoin(ROOT, pathname);

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Interdit");
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

server.listen(PORT, () => {
  console.log("Le Cri du Vivant — ouvrez http://localhost:" + PORT);
});
