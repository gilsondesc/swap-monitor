@echo off
title Swap Monitor
cd /d "%~dp0"
echo ==========================================
echo       Iniciando Swap Monitor Local
echo ==========================================
call npm.cmd run dev
pause
