#!/bin/bash
# ============================================================
#  Nowan Xichoka - arranque en Linux / Raspberry Pi
#
#  ./iniciar.sh                         todo en esta computadora (servidor, cabina y proyección)
#  ./iniciar.sh prueba                  igual, en modo ensayo (datos aparte + botones de prueba)
#  ./iniciar.sh solo-proyeccion IP      solo la proyección, conectada al servidor de otra
#                                       computadora (Opción B), por ejemplo:
#                                       ./iniciar.sh solo-proyeccion 192.168.1.20
#
#  La primera vez: chmod +x iniciar.sh   (y necesita internet para instalar)
# ============================================================
cd "$(dirname "$0")"

# Ajusta esto: dónde empieza la pantalla del proyector (en píxeles).
POS_PROYECTOR=1920
PUERTO=8000

NAV=""
for candidato in chromium-browser chromium google-chrome microsoft-edge; do
  if command -v "$candidato" >/dev/null 2>&1; then NAV="$candidato"; break; fi
done
if [ -z "$NAV" ]; then
  echo "No encontré Chromium. En Raspberry Pi OS: sudo apt install chromium-browser"
  exit 1
fi

# --password-store=basic evita que Chromium pida la contraseña del llavero al abrir.
FLAGS="--kiosk --no-first-run --noerrdialogs --disable-session-crashed-bubble --disable-infobars
       --password-store=basic --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream"

abrir() {  # abrir <perfil> <posición x> <url>
  "$NAV" $FLAGS --user-data-dir="/tmp/nowan-$1" --window-position="$2",0 "$3" >/dev/null 2>&1 &
}

if [ "$1" = "solo-proyeccion" ]; then
  if [ -z "$2" ]; then echo "Falta la IP del servidor: ./iniciar.sh solo-proyeccion 192.168.1.20"; exit 1; fi
  abrir proyeccion 0 "http://$2:$PUERTO/proyeccion/"
  echo "Proyección abierta. Para salir: Alt+F4."
  exit 0
fi

if [ ! -x .venv/bin/python ]; then
  echo "Instalando (solo la primera vez, necesita internet)..."
  python3 -m venv .venv || { echo "Falta venv: sudo apt install python3-venv"; exit 1; }
  # Si alguna pieza opcional no compila en la Pi, se instala lo mínimo necesario.
  .venv/bin/pip install -r requirements.txt || .venv/bin/pip install fastapi uvicorn websockets || exit 1
fi

EXTRA=""
[ "$1" = "prueba" ] && EXTRA="--prueba --datos datos/ensayo.json"

.venv/bin/python servidor/servidor.py --puerto $PUERTO $EXTRA &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
sleep 4

abrir proyeccion "$POS_PROYECTOR" "http://localhost:$PUERTO/proyeccion/"
sleep 3
abrir cabina 0 "http://localhost:$PUERTO/cabina/"

echo "Listo. Para salir del modo kiosco: Alt+F4 en cada ventana."
echo "Si las dos ventanas abren en la misma pantalla, arrastren una con Super+flechas"
echo "o usen la Opción B (la Pi solo para la proyección)."
echo "El servidor sigue corriendo en esta ventana. Ctrl+C para detenerlo."
wait $SERVIDOR
