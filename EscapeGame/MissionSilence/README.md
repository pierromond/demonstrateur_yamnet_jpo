# Mission Silence — Station acoustique (escape game)

Station d'un escape game pour enfants : retrouver en silence un mot caché dans la salle, le taper
sur l'ordinateur, et noter le code 4 chiffres affiché. Tout bruit trop fort fait échouer la mission ;
un cri très fort fait « exploser » l'écran (effet visuel de brouillage).

## Démarrage

Prérequis : Node.js (aucune dépendance à installer).

```bash
cd EscapeGame/MissionSilence
node server.js
```

- Écran de jeu (sur le PC) : `http://localhost:3000` — cliquer pour activer le micro, plein écran (F11).
  Le micro n'est autorisé qu'en `localhost` (contexte sécurisé du navigateur).
- Télécommande (téléphone de l'animateur, même WiFi) : `http://<IP-du-PC>:3000/admin` — PIN par défaut `1234`.
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
| `word` | `TOUCHE` | Mot à taper pour révéler le code |
| `code` | `4821` | Code 4 chiffres affiché au succès |
| `thresholdDb` | `55` | Seuil d'échec (dépassé ~1 s → échec) |
| `explodeThresholdDb` | `80` | Seuil d'explosion (brouillage spectaculaire) |
| `failDurationMs` | `1000` | Durée de dépassement avant échec |
| `codeDisplayMs` | `30000` | Durée d'affichage du code |
| `timeLimitMs` | `300000` | Chrono de la mission (5 min) — réinitialisable par l'admin uniquement |
| `timePenaltyMs` | `20000` | Pénalité du cri (seuil d'explosion) |
| `wordPenaltyMs` | `10000` | Pénalité d'un mot faux |
| `adminPin` | `1234` | PIN de la télécommande |
| `port` | `3000` | Port HTTP |

## Contrôles

- **F8** : panneau animateur (calibration micro, seuils, code de session, mot)
- **F9** : armer / relancer la mission
- **F10** : mode démo pédagogique (aucun échec)
- **Échap** : retour à l'écran de repos

## Calibration

F8 → « Mesurer le silence (3 s) » puis « Tapez des mains près du micro » (repère : claquement = 90 dB).
Le réglage est conservé par le navigateur. Ajustez ensuite le seuil d'échec (55 dB par défaut).

## Règles du jeu

1. Armer la mission → compte à rebours 3-2-1 → recherche en silence. **Chrono de 5 minutes** affiché en
   grand : c'est le temps pour trouver le code avant qu'il ne s'efface.
2. **Bruit ≥ seuil** (ex. 55 dB) → un message « ATTENTION… CHUUUT ! » s'affiche tant que le bruit
   persiste (le jeu continue, **aucune pénalité**).
3. **Cri ≥ seuil d'explosion** (ex. 80 dB) → l'écran se brouille, tremble, « explose » (avec un
   « **-20 s sur le compteur !** » bien visible), puis la mission reprend avec **-20 s**.
   La pénalité de temps s'applique au **seuil d'explosion uniquement**.
4. **Mot faux** (mot complet tapé, incorrect) → **-10 s** et le champ s'efface pour réessayer.
5. Taper le mot exact (ex. `IMPERCEPTIBLE`) → le code s'affiche 30 s : les enfants le notent.
6. **Chrono à 0** → écran « Désolé, vous n'aurez que 3 chiffres sur 4 » : seuls les 3 premiers
   chiffres du code sont révélés (30 s), puis retour au repos.
7. Seul l'animateur peut **réinitialiser le chrono** : bouton « Réinitialiser le chrono » sur la
   télécommande (`/admin`) ou dans le panneau animateur (F8).

L'application ne produit **aucun son** : tous les retours sont visuels.
