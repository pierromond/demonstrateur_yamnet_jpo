#!/usr/bin/env bash
# Le Cri du Vivant — lancement autonome (Linux / Mac)
cd "$(dirname "$0")"

PYTHON=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PYTHON="$c"; break; fi
done
if [ -z "$PYTHON" ]; then
  echo "[ERREUR] Python 3 n'est pas installé."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi

check_deps() {
  .venv/bin/python -c "import numpy, fastapi, uvicorn, websockets, tensorflow" >/dev/null 2>&1
}

needs_setup=0
if [ ! -x ".venv/bin/python" ]; then
  needs_setup=1
elif ! check_deps; then
  needs_setup=1
fi

if [ "$needs_setup" = "1" ]; then
  if [ ! -x ".venv/bin/python" ]; then
    echo "Première utilisation : création de l'environnement Python…"
    "$PYTHON" -m venv .venv || {
      echo "[ERREUR] Impossible de créer l'environnement Python."
      echo "Sur Ubuntu, installez d'abord : sudo apt install python3-venv"
      read -r -p "Appuyez sur Entrée…"
      exit 1
    }
  else
    echo "Dépendances manquantes ou incomplètes : réinstallation en cours…"
  fi
  echo "Installation des dépendances (une seule fois, quelques minutes)…"
  .venv/bin/python -m pip install --upgrade pip || {
    echo "[ERREUR] Mise à jour de pip impossible (connexion internet ?)."
    read -r -p "Appuyez sur Entrée…"
    exit 1
  }
  .venv/bin/python -m pip install -r requirements.txt || {
    echo "[ERREUR] L'installation des dépendances a échoué (vérifiez la connexion internet)."
    echo "Relancez ce fichier une fois la connexion rétablie."
    read -r -p "Appuyez sur Entrée…"
    exit 1
  }
  if ! check_deps; then
    echo "[ERREUR] Les dépendances ne sont toujours pas fonctionnelles."
    read -r -p "Appuyez sur Entrée…"
    exit 1
  fi
fi

echo "Démarrage du Cri du Vivant…"
echo "  Page : http://localhost:8765"
echo "  Arrêt : Ctrl+C ici"
(cd escape_game && exec ../.venv/bin/python server.py) &
SERVER_PID=$!
sleep 5
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:8765" >/dev/null 2>&1
fi
wait "$SERVER_PID"
