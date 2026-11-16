#!/bin/bash
# Sauvegarde des données de Suivi horaires (Supabase) vers iCloud Drive.
#
# Lancé chaque jour par macOS (launchd) ; ne fait réellement une sauvegarde
# que si la dernière a plus de 6 jours. Si le Mac était éteint, la sauvegarde
# se fait donc au prochain démarrage du programme.
#
#   sauvegarde.sh           sauvegarde si nécessaire
#   sauvegarde.sh --force   sauvegarde tout de suite
#
# Le mot de passe du rôle « backup_reader » (lecture seule) est lu dans le
# trousseau macOS ; il n'est jamais écrit dans un fichier.
set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/usr/bin:/bin:/usr/sbin"
PROJECT_REF="lzylctcdzqgnnlpbrtvn"
DB_HOST="aws-0-eu-central-1.pooler.supabase.com"
DB_USER="backup_reader.${PROJECT_REF}"
KEYCHAIN_SERVICE="suivi-horaires-sauvegarde"
DEST="${SUIVI_SAUVEGARDE_DEST:-$HOME/Library/Mobile Documents/com~apple~CloudDocs/Sauvegardes suivi-horaires}"
LOG="$HOME/Library/Logs/suivi-horaires-sauvegarde.log"
MAX_AGE_DAYS=6

log(){ printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"; }
notify(){ /usr/bin/osascript -e "display notification \"$1\" with title \"Sauvegarde suivi-horaires\"" >/dev/null 2>&1 || true; }
fail(){ log "ÉCHEC : $*"; notify "Échec : $*"; exit 1; }

mkdir -p "$(dirname "$LOG")"
mkdir -p "$DEST" 2>/dev/null && ls "$DEST" >/dev/null 2>&1 \
  || fail "accès à iCloud Drive refusé (Réglages Système → Confidentialité → Fichiers et dossiers)"

if [[ "${1:-}" != "--force" ]]; then
  last=$(find "$DEST" -maxdepth 1 -name 'suivi-horaires_*.sql.gz' -mtime -"$MAX_AGE_DAYS" -print -quit 2>/dev/null) \
    || fail "lecture du dossier de sauvegarde impossible"
  if [[ -n "$last" ]]; then log "À jour : dernière sauvegarde $(basename "$last")"; exit 0; fi
fi

command -v pg_dump >/dev/null || fail "pg_dump introuvable (brew install libpq)"
PGPASSWORD=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a backup_reader -w 2>/dev/null) \
  || fail "mot de passe absent du trousseau (relancer installer.sh)"
export PGPASSWORD

stamp=$(date '+%Y-%m-%d_%H%M')
tmp=$(mktemp -t suivi-horaires-sauvegarde)
trap 'rm -f "$tmp" "$tmp.gz"; unset PGPASSWORD' EXIT

PGCONNECT_TIMEOUT=20 pg_dump \
  "host=$DB_HOST port=5432 dbname=postgres user=$DB_USER sslmode=require application_name=sauvegarde-hebdo" \
  --data-only --schema=public --inserts --rows-per-insert=200 --disable-triggers \
  --no-owner --no-privileges --file="$tmp" 2>>"$LOG" || fail "pg_dump a échoué (voir $LOG)"

# Contrôles : la copie doit contenir les tables principales.
for table in employees employers work_entries work_segments leave_requests; do
  grep -q "^INSERT INTO public\.${table} \|^-- Data for Name: ${table};" "$tmp" || fail "table ${table} absente de la sauvegarde"
done

gzip -9 "$tmp"
gzip -t "$tmp.gz" || fail "archive corrompue"
final="$DEST/suivi-horaires_${stamp}.sql.gz"
mv "$tmp.gz" "$final"
size=$(du -h "$final" | cut -f1)
log "OK : $(basename "$final") ($size)"
[[ "${1:-}" == "--force" ]] && notify "Sauvegarde réussie ($size)"
exit 0
