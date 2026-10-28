"""
Servidor de Nowan Xichoka.

Conecta la cabina, la proyección y el panel de moderación por WebSockets,
pasa los nombres por el filtro y guarda la lista de mariposas en un JSON.

Lo único que viaja y se guarda por cada historia es:
    { id, nombre (o null), hora, rasgos: { duracion, volumen, lineas } }
Nunca audio. Nunca texto de la historia.

Uso:
    python servidor/servidor.py                 # exposición
    python servidor/servidor.py --prueba        # con botones de mariposas de prueba en el panel
    python servidor/servidor.py --datos datos/ensayo.json --prueba
"""

import argparse
import asyncio
import json
import os
import random
import secrets
import socket
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from filtro import Filtro

RAIZ = Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"

# Tiempo mínimo entre dos mariposas. La cabina ya espera ~15 s entre personas;
# esto es solo una red de seguridad por si alguien aprieta el botón sin parar.
MIN_ENTRE_ENTRADAS = 8

CONFIG = {
    "datos": RAIZ / "datos" / "mariposas.json",
    "clave": None,
    "prueba": False,
    "cabina_remota": False,
    "memoria_minutos": 60,
}

NOMBRES_PRUEBA = [
    "María Guadalupe", "José Luis", "Abuelita Chela", "Don Beto", "Rosa María",
    "Juan Carlos", "Tía Lupita", "Ernesto", "Carmen", "Mi papá", "Firulais",
    "Abuelo Pancho", "Socorro", "Ana Sofía", "Miguel Ángel", "Doña Mari",
    "Refugio", "Esperanza", "Lalo", "Mi abuela Toña", "Javier", "Concepción",
    "Pelusa", "Ramón", "Teresita", "Héctor", "Margarita", "Chuy", "Isabel", None,
]


# ---------------------------------------------------------------------------
# Estado y guardado
# ---------------------------------------------------------------------------

class Estado:
    def __init__(self, archivo: Path):
        self.archivo = archivo
        self.archivo_ajustes = archivo.with_name("ajustes.json")
        self.entradas: list[dict] = []
        self.pausada = False
        self.umbral = 0.006          # umbral de voz del micrófono (0 a 1); la cabina lo calibra sola
        self.calibrado = False       # True cuando ya hay un umbral guardado (calibrado o ajustado a mano)
        # Límites de la pared, para equipos lentos (por ejemplo una Raspberry Pi).
        self.max_vuelo = 150         # mariposas volando a la vez
        self.max_flores = 1500       # flores en el campo; después, cada nueva toma el lugar de la más vieja
        self.ultima_entrada = 0.0
        self.filtro = Filtro()
        self.cargar()

    def cargar(self):
        if self.archivo.exists():
            self.entradas = json.loads(self.archivo.read_text(encoding="utf-8"))
        if self.archivo_ajustes.exists():
            ajustes = json.loads(self.archivo_ajustes.read_text(encoding="utf-8"))
            self.calibrado = "umbral" in ajustes
            self.umbral = ajustes.get("umbral", self.umbral)
            self.max_vuelo = ajustes.get("max_vuelo", self.max_vuelo)
            self.max_flores = ajustes.get("max_flores", self.max_flores)

    @staticmethod
    def _escribir(archivo: Path, datos):
        # Se escribe a un archivo temporal y luego se reemplaza: si la
        # computadora se apaga a la mitad, el JSON anterior sigue entero.
        archivo.parent.mkdir(parents=True, exist_ok=True)
        temporal = archivo.with_suffix(".tmp")
        temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(temporal, archivo)

    def guardar(self):
        self._escribir(self.archivo, self.entradas)

    def guardar_ajustes(self):
        ajustes = {"max_vuelo": self.max_vuelo, "max_flores": self.max_flores}
        if self.calibrado:
            ajustes["umbral"] = self.umbral
        self._escribir(self.archivo_ajustes, ajustes)

    def nueva_entrada(self, nombre: str | None, rasgos: dict) -> dict:
        entrada = {
            "id": (self.entradas[-1]["id"] + 1) if self.entradas else 1,
            "nombre": self.filtro.revisar(nombre),
            "hora": datetime.now().isoformat(timespec="seconds"),
            "rasgos": limpiar_rasgos(rasgos),
        }
        self.entradas.append(entrada)
        self.guardar()
        return entrada

    def buscar(self, id_: int) -> dict | None:
        return next((e for e in self.entradas if e["id"] == id_), None)


