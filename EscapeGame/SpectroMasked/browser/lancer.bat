@echo off
rem Spectro Masked - version autonome (Windows)
rem Aucun serveur applicatif, aucun acces reseau.
rem Aucune installation : Node.js est embarque dans runtime\ si present.
setlocal
cd /d "%~dp0"

set NODE=node
if exist "runtime\node.exe" set NODE=runtime\node.exe

"%NODE%" --version >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable.
  echo Placez un runtime Node.js portable dans le dossier "runtime\" ou installez Node.js.
  pause
  exit /b 1
)

echo Demarrage de Spectro Masked...
echo   Page : http://localhost:4000
echo   Micro et MIDI : ouvrir la page dans Chrome ou Edge sur CE PC
echo   Arret : fermer cette fenetre
start "Spectro Masked" cmd /k "%NODE% serve.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4000"
