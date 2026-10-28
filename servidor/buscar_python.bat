@echo off
rem Busca Python en Windows y lo deja en la variable PY.
rem Lo usan instalar.bat e iniciar.bat (con "call"). Si no lo encuentra, PY queda vacia.
rem Primero "py" (el lanzador que instala python.org); luego "python".
rem Ojo: Windows trae un "python" falso que solo abre la Microsoft Store;
rem ese falla al pedirle la version, asi que aqui no se confunde con el real.
set "PY="
py -3 --version >nul 2>nul
if %errorlevel%==0 (
  set "PY=py -3"
) else (
  python --version >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
