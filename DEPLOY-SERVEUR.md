# Déploiement sur un serveur (sans Tailscale)

Cette branche remplace l'accès par tunnel Tailscale par un déploiement direct
**Docker Compose** : les 4 stations tournent sur le serveur et sont accessibles
par leurs ports (ou par HTTPS avec un domaine).

## Prérequis (sur le serveur)

- Docker + Docker Compose plugin :
  `sudo apt install docker.io docker-compose-plugin` (Ubuntu/Debian)
- Ports 3000, 4000, 4500, 8765 ouverts dans le pare-feu du serveur.

## Lancement

```bash
git clone https://github.com/pierromond/demonstrateur_yamnet_jpo.git
cd demonstrateur_yamnet_jpo
git checkout deploy-serveur

docker compose up -d --build
```

Les 4 stations répondent alors sur le serveur :

| Station | URL (sur le serveur) |
|---|---|
| Mission Silence | http://IP_DU_SERVEUR:3000 |
| Spectro Masked | http://IP_DU_SERVEUR:4000 |
| Plaque de Chladni | http://IP_DU_SERVEUR:4500 |
| Cri du Vivant | http://IP_DU_SERVEUR:8765 |

`docker compose ps` : état des conteneurs · `docker compose logs -f <station>` : journaux ·
`docker compose down` : arrêt.

## HTTPS obligatoire pour le micro / le MIDI

Chrome/Edge bloquent **micro et MIDI** sur une page en HTTP simple servie depuis une
autre machine que le navigateur. Pour utiliser les stations à distance (imitations
d'animaux, Launchpad, sonomètre), il faut du **HTTPS** :

- Avec un **nom de domaine** pointant vers le serveur : décommentez le service
  `caddy` dans `docker-compose.yml`, créez `.env.caddy` avec `DOMAIN=exemple.fr`,
  ajoutez les sous-domaines `mission`/`cri`/`spectro`/`chladni` (A records) puis :
  `docker compose --profile https up -d`
  (certificats HTTPS automatiques Let's Encrypt, fichiers Caddyfile fournis).
- Sans domaine : le micro/MIDI ne fonctionneront que depuis un navigateur
  ouvert **sur le serveur lui-même** (http://localhost:PORT).

## Configuration

Chaque station lit son `config.json` (énigmes, sons, seuils, codes, fréquences).
Après modification : `docker compose up -d --build <station>`.

## Notes

- Les conteneurs redémarrent automatiquement (`restart: unless-stopped`).
- Le modèle YAMNet (16 Mo) est inclus dans l'image du Cri du Vivant
  (premier build : ~5-10 min).
- Pas de dépendance à Tailscale ni à aucun tunnel : les stations sont exposées
  directement par le serveur.
