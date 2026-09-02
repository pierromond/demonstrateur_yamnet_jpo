#!/usr/bin/env bash
# Le Cri du Vivant — lancement Docker (Linux / Mac)
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

echo "Construction de l'image Docker, première fois : 5 à 10 minutes…"
docker build -t cri-du-vivant . || {
  echo "[ERREUR] La construction de l'image a échoué (connexion internet ?)."
  read -r -p "Appuyez sur Entrée…"
  exit 1
}

echo "Démarrage de la station…"
docker rm -f cri-du-vivant >/dev/null 2>&1
docker run -d --name cri-du-vivant -p 8765:8765 cri-du-vivant || {
  echo "[ERREUR] Le démarrage a échoué, le port 8765 est peut-être déjà utilisé."
  read -r -p "Appuyez sur Entrée…"
  exit 1
}

sleep 8
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:8765" >/dev/null 2>&1
fi
echo "Le Cri du Vivant tourne dans Docker."
echo "  Page : http://localhost:8765"
echo "  Arrêt : docker stop cri-du-vivant"
