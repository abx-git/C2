# Local C2 sync helper: status + transfer for the editor on 127.0.0.1:17843.
$ErrorActionPreference = "Stop"
$Port = if ($env:C2_SYNC_PORT) { [int]$env:C2_SYNC_PORT } else { 17843 }
$SyncHome = if ($env:C2_SYNC_HOME) { $env:C2_SYNC_HOME } else { Join-Path $env:USERPROFILE ".c2-sync" }
$Bin = Join-Path $SyncHome "bin"
$Conf = Join-Path $SyncHome "config"
$Last = Join-Path $SyncHome "last.json"
$env:PATH = "$Bin;$env:PATH"
$script:Busy = $false

function Write-Last($ok, $error) {
  $payload = @{
    ok = [bool]$ok
    at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    error = $error
  }
  $payload | ConvertTo-Json -Compress | Set-Content -Path $Last -Encoding UTF8
}

function Read-Last {
  if (-not (Test-Path $Last)) { return $null }
  try { return Get-Content $Last -Raw | ConvertFrom-Json } catch { return $null }
}

function Read-Config {
  $cfg = @{}
  if (-not (Test-Path $Conf)) { return $cfg }
  Get-Content $Conf | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
    $k, $v = $_ -split "=", 2
    $cfg[$k.Trim()] = $v
  }
  return $cfg
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
  if (-not $deploy) { return $deploy }
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

function Join-Remote([string]$remote, [string]$publish) {
  $base = if ($remote) { $remote.TrimEnd("/") } else { "" }
  if (-not $publish) { return $base }
  if ($base) { return "$base/$publish" }
  return $publish
}

function Probe($cfg) {
  try {
    if ($cfg["method"] -eq "rclone") {
      $remote = if ($cfg["rclone_remote"]) { $cfg["rclone_remote"] } else { "c2-sync" }
      $dest = "${remote}:"
      $out = & rclone lsd $dest --max-depth 0 --sftp-shell-type none --sftp-known-hosts-file none --timeout 12s --contimeout 12s 2>&1
      if ($LASTEXITCODE -eq 0) { return @{ reachable = $true; probeError = $null } }
      $msg = ($out | Out-String).Trim()
      if ($msg.Length -gt 300) { $msg = $msg.Substring($msg.Length - 300) }
      return @{ reachable = $false; probeError = $msg }
    }
    $hostName = $cfg["host"]
    if (-not $hostName) { return @{ reachable = $false; probeError = "SSH-Host fehlt in der Konfiguration." } }
    $out = & ssh -o BatchMode=yes -o ConnectTimeout=10 $hostName true 2>&1
    if ($LASTEXITCODE -eq 0) { return @{ reachable = $true; probeError = $null } }
    $msg = ($out | Out-String).Trim()
    if ($msg.Length -gt 300) { $msg = $msg.Substring($msg.Length - 300) }
    return @{ reachable = $false; probeError = $msg }
  } catch {
    return @{ reachable = $false; probeError = $_.Exception.Message }
  }
}

function Status-Payload($doProbe, $publish) {
  $cfg = Read-Config
  $deployCfg = $cfg["deploy"]
  $slug = ""
  try { $slug = Sanitize-Publish $publish } catch { $slug = "" }
  $src = Resolve-LocalSrc $deployCfg $slug
  $payload = @{
    agent = $true
    busy = [bool]$script:Busy
    configured = [bool]($deployCfg -and $cfg["method"])
    method = $cfg["method"]
    deploy = $src
    deployExists = [bool]($src -and (Test-Path $src))
    host = $cfg["host"]
    remote = Join-Remote $cfg["remote"] $slug
    last = Read-Last
  }
  if ($doProbe -and $payload.configured) {
    $p = Probe $cfg
    $payload.reachable = $p.reachable
    $payload.probeError = $p.probeError
  }
  return $payload
}

function Send-Json($ctx, $code, $body) {
  $json = $body | ConvertTo-Json -Compress -Depth 6
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $code
  $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
  $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  $ctx.Response.Headers.Add("Cache-Control", "no-store")
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
} catch {
  exit 0
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  if ($req.HttpMethod -eq "OPTIONS") {
    $ctx.Response.StatusCode = 204
    $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    $ctx.Response.Close()
    continue
  }
  $path = $req.Url.AbsolutePath
  if ($req.HttpMethod -eq "GET" -and ($path -eq "/" -or $path -eq "/status")) {
    $doProbe = $req.Url.Query -match "probe=1"
    $subdir = ""
    if ($req.Url.Query -match "subdir=([^&]+)") {
      $subdir = [System.Uri]::UnescapeDataString($Matches[1])
    }
    Send-Json $ctx 200 (Status-Payload $doProbe $subdir)
    continue
  }
  if ($req.HttpMethod -eq "POST" -and $path -eq "/transfer") {
    if ($script:Busy) {
      Send-Json $ctx 409 @{ ok = $false; error = "Es läuft bereits eine Übertragung." }
      continue
    }
    $cfg = Read-Config
    if (-not $cfg["deploy"]) {
      Send-Json $ctx 409 @{ ok = $false; error = "C2-Sync ist noch nicht eingerichtet. Bitte Setup doppelklicken." }
      continue
    }
    $rawBody = ""
    if ($req.ContentLength -gt 0) {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $rawBody = $reader.ReadToEnd()
    }
    $slug = ""
    try {
      if ($rawBody) {
        $json = $rawBody | ConvertFrom-Json
        $candidate = ""
        if ($json.subdir) { $candidate = [string]$json.subdir }
        elseif ($json.publishPath) { $candidate = [string]$json.publishPath }
        $slug = Sanitize-Publish $candidate
      }
    } catch {
      Send-Json $ctx 400 @{ ok = $false; error = $_.Exception.Message }
      continue
    }
    $src = Resolve-LocalSrc $cfg["deploy"] $slug
    if (-not (Test-Path $src)) {
      Send-Json $ctx 409 @{ ok = $false; error = "Deploy-Ordner fehlt: $src" }
      continue
    }
    $script:Busy = $true
    try {
      $ps1 = Join-Path $SyncHome "transfer.ps1"
      $env:C2_PUBLISH_PATH = $slug
      $p = Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ps1) -Wait -PassThru -NoNewWindow
      Remove-Item Env:C2_PUBLISH_PATH -ErrorAction SilentlyContinue
      if ($p.ExitCode -eq 0) {
        Write-Last $true $null
        Send-Json $ctx 200 @{ ok = $true; error = $null }
      } else {
        $msg = "Übertragung fehlgeschlagen."
        if (Test-Path $Last) {
          $prev = Read-Last
          if ($prev.error) { $msg = $prev.error }
        }
        Write-Last $false $msg
        Send-Json $ctx 500 @{ ok = $false; error = $msg }
      }
    } finally {
      $script:Busy = $false
    }
    continue
  }
  Send-Json $ctx 404 @{ ok = $false; error = "Unbekannter Pfad." }
}
