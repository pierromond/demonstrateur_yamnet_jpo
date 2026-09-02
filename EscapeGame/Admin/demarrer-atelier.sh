#!/usr/bin/env bash
# Escape Game Admin — démarre l'interface de pilotage + les webapps
# et leurs tunnels Cloudflare. Ctrl+C arrête tout proprement.
set -euo pipefail
cd "$(dirname "$0")"

node server.js
