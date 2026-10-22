// Proyección: la pared de mariposas y cempasúchil.
//
// La regla de las 150: vuelan como máximo las 150 mariposas más recientes.
// Cuando llega la 151, la más antigua baja, se posa en la parte baja de la
// pared y florece como cempasúchil. Su nombre se queda en la flor.
//
// Parámetros de la URL:
//   ?demo=40      sin servidor: crea 40 mariposas de prueba y luego una cada 4 s
//   ?origen=0.5   de qué punto del borde inferior nacen las mariposas (0 = izq., 1 = der.)

import { conectar } from "../comun/conexion.js";
import {
  aspecto, azar, crearAlas, dibujarBrillo, dibujarFlor, dibujarMariposa, limitar, mezclar,
} from "../comun/mariposa.js";

const MAX_VUELO = 150;
const DURACION_FLORACION = 2.6;   // segundos
const DURACION_DESTACADA = 45;    // la recién llegada brilla un rato para que la encuentren

const parametros = new URLSearchParams(location.search);
const ORIGEN_X = limitar(parseFloat(parametros.get("origen") ?? "0.5"), 0, 1);

const lienzo = document.getElementById("pared");
const ctx = lienzo.getContext("2d");
const campo = document.createElement("canvas");      // flores ya florecidas (capa fija)
const ctxCampo = campo.getContext("2d");
const nombresCampo = document.createElement("canvas"); // nombres de las flores (capa fija)
const ctxNombres = nombresCampo.getContext("2d");

let W = 0, H = 0, k = 1, dpr = 1;
let entradas = [];        // todas, ordenadas por id
let volando = [];         // mariposas en pantalla (volando, bajando o floreciendo)
let flores = 0;           // cuántas flores ya están fijas en el campo
let reloj = 0;
let vacio = 1;            // opacidad del texto de "pared vacía"

// ---------------------------------------------------------------------------
// Medidas y acomodo del campo
// ---------------------------------------------------------------------------

const medidas = {};
function medir() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  k = H / 1080;
  for (const c of [lienzo, campo, nombresCampo]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  medidas.flor = 46 * k;
  medidas.dx = 34 * k;
  medidas.dy = 20 * k;
  medidas.margen = 22 * k;
  medidas.porFila = Math.max(4, Math.floor((W - 2 * medidas.margen) / medidas.dx));
  medidas.maxFilas = Math.max(4, Math.floor((H * 0.55) / medidas.dy));
  permutaciones.clear();
}

const permutaciones = new Map();
function permutacion(fila) {
  if (!permutaciones.has(fila)) {
    const rnd = azar(fila * 104729 + 3);
    const p = [...Array(medidas.porFila).keys()];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    permutaciones.set(fila, p);
  }
  return permutaciones.get(fila);
}

// Lugar de la flor número `n` (0 = la primera que floreció). Siempre el mismo,
// para que al reiniciar el campo quede idéntico. Dentro de cada fila el orden
// es al azar, para que no se llene de izquierda a derecha como una impresora.
function lugarFlor(n) {
  const { porFila, maxFilas, dx, dy, margen } = medidas;
  const fila = Math.floor(n / porFila);
  const col = permutacion(fila)[n % porFila];
  const filaVisible = fila % maxFilas;
  const capa = Math.floor(fila / maxFilas);
  const rnd = azar(n * 7919 + 1);
  return {
    x: margen + (col + 0.5) * dx + (filaVisible % 2 ? dx / 2 : 0) + (rnd() - 0.5) * dx * 0.6,
    y: H - margen - filaVisible * dy + (rnd() - 0.5) * dy * 0.6 - capa * dy * 0.3,
  };
}

function alturaCampo(n) {
  if (n <= 0) return H;
  const filas = Math.min(medidas.maxFilas, Math.ceil(n / medidas.porFila));
  return H - medidas.margen - filas * medidas.dy - medidas.flor * 0.6;
}

function zonaDeVuelo() {
  const arriba = H * 0.07;
  const abajo = Math.max(H * 0.38, alturaCampo(flores) - H * 0.07);
  return { arriba, abajo };
}

// ---------------------------------------------------------------------------
// Mariposas
// ---------------------------------------------------------------------------

