@echo off
rem ============================================================
rem  Nowan Xichoka - revision en Windows
rem  Ya no hay que instalar nada: las librerias vienen incluidas.
rem  Esto solo revisa que Python este bien. Despues, usa iniciar.bat.
rem ============================================================
cd /d "%~dp0"
call servidor\buscar_python.bat
if not defined PY (
  echo No encontre Python.
  echo Instalalo desde https://www.python.org/downloads/
  echo y en la primera pantalla marca "Add python.exe to PATH".
  echo Si ya lo instalaste, reinicia la computadora y vuelve a intentar.
  pause
  exit /b 1
)
%PY% servidor\servidor.py --verificar
if errorlevel 1 (
  echo.
  echo Algo fallo. Toma una foto de este mensaje y mandala al equipo.
  pause
  exit /b 1
)
echo.
echo Todo listo. Ahora usa iniciar.bat
pause
