# Überträgt den lokalen Deploy-Ordner auf den Server (Mutagen oder rclone).
$ErrorActionPreference = "Stop"
$SyncHome = if ($env:C2_SYNC_HOME) { $env:C2_SYNC_HOME } else { Join-Path $env:USERPROFILE ".c2-sync" }
$Conf = Join-Path $SyncHome "config"
$Bin = Join-Path $SyncHome "bin"
$Last = Join-Path $SyncHome "last.json"
$env:PATH = "$Bin;$env:PATH"

function Record-Last($ok, $error) {
  New-Item -ItemType Directory -Force -Path $SyncHome | Out-Null
  @{
    ok = [bool]$ok
    at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    error = if ($error) { "$error" } else { $null }
  } | ConvertTo-Json -Compress | Set-Content -Path $Last -Encoding UTF8
}

function Fail($msg) {
  Record-Last $false $msg
  Write-Error $msg
  exit 1
}

try {
if (-not (Test-Path $Conf)) {
  Fail "C2-Sync ist noch nicht eingerichtet. Bitte scripts\c2-sync\setup.cmd doppelklicken."
}

$cfg = @{}
Get-Content $Conf | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $k, $v = $_ -split "=", 2
  $cfg[$k.Trim()] = $v
}

if ($env:C2_SYNC_METHOD) { $cfg["method"] = $env:C2_SYNC_METHOD }
if ($env:C2_SYNC_HOST) { $cfg["host"] = $env:C2_SYNC_HOST }
if ($env:C2_SYNC_REMOTE) { $cfg["remote"] = $env:C2_SYNC_REMOTE }
if ($env:C2_RCLONE_REMOTE) { $cfg["rclone_remote"] = $env:C2_RCLONE_REMOTE }

$deployCfg = $cfg["deploy"]
if (-not $deployCfg) {
  Fail "Deploy-Ordner fehlt: $deployCfg"
}

function Sanitize-Publish([string]$raw) {
  $s = ("$raw").Trim().Trim("/")
  if (-not $s) { return "" }
  if ($s -match '[/\\]' -or $s.Contains("..") -or $s -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
    throw "Ungültiger Unterordner. Nur ein Segment, z. B. montreal."
  }
  return $s
}

function Resolve-LocalSrc([string]$deploy, [string]$publish) {
  if (-not $publish) { return $deploy }
  $name = Split-Path -Leaf $deploy
  if ($name -eq $publish -or $name -eq "$publish.deploy") { return $deploy }
  $parent = Split-Path -Parent $deploy
  $nested = Join-Path $parent "$publish.deploy"
  $alt = Join-Path $parent $publish
  if (Test-Path $nested) { return $nested }
  if (Test-Path $alt) { return $alt }
  return $nested
}

try {
  $publish = Sanitize-Publish ($env:C2_PUBLISH_PATH)
} catch {
  Fail $_.Exception.Message
}

$deploy = Resolve-LocalSrc $deployCfg $publish
$remote = $cfg["remote"]
if ($publish) {
  $remote = "$($remote.TrimEnd('/'))/$publish"
}

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
  $dest = "${remoteName}:$remote"
  Write-Host "rclone → $dest"
  $rcloneArgs = @(
    "sync", $deploy, $dest,
    "--sftp-shell-type", "none",
    "--sftp-known-hosts-file", "none",
    "--create-empty-src-dirs",
    "--exclude", ".DS_Store"
  )
  if (-not $publish) {
    $listing = & rclone lsf $dest --dirs-only --sftp-shell-type none --sftp-known-hosts-file none 2>$null
    foreach ($dir in $listing) {
      $name = "$dir".TrimEnd("/")
      if (-not $name) { continue }
      if (-not (Test-Path (Join-Path $deploy $name))) {
        Write-Host "behalte Server-Ordner /$name/"
        $rcloneArgs += @("--exclude", "/$name/**", "--exclude", "/$name")
      }
    }
  }
  $rcloneArgs += "--progress"
  & rclone @rcloneArgs
  if ($LASTEXITCODE -ne 0) { Fail "rclone sync fehlgeschlagen." }
  Write-Host "Fertig."
  Record-Last $true $null
  exit 0
}

if (-not (Get-Command mutagen -ErrorAction SilentlyContinue)) { Fail "Mutagen fehlt. Setup erneut ausführen." }
$hostName = $cfg["host"]
$session = if ($publish) { "c2-$publish" } else { "c2-gallery" }
& mutagen daemon start | Out-Null
$listed = & mutagen sync list $session 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Mutagen-Sitzung anlegen…"
  & mutagen sync create --name $session --sync-mode one-way-replica --default-file-mode-beta 0644 --default-directory-mode-beta 0755 --ignore ".DS_Store" $deploy "${hostName}:${remote}"
  if ($LASTEXITCODE -ne 0) { Fail "mutagen sync create fehlgeschlagen." }
}
Write-Host "mutagen flush → ${hostName}:${remote}"
& mutagen sync flush $session
if ($LASTEXITCODE -ne 0) { Fail "mutagen flush fehlgeschlagen. SSH-Zugang prüfen." }
Write-Host "Fertig."
Record-Last $true $null
} catch {
  if ($_.Exception.Message -notmatch "C2-Sync ist noch nicht|Deploy-Ordner fehlt|rclone fehlt|Mutagen fehlt|fehlgeschlagen") {
    Record-Last $false $_.Exception.Message
  }
  throw
}
