#!/usr/bin/env bash
# Plaque de Chladni — lancement autonome (Linux / Mac)
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERREUR] Node.js n'est pas installé."
  echo "Installez-le depuis https://nodejs.org puis relancez."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi

echo "Démarrage de la Plaque de Chladni…"
echo "  Page : http://localhost:4500"
echo "  Arrêt : Ctrl+C ici"
node server.js &
SERVER_PID=$!
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:4500" >/dev/null 2>&1
fi
wait "$SERVER_PID"
