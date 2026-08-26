# C2

Lokale Fotogalerie. Katalog und Originale bleiben auf dem Rechner.

- Editor lokal: `npm run dev` → [http://localhost:3000](http://localhost:3000)
- Editor GitHub Pages: [https://abx-git.github.io/C2](https://abx-git.github.io/C2) (nur die App, ohne Bilddaten)
- Öffentliche Galerie: im Editor **Deploy-Ordner** erzeugen, `index.html` öffnen oder den Ordner per Mutagen auf den Server legen

`/edit` bleibt als Alias und leitet auf den Editor um.

## Deploy auf den Server (Mutagen)

C2 schreibt nur einen lokalen Ordner. Die Übertragung macht Mutagen. Den Snapshot in ein **eigenes** Remote-Verzeichnis legen, nicht ins Webroot einer anderen Site.

### 1. Konfiguration

SSH-Host in `~/.ssh/config` eintragen. Mutagen installieren, falls nötig: `brew install mutagen-io/mutagen/mutagen`.

Vorlage kopieren und **Alpha** (lokaler Deploy-Ordner) sowie **Beta** (`SSH-Alias:Remote-Pfad`) setzen:

```bash
cp mutagen.yml.example mutagen.yml
```

`one-way-safe` löscht auf dem Server nichts extra. Soll der Server exakt dem Deploy-Ordner entsprechen, in der YAML `mode: "one-way-replica"` — nur in diesem Galerie-Ordner.

Ordner anlegen, die in der YAML stehen:

```bash
mkdir -p ~/c2-deploy
ssh HOST 'mkdir -p httpdocs/galerie'
ssh -o BatchMode=yes HOST 'echo ok'
```

`mutagen.yml` ist gitignoriert (lokale Hostnamen).

### 2. Start

```bash
mutagen daemon start
mutagen project start
```

### 3. Alltag

In C2 immer in denselben Deploy-Ordner schreiben, dann:

```bash
mutagen project list
mutagen project flush
```

Nach dem Login bei Bedarf nur `mutagen daemon start` — die Session bleibt in der Konfiguration.
