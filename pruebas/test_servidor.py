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
        recibir_hasta(cabina, "estado")

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
