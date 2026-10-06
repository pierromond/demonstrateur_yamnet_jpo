# Spectro Masked — version autonome (navigateur)

Variante **hors-ligne, sans serveur applicatif** de la station : la page est
servie par un simple micro-serveur statique local (`http://localhost:4000`).

La station était déjà purement côté navigateur (Web Audio, clavier, MIDI) ; le
serveur ne servait qu'à distribuer les fichiers et la config. Ici, la config est
un simple `config.json`.

## Lancement

- **Windows** : double-clic sur `lancer.bat`.
- **Linux / Mac** : `./lancer.sh`.

Le navigateur s'ouvre sur `http://localhost:4000` ; cliquez sur « Activer
l'audio » et autorisez le MIDI si un Launchpad est branché (Chrome/Edge requis).

## Configuration

Tout est dans `config.json` :

- `sounds` : nom, fichier, touche clavier, note MIDI, couleur éventuelle ;
- `pads` : pads colorés (les 3 coins) et leur couleur LED.

Modifier le fichier puis recharger la page.

## Empaquetage (Node portable embarqué)

```bash
tools/package.sh
```

Génère dans `dist/` : `spectro-masked-linux-x64/` (`lancer.sh`) et
`spectro-masked-windows-x64/` (`lancer.bat`). Aucune installation requise.