def limpiar_rasgos(rasgos) -> dict:
    """Acepta solo los tres números esperados, dentro de rangos razonables."""
    rasgos = rasgos if isinstance(rasgos, dict) else {}

    def numero(clave, minimo, maximo, defecto):
        try:
            return max(minimo, min(maximo, float(rasgos.get(clave, defecto))))
        except (TypeError, ValueError):
            return defecto

    return {
        "duracion": round(numero("duracion", 0, 3600, 0)),
        "volumen": round(numero("volumen", 0, 1, 0), 3),
        "lineas": int(numero("lineas", 0, 500, 0)),
    }


# ---------------------------------------------------------------------------
# Conexiones
# ---------------------------------------------------------------------------

class Conexiones:
    def __init__(self):
        self.por_rol: dict[str, set[WebSocket]] = {"cabina": set(), "proyeccion": set(), "panel": set()}

    async def enviar(self, roles, mensaje: dict):
        texto = json.dumps(mensaje, ensure_ascii=False)
        for rol in roles:
            for ws in list(self.por_rol[rol]):
                try:
                    await ws.send_text(texto)
                except Exception:
                    self.por_rol[rol].discard(ws)

    def resumen(self) -> dict:
        return {"tipo": "conexiones", **{rol: len(s) for rol, s in self.por_rol.items()}}


estado: Estado
conexiones = Conexiones()


async def mariposa_de_memoria():
    """
    Cada hora (en punto) nace una mariposa sin nombre, sola, sin que nadie
    entre a la cabina: en México muere una persona por suicidio
    aproximadamente cada hora.

    A propósito, no lleva ninguna marca: ni en la pared, ni en el panel, ni
    en el JSON. Se trata igual que cualquier otra historia, con el mismo
    cariño, integrada con las demás como debió estarlo en vida.
    """
    periodo = CONFIG["memoria_minutos"] * 60
    while True:
        await asyncio.sleep(periodo - (time.time() % periodo))
        rnd = random.Random(time.time())
        rasgos = {"duracion": rnd.randint(30, 200), "volumen": rnd.uniform(0.15, 0.5), "lineas": rnd.randint(3, 20)}
        entrada = estado.nueva_entrada(None, rasgos)
        await publicar(entrada)


@asynccontextmanager
async def ciclo_de_vida(app):
    global estado
    estado = Estado(CONFIG["datos"])
    tarea = asyncio.create_task(mariposa_de_memoria()) if CONFIG["memoria_minutos"] > 0 else None
    yield
    if tarea:
        tarea.cancel()


app = FastAPI(lifespan=ciclo_de_vida)


def es_local(ws: WebSocket) -> bool:
    host = ws.client.host if ws.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


def mensaje_estado(rol: str) -> dict:
    mensaje = {"tipo": "estado", "pausada": estado.pausada, "umbral": estado.umbral,
               "calibrado": estado.calibrado}
    if rol in ("proyeccion", "panel"):
        mensaje["entradas"] = estado.entradas
        mensaje.update(limites())
    if rol == "panel":
        mensaje["prueba"] = CONFIG["prueba"]
    return mensaje


@app.websocket("/ws")
async def websocket(ws: WebSocket, rol: str, clave: str = ""):
    if rol not in conexiones.por_rol:
        await ws.close(code=4400)
        return
    # El panel necesita la clave que imprime el servidor al arrancar.
    if rol == "panel" and not secrets.compare_digest(clave, CONFIG["clave"]):
        await ws.accept()
        await ws.send_text(json.dumps({"tipo": "clave_incorrecta"}))
        await ws.close(code=4401)
        return
    # La cabina solo se acepta desde la misma computadora (además, el
    # navegador solo da el micrófono en localhost).
    if rol == "cabina" and not (es_local(ws) or CONFIG["cabina_remota"]):
        await ws.close(code=4403)
        return

    await ws.accept()
    conexiones.por_rol[rol].add(ws)
    await ws.send_text(json.dumps(mensaje_estado(rol), ensure_ascii=False))
    await conexiones.enviar(["panel"], conexiones.resumen())

    try:
        while True:
            try:
                mensaje = json.loads(await ws.receive_text())
            except json.JSONDecodeError:
                continue
            if not isinstance(mensaje, dict):
                continue
            if rol == "cabina":
                await de_la_cabina(ws, mensaje)
            elif rol == "panel":
                await del_panel(mensaje)
    except WebSocketDisconnect:
        pass
    finally:
        conexiones.por_rol[rol].discard(ws)
        await conexiones.enviar(["panel"], conexiones.resumen())


