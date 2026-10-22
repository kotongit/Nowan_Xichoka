@echo off
rem ============================================================
rem  Nowan Xichoka - arranque en Windows
rem  Doble clic: abre el servidor, la cabina y la proyeccion.
rem  "iniciar.bat prueba": modo ensayo (datos aparte + botones de prueba).
rem ============================================================
setlocal
cd /d "%~dp0"

rem --- Ajusta esto: donde empieza la pantalla del proyector ---------
rem  Si la pantalla de la cabina mide 1920 px de ancho y el proyector
rem  esta "a la derecha" en la configuracion de pantallas, deja 1920.
set POS_PROYECTOR=1920
set PUERTO=8000

if not exist ".venv\Scripts\python.exe" (
  echo Primero hay que instalar. Ejecuta instalar.bat
  pause
  exit /b 1
)

set EXTRA=
if /i "%1"=="prueba" set EXTRA=--prueba --datos datos\ensayo.json

start "Nowan Xichoka - servidor (no cerrar)" cmd /k ".venv\Scripts\python.exe servidor\servidor.py --puerto %PUERTO% %EXTRA%"
timeout /t 3 /nobreak >nul

set NAV=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set NAV=%LocalAppData%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined NAV (
  echo No encontre Chrome ni Edge. Abre a mano:
  echo   http://localhost:%PUERTO%/cabina/
  echo   http://localhost:%PUERTO%/proyeccion/
  pause
  exit /b 1
)

set FLAGS=--kiosk --no-first-run --disable-session-crashed-bubble --disable-features=Translate --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream

rem Cada ventana usa su propio perfil para poder ir a pantallas distintas.
start "" "%NAV%" %FLAGS% --user-data-dir="%TEMP%\nowan-proyeccion" --window-position=%POS_PROYECTOR%,0 "http://localhost:%PUERTO%/proyeccion/"
timeout /t 2 /nobreak >nul
start "" "%NAV%" %FLAGS% --user-data-dir="%TEMP%\nowan-cabina" --window-position=0,0 "http://localhost:%PUERTO%/cabina/"

echo.
echo Listo. Para salir del modo kiosco: Alt+F4 en cada ventana.
echo La direccion del panel (para el celular) esta en la ventana del servidor.
