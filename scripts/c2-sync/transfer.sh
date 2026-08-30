#!/bin/sh
# Überträgt den lokalen Deploy-Ordner auf den Server (Mutagen oder rclone).
set -e
HOME_DIR="${HOME}"
SYNC_HOME="${C2_SYNC_HOME:-$HOME_DIR/.c2-sync}"
CONF="$SYNC_HOME/config"
BIN="$SYNC_HOME/bin"
LAST="$SYNC_HOME/last.json"
export PATH="$BIN:$PATH"
LAST_RECORDED=0

record_last() {
  LAST_RECORDED=1
  mkdir -p "$SYNC_HOME"
  ok="$1"
  err="$2"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys; json.dump({'ok': sys.argv[1]=='1', 'at': __import__('datetime').datetime.now().isoformat(timespec='seconds'), 'error': sys.argv[2] or None}, open(sys.argv[3],'w'), ensure_ascii=False); open(sys.argv[3],'a').write('\n')" \
      "$ok" "$err" "$LAST" || true
  fi
}

on_exit() {
  code=$?
  if [ "$code" -ne 0 ] && [ "$LAST_RECORDED" -eq 0 ]; then
    record_last 0 "Übertragung fehlgeschlagen."
  fi
}
trap on_exit EXIT

if [ ! -f "$CONF" ]; then
  record_last 0 "C2-Sync ist noch nicht eingerichtet. Bitte scripts/c2-sync/setup doppelklicken."
  echo "C2-Sync ist noch nicht eingerichtet. Bitte scripts/c2-sync/setup doppelklicken." >&2
  exit 1
fi

method=""
deploy=""
host=""
remote=""
rclone_remote=""
while IFS='=' read -r key value || [ -n "$key" ]; do
  case "$key" in
    "" | \#*) continue ;;
  esac
  case "$key" in
    method) method=$value ;;
    deploy) deploy=$value ;;
    host) host=$value ;;
    remote) remote=$value ;;
    rclone_remote) rclone_remote=$value ;;
  esac
done <"$CONF"

if [ ! -d "$deploy" ]; then
  record_last 0 "Deploy-Ordner fehlt: $deploy"
  echo "Deploy-Ordner fehlt: $deploy" >&2
  exit 1
fi

# Öffentliche Dateien müssen für den Webserver lesbar sein.
find "$deploy" -type d -exec chmod 755 {} +
find "$deploy" -type f -exec chmod 644 {} +

notify() {
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$1\" with title \"C2\"" >/dev/null 2>&1 || true
  fi
}

fail() {
  echo "$1" >&2
  record_last 0 "$1"
  notify "Übertragung fehlgeschlagen."
  exit 1
}

if [ "$method" = "rclone" ]; then
  command -v rclone >/dev/null 2>&1 || fail "rclone fehlt. Setup erneut ausführen."
  dest="${rclone_remote:-c2-sync}:${remote}"
  echo "rclone → $dest"
  rclone sync "$deploy" "$dest" \
    --sftp-shell-type none \
    --sftp-known-hosts-file none \
    --create-empty-src-dirs \
    --exclude ".DS_Store" \
    --progress || fail "rclone sync fehlgeschlagen. Server-Zugang und Ordner prüfen."
  record_last 1 ""
  notify "Galerie ist auf dem Server."
  echo "Fertig."
  exit 0
fi

command -v mutagen >/dev/null 2>&1 || fail "Mutagen fehlt. Setup erneut ausführen."
[ -n "$host" ] || fail "SSH-Host fehlt in der Konfiguration."
session="${C2_SYNC_SESSION:-c2-gallery}"
mutagen daemon start >/dev/null
if ! mutagen sync list "$session" >/dev/null 2>&1; then
  echo "Mutagen-Sitzung anlegen…"
  mutagen sync create \
    --name "$session" \
    --sync-mode one-way-replica \
    --default-file-mode-beta 0644 \
    --default-directory-mode-beta 0755 \
    --ignore ".DS_Store" \
    "$deploy" "${host}:${remote}"
fi
echo "mutagen flush → ${host}:${remote}"
mutagen sync flush "$session" || fail "mutagen flush fehlgeschlagen. SSH-Zugang prüfen."
record_last 1 ""
notify "Galerie ist auf dem Server."
echo "Fertig."
