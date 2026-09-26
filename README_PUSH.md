# V1.9 — rappels push

Cette version ajoute les notifications Web Push.

## Règle métier

Le rappel est envoyé uniquement si :

1. il est 19h en heure `Europe/Paris` ;
2. l'employé est prévu au travail ce jour-là ;
3. la journée n'est pas marquée « non travaillée » ;
4. arrivée + départ ne sont pas tous les deux renseignés ;
5. aucun rappel n'a déjà été envoyé ce jour-là.

Samedi et dimanche sont non travaillés par défaut, sauf override dans le planning.

## Mise en place Supabase

1. Exécuter `supabase_push_setup.sql` dans SQL Editor.
2. Dans Data API > Exposed functions, exposer :
   - `api_employee_save_push_subscription`
   - `api_employee_remove_push_subscription`
   - `system_get_reminder_batch`
   - `system_record_reminder_success`
   - `system_mark_push_success`
   - `system_deactivate_push_subscription`
3. Dans Edge Functions : Deploy a new function > Via Editor.
4. Nom : `send-reminders`.
5. Coller le contenu de `supabase/functions/send-reminders/index.ts`, puis déployer.
6. Ajouter les secrets indiqués dans le fichier séparé `supabase_push_secrets_DO_NOT_COMMIT.txt` :
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
   - `CRON_SECRET`
7. Tester la fonction depuis le Dashboard avec :
   - Header `x-cron-secret` = valeur de `CRON_SECRET`
   - Body : `{ "force": true }`
8. Quand le test fonctionne, exécuter `supabase_push_cron.sql`.

## Test téléphone

- Android : ouvrir le site, se connecter, puis « Activer les rappels ».
- iPhone : ajouter d'abord le site à l'écran d'accueil, ouvrir l'icône installée, puis activer les rappels.
- Le bouton « Tester sur ce téléphone » affiche une notification locale pour confirmer que l'autorisation est correcte.

Pour tester l'envoi serveur un samedi/dimanche, marquer temporairement l'employé comme « travaillé » aujourd'hui dans le planning pilotage, laisser la journée incomplète, puis tester l'Edge Function avec `{ "force": true }`.
