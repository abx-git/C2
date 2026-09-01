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

publish=$(printf '%s' "${C2_PUBLISH_PATH:-}" | sed 's|^/*||;s|/*$||')
case "$publish" in
  */* | *..* | *\\*) fail "Ungültiger Unterordner. Nur ein Segment, z. B. montreal." ;;
esac
if [ -n "$publish" ]; then
  printf '%s' "$publish" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' \
    || fail "Ungültiger Unterordner. Nur ein Segment, z. B. montreal."
fi

src="$deploy"
dest_remote="$remote"
if [ -n "$publish" ]; then
  parent=$(dirname "$deploy")
  base=$(basename "$deploy")
  if [ "$base" = "$publish" ] || [ "$base" = "${publish}.deploy" ]; then
    src="$deploy"
  elif [ -d "$parent/${publish}.deploy" ]; then
    src="$parent/${publish}.deploy"
  elif [ -d "$parent/${publish}" ]; then
    src="$parent/${publish}"
  else
    src="$parent/${publish}.deploy"
  fi
  dest_remote="${remote%/}/$publish"
fi

if [ ! -d "$src" ]; then
  record_last 0 "Deploy-Ordner fehlt: $src"
  echo "Deploy-Ordner fehlt: $src" >&2
  exit 1
fi

# Öffentliche Dateien müssen für den Webserver lesbar sein.
find "$src" -type d -exec chmod 755 {} +
find "$src" -type f -exec chmod 644 {} +

if [ "$method" = "rclone" ]; then
  command -v rclone >/dev/null 2>&1 || fail "rclone fehlt. Setup erneut ausführen."
  dest="${rclone_remote:-c2-sync}:${dest_remote}"
  echo "rclone → $dest"
  set -- rclone sync "$src" "$dest" \
    --sftp-shell-type none \
    --sftp-known-hosts-file none \
    --create-empty-src-dirs \
    --exclude ".DS_Store"
  # Root-Sync darf andere Projekte (z. B. /montreal/) nicht löschen.
  if [ -z "$publish" ]; then
    listing=$(rclone lsf "$dest" --dirs-only --sftp-shell-type none --sftp-known-hosts-file none 2>/dev/null || true)
    while IFS= read -r dir || [ -n "$dir" ]; do
      dir=${dir%/}
      [ -n "$dir" ] || continue
      if [ ! -e "$src/$dir" ]; then
        echo "behalte Server-Ordner /$dir/"
        set -- "$@" --exclude "/${dir}/**" --exclude "/${dir}"
      fi
    done <<EOF
$listing
EOF
  fi
  "$@" --progress || fail "rclone sync fehlgeschlagen. Server-Zugang und Ordner prüfen."
  record_last 1 ""
  notify "Galerie ist auf dem Server."
  echo "Fertig."
  exit 0
fi

command -v mutagen >/dev/null 2>&1 || fail "Mutagen fehlt. Setup erneut ausführen."
[ -n "$host" ] || fail "SSH-Host fehlt in der Konfiguration."
if [ -n "$publish" ]; then
  session="${C2_SYNC_SESSION:-c2-$publish}"
else
  session="${C2_SYNC_SESSION:-c2-gallery}"
fi
mutagen daemon start >/dev/null
if ! mutagen sync list "$session" >/dev/null 2>&1; then
  echo "Mutagen-Sitzung anlegen…"
  mutagen sync create \
    --name "$session" \
    --sync-mode one-way-replica \
    --default-file-mode-beta 0644 \
    --default-directory-mode-beta 0755 \
    --ignore ".DS_Store" \
    "$src" "${host}:${dest_remote}"
fi
echo "mutagen flush → ${host}:${dest_remote}"
mutagen sync flush "$session" || fail "mutagen flush fehlgeschlagen. SSH-Zugang prüfen."
record_last 1 ""
notify "Galerie ist auf dem Server."
echo "Fertig."
