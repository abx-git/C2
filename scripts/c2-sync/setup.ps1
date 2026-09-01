# Einmaliges Setup: Mutagen (oder rclone bei SFTP-only) installieren und C2-Sync einrichten.
$ErrorActionPreference = "Stop"
$MutagenVersion = if ($env:C2_MUTAGEN_VERSION) { $env:C2_MUTAGEN_VERSION } else { "0.18.1" }
$SyncHome = if ($env:C2_SYNC_HOME) { $env:C2_SYNC_HOME } else { Join-Path $env:USERPROFILE ".c2-sync" }
$Bin = Join-Path $SyncHome "bin"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
New-Item -ItemType Directory -Force -Path $Bin, $SyncHome | Out-Null
$env:PATH = "$Bin;$env:PATH"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()

function Die($msg) {
  [System.Windows.Forms.MessageBox]::Show($msg, "C2 Setup", "OK", "Error") | Out-Null
  throw $msg
}

function Ask-Text($prompt, $default) {
  $r = [Microsoft.VisualBasic.Interaction]::InputBox($prompt, "C2 Setup", $default)
  if ([string]::IsNullOrWhiteSpace($r)) { Die "Abgebrochen." }
  return $r.Trim().TrimEnd("\")
}

function Ask-Folder($prompt) {
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = $prompt
  $d.ShowNewFolderButton = $true
  if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Die "Abgebrochen." }
  return $d.SelectedPath
}

$confPath = Join-Path $SyncHome "config"
$hadConfig = Test-Path $confPath
if ($hadConfig) {
  Write-Host "Bestehende Config bleibt. rclone wird bereitgestellt."
  $deploy = Join-Path $env:USERPROFILE "Documents\c2.site\deploy6"
} else {
$ok = [System.Windows.Forms.MessageBox]::Show(
  "C2 richtet die Übertragung auf den Likibox-Server ein.`n`nDer lokale Ordner kommt aus dem Editor (Zum Server), nicht aus diesem Setup.",
  "C2 Setup",
  "OKCancel",
  "Information"
)
if ($ok -ne [System.Windows.Forms.DialogResult]::OK) { Die "Abgebrochen." }

$deploy = @(
  (Join-Path $env:USERPROFILE "Documents\c2.site\deploy6"),
  (Join-Path $env:USERPROFILE "c2-deploy"),
  (Join-Path $env:USERPROFILE "Documents\c2-deploy")
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $deploy) { $deploy = Join-Path $env:USERPROFILE "Documents\c2.site\deploy6" }
}

function Install-Mutagen {
  if (Get-Command mutagen -ErrorAction SilentlyContinue) {
    Write-Host "Mutagen ist schon da: $((Get-Command mutagen).Source)"
    return
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "windows_arm64" } else { "windows_amd64" }
  $url = "https://github.com/mutagen-io/mutagen/releases/download/v$MutagenVersion/mutagen_${arch}_v$MutagenVersion.zip"
  Write-Host "Mutagen $MutagenVersion wird geladen…"
  $tmp = Join-Path $env:TEMP "c2-mutagen.zip"
  $out = Join-Path $env:TEMP "c2-mutagen"
  Invoke-WebRequest -Uri $url -OutFile $tmp
  if (Test-Path $out) { Remove-Item -Recurse -Force $out }
  Expand-Archive -Path $tmp -DestinationPath $out
  Copy-Item (Join-Path $out "mutagen.exe") (Join-Path $Bin "mutagen.exe") -Force
  $agents = Join-Path $out "mutagen-agents.tar.gz"
  if (Test-Path $agents) { Copy-Item $agents (Join-Path $Bin "mutagen-agents.tar.gz") -Force }
}

function Install-Rclone {
  $env:PATH = "$Bin;C:\Program Files\rclone;$env:LOCALAPPDATA\Programs\rclone;$env:PATH"
  $existing = Get-Command rclone -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "rclone ist schon da: $($existing.Source)"
    $dest = Join-Path $Bin "rclone.exe"
    if (-not (Test-Path $dest)) { Copy-Item $existing.Source $dest -Force }
    return
  }
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "windows-arm64" } else { "windows-amd64" }
  Write-Host "rclone wird geladen…"
  $tmp = Join-Path $env:TEMP "c2-rclone.zip"
  $out = Join-Path $env:TEMP "c2-rclone"
  Invoke-WebRequest -Uri "https://downloads.rclone.org/rclone-current-$arch.zip" -OutFile $tmp
  if (Test-Path $out) { Remove-Item -Recurse -Force $out }
  Expand-Archive -Path $tmp -DestinationPath $out
  $exe = Get-ChildItem $out -Recurse -Filter rclone.exe | Select-Object -First 1
  if (-not $exe) { Die "rclone-Archiv unvollständig." }
  Copy-Item $exe.FullName (Join-Path $Bin "rclone.exe") -Force
}

