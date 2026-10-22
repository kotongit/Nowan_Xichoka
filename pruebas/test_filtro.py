import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "servidor"))

import pytest

from filtro import Filtro, normalizar


@pytest.fixture
def filtro():
    return Filtro()


@pytest.mark.parametrize("nombre", [
    "María Guadalupe",
    "José Luis Peña",
    "O'Connor",
    "Ana-Sofía",
    "Mi abuela Toña",
    "Chuy",
    "Concepción Prieto",
    "Firulais",
])
def test_nombres_reales_pasan(filtro, nombre):
    assert filtro.revisar(nombre) == nombre


@pytest.mark.parametrize("nombre", [
    "",
    "a",
    "x" * 41,
    "Juan 23",
    "www.algo.com",
    "uno dos tres cuatro cinco seis siete",
    "@@@@",
    "--",
])
def test_forma_invalida_va_sin_nombre(filtro, nombre):
    assert filtro.revisar(nombre) is None


@pytest.mark.parametrize("nombre", [
    "puto",
    "PUTO",
    "Juan el pendejo",
    "puuuuto",
    "p u t o",
    "vérga",
    "Skibidi",
])
def test_groserias_van_sin_nombre(filtro, nombre):
    assert filtro.revisar(nombre) is None


def test_leetspeak_se_normaliza():
    assert normalizar("p3nd3j0") == ["pendejo"]


def test_compara_palabras_completas_no_pedazos(filtro):
    # "Culebro" contiene "culo"? No, pero "Computadora" contiene "puta":
    # se comparan palabras completas, así que no se bloquea.
    assert filtro.revisar("Computadora") == "Computadora"
    assert filtro.revisar("Sebastián Culebro") == "Sebastián Culebro"


def test_espacios_sobrantes_se_limpian(filtro):
    assert filtro.revisar("  Rosa    María ") == "Rosa María"


def test_mismo_nombre_mas_de_dos_veces_en_diez_minutos():
    ahora = [0.0]
    filtro = Filtro(palabras=set(), reloj=lambda: ahora[0])
    assert filtro.revisar("Don Beto") == "Don Beto"
    ahora[0] += 60
    assert filtro.revisar("don beto") == "don beto"
    ahora[0] += 60
    assert filtro.revisar("Don Beto") is None      # tercera vez
    ahora[0] += 11 * 60
    assert filtro.revisar("Don Beto") == "Don Beto"  # ya pasaron 10 minutos
