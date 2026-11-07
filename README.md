# Suivi horaires

Application web légère de suivi des horaires pour une petite équipe travaillant auprès de plusieurs employeurs.

**Version actuelle : V2.0 Alpha 2.9**

Le projet est hébergé sur GitHub Pages et utilise Supabase pour les données, l'authentification par lien privé + PIN et les notifications.

## Fonctionnalités

### Espace salarié
- lien personnel + PIN à 4 chiffres ;
- journée travaillée / non travaillée ;
- plusieurs créneaux et plusieurs employeurs dans une même journée ;
- heure de début / heure de fin en direct ou saisie manuelle ;
- pause modifiable ;
- suppression d'un créneau saisi par erreur ;
- historique compact, journées repliées et vues semaine / mois en détail ;
- journées à compléter ;
- demandes de congés et RTT (journée, matin, après-midi) ;
- raccourcis arrivée 7h30 / 14h et départ 18h, avec saisie libre ;
- mode jour / nuit ;
- installation sur l'écran d'accueil ;
- fonctionnement hors ligne pour les actions quotidiennes, avec synchronisation automatique au retour du réseau.

### Pilotage
- vue globale des salariés ;
- planning semaine / mois ;
- sélection de plusieurs jours pour les passer travaillés ou non travaillés ;
- détail des salariés prévus en vue semaine ;
- validation et correction des journées ;
- gestion des employeurs et de leurs affectations ;
- gestion / validation des congés ;
- objectifs horaires ;
- synthèses et export PDF ;
- notifications de synthèse.

## Architecture

```text
.
├── index.html
├── employee.html
├── pilotage.html
├── app.js
├── employee.js
├── pilotage.js
├── styles/
│   ├── base.css       # socle historique stable
│   ├── v2.css         # composants V2
│   └── current.css    # couche visuelle actuelle
├── config.js
├── sw.js
├── manifest.json
├── manifest-employee.json
├── manifest-pilotage.json
├── icons/
└── supabase/
    ├── README.md
    └── functions/
        └── send-reminders/
```

Le frontend reste volontairement en **HTML / CSS / JavaScript sans framework**.

## Sécurité

`config.js` contient uniquement des valeurs prévues pour être publiques dans le navigateur :
- URL du projet Supabase ;
- clé Supabase publishable ;
- clé VAPID publique.

Les tables Supabase ne sont pas accessibles directement aux utilisateurs : les opérations passent par des RPC serveur.

Les connexions par PIN sont protégées côté serveur :
- 5 échecs maximum sur une fenêtre de 15 minutes ;
- blocage de 15 minutes au 5e échec ;
- remise à zéro après une connexion réussie ;
- le compteur est indexé par un hash du lien privé, jamais par le lien lui-même.

La migration correspondante est `supabase/migrations/20261019_001_login_rate_limit.sql`.

Ne jamais ajouter au dépôt :
- clé `service_role` ;
- clé VAPID privée ;
- `CRON_SECRET` ;
- PIN réels ;
- liens privés / `link_token` réels ;
- exports de données salariés.

## Mode hors ligne

Après une première connexion en ligne, l'espace salarié conserve localement les données nécessaires.

Les actions quotidiennes hors ligne sont placées dans une file locale puis synchronisées automatiquement. Des identifiants d'idempotence côté serveur évitent les doublons lors des reprises réseau.

Les corrections complexes de l'historique restent volontairement réservées au mode en ligne.

## Notifications

À 19 h (Europe/Paris) :
- un salarié prévu au travail avec une journée incomplète peut recevoir un rappel ;
- le Pilotage peut recevoir une synthèse du nombre de journées complétées.

La fonction serveur de référence se trouve dans `supabase/functions/send-reminders/`.

## Synthèse et validation par salarié

Dans le Pilotage, cliquer sur une fiche salarié (ou utiliser Entrée / Espace) ouvre sa semaine en cours : créneaux et employeurs par jour, pauses, congés / RTT, total des heures saisies, référence hebdomadaire et écart. Les semaines précédentes et les autres journées en attente restent accessibles depuis cette fenêtre.

Chaque journée peut être corrigée avec l’éditeur existant ou validée individuellement. Le bouton de validation groupée prend uniquement les journées complètes en attente de la semaine affichée, y compris les journées déclarées non travaillées. Il exclut les créneaux ouverts, les journées futures et les congés journée. Une actualisation précède la validation : les journées modifiées depuis leur consultation restent à vérifier. En cas de panne, les validations déjà reçues par le serveur sont conservées ; l’interface indique le résultat et les journées restantes.

Les validations réutilisent `api_owner_validate_entry` et ses contrôles de session. Aucun changement de schéma n’est nécessaire. Le test navigateur `scripts/test-employee-week.mjs` utilise exclusivement des données fictives et bloque les accès externes.

