#!/usr/bin/env bash
# Tailscale Funnel — relance de l'URL publique fixe de l'escape game.
# Usage : ./tailscale-funnel.sh   (apres un redemarrage du PC)
set -u
TS=/home/aumond/.local/opt/tailscale
SOCK=/tmp/tailscaled.sock
PORT=3100
URL=https://pnan-23-034.tailb0226e.ts.net

if "$TS/tailscale" --socket="$SOCK" status >/dev/null 2>&1; then
  echo "tailscaled deja en cours d'execution."
else
  echo "Demarrage de tailscaled..."
  mkdir -p /home/aumond/.tailscale/var
  nohup "$TS/tailscaled" --tun=userspace-networking --socket="$SOCK" \
    --state=/home/aumond/.tailscale/tailscaled.state \
    --statedir=/home/aumond/.tailscale/var >/home/aumond/.tailscale/tailscaled.log 2>&1 &
  for i in $(seq 1 30); do
    "$TS/tailscale" --socket="$SOCK" status >/dev/null 2>&1 && break
    sleep 1
  done
fi

"$TS/tailscale" --socket="$SOCK" funnel --bg "$PORT" >/dev/null 2>&1

echo "URL publique fixe : $URL"
echo "  (admin + /missionSilence/ /criVivant/ /spectroMasked/ /chladni/)"
echo "Verification..."
sleep 3
code=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)
if [ "$code" = "200" ]; then
  echo "OK - la station repond ($code)."
else
  echo "Attention : reponse $code - verifiez la connexion internet et l'etat du compte Tailscale (tailscale status)."
fi
