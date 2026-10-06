@echo off
rem Le Cri du Vivant - version autonome (Windows)
rem Reconnaissance YAMNet dans le navigateur, aucun serveur applicatif.
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

echo Demarrage du Cri du Vivant...
echo   Page : http://localhost:8765
echo   Arret : fermer cette fenetre
start "Le Cri du Vivant" cmd /k "%NODE% serve.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8765"
