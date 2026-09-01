#!/bin/bash
# Einmaliges Setup bzw. Reparatur: rclone/Mutagen bereitstellen, Helfer starten.
# Den lokalen Deploy-Ordner fragt das Setup nicht ab — der kommt aus dem Editor.
set -euo pipefail

MUTAGEN_VERSION="${C2_MUTAGEN_VERSION:-0.18.1}"
SYNC_HOME="${C2_SYNC_HOME:-$HOME/.c2-sync}"
BIN="$SYNC_HOME/bin"
HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="$SYNC_HOME/config"

mkdir -p "$BIN" "$SYNC_HOME"
# shellcheck source=env.sh
. "$HERE/env.sh"
c2_sync_env

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

trim() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s|/*$||'
}

read_config() {
  method=""
  deploy=""
  host=""
  remote=""
  rclone_remote=""
  [ -f "$CONF" ] || return 1
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in
      "" | \#*) continue ;;
      method) method=$value ;;
      deploy) deploy=$value ;;
      host) host=$value ;;
      remote) remote=$value ;;
      rclone_remote) rclone_remote=$value ;;
    esac
  done <"$CONF"
  return 0
}

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

copy_scripts() {
  cp "$HERE/env.sh" "$SYNC_HOME/env.sh"
  cp "$HERE/transfer.sh" "$SYNC_HOME/transfer.sh"
  cp "$HERE/agent.py" "$SYNC_HOME/agent.py"
  cp "$HERE/c2sync-macos.sh" "$SYNC_HOME/c2sync-macos.sh"
  chmod +x "$SYNC_HOME/transfer.sh" "$HERE/transfer.sh" "$SYNC_HOME/c2sync-macos.sh"
}

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
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${SYNC_HOME}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${SYNC_HOME}/agent.log</string>
</dict>
</plist>
PLIST
  launchctl bootstrap "gui/$(id -u)" "$plist" >/dev/null 2>&1 || launchctl load "$plist" >/dev/null 2>&1 || true
}

install_url_handler() {
  local APP="$SYNC_HOME/C2Sync.app"
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS"
  cp "$HERE/c2sync-macos.sh" "$APP/Contents/MacOS/c2sync"
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

  local DESK="$HOME/Desktop/C2 Galerie übertragen.command"
  cat >"$DESK" <<EOF
#!/bin/bash
"${SYNC_HOME}/transfer.sh"
echo
read -r -p "Taste zum Schließen… "
EOF
  chmod +x "$DESK"
  xattr -d com.apple.quarantine "$DESK" >/dev/null 2>&1 || true
}

if ! command -v osascript >/dev/null 2>&1; then
  die "Dieses Setup ist für macOS."
fi

had_config=0
method=""
deploy=""
host=""
remote=""
rclone_remote=""
if read_config; then
  had_config=1
fi

echo "rclone bereitstellen…"
c2_ensure_rclone || die "rclone konnte nicht eingerichtet werden (Netzwerk oder Rechte prüfen)."

if [ "$had_config" -eq 0 ]; then
  osascript <<'APPLESCRIPT' >/dev/null
try
  display dialog "C2 richtet die Übertragung auf den Likibox-Server ein.

Der lokale Ordner kommt aus dem Editor (Deploy-Ordner / Zum Server), nicht aus diesem Setup.

Danach: Schreibtisch „C2 Galerie übertragen“ und im Editor „Zum Server“." buttons {"Abbrechen", "OK"} default button "OK"
on error number -128
  error "cancelled"
end try
APPLESCRIPT

  deploy="$(c2_default_deploy)"
  host="$(ask_text "SSH-Host (Name aus ~/.ssh/config oder user@server):" "c2-strato" || true)"
  [ -n "${host:-}" ] || die "Abgebrochen."
  host="$(trim "$host")"
  remote="$(ask_text "Ordner auf dem Server (Dokumentenwurzel, z. B. likibox):" "likibox" || true)"
  [ -n "${remote:-}" ] || die "Abgebrochen."
  remote="$(trim "$remote" | sed 's|^/||')"

  echo "Werkzeuge installieren…"
  install_mutagen
  method="mutagen"
  echo "SSH-Befehl auf ${host} prüfen…"
  if ! command -v ssh >/dev/null 2>&1; then
    method="rclone"
  elif ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$host" true >/dev/null 2>&1; then
    echo "SSH-Shell vorhanden → Mutagen."
  else
    echo "Kein SSH-Befehl (typisch SFTP-only, z. B. Strato) → rclone."
    method="rclone"
  fi

  rclone_remote=""
  if [ "$method" = "rclone" ]; then
    c2_ensure_rclone || die "rclone konnte nicht eingerichtet werden."
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

  cat >"$CONF" <<EOF
method=$method
deploy=$deploy
host=$host
remote=$remote
rclone_remote=$rclone_remote
EOF
  chmod 600 "$CONF"
fi

copy_scripts
start_agent
install_url_handler

if [ "$had_config" -eq 1 ]; then
  osascript <<APPLESCRIPT
display dialog "rclone ist bereit. Setup muss nicht erneut den Ordner abfragen.

Lokaler Ordner: kommt aus dem Editor (Zum Server).
Ziel: Likibox-Server.

„Zum Server“ oder die Desktop-Verknüpfung lädt dorthin." buttons {"OK"} default button "OK"
APPLESCRIPT
else
  osascript <<APPLESCRIPT
display dialog "Einrichtung fertig.

Übertragen auf den Likibox-Server:
• Im Editor: „Zum Server“ (Ordner dort wählen)
• Schreibtisch: „C2 Galerie übertragen“

Methode: $method
Ziel: $host:$remote" buttons {"OK"} default button "OK"
APPLESCRIPT
fi

echo "Fertig. Config: $CONF"
echo "rclone: $(c2_find_rclone || true)"
