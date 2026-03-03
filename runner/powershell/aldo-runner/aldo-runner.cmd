@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0aldo-runner.ps1" %*
