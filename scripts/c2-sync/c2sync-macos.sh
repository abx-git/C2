#!/bin/bash
# URL-Handler c2sync:// — lädt die Galerie auf den Likibox-Server (rclone/Mutagen).
LOG="${HOME}/.c2-sync/transfer.log"
mkdir -p "${HOME}/.c2-sync"
publish=$(python3 - "${1:-}" <<'PY'
import re, sys
from urllib.parse import parse_qs, unquote, urlparse
raw = sys.argv[1] if len(sys.argv) > 1 else ""
if not raw:
    print("")
    raise SystemExit
if "://" not in raw:
    raw = "c2sync://" + raw
u = urlparse(raw)
qs = parse_qs(u.query)
slug = (qs.get("subdir") or qs.get("publish") or [""])[0]
if not slug:
    path = unquote(u.path or "").strip("/")
    host = unquote(u.netloc or "").strip("/")
    slug = path or host
if slug.lower() == "transfer":
    slug = ""
slug = slug.strip("/")
print(slug if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", slug or "") else "")
PY
)
export C2_PUBLISH_PATH="$publish"
if "${HOME}/.c2-sync/transfer.sh" >"$LOG" 2>&1; then
  osascript -e 'display notification "Galerie ist auf dem Likibox-Server." with title "C2"' >/dev/null 2>&1 || true
  exit 0
fi
osascript -e 'display dialog "Übertragung auf den Likibox-Server fehlgeschlagen. Details stehen in ~/.c2-sync/transfer.log." buttons {"OK"} default button "OK" with icon stop' >/dev/null 2>&1 || true
exit 1
