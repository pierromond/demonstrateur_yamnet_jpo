@echo off
rem Le Cri du Vivant - lancement autonome (Windows)
rem Premiere utilisation : installez Python 3.10 a 3.12 depuis https://python.org
rem puis double-cliquez ce fichier.
cd /d "%~dp0"

set PYTHON=
where py >nul 2>nul && set PYTHON=py -3
if not defined PYTHON (
  where python >nul 2>nul && set PYTHON=python
)
if not defined PYTHON (
  echo [ERREUR] Python n'est pas installe sur ce PC.
  echo Installez Python 3.10 a 3.12 depuis https://python.org puis relancez.
  echo Astuce : cochez "Add python.exe to PATH" lors de l'installation.
  pause
  exit /b 1
)

set NEEDS_SETUP=0
if not exist ".venv\Scripts\python.exe" set NEEDS_SETUP=1
if "%NEEDS_SETUP%"=="0" (
  ".venv\Scripts\python.exe" -c "import numpy, fastapi, uvicorn, websockets, tensorflow" >nul 2>nul
  if errorlevel 1 set NEEDS_SETUP=1
)
if "%NEEDS_SETUP%"=="1" (
  if not exist ".venv\Scripts\python.exe" (
    echo Premiere utilisation : creation de l'environnement Python...
    %PYTHON% -m venv .venv
    if errorlevel 1 (
      echo [ERREUR] Impossible de creer l'environnement Python.
      pause
      exit /b 1
    )
  ) else (
    echo Dependances manquantes ou incompletes : reinstallation en cours...
  )
  echo Installation des dependances, une seule fois, quelques minutes...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  if errorlevel 1 (
    echo [ERREUR] Mise a jour de pip impossible, verifiez la connexion internet.
    pause
    exit /b 1
  )
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 (
    echo [ERREUR] L'installation des dependances a echoue, verifiez la connexion internet.
    echo Relancez ce fichier une fois la connexion retablie.
    pause
    exit /b 1
  )
)

echo Demarrage du Cri du Vivant...
echo   Page : http://localhost:8765
echo   Arret : fermer la fenetre noire ou faites Ctrl+C dedans
echo.
start "Le Cri du Vivant" cmd /k "cd escape_game && ..\.venv\Scripts\python.exe server.py"
timeout /t 5 /nobreak >nul
start "" "http://localhost:8765"
