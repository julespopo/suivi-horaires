# Migrations SQL

Le schéma Supabase de production a été construit historiquement par plusieurs scripts successifs.

Pour éviter de remettre dans GitHub d'anciens comptes de démonstration, PIN ou tokens, les anciens scripts ne sont pas copiés tels quels dans ce dossier.

## Avant RC1

Créer un export propre du schéma actuel depuis Supabase, sans données :
- tables ;
- contraintes ;
- index ;
- RLS ;
- fonctions RPC ;
- grants.

Cet export deviendra la base reproductible de la V2.

Les secrets et les données utilisateurs ne doivent jamais apparaître ici.
