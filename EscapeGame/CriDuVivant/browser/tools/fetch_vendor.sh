#!/usr/bin/env bash
# Télécharge les bibliothèques TensorFlow.js utilisées par la version navigateur.
# À lancer une seule fois (avec Internet) ; les fichiers sont ensuite servis en local.
set -euo pipefail
cd "$(dirname "$0")/.."

TFJS_CORE="4.9.0"
TFJS_TFLITE="0.0.1-alpha.10"

mkdir -p vendor/wasm

echo "Téléchargement de tfjs-core ${TFJS_CORE}…"
curl -fsSL -o vendor/tf-core.min.js \
  "https://unpkg.com/@tensorflow/tfjs-core@${TFJS_CORE}/dist/tf-core.min.js"

echo "Téléchargement de tfjs-backend-cpu ${TFJS_CORE}…"
curl -fsSL -o vendor/tf-backend-cpu.min.js \
  "https://unpkg.com/@tensorflow/tfjs-backend-cpu@${TFJS_CORE}/dist/tf-backend-cpu.min.js"

echo "Téléchargement de tfjs-tflite ${TFJS_TFLITE}…"
curl -fsSL -o vendor/tf-tflite.min.js \
  "https://unpkg.com/@tensorflow/tfjs-tflite@${TFJS_TFLITE}/dist/tf-tflite.min.js"

echo "Téléchargement des modules WASM…"
BASE="https://unpkg.com/@tensorflow/tfjs-tflite@${TFJS_TFLITE}/wasm"
for f in \
  tflite_web_api_client.js \
  tflite_web_api_cc.js \
  tflite_web_api_cc_simd.js \
  tflite_web_api_cc.wasm \
  tflite_web_api_cc_simd.wasm ; do
  curl -fsSL -o "vendor/wasm/${f}" "${BASE}/${f}"
done

echo "Terminé. Vérifiez que le modèle vendor/… et yamnet.tflite sont présents."
