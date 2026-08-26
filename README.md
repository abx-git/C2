# C2

Lokale Fotogalerie. Katalog und Originale bleiben auf dem Rechner.

- Editor lokal: `npm run dev` → [http://localhost:3000](http://localhost:3000)
- Editor GitHub Pages: [https://abx-git.github.io/C2](https://abx-git.github.io/C2) (nur die App, ohne Bilddaten)
- Öffentliche Galerie: im Editor **Deploy-Ordner** erzeugen, `index.html` öffnen oder den Ordner per Mutagen auf den Server legen

`/edit` bleibt als Alias und leitet auf den Editor um.

## Deploy auf den Server (Mutagen)

C2 schreibt nur einen lokalen Ordner. Die Übertragung macht Mutagen. Den Snapshot in ein **eigenes** Remote-Verzeichnis legen, nicht ins Webroot einer anderen Site.

Voraussetzungen: SSH-Host in `~/.ssh/config` (unten `HOST`), Mutagen installiert.

```bash
brew install mutagen-io/mutagen/mutagen   # falls nötig
mutagen daemon start
ssh -o BatchMode=yes HOST 'echo ok'
```

Einmalig Session anlegen. **Alpha** ist der Ordner, den du in C2 als Deploy-Ordner wählst. **Beta** ist der Zielpfad auf dem Server:

```bash
mkdir -p ~/c2-deploy
ssh HOST 'mkdir -p httpdocs/galerie'

mutagen sync create \
  --name c2-gallery \
  --sync-mode one-way-safe \
  --ignore VCS \
  --ignore '.DS_Store' \
  --default-file-mode-beta 0644 \
  --default-directory-mode-beta 0755 \
  ~/c2-deploy \
  HOST:httpdocs/galerie
```

`HOST` und den Remote-Pfad durch SSH-Alias und Zielverzeichnis ersetzen.

`one-way-safe` löscht auf dem Server nichts extra. Soll der Server exakt dem Deploy-Ordner entsprechen: `--sync-mode one-way-replica` — nur in diesem Galerie-Ordner.

Alltag: in C2 immer in denselben Deploy-Ordner schreiben, dann:

```bash
mutagen sync list
mutagen sync flush c2-gallery
mutagen sync monitor c2-gallery
```

Die Session bleibt bestehen; nach dem Login bei Bedarf `mutagen daemon start`.
