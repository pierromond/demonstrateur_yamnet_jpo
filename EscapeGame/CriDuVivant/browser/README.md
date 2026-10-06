# Le Cri du Vivant — version autonomе (navigateur)

Variante **hors-ligne, sans Python et sans serveur applicatif** de la station.
La reconnaissance **YAMNet tourne dans le navigateur** (TensorFlow.js + WebAssembly) ;
plus aucun échange avec un serveur de calcul.

## Ce que ça change

| | Version d'origine | Cette version |
|---|---|---|
| Reconnaissance | serveur Python (TensorFlow) | **navigateur** (tfjs-tflite/WASM) |
| Communication | WebSocket | **aucune** (tout est local) |
| Dépendances | Python + fastapi + uvicorn + websocket | **aucune** |
| Hors-ligne | non | **oui** |
| Windows / Linux | build séparés | **identiques** |

La fenêtre d'analyse (0,96 s) et le pas (0,48 s) sont identiques au serveur
d'origine, ainsi que le pré-traitement (gain limité à +24 dB). Le modèle est
reconverti depuis YAMNet avec une entrée fixe `15360` et produit des scores
identiques à l'ancien modèle (écart < 10⁻⁵).

## Lancement

- **Windows** : double-clic sur `lancer.bat`.
- **Linux / Mac** : `./lancer.sh`.

Le navigateur s'ouvre sur `http://localhost:8765` ; il faut autoriser le micro.
Le micro et le chargement WebAssembly exigent `http://localhost` (pas `file://`),
d'où le micro-lanceur — il sert uniquement les fichiers locaux, sans réseau.

## Configuration

Tout est dans `config.json` :

- `animals` : classes YAMNet, nom français, emoji et `yamnet_index` (index dans les 521 classes) ;
- `rounds` : énigmes, animal cible, seuil de détection, niveau d'aide ;
- `confidence_threshold`, `human_threshold`, `sustain_duration` ;
- `code` : code secret révélé à la fin ;
- `server.yamnet_window_seconds` / `yamnet_hop_seconds` : fenêtrage (0,96 s / 0,48 s).

Modifier le fichier puis recharger la page.

## Reconstruire les dépendances (avec Internet, une seule fois)

```bash
tools/fetch_vendor.sh                    # bibliothèques TensorFlow.js + WASM
python3 -m venv .venv-tools
.venv-tools/bin/pip install tensorflow kagglehub
.venv-tools/bin/python tools/convert_model.py   # régénère yamnet.tflite
```

## Fabriquer les paquets distribuables (Node portable embarqué)

```bash
tools/package.sh
```

Génère dans `dist/` :

- `cri-du-vivant-linux-x64/` (runtime Node + `lancer.sh`)
- `cri-du-vivant-windows-x64/` (runtime Node + `lancer.bat`)

Aucune installation sur le poste : un double-clic suffit.

## Contenu du dossier

- `index.html`, `app.js` : l'application (interface + logique + inférence) ;
- `yamnet.tflite` : YAMNet reconverti à entrée fixe ;
- `vendor/` : tfjs-core, tfjs-backend-cpu, tfjs-tflite et les modules WASM ;
- `serve.js` : micro-serveur statique local (aucune dépendance) ;
- `tools/` : scripts de conversion, de récupération des libs et d'empaquetage.
