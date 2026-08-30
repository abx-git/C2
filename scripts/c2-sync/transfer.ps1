# Überträgt den lokalen Deploy-Ordner auf den Server (Mutagen oder rclone).
$ErrorActionPreference = "Stop"
$SyncHome = if ($env:C2_SYNC_HOME) { $env:C2_SYNC_HOME } else { Join-Path $env:USERPROFILE ".c2-sync" }
$Conf = Join-Path $SyncHome "config"
$Bin = Join-Path $SyncHome "bin"
$env:PATH = "$Bin;$env:PATH"

function Fail($msg) {
  Write-Error $msg
  exit 1
}

if (-not (Test-Path $Conf)) {
  Fail "C2-Sync ist noch nicht eingerichtet. Bitte scripts\c2-sync\setup.cmd doppelklicken."
}

$cfg = @{}
Get-Content $Conf | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $k, $v = $_ -split "=", 2
  $cfg[$k.Trim()] = $v
}

$deploy = $cfg["deploy"]
if (-not $deploy -or -not (Test-Path $deploy)) {
  Fail "Deploy-Ordner fehlt: $deploy"
}

Get-ChildItem -Path $deploy -Recurse -Force | ForEach-Object {
  try {
    if ($_.PSIsContainer) { $_.Attributes = "Directory" } else { $_.Attributes = "Archive" }
  } catch { }
}

$method = $cfg["method"]
if ($method -eq "rclone") {
  if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) { Fail "rclone fehlt. Setup erneut ausführen." }
  $remoteName = if ($cfg["rclone_remote"]) { $cfg["rclone_remote"] } else { "c2-sync" }
  $dest = "${remoteName}:$($cfg['remote'])"
  Write-Host "rclone → $dest"
  & rclone sync $deploy $dest --sftp-shell-type none --sftp-known-hosts-file none --create-empty-src-dirs --exclude ".DS_Store" --progress
  if ($LASTEXITCODE -ne 0) { Fail "rclone sync fehlgeschlagen." }
  Write-Host "Fertig."
  exit 0
}

if (-not (Get-Command mutagen -ErrorAction SilentlyContinue)) { Fail "Mutagen fehlt. Setup erneut ausführen." }
$hostName = $cfg["host"]
$remote = $cfg["remote"]
$session = "c2-gallery"
& mutagen daemon start | Out-Null
$listed = & mutagen sync list $session 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Mutagen-Sitzung anlegen…"
  & mutagen sync create --name $session --sync-mode one-way-replica --default-file-mode-beta 0644 --default-directory-mode-beta 0755 --ignore ".DS_Store" $deploy "${hostName}:${remote}"
  if ($LASTEXITCODE -ne 0) { Fail "mutagen sync create fehlgeschlagen." }
}
Write-Host "mutagen flush → ${hostName}:${remote}"
& mutagen sync flush $session
if ($LASTEXITCODE -ne 0) { Fail "mutagen flush fehlgeschlagen." }
Write-Host "Fertig."
