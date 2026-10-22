import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "servidor"))

import pytest
from fastapi.testclient import TestClient

import servidor


@pytest.fixture
def cliente(tmp_path, monkeypatch):
    monkeypatch.setitem(servidor.CONFIG, "datos", tmp_path / "mariposas.json")
    monkeypatch.setitem(servidor.CONFIG, "clave", "1234")
    monkeypatch.setitem(servidor.CONFIG, "prueba", False)
    # El cliente de pruebas no viene de localhost.
    monkeypatch.setitem(servidor.CONFIG, "cabina_remota", True)
    monkeypatch.setattr(servidor, "MIN_ENTRE_ENTRADAS", 0)
    monkeypatch.setitem(servidor.CONFIG, "memoria_minutos", 0)
    with TestClient(servidor.app) as c:
        yield c


def recibir_hasta(ws, tipo):
    while True:
        m = ws.receive_json()
        if m["tipo"] == tipo:
            return m


def test_flujo_completo(cliente, tmp_path):
    with cliente.websocket_connect("/ws?rol=proyeccion") as proyeccion, \
         cliente.websocket_connect("/ws?rol=cabina") as cabina:
        assert recibir_hasta(proyeccion, "estado")["entradas"] == []
        assert recibir_hasta(cabina, "estado")["calibrado"] is False

        cabina.send_json({"tipo": "mariposa", "nombre": "  María Guadalupe ",
                          "rasgos": {"duracion": 94, "volumen": 0.42, "lineas": 17, "texto": "no debe pasar"}})
        assert recibir_hasta(cabina, "recibida")["id"] == 1
        nueva = recibir_hasta(proyeccion, "nueva")["entrada"]

    assert nueva["nombre"] == "María Guadalupe"
    assert nueva["rasgos"] == {"duracion": 94, "volumen": 0.42, "lineas": 17}
    assert set(nueva) == {"id", "nombre", "hora", "rasgos"}

    guardado = json.loads((tmp_path / "mariposas.json").read_text(encoding="utf-8"))
    assert guardado == [nueva]


def test_groseria_vuela_sin_nombre(cliente):
    with cliente.websocket_connect("/ws?rol=cabina") as cabina:
        cabina.send_json({"tipo": "mariposa", "nombre": "pendejo", "rasgos": {}})
        recibir_hasta(cabina, "recibida")
    assert servidor.estado.entradas[0]["nombre"] is None


def test_panel_necesita_clave(cliente):
    with cliente.websocket_connect("/ws?rol=panel&clave=0000") as panel:
        assert panel.receive_json()["tipo"] == "clave_incorrecta"


def test_quitar_nombre_y_pausa(cliente):
    with cliente.websocket_connect("/ws?rol=panel&clave=1234") as panel, \
         cliente.websocket_connect("/ws?rol=cabina") as cabina:
        recibir_hasta(panel, "estado")
        cabina.send_json({"tipo": "mariposa", "nombre": "Don Beto", "rasgos": {}})
        entrada = recibir_hasta(panel, "nueva")["entrada"]

        panel.send_json({"tipo": "quitar_nombre", "id": entrada["id"]})
        assert recibir_hasta(panel, "actualizada")["entrada"]["nombre"] is None

        panel.send_json({"tipo": "pausar", "valor": True})
        assert recibir_hasta(cabina, "pausa")["valor"] is True


def test_la_lista_sobrevive_un_reinicio(cliente, tmp_path):
    with cliente.websocket_connect("/ws?rol=cabina") as cabina:
        for nombre in ["Carmen", "Ernesto", None]:
            cabina.send_json({"tipo": "mariposa", "nombre": nombre, "rasgos": {}})
            recibir_hasta(cabina, "recibida")

    otro = servidor.Estado(tmp_path / "mariposas.json")
    assert [e["nombre"] for e in otro.entradas] == ["Carmen", "Ernesto", None]


def test_mariposa_de_cada_hora(tmp_path, monkeypatch):
    monkeypatch.setitem(servidor.CONFIG, "datos", tmp_path / "mariposas.json")
    monkeypatch.setitem(servidor.CONFIG, "memoria_minutos", 0.02)  # 1.2 s, para no esperar una hora
    with TestClient(servidor.app) as c, c.websocket_connect("/ws?rol=proyeccion") as proyeccion:
        recibir_hasta(proyeccion, "estado")
        entrada = recibir_hasta(proyeccion, "nueva")["entrada"]
    assert entrada["nombre"] is None
    # Sin ninguna marca: es igual a cualquier otra entrada.
    assert set(entrada) == {"id", "nombre", "hora", "rasgos"}


def test_calibrar_desde_el_panel(cliente):
    with cliente.websocket_connect("/ws?rol=panel&clave=1234") as panel, \
         cliente.websocket_connect("/ws?rol=cabina") as cabina:
        recibir_hasta(panel, "estado")
        recibir_hasta(cabina, "estado")
        panel.send_json({"tipo": "calibrar"})
        recibir_hasta(cabina, "calibrar")
        cabina.send_json({"tipo": "calibrado", "valor": 0.012})
        assert recibir_hasta(panel, "umbral")["valor"] == 0.012
    assert servidor.estado.umbral == 0.012

    # Ya hay umbral guardado: la cabina no se vuelve a calibrar sola.
    with cliente.websocket_connect("/ws?rol=cabina") as cabina:
        assert recibir_hasta(cabina, "estado")["calibrado"] is True


def test_voces_de_cada_integrante(cliente, tmp_path, monkeypatch):
    audio = tmp_path / "audio"
    (audio / "ana").mkdir(parents=True)
    (audio / "beto").mkdir()
    for clip in ["bienvenida", "nombre", "salida"]:
        (audio / "ana" / f"{clip}.mp3").write_bytes(b"x")
    (audio / "beto" / "bienvenida.m4a").write_bytes(b"x")
    (audio / "beto" / "notas.txt").write_text("no es audio")
    (audio / "salida.mp3").write_bytes(b"x")   # suelto en audio/: también cuenta
    monkeypatch.setattr(servidor, "RAIZ", tmp_path)

    voces = cliente.get("/api/voces").json()
    assert voces == {
        "_": {"salida": "/audio/salida.mp3"},
        "ana": {c: f"/audio/ana/{c}.mp3" for c in ["bienvenida", "nombre", "salida"]},
        "beto": {"bienvenida": "/audio/beto/bienvenida.m4a"},
    }
