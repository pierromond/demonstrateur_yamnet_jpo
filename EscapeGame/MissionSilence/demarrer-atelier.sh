#!/usr/bin/env bash
# Mission Silence — démarre le serveur + le tunnel d'accès distant.
# Usage : ./demarrer-atelier.sh [cloudflare|localhostrun]   (défaut : cloudflare)
# L'URL publique s'affiche dans les logs. Ctrl+C arrête tout.
set -euo pipefail
cd "$(dirname "$0")"

node server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for i in $(seq 1 20); do
  if curl -s -o /dev/null http://localhost:3000/ 2>/dev/null; then break; fi
  sleep 0.5
done

MODE="${1:-cloudflare}"
echo ""
echo "=== MISSION SILENCE — accès distant ($MODE) ==="
echo "Écran de jeu local : http://localhost:3000  (plein écran F11)"
echo "Télécommande local : http://localhost:3000/admin"
echo ""

if [ "$MODE" = "localhostrun" ]; then
  ssh -o ServerAliveInterval=60 -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new \
      -R 80:localhost:3000 nokey@localhost.run
else
  cloudflared tunnel --url http://localhost:3000 --protocol http2
fi