async def publicar(entrada: dict):
    await conexiones.enviar(["proyeccion", "panel"], {"tipo": "nueva", "entrada": entrada})


async def de_la_cabina(ws: WebSocket, mensaje: dict):
    tipo = mensaje.get("tipo")

    if tipo == "mariposa":
        ahora = time.monotonic()
        if ahora - estado.ultima_entrada < MIN_ENTRE_ENTRADAS:
            return
        estado.ultima_entrada = ahora
        nombre = mensaje.get("nombre")
        entrada = estado.nueva_entrada(nombre if isinstance(nombre, str) else None, mensaje.get("rasgos"))
        await ws.send_text(json.dumps({"tipo": "recibida", "id": entrada["id"]}))
        await publicar(entrada)

    elif tipo == "nivel":
        # Nivel del micrófono en vivo (solo números), para ajustar el umbral desde el panel.
        await conexiones.enviar(["panel"], {"tipo": "nivel", "valor": mensaje.get("valor"),
                                            "hablando": mensaje.get("hablando"),
                                            "mic": str(mensaje.get("mic", ""))[:40]})

    elif tipo in ("calibrado", "umbral"):
        # La cabina midió el ruido de fondo, o alguien movió la sensibilidad en F2.
        await poner_umbral(mensaje.get("valor"))


def limites() -> dict:
    return {"max_vuelo": estado.max_vuelo, "max_flores": estado.max_flores}


async def poner_umbral(valor):
    try:
        estado.umbral = max(0.001, min(0.5, float(valor)))
    except (TypeError, ValueError):
        return
    estado.calibrado = True
    estado.guardar_ajustes()
    await conexiones.enviar(["cabina", "panel"], {"tipo": "umbral", "valor": estado.umbral})


async def del_panel(mensaje: dict):
    tipo = mensaje.get("tipo")

    if tipo == "quitar_nombre":
        entrada = estado.buscar(mensaje.get("id"))
        if entrada and entrada["nombre"]:
            entrada["nombre"] = None
            estado.guardar()
            await conexiones.enviar(["proyeccion", "panel"], {"tipo": "actualizada", "entrada": entrada})

    elif tipo == "pausar":
        estado.pausada = bool(mensaje.get("valor"))
        await conexiones.enviar(["cabina", "panel", "proyeccion"], {"tipo": "pausa", "valor": estado.pausada})

    elif tipo == "umbral":
        await poner_umbral(mensaje.get("valor"))

    elif tipo == "calibrar":
        await conexiones.enviar(["cabina"], {"tipo": "calibrar"})

    elif tipo == "limites":
        try:
            if "max_vuelo" in mensaje:
                estado.max_vuelo = max(10, min(400, int(mensaje["max_vuelo"])))
            if "max_flores" in mensaje:
                estado.max_flores = max(50, min(5000, int(mensaje["max_flores"])))
        except (TypeError, ValueError):
            return
        estado.guardar_ajustes()
        await conexiones.enviar(["proyeccion", "panel"], {"tipo": "limites", **limites()})

    elif tipo == "prueba" and CONFIG["prueba"]:
        cantidad = max(1, min(200, int(mensaje.get("cantidad", 1))))
        for _ in range(cantidad):
            rasgos = {
                "duracion": random.randint(10, 300),
                "volumen": random.random() * 0.8 + 0.1,
                "lineas": random.randint(1, 40),
            }
            entrada = estado.nueva_entrada(random.choice(NOMBRES_PRUEBA), rasgos)
            await publicar(entrada)
            if cantidad > 1:
                await asyncio.sleep(0.05)


