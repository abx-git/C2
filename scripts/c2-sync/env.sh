# Gemeinsame PATH- und rclone-Hilfe für transfer.sh und setup.sh (POSIX).
# shellcheck shell=sh

c2_sync_env() {
  if [ -z "${HOME:-}" ]; then
    HOME="$(cd ~ && pwd)"
  fi
  SYNC_HOME="${C2_SYNC_HOME:-$HOME/.c2-sync}"
  BIN="$SYNC_HOME/bin"
  mkdir -p "$BIN" "$SYNC_HOME"
  PATH="$BIN:/opt/homebrew/bin:/usr/local/bin:$HOME/bin:/usr/bin:/bin:$PATH"
  export HOME SYNC_HOME BIN PATH
}

c2_find_rclone() {
  c2_sync_env
  if [ -x "$BIN/rclone" ]; then
    printf '%s' "$BIN/rclone"
    return 0
  fi
  set -- \
    /opt/homebrew/bin/rclone \
    /usr/local/bin/rclone \
    "$HOME/bin/rclone"
  for p in "$@"; do
    if [ -x "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
  done
  if command -v rclone >/dev/null 2>&1; then
    command -v rclone
    return 0
  fi
  return 1
}

c2_install_rclone() {
  c2_sync_env
  arch="osx-amd64"
  case "$(uname -m)" in
    arm64 | aarch64) arch="osx-arm64" ;;
  esac
  tmp="$(mktemp -d)"
  zip="$tmp/rclone.zip"
  curl -fsSL "https://downloads.rclone.org/rclone-current-${arch}.zip" -o "$zip" || return 1
  unzip -q "$zip" -d "$tmp" || return 1
  exe="$(find "$tmp" -name rclone -type f | head -1)"
  [ -n "$exe" ] || return 1
  mv "$exe" "$BIN/rclone"
  chmod +x "$BIN/rclone"
  rm -rf "$tmp"
}

c2_ensure_rclone() {
  c2_sync_env
  found="$(c2_find_rclone || true)"
  if [ -n "$found" ]; then
    if [ "$found" != "$BIN/rclone" ]; then
      ln -sf "$found" "$BIN/rclone" 2>/dev/null || cp "$found" "$BIN/rclone"
      chmod +x "$BIN/rclone" 2>/dev/null || true
    fi
    return 0
  fi
  c2_install_rclone
}

c2_default_deploy() {
  set -- \
    "$HOME/Documents/c2.site/deploy6" \
    "$HOME/c2-deploy" \
    "$HOME/Documents/c2-deploy"
  for p in "$@"; do
    if [ -d "$p" ]; then
      printf '%s' "$p"
      return 0
    fi
  done
  printf '%s' "$HOME/Documents/c2.site/deploy6"
}
