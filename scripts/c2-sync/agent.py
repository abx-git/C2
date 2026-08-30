"""Local C2 sync helper: status + transfer for the editor on 127.0.0.1:17843."""

from typing import Any, Dict, Optional, Tuple
import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("C2_SYNC_PORT", "17843"))
HOME = Path(os.environ.get("C2_SYNC_HOME", Path.home() / ".c2-sync"))
BIN = HOME / "bin"
CONF = HOME / "config"
LAST = HOME / "last.json"
BUSY = threading.Lock()
STATE = {"busy": False}


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def write_last(ok: bool, error: Optional[str]) -> None:
    LAST.write_text(
        json.dumps({"ok": ok, "at": now(), "error": error}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def read_last() -> Optional[dict]:
    try:
        data = json.loads(LAST.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return None


def read_config() -> Dict[str, str]:
    cfg: dict[str, str] = {}
    if not CONF.is_file():
        return cfg
    for line in CONF.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        cfg[key.strip()] = value
    return cfg


def env_with_bin() -> Dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{BIN}{os.pathsep}{env.get('PATH', '')}"
    return env


def probe(cfg: Dict[str, str]) -> Tuple[bool, Optional[str]]:
    env = env_with_bin()
    method = cfg.get("method", "")
    try:
        if method == "rclone":
            remote = cfg.get("rclone_remote") or "c2-sync"
            dest = f"{remote}:"
            run = subprocess.run(
                [
                    "rclone",
                    "lsd",
                    dest,
                    "--max-depth",
                    "0",
                    "--sftp-shell-type",
                    "none",
                    "--sftp-known-hosts-file",
                    "none",
                    "--timeout",
                    "12s",
                    "--contimeout",
                    "12s",
                ],
                capture_output=True,
                text=True,
                timeout=18,
                env=env,
            )
        else:
            host = cfg.get("host", "")
            if not host:
                return False, "SSH-Host fehlt in der Konfiguration."
            run = subprocess.run(
                [
                    "ssh",
                    "-o",
                    "BatchMode=yes",
                    "-o",
                    "ConnectTimeout=10",
                    host,
                    "true",
                ],
                capture_output=True,
                text=True,
                timeout=16,
                env=env,
            )
        if run.returncode == 0:
            return True, None
        err = (run.stderr or run.stdout or "Verbindung fehlgeschlagen.").strip()
        return False, err.splitlines()[-1][:300]
    except FileNotFoundError as exc:
        return False, f"Werkzeug fehlt: {exc.filename}"
    except subprocess.TimeoutExpired:
        return False, "Zeitüberschreitung bei der Server-Verbindung."


def status_payload(do_probe: bool) -> Dict[str, Any]:
    cfg = read_config()
    configured = bool(cfg.get("deploy") and cfg.get("method"))
    deploy = cfg.get("deploy", "")
    payload: Dict[str, Any] = {
        "agent": True,
        "busy": STATE["busy"],
        "configured": configured,
        "method": cfg.get("method") or None,
        "deploy": deploy or None,
        "deployExists": bool(deploy) and Path(deploy).is_dir(),
        "host": cfg.get("host") or None,
        "remote": cfg.get("remote") or None,
        "last": read_last(),
    }
    if do_probe and configured:
        reachable, error = probe(cfg)
        payload["reachable"] = reachable
        payload["probeError"] = error
    return payload


def run_transfer() -> Tuple[bool, Optional[str]]:
    script = HOME / "transfer.sh"
    if os.name == "nt":
        ps1 = HOME / "transfer.ps1"
        if not ps1.is_file():
            return False, "transfer.ps1 fehlt. Setup erneut ausführen."
        cmd = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(ps1),
        ]
    else:
        if not script.is_file():
            return False, "transfer.sh fehlt. Setup erneut ausführen."
        cmd = ["/bin/sh", str(script)]
    try:
        run = subprocess.run(cmd, capture_output=True, text=True, timeout=1800, env=env_with_bin())
    except subprocess.TimeoutExpired:
        write_last(False, "Zeitüberschreitung bei der Übertragung.")
        return False, "Zeitüberschreitung bei der Übertragung."
    if run.returncode == 0:
        write_last(True, None)
        return True, None
    err = (run.stderr or run.stdout or "Übertragung fehlgeschlagen.").strip()
    msg = err.splitlines()[-1][:400] if err else "Übertragung fehlgeschlagen."
    write_last(False, msg)
    return False, msg


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _json(self, code: int, body: dict) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path not in ("/", "/status"):
            self._json(404, {"ok": False, "error": "Unbekannter Pfad."})
            return
        probe_flag = parse_qs(parsed.query).get("probe", ["0"])[0] in ("1", "true")
        self._json(200, status_payload(probe_flag))

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/transfer":
            self._json(404, {"ok": False, "error": "Unbekannter Pfad."})
            return
        cfg = read_config()
        if not cfg.get("deploy"):
            self._json(409, {"ok": False, "error": "C2-Sync ist noch nicht eingerichtet. Bitte Setup doppelklicken."})
            return
        if not Path(cfg["deploy"]).is_dir():
            self._json(
                409,
                {"ok": False, "error": f"Deploy-Ordner fehlt: {cfg['deploy']}"},
            )
            return
        if not BUSY.acquire(blocking=False):
            self._json(409, {"ok": False, "error": "Es läuft bereits eine Übertragung."})
            return
        STATE["busy"] = True
        try:
            ok, error = run_transfer()
            self._json(200 if ok else 500, {"ok": ok, "error": error})
        finally:
            STATE["busy"] = False
            BUSY.release()


def main() -> int:
    HOME.mkdir(parents=True, exist_ok=True)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        return 0
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
