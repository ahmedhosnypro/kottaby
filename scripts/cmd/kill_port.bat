@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0kill_port.ps1" %*
