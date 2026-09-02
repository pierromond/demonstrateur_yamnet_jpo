# Escape Game — 4 stations d'écoute

Démonstrateur d'escape game sonore : les joueurs doivent utiliser **leur voix, leur silence
ou des fréquences** pour résoudre des énigmes dans 4 stations. Chaque station est
indépendante (elle peut tourner seule sur un PC), ou pilotée depuis une interface centrale.

| Dossier | Station | Rôle | Port local |
|---|---|---|---|
| `Admin/` | Pilotage | Interface de contrôle : démarre/arrête les webapps, surveille les crashs, gère les tunnels | 3100 |
| `MissionSilence/` | Station acoustique | Sonomètre — rester silencieux, trouver le mot, obtenir le code (Node.js) | 3000 |
| `CriDuVivant/` | Reconnaissance sonore | Imiter les cris d'animaux, analysés par YAMNet (Python/FastAPI + TensorFlow) | 8765 |
| `SpectroMasked/` | Déclencheur de sons | Sons déclenchés au clavier ou au Launchpad MK2 (Node.js) | 4000 |
| `PlaqueChladni/` | Cymatique | Fréquences de résonance de la plaque (Node.js) | 4500 |

## Démarrage rapide (développement)

Une seule commande :

```bash
cd EscapeGame/Admin
./demarrer-atelier.sh          # ou : node server.js
```

L'admin démarre les webapps (`autoStart` dans `Admin/config.json`) et expose l'ensemble.
L'interface locale : http://localhost:3100 (PIN dans `Admin/config.json` → `adminPin`).

Actions possibles par carte : **Démarrer / Arrêter / Redémarrer**, **Tout démarrer /
Tout arrêter**, relance automatique en cas de crash, consultation des **journaux**.

## Les stations

### Mission Silence (3000) — station acoustique
Le groupe doit rester **silencieux** sous un seuil de bruit, trouver le mot caché dans la
salle et taper le code pour arrêter le chrono.
- Mesure du niveau en dB (RMS 32 bits), grande jauge + chrono très visible ;
- **Calibration à 1 point** (panneau F8) : au choix silence ≈ 40 dB, claquement ≈ 90 dB,
  ou calibrateur externe 94 dB/1 kHz — le décalage est ajusté, aucune valeur n'est bornée ;
- Raccourcis : `F8` panneau · `Espace`/`F9` armer · `Ctrl+Alt+D` réinit. chrono ·
  `F10` mode démo ;
- Écran final (2 min) : code + message « frapper à la porte suivante » + encart
  pédagogique sur le **décibel** (0 dB n'est pas le silence absolu, record −24,9 dBA…).

### Le Cri du Vivant (8765) — reconnaissance sonore YAMNet
Les enfants doivent **imiter les cris d'animaux** : cochon, chien, mouton, loup
(difficulté progressive : seuils et aides par énigme dans `config.json`).
- Analyse par **YAMNet** (réseau de neurones Google, 521 classes de sons, AudioSet) ;
- Détection de la voix humaine → message d'énigme ;
- Encart pédagogique YAMNet sur l'écran final + message « ouvrir la boîte à clé » ;
- Raccourcis : `Ctrl+Alt+C` finir · `Ctrl+Alt+V` relancer · double-clic sur l'énigme (secours) ;
- Dépendances : `python -m venv .venv && .venv/bin/pip install -r requirements.txt`
  (model `yamnet.tflite` à la racine du dossier).

### Spectro Masked (4000) — déclencheur de sons (Launchpad MK2)
Sons déclenchés par touches (`a z e r t y u i`) ou par les pads du Launchpad.
- Mapping notes du Launchpad MK2 : `note = 10 × (rang−1) + colonne + 10`
  (rang 1-8 du bas vers le haut, colonne 1-8 de gauche à droite) ;
- Pads de couleur : vert (11), rouge (81), bleu (88) — vélocités calibrées
  rouge=6, vert=21, bleu=39 ; les autres pads sont des déclencheurs **sans LED** ;
- Configuration : `config.json` (`sounds`, `pads`) et dossier `audio/`.

### Plaque de Chladni (4500) — cymatique
Balayage de fréquences : un pas par clic, **uniquement** sur les fréquences de résonance
de la plaque (liste exacte dans `config.json` → `frequencies`).

## Déploiement autonome (clé USB)

Le dossier `EscapeGame-Standalone/` contient **4 dossiers prêts à copier** sur un PC de
station (chacun avec son ZIP) :

- `lancer.bat` (Windows) / `lancer.sh` (Linux-Mac) : démarre et ouvre le navigateur ;
- stations 01 (Mission Silence) et 04 (Cri du Vivant) : **option Docker**
  (`lancer-docker.bat`, Docker Desktop requis) pour une installation sans souci ;
- chaque dossier a son `LISEZMOI.txt` ; prérequis : Node.js (01-03),
  Python 3.10-3.12 ou Docker (04).

## Accès public

- **URL fixe (recommandée)** : Tailscale Funnel → https://pnan-23-034.tailb0226e.ts.net
  (chemins : `/missionSilence/` `/criVivant/` `/spectroMasked/` `/chladni/`).
  Relance après redémarrage : `./tailscale-funnel.sh` (racine du dépôt).
- **URL aléatoire** : tunnel quick Cloudflare/localhost.run géré par l'admin
  (change à chaque relance — « Nouvelle URL » dans l'admin).

## Configuration de l'admin

`Admin/config.json` :

| Champ | Rôle |
|---|---|
| `port` | Port de l'interface admin (défaut 3100) |
| `adminPin` | PIN requis pour toute action (le défaut est un exemple, à changer) |
| `cloudflared` | Binaire du tunnel (défaut `cloudflared`) |
| `adminTunnel.enabled` | Exposer l'admin via un tunnel |
| `apps` | Une entrée par webapp : `command`, `args`, `dir`, `port`, `autoStart`, `autoRestart`, `tunnel` |

Surcharge possible du PIN par variable d'environnement : `ADMIN_PIN=… node server.js`.

## Sécurité (à faire avant le jour J)

- `Admin/config.json` → `adminPin` : choisir un PIN long et aléatoire.
- PIN vérifié avec verrouillage : 5 échecs = 1 minute de blocage ; toutes les actions
  (`POST /api/*`) exigent `Content-Type: application/json` et une origine correspondant au serveur.
- `GET /api/status` et `GET /api/logs` restent publics (lecture seule).
- Micro et MIDI ne fonctionnent qu'en **http://localhost** ou **https** (pas en IP locale HTTP).
