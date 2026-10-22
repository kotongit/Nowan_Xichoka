#!/bin/bash
# ============================================================
#  Nowan Xichoka - arranque en Mac
#  Doble clic: abre el servidor, la cabina y la proyección.
#  "./iniciar.command prueba": modo ensayo (datos aparte + botones de prueba).
# ============================================================
cd "$(dirname "$0")"

# Ajusta esto: dónde empieza la pantalla del proyector (en puntos).
POS_PROYECTOR=1920
PUERTO=8000

if [ ! -x .venv/bin/python ]; then
  echo "Instalando (solo la primera vez, necesita internet)..."
  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt || exit 1
fi

EXTRA=""
[ "$1" = "prueba" ] && EXTRA="--prueba --datos datos/ensayo.json"

.venv/bin/python servidor/servidor.py --puerto $PUERTO $EXTRA &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
sleep 3

NAV="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$NAV" ] || NAV="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
if [ ! -x "$NAV" ]; then
  echo "No encontré Chrome ni Edge. Abre a mano:"
  echo "  http://localhost:$PUERTO/cabina/"
  echo "  http://localhost:$PUERTO/proyeccion/"
else
  FLAGS="--kiosk --no-first-run --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream"
  "$NAV" $FLAGS --user-data-dir="$TMPDIR/nowan-proyeccion" --window-position=$POS_PROYECTOR,0 "http://localhost:$PUERTO/proyeccion/" >/dev/null 2>&1 &
  sleep 2
  "$NAV" $FLAGS --user-data-dir="$TMPDIR/nowan-cabina" --window-position=0,0 "http://localhost:$PUERTO/cabina/" >/dev/null 2>&1 &
  echo "Listo. Para salir del modo kiosco: Cmd+Q en cada ventana."
fi

echo "El servidor sigue corriendo en esta ventana. Ctrl+C para detenerlo."
wait $SERVIDOR