function crearMariposa(entrada, nueva) {
  const a = aspecto(entrada);
  const S = 22 * k * a.tam;
  const rnd = azar(a.semilla + 11);
  const zona = zonaDeVuelo();
  const m = {
    entrada, a, S,
    alas: crearAlas(a, S, dpr),
    x: rnd() * W,
    y: mezclar(zona.arriba, zona.abajo, rnd()),
    vx: (rnd() - 0.5) * 40 * k,
    vy: (rnd() - 0.5) * 20 * k,
    angulo: 0,
    fase: rnd() * Math.PI * 2,
    objetivo: null,
    cambio: 0,
    planeo: 0,
    estado: "volando",
    t: 0,
    nacio: nueva ? 0 : Infinity,
    destacada: nueva ? DURACION_DESTACADA : 0,
    rnd,
  };
  if (nueva) {
    m.x = W * ORIGEN_X + (rnd() - 0.5) * W * 0.05;
    m.y = H + S * 2;
    m.vx = (rnd() - 0.5) * 30 * k;
    m.vy = -160 * k;
    m.objetivo = { x: W * ORIGEN_X + (rnd() - 0.5) * W * 0.3, y: mezclar(zona.arriba, zona.abajo, 0.5 + rnd() * 0.4) };
    m.cambio = 4;
  }
  return m;
}

function nuevoObjetivo(m) {
  const zona = zonaDeVuelo();
  m.objetivo = {
    x: limitar(m.x + (m.rnd() - 0.5) * W * 0.5, W * 0.04, W * 0.96),
    y: mezclar(zona.arriba, zona.abajo, m.rnd()),
  };
  m.cambio = 3 + m.rnd() * 6;
  if (m.rnd() < 0.25) m.planeo = 0.6 + m.rnd() * 1.2;
}

function actualizarMariposa(m, dt) {
  m.t += dt;
  m.nacio += dt;
  m.destacada = Math.max(0, m.destacada - dt);

  if (m.estado === "floreciendo") return;

  let velocidad, giro;
  if (m.estado === "bajando") {
    const d = Math.hypot(m.objetivo.x - m.x, m.objetivo.y - m.y);
    velocidad = limitar(d * 0.9, 12 * k, 70 * k);
    giro = 2.2;
    if (d < 2.5 * k) {
      m.x = m.objetivo.x;
      m.y = m.objetivo.y;
      m.estado = "floreciendo";
      m.t = 0;
      return;
    }
  } else {
    m.cambio -= dt;
    if (!m.objetivo || m.cambio <= 0 || Math.hypot(m.objetivo.x - m.x, m.objetivo.y - m.y) < 30 * k) {
      nuevoObjetivo(m);
    }
    velocidad = (38 + m.a.frecuencia * 6) * k;
    giro = m.nacio < 3 ? 0.6 : 0.9;
  }

  // Se dirige suavemente hacia su objetivo, con un poco de revoloteo.
  const dx = m.objetivo.x - m.x, dy = m.objetivo.y - m.y;
  const d = Math.hypot(dx, dy) || 1;
  const revoloteo = Math.sin(reloj * 1.7 + m.a.semilla) * 0.5;
  const deseadaX = (dx / d) * velocidad - (dy / d) * revoloteo * velocidad * 0.4;
  const deseadaY = (dy / d) * velocidad + (dx / d) * revoloteo * velocidad * 0.4;
  const f = Math.min(1, dt * giro);
  m.vx += (deseadaX - m.vx) * f;
  m.vy += (deseadaY - m.vy) * f;
  m.x += m.vx * dt;
  m.y += m.vy * dt;

  // Aleteo (o planeo de vez en cuando)
  m.planeo = Math.max(0, m.planeo - dt);
  const frecuencia = m.planeo > 0 && m.estado === "volando" ? 0.4 : m.a.frecuencia;
  m.fase += dt * Math.PI * 2 * frecuencia;

  const objetivoAngulo = Math.atan2(m.vy, m.vx) + Math.PI / 2;
  let delta = objetivoAngulo - m.angulo;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  m.angulo += delta * Math.min(1, dt * 4);
}

function apertura(m) {
  if (m.planeo > 0 && m.estado === "volando") return 0.85 + 0.1 * Math.cos(m.fase);
  return 0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.cos(m.fase), 0.8);
}

const facil = (t) => 1 - Math.pow(1 - t, 3);
function rebote(t) {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// ---------------------------------------------------------------------------
// Flores
// ---------------------------------------------------------------------------

function fuente(px, peso = 400) {
  return `${peso} ${Math.round(px)}px "Segoe UI", system-ui, -apple-system, sans-serif`;
}

function fijarFlor(entrada, n) {
  const lugar = lugarFlor(n);
  dibujarFlor(ctxCampo, lugar.x, lugar.y, medidas.flor, aspecto(entrada), 1);
}

function nombreFlor(c, entrada, n, alfa = 1) {
  if (!entrada.nombre) return;
  const lugar = lugarFlor(n);
  c.save();
  c.globalAlpha *= alfa;
  c.font = fuente(11 * k);
  c.textAlign = "center";
  c.lineWidth = 3 * k;
  c.strokeStyle = "rgba(0,0,0,0.75)";
  c.fillStyle = "rgba(255, 240, 220, 0.75)";
  c.strokeText(entrada.nombre, lugar.x, lugar.y + medidas.flor * 0.36);
  c.fillText(entrada.nombre, lugar.x, lugar.y + medidas.flor * 0.36);
  c.restore();
}

function redibujarCampo() {
  for (const c of [ctxCampo, ctxNombres]) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
  }
  for (let n = 0; n < flores; n++) fijarFlor(entradas[n], n);
  redibujarNombres();
}

