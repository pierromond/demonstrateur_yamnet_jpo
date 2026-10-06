#!/usr/bin/env bash
# Spectro Masked — version autonome (Linux / Mac)
# Aucun serveur applicatif, aucun accès réseau.
# Aucune installation : Node.js est embarqué dans runtime/ si présent.
cd "$(dirname "$0")"

NODE=""
if [ -x "runtime/bin/node" ]; then
  NODE="$PWD/runtime/bin/node"
elif [ -x "runtime/node" ]; then
  NODE="$PWD/runtime/node"
elif command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
fi

if [ -z "$NODE" ]; then
  echo "[ERREUR] Node.js est introuvable."
  echo "Placez un runtime Node.js portable dans le dossier 'runtime/' ou installez Node.js."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi

echo "Démarrage de Spectro Masked…"
echo "  Page : http://localhost:4000"
echo "  Micro/MIDI : ouvrir la page dans Chrome ou Edge sur CE PC"
echo "  Arrêt : Ctrl+C ici"
"$NODE" serve.js &
SERVER_PID=$!
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:4000" >/dev/null 2>&1
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:4000" >/dev/null 2>&1
fi
wait "$SERVER_PID"
