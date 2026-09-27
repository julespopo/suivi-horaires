# Supabase — Suivi horaires

Ce dossier versionne les éléments backend que nous souhaitons conserver avec le code de l'application.

## Principes

- Les tables ne sont pas exposées directement au navigateur.
- Le frontend utilise des RPC `security definer` explicitement autorisées.
- Les secrets (`SUPABASE_SERVICE_ROLE_KEY`, clé VAPID privée, `CRON_SECRET`) ne doivent jamais être commités.
- Les comptes réels, PIN, `link_token` et données métier ne doivent pas être stockés dans GitHub.

## Edge Function

`functions/send-reminders/index.ts` est la version de référence de la fonction de rappel actuellement utilisée.

Secrets requis dans l'environnement Supabase :
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `CRON_SECRET`

Le cron reste configuré côté Supabase.

## Schéma SQL

Le projet Supabase de production existe déjà et a été construit par migrations successives. Avant RC1, le schéma devra être exporté depuis Supabase et ajouté ici sous forme de migrations propres et reproductibles.

Ne pas reconstruire le schéma de production à partir d'anciens scripts de test contenant des comptes ou tokens historiques.
