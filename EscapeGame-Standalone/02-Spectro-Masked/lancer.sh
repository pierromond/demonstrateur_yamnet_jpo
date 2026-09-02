#!/usr/bin/env bash
# Spectro Masked — lancement autonome (Linux / Mac)
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERREUR] Node.js n'est pas installé."
  echo "Installez-le depuis https://nodejs.org puis relancez."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi

echo "Démarrage de Spectro Masked…"
echo "  Page : http://localhost:4000"
echo "  Micro/MIDI : ouvrir la page dans Chrome ou Edge sur CE PC"
echo "  Arrêt : Ctrl+C ici"
node server.js &
SERVER_PID=$!
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:4000" >/dev/null 2>&1
fi
wait "$SERVER_PID"