# ---------------------------------------------------------------------------
# Páginas
# ---------------------------------------------------------------------------

@app.middleware("http")
async def sin_cache(request, call_next):
    # Que el navegador siempre pida la versión más nueva de las páginas y
    # scripts; si no, después de editar el código se sigue viendo el viejo.
    respuesta = await call_next(request)
    respuesta.headers["Cache-Control"] = "no-store"
    return respuesta


CLIPS = ("bienvenida", "nombre", "salida")
FORMATOS = (".mp3", ".m4a", ".wav", ".ogg", ".webm")


@app.get("/api/voces")
async def voces():
    """
    Las grabaciones de las instrucciones. Cada integrante tiene su carpeta:
        audio/ana/bienvenida.mp3, audio/ana/nombre.mp3, audio/ana/salida.mp3
    Devuelve {"ana": {"bienvenida": "/audio/ana/bienvenida.mp3", ...}, ...}.
    Archivos sueltos en audio/ (audio/bienvenida.mp3) cuentan como una voz más.
    """
    carpeta = RAIZ / "audio"
    resultado = {}
    for lugar in [carpeta, *sorted(p for p in carpeta.iterdir() if p.is_dir())]:
        clips = {}
        for archivo in lugar.iterdir():
            if archivo.is_file() and archivo.stem in CLIPS and archivo.suffix.lower() in FORMATOS:
                clips[archivo.stem] = "/" + archivo.relative_to(RAIZ).as_posix()
        if clips:
            resultado[lugar.name if lugar != carpeta else "_"] = clips
    return resultado


@app.get("/")
async def inicio():
    return RedirectResponse("/inicio/")


app.mount("/inicio", StaticFiles(directory=WEB / "inicio", html=True), name="inicio")
app.mount("/cabina", StaticFiles(directory=WEB / "cabina", html=True), name="cabina")
app.mount("/proyeccion", StaticFiles(directory=WEB / "proyeccion", html=True), name="proyeccion")
app.mount("/panel", StaticFiles(directory=WEB / "panel", html=True), name="panel")
app.mount("/comun", StaticFiles(directory=WEB / "comun"), name="comun")
app.mount("/audio", StaticFiles(directory=RAIZ / "audio"), name="audio")


def ip_local() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser(description="Servidor de Nowan Xichoka")
    parser.add_argument("--puerto", type=int, default=8000)
    parser.add_argument("--datos", type=Path, default=CONFIG["datos"],
                        help="archivo JSON donde se guardan las mariposas")
    parser.add_argument("--clave", default=None,
                        help="clave del panel de moderación (por defecto se genera una)")
    parser.add_argument("--prueba", action="store_true",
                        help="activa los botones de mariposas de prueba en el panel")
    parser.add_argument("--memoria-minutos", type=int, default=CONFIG["memoria_minutos"],
                        help="cada cuántos minutos nace una mariposa sin nombre sola (0 = nunca)")
    parser.add_argument("--cabina-remota", action="store_true",
                        help="permite abrir la cabina desde otra computadora (no recomendado)")
    args = parser.parse_args()

    CONFIG["datos"] = args.datos.resolve()
    CONFIG["clave"] = args.clave or f"{secrets.randbelow(10000):04d}"
    CONFIG["prueba"] = args.prueba
    CONFIG["cabina_remota"] = args.cabina_remota
    CONFIG["memoria_minutos"] = args.memoria_minutos

    ip = ip_local()
    print()
    print("  Nowan Xichoka · servidor")
    print(f"  Cabina:      http://localhost:{args.puerto}/cabina/")
    print(f"  Proyección:  http://localhost:{args.puerto}/proyeccion/   (o http://{ip}:{args.puerto}/proyeccion/)")
    print(f"  Panel:       http://{ip}:{args.puerto}/panel/?clave={CONFIG['clave']}")
    print(f"  Datos:       {CONFIG['datos']}")
    if args.memoria_minutos:
        print(f"  Mariposa sin nombre cada {args.memoria_minutos} min (en punto).")
    if args.prueba:
        print("  MODO PRUEBA: el panel puede crear mariposas de prueba.")
    print()

    uvicorn.run(app, host="0.0.0.0", port=args.puerto, log_level="warning")


if __name__ == "__main__":
    main()