## Développement

La branche `main` doit rester utilisable.

Pour une modification importante :
1. créer une branche ;
2. effectuer les changements ;
3. tester les espaces salarié et Pilotage ;
4. vérifier le fonctionnement PWA / hors ligne ;
5. fusionner seulement après validation.

## Mise en service

La période suivie par l'application commence au **2 novembre 2026**. Les données de préparation sont remises à zéro avant la mise en service. Les dates antérieures ne sont pas proposées comme journées à compléter.


## Organisation CSS

Les styles sont chargés dans un ordre fixe afin de conserver exactement la cascade existante :

1. `styles/base.css` — socle général et compatibilité historique ;
2. `styles/v2.css` — composants métier V2 ;
3. `styles/current.css` — apparence actuelle et derniers correctifs responsives.

Les nouveaux ajustements visuels doivent être faits dans la couche appropriée plutôt que par ajout systématique d'overrides en fin de fichier.

## RTT et récupération

Les RTT utilisent `leave_type` : `rtt`, `rtt_morning`, `rtt_afternoon` ; `paid_leave` reste inchangé.
Une demi-journée porte sur une seule date : le matin se termine à 13h, l’après-midi commence à 13h (heures locales).
La demande salarié reste en attente de validation ; un ajout du pilotage est directement validé.
Le travail sur la moitié restante est autorisé, sans chevauchement. Les corrections et synchronisations hors ligne suivent les mêmes contrôles serveur.
Le RTT ajoute zéro minute travaillée. Le relevé PDF compte une demi-journée pour 0,5 jour et conserve les créneaux, commentaires, pauses et validation du travail.
La pause automatique est nulle sur une demi-journée RTT ; une pause manuelle reste déduite.
Les anciens RPC de congés et les anciennes files hors ligne restent compatibles. Les nouvelles fonctions internes ne sont pas exposées, les tables restent protégées par RLS.

### Non-régression RTT

```sh
node scripts/check-static.mjs
npm install --prefix /tmp/suivi-test-runtime @electric-sql/pglite@0.3.14 @playwright/test@1.56.1
PGLITE_MODULE=/tmp/suivi-test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-rtt-db.mjs
PGLITE_MODULE=/tmp/suivi-test-runtime/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-launch-db.mjs
PLAYWRIGHT_MODULE=/tmp/suivi-test-runtime/node_modules/playwright/index.mjs node scripts/test-rtt-ui.mjs
```

Le test SQL utilise une base PostgreSQL temporaire en mémoire et une fixture fictive ; ne jamais exécuter `supabase/tests/rtt-fixture.sql` en production.
Le test navigateur attend Chrome sur macOS (chemin modifiable via `CHROME_PATH`) et bloque tout accès externe. Il vérifie mobile, mode nuit, historique, raccourcis, saisie libre, file hors ligne et relevé imprimable.

La migration de mise en service archive les saisies et journaux dans le schéma privé `launch_backup_20261102` avant remise à zéro, y compris les congés et plannings futurs de préparation. Elle conserve les comptes, PIN, liens, employeurs, affectations et abonnements de notification. Les sessions sont fermées pour empêcher une ancienne file hors ligne de republier les tests ; une nouvelle connexion avec le même lien et PIN suffit. Les caches de préparation sont isolés de ceux de mise en service. Les contraintes serveur refusent les nouvelles écritures antérieures au 2 novembre.

## Contrôles avant mise en service

Les outils de test sont maintenant verrouillés dans `package-lock.json` et exécutés sur chaque modification de `main` ou pull request :

```sh
npm ci --ignore-scripts
npm run check
npm run test:db
npm run test:worker
node scripts/test-summary.mjs
npx playwright install chromium
npm run test:ui
```

La suite vérifie les RTT, les pauses, les validations, le nettoyage de lancement, les droits des sessions, les dates (dont 2028 et les changements d’année), la reprise réseau et le cache PWA. Elle n’envoie aucune notification réelle et ne crée aucune donnée de test dans la base de production.

Le cache conserve uniquement les fichiers connus de cette application. Les liens privés ne figurent pas dans ses clés, une panne HTTP ne remplace pas une copie valide et les caches d’autres applications sont conservés. Les requêtes bloquées s’interrompent après 30 secondes et les actions hors ligne restent réessayables.

Les noms sont échappés avant leur insertion dans les vues HTML. Les sessions des comptes désactivés sont refusées immédiatement. La synthèse du soir distingue le RTT journée de la demi-journée RTT.

La couverture navigateur automatisée utilise Chromium ; iPhone/Safari et les notifications push nécessitent également une vérification sur les appareils réels. Les sauvegardes de préparation sont privées ; elles ne remplacent pas une politique de sauvegarde régulière de production.

