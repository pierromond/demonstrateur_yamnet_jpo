@echo off
rem Mission Silence - lancement autonome (Windows)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe sur ce PC.
  echo Installez Node.js depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)

echo Demarrage de Mission Silence...
echo   Page : http://localhost:3000
echo   Arret : fermer la fenetre noire ou faites Ctrl+C dedans
echo.
start "Mission Silence" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000"
