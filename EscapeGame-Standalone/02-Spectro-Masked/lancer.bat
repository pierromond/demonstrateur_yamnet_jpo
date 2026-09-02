@echo off
rem Spectro Masked - lancement autonome (Windows)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe sur ce PC.
  echo Installez Node.js depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)

echo Demarrage de Spectro Masked...
echo   Page : http://localhost:4000
echo   Micro et MIDI : ouvrir la page dans Chrome ou Edge sur CE PC
echo   Arret : fermer la fenetre noire ou faites Ctrl+C dedans
echo.
start "Spectro Masked" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4000"