function redibujarNombres() {
  ctxNombres.clearRect(0, 0, W, H);
  for (let n = 0; n < flores; n++) nombreFlor(ctxNombres, entradas[n], n);
}

// ---------------------------------------------------------------------------
// Llegada de entradas
// ---------------------------------------------------------------------------

function reconstruir(lista) {
  entradas = [...lista].sort((a, b) => a.id - b.id);
  flores = Math.max(0, entradas.length - MAX_VUELO);
  volando = entradas.slice(flores).map((e) => crearMariposa(e, false));
  redibujarCampo();
  vacio = entradas.length ? 0 : 1;
}

function agregar(entrada) {
  if (entradas.some((e) => e.id === entrada.id)) return;
  entradas.push(entrada);
  volando.push(crearMariposa(entrada, true));

  // Regla de las 150: la más antigua que sigue volando baja a florecer.
  const enVuelo = volando.filter((m) => m.estado === "volando");
  if (enVuelo.length > MAX_VUELO) {
    const mayor = enVuelo.reduce((a, b) => (a.entrada.id < b.entrada.id ? a : b));
    const n = entradas.indexOf(mayor.entrada);
    const lugar = lugarFlor(n);
    mayor.estado = "bajando";
    mayor.indiceFlor = n;
    mayor.objetivo = { x: lugar.x, y: lugar.y };
  }
}

