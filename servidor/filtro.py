"""
Filtro anti-spam para los nombres.

Regla principal: falla en silencio. Si un nombre no pasa, la mariposa vuela
igual, sin nombre. Nunca se muestra un mensaje de "rechazado".

Capas:
  1. FORMA   - largo, caracteres permitidos, número de palabras.
  2. LISTA   - groserías / memes, comparando palabras completas ya normalizadas.
  3. RITMO   - el mismo nombre más de 2 veces en 10 minutos ya no se muestra.
  (4. PERSONA - el panel de moderación; vive en servidor.py)
"""

import re
import time
import unicodedata
from collections import deque
from pathlib import Path

LARGO_MIN = 2
LARGO_MAX = 40
MAX_PALABRAS = 6
REPETICIONES_MAX = 2            # el mismo nombre, más de 2 veces...
VENTANA_REPETICION = 10 * 60    # ...en 10 minutos

# Letras (con ñ y acentos), espacios, apóstrofes y guiones. Nada más.
_FORMA = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿÑñ' \-]+$")

_LEET = str.maketrans({
    "4": "a", "@": "a", "0": "o", "3": "e", "1": "i", "!": "i",
    "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "|": "l",
})

ARCHIVO_PALABRAS = Path(__file__).with_name("palabras_bloqueadas.txt")


def limpiar(nombre: str) -> str:
    """Quita espacios sobrantes. Es lo que se muestra si el nombre pasa."""
    return " ".join(nombre.split())


def sin_acentos(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFD", texto)
    # La ñ se conserva como n; para comparar groserías da igual.
    return "".join(c for c in descompuesto if unicodedata.category(c) != "Mn")


def normalizar(texto: str) -> list[str]:
    """
    Convierte el texto en una lista de palabras "comparables":
    minúsculas, sin acentos, sin leetspeak, sin letras repetidas,
    y juntando letras sueltas separadas por espacios ("p u t o" -> "puto").
    """
    t = sin_acentos(texto.lower()).translate(_LEET)
    t = re.sub(r"[^a-z\s]", " ", t)
    # Junta letras repetidas: "puuuuto" -> "puto"
    t = re.sub(r"(.)\1+", r"\1", t)
    palabras = t.split()

    # Junta secuencias de letras sueltas: ["p","u","t","o"] -> ["puto"]
    resultado, sueltas = [], []
    for p in palabras:
        if len(p) == 1:
            sueltas.append(p)
            continue
        if sueltas:
            resultado.append("".join(sueltas))
            sueltas = []
        resultado.append(p)
    if sueltas:
        resultado.append("".join(sueltas))
    return resultado


def cargar_palabras(archivo: Path = ARCHIVO_PALABRAS) -> set[str]:
    palabras = set()
    if not archivo.exists():
        return palabras
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        linea = linea.split("#", 1)[0].strip()
        if linea:
            # Se normalizan igual que los nombres para que coincidan.
            palabras.update(normalizar(linea))
    return palabras


class Filtro:
    def __init__(self, palabras: set[str] | None = None, reloj=time.monotonic):
        self.palabras = cargar_palabras() if palabras is None else palabras
        self.reloj = reloj
        self._recientes: deque[tuple[float, str]] = deque()

    def forma_valida(self, nombre: str) -> bool:
        if not (LARGO_MIN <= len(nombre) <= LARGO_MAX):
            return False
        if not _FORMA.match(nombre):
            return False
        if len(nombre.split()) > MAX_PALABRAS:
            return False
        # Al menos dos letras de verdad (no "--" ni "' '").
        return sum(c.isalpha() for c in nombre) >= LARGO_MIN

    def tiene_groseria(self, nombre: str) -> bool:
        return any(p in self.palabras for p in normalizar(nombre))

    def _demasiadas_repeticiones(self, nombre: str) -> bool:
        ahora = self.reloj()
        while self._recientes and ahora - self._recientes[0][0] > VENTANA_REPETICION:
            self._recientes.popleft()
        clave = " ".join(normalizar(nombre))
        veces = sum(1 for _, n in self._recientes if n == clave)
        self._recientes.append((ahora, clave))
        return veces >= REPETICIONES_MAX

    def revisar(self, nombre: str | None) -> str | None:
        """Devuelve el nombre limpio si pasa, o None si la mariposa va sin nombre."""
        if not nombre:
            return None
        nombre = limpiar(nombre)
        if not self.forma_valida(nombre):
            return None
        if self.tiene_groseria(nombre):
            return None
        if self._demasiadas_repeticiones(nombre):
            return None
        return nombre
