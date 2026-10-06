#!/usr/bin/env bash
# Assemble les paquets autonomes du Cri du Vivant (version navigateur) pour
# Windows et Linux, avec un runtime Node.js portable embarqué (aucune
# installation requise sur le poste).
#
# Prérequis : accès Internet (pour télécharger Node une seule fois) + curl.
# Usage : tools/package.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${HERE}/.." && pwd)"
DIST="${ROOT}/dist"
CACHE="${ROOT}/.cache"

NODE_VERSION="${NODE_VERSION:-20.18.1}"
LINUX_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"
WIN_ZIP="node-v${NODE_VERSION}-win-x64.zip"
BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"

mkdir -p "${DIST}" "${CACHE}"

fetch() {
  local url="$1" out="$2"
  if [ ! -f "${out}" ]; then
    echo "Téléchargement de $(basename "${out}")…"
    curl -fsSL -o "${out}" "${url}"
  fi
}

app_files() {
  cp "${ROOT}/index.html" "${ROOT}/app.js" "${ROOT}/serve.js" \
     "${ROOT}/config.json" "${ROOT}/yamnet.tflite" "$1/"
  cp -r "${ROOT}/vendor" "$1/"
}

# ---------- Linux ----------
LINUX_DIR="${DIST}/cri-du-vivant-linux-x64"
rm -rf "${LINUX_DIR}"
mkdir -p "${LINUX_DIR}/runtime/bin"
app_files "${LINUX_DIR}"
cp "${ROOT}/lancer.sh" "${LINUX_DIR}/"
chmod +x "${LINUX_DIR}/lancer.sh"

fetch "${BASE_URL}/${LINUX_TARBALL}" "${CACHE}/${LINUX_TARBALL}"
tar -xf "${CACHE}/${LINUX_TARBALL}" -C "${CACHE}"
cp "${CACHE}/node-v${NODE_VERSION}-linux-x64/bin/node" "${LINUX_DIR}/runtime/bin/node"
chmod +x "${LINUX_DIR}/runtime/bin/node"

# ---------- Windows ----------
WIN_DIR="${DIST}/cri-du-vivant-windows-x64"
rm -rf "${WIN_DIR}"
mkdir -p "${WIN_DIR}/runtime"
app_files "${WIN_DIR}"
cp "${ROOT}/lancer.bat" "${WIN_DIR}/"

fetch "${BASE_URL}/${WIN_ZIP}" "${CACHE}/${WIN_ZIP}"
python3 -m zipfile -e "${CACHE}/${WIN_ZIP}" "${CACHE}/win-node"
cp "${CACHE}/win-node/node-v${NODE_VERSION}-win-x64/node.exe" "${WIN_DIR}/runtime/node.exe"

# ---------- Notice ----------
cat > "${LINUX_DIR}/LISEZMOI.txt" <<'TXT'
LE CRI DU VIVANT — version autonome (Linux / Mac)
=================================================
Double-cliquez sur « lancer.sh » (ou exécutez-le dans un terminal).
Le navigateur s'ouvre sur http://localhost:8765 ; autorisez le micro.

Aucune installation, aucune connexion Internet : Node.js est embarqué dans
runtime/ et la reconnaissance YAMNet tourne dans le navigateur.

Pour modifier les énigmes : éditez config.json puis rechargez la page.
TXT

cat > "${WIN_DIR}/LISEZMOI.txt" <<'TXT'
LE CRI DU VIVANT - version autonome (Windows)
=============================================
Double-cliquez sur « lancer.bat ».
Le navigateur s'ouvre sur http://localhost:8765 ; autorisez le micro.

Aucune installation, aucune connexion Internet : Node.js est embarque dans
runtime\ et la reconnaissance YAMNet tourne dans le navigateur.

Pour modifier les enigmes : editez config.json puis rechargez la page.
TXT

echo
echo "Paquets créés :"
du -sh "${LINUX_DIR}" "${WIN_DIR}"
