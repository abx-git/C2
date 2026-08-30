#!/bin/bash
# Einmaliges Setup: Mutagen (oder rclone bei SFTP-only) installieren und C2-Sync einrichten.
set -euo pipefail

MUTAGEN_VERSION="${C2_MUTAGEN_VERSION:-0.18.1}"
SYNC_HOME="${C2_SYNC_HOME:-$HOME/.c2-sync}"
BIN="$SYNC_HOME/bin"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$BIN" "$SYNC_HOME"
export PATH="$BIN:/opt/homebrew/bin:/usr/local/bin:$PATH"

die() {
  echo "$1" >&2
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with icon stop" >/dev/null 2>&1 || true
  fi
  exit 1
}

ask_text() {
  local prompt="$1"
  local default="$2"
  osascript <<APPLESCRIPT
try
  set r to display dialog "$prompt" default answer "$default" buttons {"Abbrechen", "Weiter"} default button "Weiter"
  if button returned of r is "Abbrechen" then error number -128
  return text returned of r
on error number -128
  error "cancelled"
end try
APPLESCRIPT
}

ask_folder() {
  local prompt="$1"
  osascript <<APPLESCRIPT
try
  return POSIX path of (choose folder with prompt "$prompt")
on error number -128
  error "cancelled"
end try
APPLESCRIPT
}

confirm() {
  local prompt="$1"
  osascript <<APPLESCRIPT
try
  display dialog "$prompt" buttons {"Abbrechen", "OK"} default button "OK"
  return "ok"
on error number -128
  error "cancelled"
end try
APPLESCRIPT
}

