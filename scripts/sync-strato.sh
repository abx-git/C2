#!/bin/sh
# Strato SSH is SFTP-only (no shell), so Mutagen cannot run an agent there.
# Alltägliche Übertragung: einmal scripts/c2-sync/setup, danach „Zum Server“.
# Dieses Skript bleibt als direkter rclone-Aufruf nutzbar.
set -e
SRC="${C2_DEPLOY:-/Users/andreas.bergmann/Documents/c2.site/deploy6}"
SUBDIR="${C2_STRATO_SUBDIR:-likibox}"
REMOTE="${C2_STRATO_REMOTE:-c2-strato:${SUBDIR}}"

if [ ! -d "$SRC" ]; then
  echo "Deploy-Ordner fehlt: $SRC" >&2
  exit 1
fi

# Public web files must be world-readable; C2 often writes them as 0600.
find "$SRC" -type d -exec chmod 755 {} +
find "$SRC" -type f -exec chmod 644 {} +

exec rclone sync "$SRC" "$REMOTE" \
  --sftp-shell-type none \
  --sftp-known-hosts-file none \
  --create-empty-src-dirs \
  --exclude ".DS_Store" \
  --progress \
  "$@"
