# Migrations SQL

Le schéma Supabase de production a été construit historiquement par plusieurs scripts successifs.

Pour éviter de remettre dans GitHub d'anciens comptes de démonstration, PIN ou tokens, les anciens scripts ne sont pas copiés tels quels dans ce dossier.

## Point de départ reproductible

Depuis le 16/11/2026, la structure complète de la production est versionnée dans `supabase/schema/20261116_baseline.sql`, sans aucune donnée.

Les migrations de ce dossier datées d'avant cette date sont déjà incluses dans cet instantané. Elles sont gardées pour l'historique.

Toute modification future de la base doit être ajoutée ici sous forme de migration datée, puis appliquée en production. `npm run test:db` vérifie que l'instantané rejoué correspond toujours à la production.

Les secrets et les données utilisateurs ne doivent jamais apparaître ici.
