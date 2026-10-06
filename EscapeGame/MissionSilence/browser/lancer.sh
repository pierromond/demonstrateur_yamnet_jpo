#!/usr/bin/env bash
# Mission Silence — version autonome (Linux / Mac)
# Reconnaissance locale dans le navigateur, aucun serveur applicatif.
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

echo "Démarrage de Mission Silence…"
echo "  Page : http://localhost:3000"
echo "  Arrêt : Ctrl+C ici"
"$NODE" serve.js &
SERVER_PID=$!
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1
elif command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1
fi
wait "$SERVER_PID"
