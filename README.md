# Démonstrateur escape game — « Le son s'échappe »

Escape game sonore en 4 stations indépendantes pour un public scolaire (primaire au lycée) :
**silence, imitations d'animaux, fréquences de résonance et sons du quotidien**.

## Les 4 stations

| Station | Principe | Public |
|---|---|---|
| **Mission Silence** | Rester silencieux sous le seuil du sonomètre, trouver le mot, obtenir le code | 6-12 ans |
| **Le Cri du Vivant** | Imiter le cri de l'animal de l'énigme (reconnaissance YAMNet) | 6-12 ans |
| **Spectro Masked** | Déclencher les bons sons (clavier ou Launchpad MK2) | 10-15 ans |
| **Plaque de Chladni** | Trouver les fréquences qui font vibrer la plaque | 10-15 ans |

## Démarrage rapide

- **Atelier complet** : voir [`EscapeGame/README.md`](EscapeGame/README.md)
  (admin de pilotage + tunnels).
- **Stations autonomes** : dossier `EscapeGame-Standalone/` — 4 dossiers à copier sur un
  PC (lanceurs `lancer.bat` / `lancer.sh`, option Docker pour 2 d'entre elles).
- **Déploiement serveur (Docker, sans tunnel)** : voir
  [`DEPLOY-SERVEUR.md`](DEPLOY-SERVEUR.md) — `docker compose up -d --build` expose les
  4 stations par leurs ports, avec option HTTPS (Caddy + Let's Encrypt) pour le
  micro/MIDI à distance.

## Détails par station

Chaque station est auto-contenue dans `EscapeGame/` : serveur + page web + `config.json`
(personnalisation : énigmes, sons, seuils, codes, fréquences…).
Les pages finales contiennent des **encarts pédagogiques** de niveau lycée
(le décibel, YAMNet).

## Structure du dépôt

```
EscapeGame/
  Admin/            Interface de pilotage des stations
  MissionSilence/   Station 1 — acoustique (Node.js)
  CriDuVivant/      Station 2 — YAMNet (Python)
  SpectroMasked/    Station 3 — sons / Launchpad (Node.js)
  PlaqueChladni/    Station 4 — cymatique (Node.js)
  README.md         Documentation complète
EscapeGame-Standalone/   Dossiers autonomes prêts à copier (ZIP inclus)
docker-compose.yml       Déploiement serveur (4 stations, option HTTPS)
Caddyfile                Reverse proxy HTTPS optionnel
DEPLOY-SERVEUR.md        Documentation du déploiement serveur
```

## Licence

Projet pédagogique — détails dans `LICENSE` (à réintégrer si besoin).
