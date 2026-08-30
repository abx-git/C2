@echo off
title C2 Sync einrichten
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
  echo Setup nicht abgeschlossen.
  pause
)