trim() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s|/*$||'
}

if ! command -v osascript >/dev/null 2>&1; then
  die "Dieses Setup ist für macOS."
fi

confirm "C2 richtet die Server-Übertragung ein.

1. Mutagen wird lokal installiert (bei reinem SFTP-Host rclone).
2. Danach liegt auf dem Schreibtisch „C2 Galerie übertragen“.
3. Im Editor erscheint der Knopf „Zum Server“." >/dev/null

default_deploy=""
for candidate in \
  "$HOME/Documents/c2.site/deploy6" \
  "$HOME/c2-deploy" \
  "$HOME/Documents/c2-deploy"; do
  if [ -d "$candidate" ]; then
    default_deploy="$candidate"
    break
  fi
done

if [ -n "$default_deploy" ]; then
  deploy="$(ask_text "Lokaler Deploy-Ordner:" "$default_deploy" || true)"
else
  deploy="$(ask_folder "Welcher lokale Deploy-Ordner soll auf den Server?" || true)"
fi
[ -n "${deploy:-}" ] || die "Abgebrochen."
deploy="$(trim "$deploy")"
mkdir -p "$deploy"

host="$(ask_text "SSH-Host (Name aus ~/.ssh/config oder user@server):" "c2-strato" || true)"
[ -n "${host:-}" ] || die "Abgebrochen."
host="$(trim "$host")"

remote="$(ask_text "Ordner auf dem Server (Dokumentenwurzel, z. B. likibox):" "likibox" || true)"
[ -n "${remote:-}" ] || die "Abgebrochen."
remote="$(trim "$remote" | sed 's|^/||')"

install_mutagen() {
  if command -v mutagen >/dev/null 2>&1; then
    echo "Mutagen ist schon da: $(command -v mutagen)"
    return
  fi
  local arch
  case "$(uname -m)" in
    arm64) arch="darwin_arm64" ;;
    *) arch="darwin_amd64" ;;
  esac
  local url="https://github.com/mutagen-io/mutagen/releases/download/v${MUTAGEN_VERSION}/mutagen_${arch}_v${MUTAGEN_VERSION}.tar.gz"
  echo "Mutagen ${MUTAGEN_VERSION} wird geladen…"
  local tmp
  tmp="$(mktemp -d)"
  curl -fsSL "$url" | tar -xz -C "$tmp"
  mv "$tmp/mutagen" "$BIN/mutagen"
  if [ -f "$tmp/mutagen-agents.tar.gz" ]; then
    mv "$tmp/mutagen-agents.tar.gz" "$BIN/mutagen-agents.tar.gz"
  fi
  chmod +x "$BIN/mutagen"
  rm -rf "$tmp"
}

install_rclone() {
  if command -v rclone >/dev/null 2>&1; then
    echo "rclone ist schon da: $(command -v rclone)"
    return
  fi
  local arch
  case "$(uname -m)" in
    arm64) arch="osx-arm64" ;;
    *) arch="osx-amd64" ;;
  esac
  echo "rclone wird geladen…"
  local tmp zip
  tmp="$(mktemp -d)"
  zip="$tmp/rclone.zip"
  curl -fsSL "https://downloads.rclone.org/rclone-current-${arch}.zip" -o "$zip"
  unzip -q "$zip" -d "$tmp"
  local exe
  exe="$(find "$tmp" -name rclone -type f | head -1)"
  [ -n "$exe" ] || die "rclone-Archiv unvollständig."
  mv "$exe" "$BIN/rclone"
  chmod +x "$BIN/rclone"
  rm -rf "$tmp"
}

echo "Werkzeuge installieren…"
install_mutagen

method="mutagen"
echo "SSH-Befehl auf ${host} prüfen…"
if ! command -v ssh >/dev/null 2>&1; then
  echo "Kein ssh → rclone."
  method="rclone"
  install_rclone
elif ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$host" true >/dev/null 2>&1; then
  echo "SSH-Shell vorhanden → Mutagen."
else
  echo "Kein SSH-Befehl (typisch SFTP-only, z. B. Strato) → rclone."
  method="rclone"
  install_rclone
fi

rclone_remote=""
if [ "$method" = "rclone" ]; then
  if rclone listremotes 2>/dev/null | grep -qx "c2-strato:"; then
    rclone_remote="c2-strato"
  elif rclone listremotes 2>/dev/null | grep -qx "c2-sync:"; then
    rclone_remote="c2-sync"
  else
    sftp_host="$(ask_text "SFTP-Host (ohne Benutzer):" "$host" || true)"
    [ -n "${sftp_host:-}" ] || die "Abgebrochen."
    sftp_user="$(ask_text "SFTP-Benutzer:" "" || true)"
    [ -n "${sftp_user:-}" ] || die "Abgebrochen."
    sftp_pass="$(ask_text "SFTP-Passwort (wird in rclone verschlüsselt gespeichert):" "" || true)"
    [ -n "${sftp_pass:-}" ] || die "Abgebrochen."
    rclone_remote="c2-sync"
    rclone config create "$rclone_remote" sftp \
      host "$(trim "$sftp_host")" \
      user "$(trim "$sftp_user")" \
      pass "$(trim "$sftp_pass")" \
      shell_type none \
      known_hosts_file none >/dev/null
  fi
fi

cat >"$SYNC_HOME/config" <<EOF
method=$method
deploy=$deploy
host=$host
remote=$remote
rclone_remote=$rclone_remote
EOF
chmod 600 "$SYNC_HOME/config"

cp "$HERE/transfer.sh" "$SYNC_HOME/transfer.sh"
cp "$HERE/agent.py" "$SYNC_HOME/agent.py"
chmod +x "$SYNC_HOME/transfer.sh" "$HERE/transfer.sh"

start_agent() {
  local plist="$HOME/Library/LaunchAgents/de.likibox.c2sync.plist"
  local python
  python="$(command -v python3 || echo /usr/bin/python3)"
  mkdir -p "$HOME/Library/LaunchAgents"
  launchctl bootout "gui/$(id -u)/de.likibox.c2sync" >/dev/null 2>&1 || launchctl unload "$plist" >/dev/null 2>&1 || true
  cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>de.likibox.c2sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>${python}</string>
    <string>${SYNC_HOME}/agent.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${SYNC_HOME}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${SYNC_HOME}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${SYNC_HOME}/agent.log</string>
</dict>
</plist>
PLIST
  launchctl bootstrap "gui/$(id -u)" "$plist" >/dev/null 2>&1 || launchctl load "$plist" >/dev/null 2>&1 || true
  "$python" "$SYNC_HOME/agent.py" >>"$SYNC_HOME/agent.log" 2>&1 &
}

start_agent

# Protokoll c2sync:// für den Editor-Knopf „Zum Server“
APP="$SYNC_HOME/C2Sync.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cat >"$APP/Contents/MacOS/c2sync" <<'EOF'
#!/bin/bash
LOG="${HOME}/.c2-sync/transfer.log"
mkdir -p "${HOME}/.c2-sync"
if "${HOME}/.c2-sync/transfer.sh" >"$LOG" 2>&1; then
  osascript -e 'display notification "Galerie ist auf dem Server." with title "C2"' >/dev/null 2>&1 || true
  exit 0
fi
osascript -e 'display dialog "Übertragung fehlgeschlagen. Details stehen in ~/.c2-sync/transfer.log." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
exit 1
EOF
chmod +x "$APP/Contents/MacOS/c2sync"
cat >"$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>c2sync</string>
  <key>CFBundleIdentifier</key>
  <string>de.likibox.c2sync</string>
  <key>CFBundleName</key>
  <string>C2 Sync</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>C2 Sync</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>c2sync</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true

DESK="$HOME/Desktop/C2 Galerie übertragen.command"
cat >"$DESK" <<EOF
#!/bin/bash
"${SYNC_HOME}/transfer.sh"
echo
read -r -p "Taste zum Schließen… "
EOF
chmod +x "$DESK"
xattr -d com.apple.quarantine "$DESK" >/dev/null 2>&1 || true

if [ "$method" = "mutagen" ]; then
  mutagen daemon start >/dev/null
  mutagen daemon register >/dev/null 2>&1 || true
  if mutagen sync list c2-gallery >/dev/null 2>&1; then
    mutagen sync terminate c2-gallery >/dev/null 2>&1 || true
  fi
  mutagen sync create \
    --name c2-gallery \
    --sync-mode one-way-replica \
    --default-file-mode-beta 0644 \
    --default-directory-mode-beta 0755 \
    --ignore ".DS_Store" \
    "$deploy" "${host}:${remote}"
  echo "Erste Übertragung…"
  mutagen sync flush c2-gallery
else
  echo "Erste Übertragung…"
  "$SYNC_HOME/transfer.sh"
fi

osascript <<APPLESCRIPT
display dialog "Einrichtung fertig.

Übertragen:
• Schreibtisch: „C2 Galerie übertragen“
• Im C2-Editor: „Zum Server“

Methode: $method
Ordner: $deploy
Ziel: $host:$remote" buttons {"OK"} default button "OK"
APPLESCRIPT

echo "Fertig. Config: $SYNC_HOME/config"
