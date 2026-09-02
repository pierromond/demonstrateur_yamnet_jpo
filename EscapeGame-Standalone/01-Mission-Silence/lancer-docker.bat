@echo off
rem Mission Silence - lancement Docker (Windows)
rem Necessite : Docker Desktop installe et demarre.
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Docker Desktop n'est pas installe.
  echo Installez-le depuis https://www.docker.com/products/docker-desktop puis relancez ce fichier.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Docker Desktop n'est pas demarre.
  echo Lancez Docker Desktop, attendez qu'il soit pret, puis relancez ce fichier.
  pause
  exit /b 1
)

echo Construction de l'image Docker, premiere fois : quelques minutes...
docker build -t mission-silence .
if errorlevel 1 (
  echo [ERREUR] La construction de l'image a echoue, verifiez la connexion internet.
  pause
  exit /b 1
)

echo Demarrage de la station...
docker rm -f mission-silence >nul 2>nul
docker run -d --name mission-silence -p 3000:3000 mission-silence
if errorlevel 1 (
  echo [ERREUR] Le demarrage a echoue, le port 3000 est peut-etre deja utilise.
  pause
  exit /b 1
)

timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
echo.
echo Mission Silence tourne dans Docker.
echo   Page : http://localhost:3000
echo   Arret : docker stop mission-silence
echo   Relance : re-double-cliquez ce fichier
pause
