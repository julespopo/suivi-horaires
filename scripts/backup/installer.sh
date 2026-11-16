#!/bin/bash
# Installe la sauvegarde automatique sur ce Mac.
#
# 1. Génère un mot de passe aléatoire pour le rôle « backup_reader » (lecture seule)
#    et le range dans le trousseau macOS. Il n'est jamais affiché ni écrit dans un fichier.
# 2. Copie dans le presse-papiers la commande SQL qui active ce mot de passe :
#    il suffit de la coller dans l'éditeur SQL de Supabase et de cliquer sur « Run ».
# 3. Installe le programme dans ~/Library/Application Support et le fait lancer
#    chaque jour à 12h30 par macOS (il ne sauvegarde qu'une fois par semaine).
#
#   installer.sh mot-de-passe   étapes 1 et 2
#   installer.sh programmer     étape 3 (après avoir exécuté la commande SQL)
#   installer.sh                les trois à la suite
#
# Changer le mot de passe (mot-de-passe) oblige à recoller la commande SQL.
set -euo pipefail
STEP="${1:-tout}"

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Library/Application Support/suivi-horaires-sauvegarde"
PLIST="$HOME/Library/LaunchAgents/fr.suivi-horaires.sauvegarde.plist"
LABEL="fr.suivi-horaires.sauvegarde"
KEYCHAIN_SERVICE="suivi-horaires-sauvegarde"

if [[ "$STEP" == "mot-de-passe" || "$STEP" == "tout" ]]; then
  password=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-40)
  security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a backup_reader -l "Sauvegarde suivi-horaires (Supabase, lecture seule)" -w "$password"
  printf "ALTER ROLE backup_reader WITH LOGIN PASSWORD '%s';" "$password" | pbcopy
  unset password
  echo "✓ Mot de passe rangé dans le trousseau macOS"
  echo "✓ Commande SQL copiée dans le presse-papiers"
fi
[[ "$STEP" == "mot-de-passe" ]] && exit 0

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents"
install -m 700 "$HERE/sauvegarde.sh" "$APP_DIR/sauvegarde.sh"

# Petite application qui lance le script : macOS demande une seule fois à l'utilisateur
# d'autoriser son accès à iCloud Drive (un script lancé directement en arrière-plan
# est refusé sans possibilité de le demander).
APP="$APP_DIR/Sauvegarde suivi-horaires.app"
rm -rf "$APP"
osacompile -o "$APP" -e "do shell script \"/bin/bash \" & quoted form of \"$APP_DIR/sauvegarde.sh\""
/usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier fr.suivi-horaires.sauvegarde" "$APP/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string fr.suivi-horaires.sauvegarde" "$APP/Contents/Info.plist"
codesign --force --sign - "$APP" 2>/dev/null || true

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>-g</string><string>-j</string><string>-a</string><string>$APP</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/suivi-horaires-sauvegarde.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ Sauvegarde programmée chaque jour à 12h30 (une sauvegarde par semaine)"
