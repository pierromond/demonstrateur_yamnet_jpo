# Mission Silence — version autonome (navigateur)

Variante **hors-ligne, sans serveur applicatif** de la station : la page est
servie par un simple micro-serveur statique local (`http://localhost:3000`).
Plus de page `/admin`, plus de télémétrie SSE, plus de commande serveur.

## Différences avec la version d'origine

| | Version d'origine | Cette version |
|---|---|---|
| Config | poussée par SSE (`/events`) | lue dans `config.json` |
| Réglages animateur | envoyés au serveur (`/cmd`, PIN) | appliqués en local (navigateur) |
| Calibration | enregistrée côté serveur | enregistrée dans le navigateur (localStorage) |
| Télécommande `/admin` | oui | non |
| Hors-ligne | non | oui |

Le sonomètre, le mot, le code et les seuils sont inchangés.

## Lancement

- **Windows** : double-clic sur `lancer.bat`.
- **Linux / Mac** : `./lancer.sh`.

Le navigateur s'ouvre sur `http://localhost:3000` ; cliquez sur « Démarrer »
et autorisez le micro.

## Réglages

- **Permanents** : éditez `config.json` (mot, code, seuils, temps).
- **Rapides / calibration** : panneau animateur (touche `F8` ou `Espace` selon
  le contexte). Les réglages et la calibration sont conservés dans le
  navigateur (`localStorage`), pas dans un fichier.
  - pour repartir de `config.json`, effacez les données du site dans le navigateur.

## Empaquetage (Node portable embarqué)

```bash
tools/package.sh
```

Génère dans `dist/` : `mission-silence-linux-x64/` (`lancer.sh`) et
`mission-silence-windows-x64/` (`lancer.bat`). Aucune installation requise.
