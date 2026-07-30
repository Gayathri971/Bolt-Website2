@echo off
title BOLT Localhost Web Server
echo ==================================================
echo   Starting BOLT Localhost Web Server...
echo ==================================================
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
