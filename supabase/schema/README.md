# Structure de la base (instantané)

`20261116_baseline.sql` décrit la base Supabase de production telle qu'elle était le 16/11/2026 : 16 tables, leurs contraintes et index, les 67 fonctions RPC, les 3 déclencheurs, les droits d'accès et la tâche planifiée des rappels.

Il ne contient **aucune donnée** (ni salariés, ni horaires, ni PIN, ni liens privés) et **aucun secret**.

## Reconstruire la base sur un nouveau projet Supabase

1. Créer un projet Supabase vide.
2. Dans le coffre-fort (Project Settings → Vault), créer les secrets `hours_project_url`, `hours_publishable_key` et `hours_cron_secret`. Les instructions se trouvent à la fin du fichier.
3. Exécuter `20261116_baseline.sql` dans l'éditeur SQL.
4. Exécuter ensuite, dans l'ordre, les migrations de `supabase/migrations/` **datées d'après le 16/11/2026**. Les plus anciennes sont déjà incluses dans l'instantané.
5. Déployer l'Edge Function `supabase/functions/send-reminders` et ses secrets (voir `supabase/README.md`).
6. Restaurer les données depuis la dernière sauvegarde.
7. Mettre à jour `config.js` avec l'URL et la clé publishable du nouveau projet.

## Vérifier que l'instantané est toujours à jour

`fingerprint.sql` calcule une empreinte de la structure. Exécuté en production, il doit donner les mêmes valeurs que celles notées dans `scripts/test-baseline-db.mjs`.

Si une valeur diffère, la production a changé sans migration versionnée. Il faut alors ajouter la migration manquante dans `supabase/migrations/`.

`npm run test:db` rejoue l'instantané sur une base PostgreSQL vide, compare les empreintes et fait un parcours salarié puis Pilotage avec des données fictives.

## Points relevés lors de l'export, à traiter plus tard

Ils sont reproduits tels quels pour rester fidèle à la production :

- `api_employee_change_pin` et `api_owner_change_pin` sont exécutables par `PUBLIC`, alors que les autres RPC sont limitées à `anon` et `authenticated`. Ce n'est pas exploitable en l'état, car les deux fonctions vérifient la session, mais c'est à harmoniser.
- `_new_session_token` et `_session_token_hash` (fonctions internes) sont exécutables par `anon`.
- La table `app_sessions` a une expiration par défaut de 3650 jours. Les fonctions de connexion fixent bien 90 jours, mais la valeur par défaut de la table est trompeuse.
