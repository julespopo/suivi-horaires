# Sauvegarde des données

Chaque semaine, une copie complète des données de Supabase (salariés, employeurs, horaires, congés, journaux) est déposée dans **iCloud Drive → Sauvegardes suivi-horaires**, sous la forme `suivi-horaires_AAAA-MM-JJ_HHMM.sql.gz`. Toutes les sauvegardes sont conservées.

Les fichiers de sauvegarde ne sont **jamais** envoyés sur GitHub.

## Fonctionnement

- macOS lance chaque jour à 12h30 la petite application « Sauvegarde suivi-horaires ». Elle est installée dans `~/Library/Application Support/suivi-horaires-sauvegarde/`.
- Elle ne fait une sauvegarde que si la dernière a plus de 6 jours. Si le Mac était éteint, elle rattrape donc au prochain passage.
- Elle se connecte avec le rôle Supabase `backup_reader`, en **lecture seule** (voir `supabase/migrations/20261117090000_backup_reader_role.sql`). Le mot de passe est rangé dans le trousseau macOS, sous « suivi-horaires-sauvegarde ».
- Avant de déposer le fichier, elle vérifie que les tables principales sont présentes et que l'archive n'est pas corrompue.
- En cas d'échec, une notification macOS s'affiche. Le journal se trouve dans `~/Library/Logs/suivi-horaires-sauvegarde.log`.

## Commandes utiles

Faire une sauvegarde tout de suite :

```bash
scripts/backup/sauvegarde.sh --force
```

Vérifier qu'une sauvegarde est restaurable, sans toucher à Supabase. La commande la recharge dans une base vide en mémoire et affiche, par table, le nombre de lignes et une empreinte du contenu :

```bash
node scripts/backup/verifier-sauvegarde.mjs "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Sauvegardes suivi-horaires/<fichier>.sql.gz"
```

Installer la sauvegarde sur un nouveau Mac (prérequis : `brew install libpq`) :

```bash
scripts/backup/installer.sh mot-de-passe
```

Coller ensuite la commande copiée dans l'éditeur SQL de Supabase et cliquer sur « Run ». Puis :

```bash
scripts/backup/installer.sh programmer
```

Arrêter la sauvegarde automatique :

```bash
launchctl bootout gui/$(id -u)/fr.suivi-horaires.sauvegarde
```

## Restaurer les données

À faire seulement si des données ont été perdues. **Ne jamais restaurer par-dessus une base qui contient encore des données à jour.**

1. Vérifier la sauvegarde avec `verifier-sauvegarde.mjs` (voir plus haut).
2. Sur une base **vide**, qu'il s'agisse d'un nouveau projet ou d'une base remise à zéro, appliquer d'abord la structure en suivant `supabase/schema/README.md`.
3. Décompresser la sauvegarde (`gunzip -k fichier.sql.gz`), puis l'exécuter avec la chaîne de connexion `postgres` du projet. Elle se trouve dans Supabase → Connect → Session pooler :

```bash
psql "<chaîne de connexion postgres>" -f suivi-horaires_AAAA-MM-JJ_HHMM.sql
```

Le fichier désactive temporairement les déclencheurs pendant l'import, puis les réactive.
