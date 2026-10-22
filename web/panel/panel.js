// Panel de moderación (para el celular de un integrante del equipo).
// Se abre con la dirección que imprime el servidor: /panel/?clave=1234

import { conectar } from "../comun/conexion.js";
import { UMBRAL_MAX, UMBRAL_MIN, enBarra as posicion, sensibilidad, umbralDe } from "../comun/sensibilidad.js";

const MAX_VUELO = 150;
const MOSTRAR = 80;

const $ = (id) => document.getElementById(id);
let entradas = [];
let umbral = 0.035;
let conexion = null;

const enBarra = (nivel) => `${posicion(nivel)}%`;

function iniciar(clave) {
  $("acceso").style.display = "none";
  $("contenido").classList.remove("oculto");
  conexion = conectar("panel", {
    clave,
    alCambiarEstado: (ok) => $("chipServidor").classList.toggle("ok", ok),
    alMensaje,
  });
}

function pedirClave() {
  $("acceso").style.display = "block";
  $("contenido").classList.add("oculto");
}

function alMensaje(m) {
  switch (m.tipo) {
    case "clave_incorrecta":
      $("clave").value = "";
      pedirClave();
      $("clave").placeholder = "Clave incorrecta";
      break;
    case "estado":
      entradas = m.entradas;
      ponerPausa(m.pausada);
      ponerUmbral(m.umbral);
      $("prueba").classList.toggle("oculto", !m.prueba);
      pintarLista();
      break;
    case "nueva":
      if (!entradas.some((e) => e.id === m.entrada.id)) entradas.push(m.entrada);
      pintarLista();
      break;
    case "actualizada": {
      const e = entradas.find((x) => x.id === m.entrada.id);
      if (e) Object.assign(e, m.entrada);
      pintarLista();
      break;
    }
    case "pausa": ponerPausa(m.valor); break;
    case "umbral": ponerUmbral(m.valor); break;
    case "conexiones":
      $("chipCabina").classList.toggle("ok", m.cabina > 0);
      $("chipProyeccion").classList.toggle("ok", m.proyeccion > 0);
      break;
    case "nivel": {
      const mic = m.mic || "";
      $("micEstado").textContent = `Micrófono: ${mic}`;
      $("micEstado").classList.toggle("mal", mic !== "listo" && mic !== "calibrando…");
      $("nivel").style.width = enBarra(m.valor ?? 0);
      $("nivel").classList.toggle("hablando", !!m.hablando || (m.valor ?? 0) > umbral);
      break;
    }
  }
}

function ponerPausa(pausada) {
  const b = $("pausa");
  b.classList.toggle("pausada", pausada);
  b.textContent = pausada ? "Cabina en pausa · Reanudar" : "Pausar cabina";
  b.dataset.pausada = pausada ? "1" : "";
}

function ponerUmbral(u) {
  umbral = u;
  $("umbral").value = sensibilidad(u);
  $("marca").style.left = enBarra(u);
  $("umbralTexto").textContent = `(sensibilidad ${sensibilidad(u)} · umbral ${u.toFixed(4)})`;
}

function mandarUmbral(u) {
  u = Math.min(UMBRAL_MAX, Math.max(UMBRAL_MIN, u));
  ponerUmbral(u);
  conexion.enviar({ tipo: "umbral", valor: u });
}

function hora(iso) {
  return iso ? iso.slice(11, 16) : "";
}

function pintarLista() {
  const total = entradas.length;
  $("total").textContent = total;
  $("volando").textContent = Math.min(total, MAX_VUELO);
  $("flores").textContent = Math.max(0, total - MAX_VUELO);

  const lista = $("lista");
  lista.replaceChildren(...entradas.slice(-MOSTRAR).reverse().map((e) => {
    const li = document.createElement("li");
    const que = document.createElement("div");
    que.className = "que";
    const nombre = document.createElement("div");
    nombre.className = e.nombre ? "nombre" : "nombre sin";
    nombre.textContent = e.nombre ?? (e.origen === "hora" ? "sin nombre · la de cada hora" : "sin nombre");
    if (e.origen === "hora") nombre.classList.add("hora-memoria");
    const cuando = document.createElement("div");
    cuando.className = "cuando";
    cuando.textContent = e.origen === "hora"
      ? `#${e.id} · ${hora(e.hora)}`
      : `#${e.id} · ${hora(e.hora)} · ${e.rasgos.duracion} s · ${e.rasgos.lineas} líneas`;
    que.append(nombre, cuando);
    li.append(que);
    if (e.nombre) {
      const b = document.createElement("button");
      b.textContent = "Quitar nombre";
      b.onclick = () => {
        if (b.classList.contains("confirmar")) {
          conexion.enviar({ tipo: "quitar_nombre", id: e.id });
          b.disabled = true;
          return;
        }
        b.classList.add("confirmar");
        b.textContent = "¿Seguro? Toca otra vez";
        setTimeout(() => {
          b.classList.remove("confirmar");
          b.textContent = "Quitar nombre";
        }, 3000);
      };
      li.append(b);
    }
    return li;
  }));
}

$("pausa").onclick = () => conexion.enviar({ tipo: "pausar", valor: !$("pausa").dataset.pausada });
$("umbral").oninput = (e) => mandarUmbral(umbralDe(+e.target.value));
$("menos").onclick = () => mandarUmbral(umbral * 1.15); // menos sensible = umbral más alto
$("mas").onclick = () => mandarUmbral(umbral / 1.15);
$("calibrar").onclick = () => conexion.enviar({ tipo: "calibrar" });
for (const b of document.querySelectorAll("#prueba button")) {
  b.onclick = () => conexion.enviar({ tipo: "prueba", cantidad: +b.dataset.cantidad });
}
$("formaClave").onsubmit = (e) => {
  e.preventDefault();
  const clave = $("clave").value.trim();
  history.replaceState(null, "", `?clave=${encodeURIComponent(clave)}`);
  location.reload();
};

const clave = new URLSearchParams(location.search).get("clave");
if (clave) iniciar(clave);
else pedirClave();
