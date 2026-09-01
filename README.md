# C2

Lokale Fotogalerie. Katalog und Originale bleiben auf dem Rechner.

- Editor lokal: `npm run dev` → [http://localhost:3000](http://localhost:3000)
- Editor GitHub Pages: [https://abx-git.github.io/C2](https://abx-git.github.io/C2) (nur die App, ohne Bilddaten)
- Öffentliche Galerie: im Editor **Deploy-Ordner** erzeugen, dann **Zum Server** (einmalig `scripts/c2-sync/setup` doppelklicken)

`/edit` bleibt als Alias und leitet auf den Editor um.

## Deploy auf den Server

C2 schreibt nur einen lokalen Ordner. Die Übertragung macht ein Sync-Skript auf dem Rechner: Mutagen, wenn der Host eine SSH-Shell erlaubt, sonst rclone (SFTP-only, z. B. Strato).

### Einmalig einrichten

Im C2-Ordner doppelklicken:

- macOS: `scripts/c2-sync/setup.command`
- Windows: `scripts/c2-sync/setup.cmd`

Das installiert Mutagen (und bei Bedarf rclone), startet einen lokalen Sync-Helfer, fragt Deploy-Ordner, Host und Server-Pfad, legt auf dem Schreibtisch **C2 Galerie übertragen** an und aktiviert den Editor-Knopf **Zum Server**.

Im Editor steht der Sync-Status sichtbar: nicht eingerichtet, keine Verbindung, oder bereit. **Zum Server** überträgt nur, wenn die Verbindung klappt — sonst erscheint die Fehlermeldung.

Falls macOS das Setup blockiert: Rechtsklick auf `setup.command` → **Öffnen**.

### Alltag

1. Im Editor **Deploy-Ordner** in denselben lokalen Ordner schreiben.
2. **Zum Server** klicken oder die Desktop-Verknüpfung.

Die lokale Konfiguration liegt in `~/.c2-sync/` (Windows: `%USERPROFILE%\.c2-sync\`) und kommt nicht ins Git.

`one-way-replica` bzw. `rclone sync` macht den Server-Ordner zum Abbild des Deploy-Ordners. In Strato die Domain-Dokumentenwurzel auf denselben Unterordner setzen (Standard: `likibox`).

Unter **Struktur** kann ein **Unterordner auf dem Server** stehen (z. B. `montreal`). Dann gilt:

1. Deploy schreibt nach `{slug}.deploy` neben dem Sync-Deploy-Ordner, wenn der gewählte Ordner nicht schon so heißt.
2. **Zum Server** überträgt nach `{remote}/{slug}` (z. B. `likibox/montreal`), ohne den Hauptordner zu überschreiben.

Die Desktop-Verknüpfung bleibt beim Haupt-Deploy. Für Unterordner **Zum Server** im jeweiligen Workspace nutzen.