Write-Host "Werkzeuge installieren…"
Install-Rclone
if (-not $hadConfig) { Install-Mutagen }

$method = "rclone"
$hostName = "c2-strato"
$remote = "likibox"
$rcloneRemote = "c2-strato"
if (-not $hadConfig) {
$hostName = Ask-Text "SSH-Host (Name aus .ssh\config oder user@server):" "c2-strato"
$remote = (Ask-Text "Ordner auf dem Server (Dokumentenwurzel, z. B. likibox):" "likibox").TrimStart("/")

Write-Host "SSH-Befehl auf $hostName prüfen…"
$sshOk = $false
if (Get-Command ssh -ErrorAction SilentlyContinue) {
  try {
    & ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new $hostName true
    if ($LASTEXITCODE -eq 0) { $sshOk = $true }
  } catch { }
}

$rcloneRemote = ""
if ($sshOk) {
  Write-Host "SSH-Shell vorhanden → Mutagen."
  $method = "mutagen"
} else {
  Write-Host "Kein SSH-Befehl (typisch SFTP-only) → rclone."
  $method = "rclone"
  $remotes = @()
  try { $remotes = & rclone listremotes } catch { }
  if ($remotes -contains "c2-strato:") {
    $rcloneRemote = "c2-strato"
  } elseif ($remotes -contains "c2-sync:") {
    $rcloneRemote = "c2-sync"
  } else {
    $sftpHost = Ask-Text "SFTP-Host (ohne Benutzer):" $hostName
    $sftpUser = Ask-Text "SFTP-Benutzer:" ""
    $sftpPass = Ask-Text "SFTP-Passwort (wird in rclone verschlüsselt gespeichert):" ""
    $rcloneRemote = "c2-sync"
    & rclone config create $rcloneRemote sftp host $sftpHost user $sftpUser pass $sftpPass shell_type none known_hosts_file none | Out-Null
  }
}

$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines(
  (Join-Path $SyncHome "config"),
  @(
    "method=$method",
    "deploy=$deploy",
    "host=$hostName",
    "remote=$remote",
    "rclone_remote=$rcloneRemote"
  ),
  $utf8
)
}

Copy-Item (Join-Path $Here "transfer.ps1") (Join-Path $SyncHome "transfer.ps1") -Force
Copy-Item (Join-Path $Here "agent.ps1") (Join-Path $SyncHome "agent.ps1") -Force

$agentLaunch = Join-Path $SyncHome "agent-launch.cmd"
@"
@echo off
powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%USERPROFILE%\.c2-sync\agent.ps1"
"@ | Set-Content -Path $agentLaunch -Encoding ASCII
$startup = Join-Path ([Environment]::GetFolderPath("Startup")) "C2 Sync Helper.cmd"
Copy-Item $agentLaunch $startup -Force
Start-Process -FilePath "powershell" -WindowStyle Hidden -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $SyncHome "agent.ps1"))

$launch = Join-Path $SyncHome "transfer-launch.cmd"
@"
@echo off
set "C2_SYNC_URL=%~1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.c2-sync\transfer.ps1"
if errorlevel 1 pause
"@ | Set-Content -Path $launch -Encoding ASCII

$desk = Join-Path ([Environment]::GetFolderPath("Desktop")) "C2 Galerie übertragen.cmd"
@"
@echo off
title C2 Galerie übertragen
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.c2-sync\transfer.ps1"
echo.
pause
"@ | Set-Content -Path $desk -Encoding ASCII

# Protokoll c2sync:// für den Editor-Knopf
$root = "HKCU:\Software\Classes\c2sync"
New-Item -Path $root -Force | Out-Null
Set-ItemProperty $root "(default)" "URL:C2 Sync"
New-ItemProperty -Path $root -Name "URL Protocol" -Value "" -Force | Out-Null
$cmdKey = Join-Path $root "shell\open\command"
New-Item -Path $cmdKey -Force | Out-Null
Set-ItemProperty $cmdKey "(default)" "`"$launch`""

[System.Windows.Forms.MessageBox]::Show(
  "rclone ist bereit. Der lokale Ordner kommt aus dem Editor (Zum Server). Ziel ist der Likibox-Server.",
  "C2 Setup",
  "OK",
  "Information"
) | Out-Null
Write-Host "Fertig. Config: $SyncHome\config"
