@echo off
rem Le Cri du Vivant - lancement Docker (Windows)
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

echo Construction de l'image Docker, premiere fois : 5 a 10 minutes...
docker build -t cri-du-vivant .
if errorlevel 1 (
  echo [ERREUR] La construction de l'image a echoue, verifiez la connexion internet.
  pause
  exit /b 1
)

echo Demarrage de la station...
docker rm -f cri-du-vivant >nul 2>nul
docker run -d --name cri-du-vivant -p 8765:8765 cri-du-vivant
if errorlevel 1 (
  echo [ERREUR] Le demarrage a echoue, le port 8765 est peut-etre deja utilise.
  pause
  exit /b 1
)

timeout /t 8 /nobreak >nul
start "" "http://localhost:8765"
echo.
echo Le Cri du Vivant tourne dans Docker.
echo   Page : http://localhost:8765
echo   Arret : docker stop cri-du-vivant
echo   Relance : re-double-cliquez ce fichier
pause
