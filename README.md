# C2

Lokale Fotogalerie. Katalog und Originale bleiben auf dem Rechner (oder auf dem Handy).

- Editor lokal: `npm run dev` → [http://localhost:3000](http://localhost:3000)
- Editor GitHub Pages: [https://abx-git.github.io/C2](https://abx-git.github.io/C2) (nur die App, ohne Bilddaten)
- Editor Android: `npm run build:android`, dann APK aus Android Studio installieren
- Öffentliche Galerie: im Editor **Deploy-Ordner** erzeugen, dann **Zum Server**

`/edit` bleibt als Alias und leitet auf den Editor um.

## Deploy auf den Server

### Desktop (Mac / Windows)

C2 schreibt nur einen lokalen Ordner. Die Übertragung macht ein Sync-Skript auf dem Rechner: Mutagen, wenn der Host eine SSH-Shell erlaubt, sonst rclone (SFTP-only, z. B. Strato).

#### Einmalig einrichten

Im C2-Ordner doppelklicken:

- macOS: `scripts/c2-sync/setup.command`
- Windows: `scripts/c2-sync/setup.cmd`

Das installiert Mutagen (und bei Bedarf rclone), startet einen lokalen Sync-Helfer (bleibt danach im Hintergrund), fragt Deploy-Ordner, Host und Server-Pfad, legt auf dem Schreibtisch **C2 Galerie übertragen** an und aktiviert **Zum Server**.

Im Editor steht der Sync-Status sichtbar: nicht eingerichtet, keine Verbindung, oder bereit. **Zum Server** überträgt nur, wenn die Verbindung klappt — sonst erscheint die Fehlermeldung.

Falls macOS das Setup blockiert: Rechtsklick auf `setup.command` → **Öffnen**.

#### Alltag

1. Im Editor **Deploy-Ordner** in denselben lokalen Ordner schreiben.
2. **Zum Server** klicken oder die Desktop-Verknüpfung.

Die lokale Sync-Software liegt in `~/.c2-sync/` (Windows: `%USERPROFILE%\.c2-sync\`) und kommt nicht ins Git. Host und Server-Ordner jedes Projekts stehen in `data/sync.json` im Projektordner — nicht im öffentlichen Deploy.

`one-way-replica` bzw. `rclone sync` macht den Server-Ordner zum Abbild des Deploy-Ordners. In Strato die Domain-Dokumentenwurzel auf denselben Unterordner setzen (Standard: `likibox`).

Unter **Struktur** kann ein **Unterordner auf dem Server** stehen (z. B. `montreal`). Dann gilt:

1. Deploy schreibt nach `{slug}.deploy` neben dem Sync-Deploy-Ordner, wenn der gewählte Ordner nicht schon so heißt.
2. **Zum Server** überträgt nach `{remote}/{slug}` (z. B. `likibox/montreal`), ohne den Hauptordner zu überschreiben.

Im Projektmenü: **Projekt öffnen**, **Speichern**, **Speichern unter**, **Trennen**. Die Desktop-Verknüpfung bleibt beim Haupt-Deploy. Für Unterordner **Zum Server** im jeweiligen Projekt nutzen.

Setup nur aus diesem C2-Ordner starten, nicht aus einer älteren Kopie. Ein Root-Sync löscht andere Server-Unterordner (z. B. `montreal`) nicht mehr.

### Android (ohne PC)

Die Android-App (Capacitor) enthält denselben Editor. Ordnerzugriff läuft über das System-Dateimenü (SAF). **Zum Server** überträgt per SFTP direkt vom Handy zum Hosting — kein Desktop-Helfer nötig.

#### Bauen und installieren

Voraussetzungen: Node.js und **JDK 21** (Capacitor 7; Flutter bringt oft nur JDK 17 mit). Android Studio ist nicht nötig, das Android-SDK von Flutter reicht.

JDK 21 einmalig (ohne Android Studio):

```bash
mkdir -p .jdk
curl -L "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$(uname -m | sed 's/arm64/aarch64/;s/x86_64/x64/')/jdk/hotspot/normal/eclipse?project=jdk" | tar -xz -C .jdk
```

APK bauen:

```bash
npm run build:android:apk
```

Das schreibt u. a. `android/app/build/outputs/apk/debug/app-debug.apk`. Installation:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Optional mit Android Studio: `npm run build:android && npm run open:android`.

`build:android` erzeugt den statischen Export ohne GitHub-`basePath` und synchronisiert ihn nach `android/`.

#### Einmalig Sync einrichten

Im Projektmenü **Sync einrichten**:

1. SFTP-Host (z. B. Strato), Port (meist `22`), Benutzer, Passwort
2. Remote-Pfad (Standard: `likibox`)
3. Optional den Deploy-Ordner wählen (sonst beim ersten **Deploy-Ordner**)

Zugangsdaten liegen verschlüsselt auf dem Gerät.

#### Alltag auf dem Handy

Zwei verschiedene Ordner:

1. **Projekt** (`Projekt öffnen`) — Bearbeitung: enthält `originals/`, `derived/`, `data/`
2. **Deploy-Ordner** — fertige Website zum Hochladen (nur öffentliche Dateien). Nicht derselbe Ordner wie das Projekt.

Ablauf:

1. Projekt öffnen  
2. **Deploy-Ordner** → lokalen Zielordner wählen (Inhalt = das, was online sichtbar wird)  
3. **Zum Server** → dieser Ordner wird nach `Remote-Pfad` bzw. `Remote-Pfad/Unterordner` gespiegelt  

Unterordner (Feld unter **Struktur**): steuert nur den **Server**-Pfad (z. B. `likibox/montreal/`). Lokal wählst du trotzdem einen normalen Ordner — auf dem Handy wird kein `{slug}.deploy` mehr angelegt.