function actualizarNombre(entrada) {
  const propia = entradas.find((e) => e.id === entrada.id);
  if (!propia) return;
  propia.nombre = entrada.nombre;
  if (entradas.indexOf(propia) < flores) redibujarNombres();
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

function etiqueta(texto, x, y, tam, alfa, peso = 400) {
  ctx.save();
  ctx.globalAlpha *= alfa;
  ctx.font = fuente(tam, peso);
  ctx.textAlign = "center";
  ctx.lineWidth = 3.5 * k;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.fillStyle = "rgba(255, 248, 235, 0.92)";
  ctx.strokeText(texto, x, y);
  ctx.fillText(texto, x, y);
  ctx.restore();
}

function dibujar(dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(campo, 0, 0, W, H);

  // Flores que están naciendo (encima del campo)
  for (const m of volando) {
    if (m.estado !== "floreciendo") continue;
    const p = limitar((m.t - 0.4) / (DURACION_FLORACION - 0.4), 0, 1);
    dibujarFlor(ctx, m.x, m.y, medidas.flor, m.a, p > 0 ? rebote(p) : 0);
  }
  ctx.drawImage(nombresCampo, 0, 0, W, H);

  // Mariposas
  for (const m of volando) {
    let alfa = 1, escala = 1;
    if (m.estado === "floreciendo") {
      const p = limitar(m.t / 1.3, 0, 1);
      alfa = 1 - facil(p);
      escala = 1 - p * 0.5;
      if (alfa <= 0.01) continue;
    }
    const bob = Math.sin(m.fase) * m.S * 0.08;
    const sinNombre = !m.entrada.nombre;
    if (sinNombre) dibujarBrillo(ctx, m.x, m.y + bob, m.S * 1.7, 0.45 * alfa);
    if (m.destacada > 0) {
      const pulso = 0.5 + 0.5 * Math.sin(reloj * 2.5);
      dibujarBrillo(ctx, m.x, m.y + bob, m.S * (3 + pulso), 0.35 * Math.min(1, m.destacada / 5) * alfa);
    }
    if (m.nacio < 2.5) {
      const p = m.nacio / 2.5;
      dibujarBrillo(ctx, m.x, m.y, m.S * (2 + p * 8), (1 - p) * 0.8);
    }
    ctx.save();
    ctx.translate(m.x, m.y + bob);
    ctx.scale(escala, escala);
    dibujarMariposa(ctx, m.alas, m.S, 0, 0, m.angulo, m.estado === "floreciendo" ? 1 : apertura(m), alfa);
    ctx.restore();
  }

  // Nombres de las mariposas (en una pasada aparte, siempre encima)
  for (const m of volando) {
    if (!m.entrada.nombre) continue;
    const y = m.y + m.S * 1.05 + 14 * k;
    if (m.estado === "floreciendo") {
      const p = limitar(m.t / DURACION_FLORACION, 0, 1);
      etiqueta(m.entrada.nombre, m.x, mezclar(y, m.y + medidas.flor * 0.36, facil(p)), mezclar(15, 11, p) * k, 1);
    } else if (m.destacada > 0) {
      etiqueta(m.entrada.nombre, m.x, y + 2 * k, 19 * k, 1, 600);
    } else {
      etiqueta(m.entrada.nombre, m.x, y, 15 * k, 0.9);
    }
  }

  // Pared vacía
  vacio = entradas.length ? Math.max(0, vacio - dt * 0.4) : Math.min(1, vacio + dt * 0.4);
  if (vacio > 0) {
    ctx.save();
    ctx.globalAlpha = vacio * (0.35 + 0.1 * Math.sin(reloj * 0.8));
    ctx.fillStyle = "#f3c88a";
    ctx.textAlign = "center";
    ctx.font = `italic ${Math.round(40 * k)}px Georgia, "Times New Roman", serif`;
    ctx.fillText("Cuéntanos de quien extrañas.", W / 2, H * 0.45);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#f3c88a";
  ctx.font = `italic ${Math.round(18 * k)}px Georgia, "Times New Roman", serif`;
  ctx.fillText("Nowan Xichoka · llora conmigo", 28 * k, 40 * k);
  ctx.restore();
}

function paso() {
  const ahora = performance.now() / 1000;
  const dt = Math.min(0.05, ahora - (paso.antes ?? ahora));
  paso.antes = ahora;
  reloj += dt;

  for (const m of volando) actualizarMariposa(m, dt);

  // Las que terminaron de florecer pasan a la capa fija del campo.
  const terminadas = volando.filter((m) => m.estado === "floreciendo" && m.t >= DURACION_FLORACION);
  if (terminadas.length) {
    terminadas.sort((a, b) => a.indiceFlor - b.indiceFlor);
    for (const m of terminadas) {
      fijarFlor(m.entrada, m.indiceFlor);
      nombreFlor(ctxNombres, m.entrada, m.indiceFlor);
      flores = Math.max(flores, m.indiceFlor + 1);
    }
    volando = volando.filter((m) => !terminadas.includes(m));
  }

  dibujar(dt);
  requestAnimationFrame(paso);
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

medir();
window.addEventListener("resize", () => {
  const anchoAntes = W, altoAntes = H;
  medir();
  for (const m of volando) {
    m.x *= W / anchoAntes;
    m.y *= H / altoAntes;
    m.S = 22 * k * m.a.tam;
    m.alas = crearAlas(m.a, m.S, dpr);
    if (m.estado !== "volando") {
      const lugar = lugarFlor(m.indiceFlor);
      m.objetivo = lugar;
      if (m.estado === "floreciendo") Object.assign(m, lugar);
    }
  }
  redibujarCampo();
});

const indicador = document.getElementById("estado");

if (parametros.has("demo")) {
  const NOMBRES = ["María Guadalupe", "José Luis", "Abuelita Chela", "Don Beto", "Rosa María", "Tía Lupita",
    "Ernesto", "Carmen", "Mi papá", "Firulais", "Abuelo Pancho", "Socorro", "Ana Sofía", null, null];
  let id = 0;
  const falsa = () => ({
    id: ++id,
    nombre: NOMBRES[Math.floor(Math.random() * NOMBRES.length)],
    hora: new Date().toISOString(),
    rasgos: { duracion: Math.random() * 300, volumen: Math.random(), lineas: Math.floor(Math.random() * 40) },
  });
  reconstruir(Array.from({ length: parseInt(parametros.get("demo")) || 0 }, falsa));
  setInterval(() => agregar(falsa()), parseFloat(parametros.get("cada") ?? "4") * 1000);
} else {
  conectar("proyeccion", {
    alCambiarEstado: (ok) => indicador.classList.toggle("desconectado", !ok),
    alMensaje(mensaje) {
      if (mensaje.tipo === "estado") {
        // Al reconectar: si solo faltan entradas nuevas, se agregan con animación;
        // si la lista cambió por completo (servidor con otros datos), se reconstruye.
        const ultimo = entradas.at(-1)?.id ?? 0;
        const conocidas = mensaje.entradas.filter((e) => e.id <= ultimo);
        if (entradas.length && conocidas.length === entradas.length) {
          conocidas.forEach(actualizarNombre);
          mensaje.entradas.filter((e) => e.id > ultimo).forEach(agregar);
        } else {
          reconstruir(mensaje.entradas);
        }
      } else if (mensaje.tipo === "nueva") {
        agregar(mensaje.entrada);
      } else if (mensaje.tipo === "actualizada") {
        actualizarNombre(mensaje.entrada);
      }
    },
  });
}

requestAnimationFrame(paso);

// Para depurar desde la consola: window.nowan.agregar({...})
window.nowan = { agregar, reconstruir, get entradas() { return entradas; }, get volando() { return volando; } };
