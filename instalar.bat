@echo off
rem Nowan Xichoka - instalacion en Windows (una sola vez, con internet).
cd /d "%~dp0"
where py >nul 2>nul && (py -3 -m venv .venv) || (python -m venv .venv)
if not exist ".venv\Scripts\python.exe" (
  echo No se pudo crear el entorno. Instala Python 3 desde python.org
  echo y marca "Add python.exe to PATH".
  pause
  exit /b 1
)
.venv\Scripts\python.exe -m pip install -r requirements.txt
echo.
echo Instalado. Ahora usa iniciar.bat
pause
