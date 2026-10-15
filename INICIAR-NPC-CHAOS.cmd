@echo off
title NPC CHAOS LIVE - TikTok Game
cd /d "%~dp0"
echo.
echo =====================================================
echo  NPC CHAOS LIVE - O HEROI DO CHAT
echo =====================================================
echo.
echo Abrindo navegador em http://127.0.0.1:8787/npc/
echo Para parar o jogo, pressione Ctrl+C nesta janela.
echo.
start "" powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8787/npc/'"
npm start
pause
