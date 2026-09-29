# Mission Silence — Station acoustique (escape game)

Station d'un escape game pour enfants : retrouver en silence un mot caché dans la salle, le taper
sur l'ordinateur, et noter le code 4 chiffres affiché. Un bruit trop fort déclenche un avertissement
« CHUUUT ! » (sans pénalité) ; un cri très fort fait « exploser » l'écran (brouillage visuel et
alarme sonore) et coûte 20 s de chrono.

## Démarrage

Prérequis : Node.js (aucune dépendance à installer).

```bash
cd EscapeGame/MissionSilence
node server.js
```

- Écran de jeu (sur le PC) : `http://localhost:3000` — cliquer pour activer le micro, plein écran (F11).
  Le micro n'est autorisé qu'en `localhost` (contexte sécurisé du navigateur).
- Télécommande (téléphone de l'animateur, même WiFi) : `http://<IP-du-PC>:3000/admin` — PIN par défaut `445649`.
  Le serveur affiche l'IP du PC au démarrage.
- Imprimables : `http://localhost:3000/imprimables/` (Affiche dB, indices, fiches code, briefing porte,
  notice animateur).

## Accès à distance (tunnel HTTPS)

Le backend tourne sur le PC de la salle ; les autres appareils (machine des enfants avec le micro,
téléphone de l'animateur) s'y connectent via une URL publique HTTPS. Le HTTPS est indispensable :
les navigateurs n'autorisent le micro que sur un contexte sécurisé.

Une seule commande au démarrage :

```bash
./demarrer-atelier.sh            # tunnel Cloudflare (quick tunnel, port 7844 sortant requis)
./demarrer-atelier.sh localhostrun   # alternative : tunnel SSH sur le port 443 (localhost.run)
```

L'URL publique (aléatoire, change à chaque lancement) s'affiche dans les logs — à partager avec
l'animateur. Sur cette URL :

- `/` : écran de jeu (la machine distante l'ouvre : c'est elle qui capte le micro)
- `/admin` : télécommande animateur (PIN de `config.json`)

### Sécurité (à faire avant le jour J)

- `config.json` → `adminPin` : choisir un PIN long et aléatoire (le défaut est un exemple).
- PIN vérifié avec verrouillage : 5 échecs = 1 minute de blocage.
- Vérifications anti-CSRF : `/cmd` et `/telemetry` exigent `Content-Type: application/json` et une
  origine correspondant au serveur.
- L'URL publique est aléatoire mais accessible à qui la connaît : le PIN protège les actions.
  Si l'URL fuit, relancez `demarrer-atelier.sh` pour en obtenir une nouvelle.
- `POST /telemetry` reste non authentifié (risque limité : fausses données d'affichage sur la
  télécommande uniquement).

## Configuration (`config.json`)

| Champ | Défaut | Rôle |
|---|---|---|
| `word` | `SILENCE` | Mot à taper pour révéler le code |
| `code` | `4821` | Code 4 chiffres affiché au succès |
| `thresholdDb` | `55` | Seuil d'alerte (message « CHUUUT ! », aucune pénalité) |
| `explodeThresholdDb` | `65` | Seuil d'explosion (alarme + brouillage + pénalité) |
| `failDurationMs` | `1000` | Non utilisé (hérité, sans effet) |
| `codeDisplayMs` | `120000` | Durée d'affichage du code (2 min) |
| `timeoutDisplayMs` | `30000` | Durée d'affichage des 3 chiffres au temps écoulé (30 s) |
| `timeLimitMs` | `300000` | Chrono de la mission (5 min) — réinitialisé à chaque armement, ou par l'admin |
| `timePenaltyMs` | `20000` | Pénalité du cri (seuil d'explosion) |
| `wordPenaltyMs` | `10000` | Pénalité d'un mot faux |
| `adminPin` | `445649` | PIN de la télécommande |
| `port` | `3000` | Port HTTP |
| `calibration` | voir fichier | Ancres des 3 références, durées de mesure et tolérances |

## Contrôles

- **F8** : panneau animateur (calibration micro, seuils, code de session, mot)
- **F9** : armer / relancer la mission
- **F10** : mode démo pédagogique (aucun échec)
- **Échap** : retour à l'écran de repos

## Calibration

La calibration est **facultative** : tant qu'elle n'est pas faite, un bandeau rouge « Calibration micro
non faite » s'affiche et les valeurs en dB sont indicatives.

Au démarrage, dans **F8 → Calibration du micro**, l'animateur choisit **une seule** référence :

| Référence | Mesure | Défaut |
|---|---|---|
| **Bruit de fond** | niveau ambiant médian pendant 3 s (au calme) | ancre **30 dB** |
| **Claquement** | pic d'un claquement de mains (doit dépasser le bruit de fond de ≥ 20 dB) | ancre **90 dB** |
| **Source étalon** | moyenne d'un calibrateur 1 kHz (signal stable) | ancre **94 dB** |

La mesure affiche le niveau en direct ; si la mesure est incohérente (claquement non détecté, ambiance
ou signal instable), elle est refusée. Une fois validée, l'offset est **enregistré sur le serveur**
(dans `calibration.json`, non versionné) et réappliqué automatiquement à chaque lancement. Il reste en
vigueur jusqu'à une nouvelle calibration (« Réinitialiser la calibration » efface l'enregistrement).

- Les 3 références sont **exclusives** : la dernière validée remplace la précédente.
- Le réglage est **local à la machine** (micro du PC de la station) ; le fichier `calibration.json`
  n'est pas suivi par Git et doit être refait si l'on change de PC/micro.
- Ajustez ensuite le seuil d'alerte (55 dB par défaut) si besoin.

## Règles du jeu

1. Armer la mission → compte à rebours 3-2-1 → recherche en silence. **Chrono de 5 minutes** affiché en
   grand : c'est le temps pour trouver le code avant qu'il ne s'efface.
2. **Bruit ≥ seuil** (ex. 55 dB) → un message « ATTENTION… CHUUUT ! » s'affiche tant que le bruit
   persiste (le jeu continue, **aucune pénalité**).
3. **Cri ≥ seuil d'explosion** (ex. 65 dB) → une **alarme sonore** retentit, l'écran se brouille,
   tremble, « explose » (avec un « **-20 s sur le compteur !** » bien visible), puis la mission
   reprend avec **-20 s**. La pénalité de temps s'applique au **seuil d'explosion uniquement**.
4. **Mot faux** (mot complet tapé, incorrect) → **-10 s** et le champ s'efface pour réessayer.
5. Taper le mot exact (ex. `SILENCE`) → le code s'affiche 2 min : les enfants le notent.
6. **Chrono à 0** → écran « Désolé, vous n'aurez que 3 chiffres sur 4 » : seuls les 3 premiers
   chiffres du code sont révélés (30 s), puis retour au repos.
7. Le chrono est **réinitialisé à chaque armement** (Espace/F9 ou télécommande) ; l'animateur peut
   aussi le réinitialiser en cours de mission via « Réinitialiser le chrono » (`/admin` ou F8).

Le seul son produit est l'**alarme d'explosion**
(`public/570462__fusionwolf3740__delta-7-detonation-alarm.wav`), jouée au franchissement du seuil
d'explosion. Tous les autres retours sont visuels.
