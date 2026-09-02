#!/usr/bin/env bash
# Mission Silence — lancement Docker (Linux / Mac)
# Nécessite : Docker installé et démarré.
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "[ERREUR] Docker n'est pas installé."
  echo "Installez Docker Desktop puis relancez ce fichier."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "[ERREUR] Docker n'est pas démarré."
  echo "Lancez Docker, attendez qu'il soit prêt, puis relancez ce fichier."
  read -r -p "Appuyez sur Entrée…"
  exit 1
fi

echo "Construction de l'image Docker, première fois : quelques minutes…"
docker build -t mission-silence . || {
  echo "[ERREUR] La construction de l'image a échoué (connexion internet ?)."
  read -r -p "Appuyez sur Entrée…"
  exit 1
}

echo "Démarrage de la station…"
docker rm -f mission-silence >/dev/null 2>&1
docker run -d --name mission-silence -p 3000:3000 mission-silence || {
  echo "[ERREUR] Le démarrage a échoué, le port 3000 est peut-être déjà utilisé."
  read -r -p "Appuyez sur Entrée…"
  exit 1
}

sleep 3
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1
fi
echo "Mission Silence tourne dans Docker."
echo "  Page : http://localhost:3000"
echo "  Arrêt : docker stop mission-silence"
