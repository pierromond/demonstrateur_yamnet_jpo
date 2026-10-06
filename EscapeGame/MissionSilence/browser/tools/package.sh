#!/usr/bin/env bash
# Assemble les paquets autonomes de Mission Silence (version navigateur) pour
# Windows et Linux, avec un runtime Node.js portable embarqué (aucune
# installation requise sur le poste).
#
# Prérequis : accès Internet (pour télécharger Node une seule fois) + curl.
# Usage : tools/package.sh
set -euo pipefail

NAME="mission-silence"
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

fetch "${BASE_URL}/${LINUX_TARBALL}" "${CACHE}/${LINUX_TARBALL}"
fetch "${BASE_URL}/${WIN_ZIP}" "${CACHE}/${WIN_ZIP}"

if [ ! -d "${CACHE}/node-v${NODE_VERSION}-linux-x64" ]; then
  tar -xf "${CACHE}/${LINUX_TARBALL}" -C "${CACHE}"
fi
if [ ! -d "${CACHE}/win-node" ]; then
  python3 -m zipfile -e "${CACHE}/${WIN_ZIP}" "${CACHE}/win-node"
fi

copy_app() {
  rm -rf "$2"
  mkdir -p "$2"
  ( cd "$1" && tar -cf - \
      --exclude=./tools --exclude=./dist --exclude=./.cache . ) \
    | ( cd "$2" && tar -xf - )
}

# Linux
LINUX_DIR="${DIST}/${NAME}-linux-x64"
copy_app "${ROOT}" "${LINUX_DIR}"
mkdir -p "${LINUX_DIR}/runtime/bin"
cp "${CACHE}/node-v${NODE_VERSION}-linux-x64/bin/node" "${LINUX_DIR}/runtime/bin/node"
chmod +x "${LINUX_DIR}/runtime/bin/node" "${LINUX_DIR}/lancer.sh"

# Windows
WIN_DIR="${DIST}/${NAME}-windows-x64"
copy_app "${ROOT}" "${WIN_DIR}"
mkdir -p "${WIN_DIR}/runtime"
cp "${CACHE}/win-node/node-v${NODE_VERSION}-win-x64/node.exe" "${WIN_DIR}/runtime/node.exe"

echo
echo "Paquets créés dans ${DIST} :"
du -sh "${LINUX_DIR}" "${WIN_DIR}"
