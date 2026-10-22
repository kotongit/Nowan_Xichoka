// Cabina: escucha (sin entender ni guardar), dibuja renglones que nadie puede
// leer y, al final, manda al servidor solo tres números y el nombre opcional.
//
// Flujo:  reposo → bienvenida → escuchando → soltar → nombre → vuela → reposo
//
// El botón: Enter (el botón arcade se configura para mandar Enter).
// También sirven la barra espaciadora (menos al escribir el nombre) y un clic.
// F2 muestra el panel de depuración (nivel del micrófono, umbral, estado).
//    Ahí mismo está el control de Sensibilidad (a la derecha = capta voces más bajitas).
// F3 calibra el micrófono: mide 3 s de silencio y ajusta el umbral solo
//    (también se puede desde el panel). Háganlo con la cabina vacía y callada.
//
// Parámetros de la URL:
//   ?simular   usa una voz inventada en lugar del micrófono (para probar)

import { conectar } from "../comun/conexion.js";
import { aspecto, crearAlas, dibujarBrillo, dibujarMariposa, limitar, mezclar } from "../comun/mariposa.js";
import { enBarra, sensibilidad, umbralDe } from "../comun/sensibilidad.js";
import { Microfono, MicrofonoSimulado } from "./microfono.js";
import { callar, decir, elegirVoz, TEXTOS, vozElegida } from "./voz.js";

const ATAQUE = 0.12;            // s de voz continua para empezar una línea
const SOLTAR = 0.7;             // s de silencio para terminar una línea
const SILENCIO_MAXIMO = 180;    // s sin voz: la cabina termina sola
const ESPERA_NOMBRE = 90;       // s sin teclear: la mariposa sale sin nombre
const DURACION_SALIDA = 12;     // s mostrando "Su mariposa ya vuela"
const BLOQUEO_REPOSO = 3;       // s en que el botón no responde al volver al reposo
const AVISO_SILENCIO = 25;      // s sin hablar antes de mostrar el mensaje del silencio
const CALIBRACION = 3;          // s de silencio que se miden al calibrar
const VECES_EL_RUIDO = 4;       // el umbral queda en 4 veces el ruido de fondo (la mediana)

const parametros = new URLSearchParams(location.search);
const mic = parametros.has("simular") ? new MicrofonoSimulado() : new Microfono();

const $ = (id) => document.getElementById(id);
const lienzo = $("carta");
const ctx = lienzo.getContext("2d");
const mensaje = $("mensaje"), pie = $("pie"), firma = $("firma");
const entradaNombre = $("entradaNombre"), nombreEscrito = $("nombreEscrito");

let W, H, k, dpr;
let estado = "reposo";
let tEstado = BLOQUEO_REPOSO;
let reloj = 0;
let turno = 0;            // cambia en cada estado; evita que una promesa vieja cambie el estado nuevo
let pausada = false;
let umbral = 0.035;
let conectado = false;
let micListo = false, micError = null;
let nivel = 0;
let sesion = null;
let renglones = [];
let desplazamiento = 0;
let soltandoDesde = 0;
let mariposaSalida = null;
let ultimoId = null;
let ultimaTecla = 0;
let calibrando = null;    // { hasta, muestras } mientras se mide el ruido de fondo
let señalPlana = 0;       // s seguidos con nivel exactamente 0 (el audio no llega)
let calibradoAntes = true; // si el servidor nunca ha guardado un umbral, se calibra sola al iniciar

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

function medir() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  k = Math.min(H / 900, W / 1200);
  lienzo.width = Math.round(W * dpr);
  lienzo.height = Math.round(H * dpr);
}
const margenIzq = () => W * 0.12;
const margenDer = () => W * 0.9;
const arriba = () => H * 0.2;
const interlineado = () => 54 * k;
const filaY = (fila) => arriba() + fila * interlineado() - desplazamiento;

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

const conexion = conectar("cabina", {
  alCambiarEstado: (ok) => { conectado = ok; },
  alMensaje(m) {
    if (m.tipo === "estado") {
      pausada = m.pausada;
      umbral = m.umbral;
      calibradoAntes = m.calibrado;
      calibrarSiHaceFalta();
    }
    else if (m.tipo === "pausa") pausada = m.valor;
    else if (m.tipo === "umbral") umbral = m.valor;
    else if (m.tipo === "recibida") ultimoId = m.id;
    else if (m.tipo === "calibrar") calibrar();
    if (estado === "reposo") textosReposo();
  },
});

// Cada micrófono es distinto (uno de laptop puede no pasar de 0.01).
// La primera vez, sin umbral guardado, la cabina mide el silencio y se ajusta sola.
function calibrarSiHaceFalta() {
  if (micListo && !calibradoAntes && estado === "reposo" && !calibrando) {
    calibradoAntes = true;
    calibrar();
  }
}

mic.iniciar()
  .then(() => { micListo = true; calibrarSiHaceFalta(); })
  .catch((e) => { micError = e; $("depurar").classList.add("visible"); console.error(e); });

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

function mostrar(el, html) {
  if (html !== undefined) el.innerHTML = html;
  el.classList.add("visible");
}
function ocultar(...els) { els.forEach((el) => el.classList.remove("visible")); }

function textosReposo() {
  mostrar(pie, pausada ? "Un momento, por favor." : "Presiona el botón para comenzar");
}

function ir(nuevo) {
  estado = nuevo;
  tEstado = 0;
  const miTurno = ++turno;
  const sigue = () => miTurno === turno;

  if (nuevo === "reposo") {
    callar();
    sesion = null;
    renglones = [];
    desplazamiento = 0;
    mariposaSalida = null;
    lienzo.classList.remove("humo", "nitido");
    ocultar(mensaje, firma);
    mensaje.classList.remove("arriba");
    textosReposo();
  }

  else if (nuevo === "bienvenida") {
    mic.reanudar();
    elegirVoz(); // una voz del equipo al azar, la misma para toda la visita
    ocultar(pie);
    mostrar(mensaje, TEXTOS.bienvenida.replace("Cuéntanos", "<br>Cuéntanos").replace("Nada", "<br>Nada").replace("Cuando", "<br><br>Cuando"));
    decir("bienvenida").then(() => sigue() && ir("escuchando"));
  }

  else if (nuevo === "escuchando") {
    ocultar(mensaje);
    mostrar(pie, "Cuando termines, presiona el botón.");
    sesion = {
      inicio: reloj, fin: null, ultimaVoz: reloj,
      lineas: 0, actual: null, fila: -1,
      arriba: 0, abajo: 0, fase: 0,
      sumaIntensidad: 0, muestrasVoz: 0,
    };
  }

  else if (nuevo === "soltar") {
    terminarLinea();
    sesion.fin = reloj;
    soltandoDesde = reloj;
    lienzo.classList.add("humo");
    ocultar(pie, mensaje);
    setTimeout(() => sigue() && ir("nombre"), 3000);
  }

  else if (nuevo === "nombre") {
    renglones = [];
    lienzo.classList.remove("humo");
    entradaNombre.value = "";
    nombreEscrito.textContent = "";
    mostrar(firma);
    mostrar(pie, "Si no quieres escribirlo, solo presiona el botón.");
    entradaNombre.focus();
    ultimaTecla = reloj;
    decir("nombre");
  }

  else if (nuevo === "vuela") {
    callar();
    ocultar(firma, pie);
    entradaNombre.blur();
    const rasgos = {
      duracion: Math.round((sesion.fin ?? reloj) - sesion.inicio),
      volumen: sesion.muestrasVoz ? +(sesion.sumaIntensidad / sesion.muestrasVoz).toFixed(3) : 0,
      lineas: sesion.lineas,
    };
    const nombre = entradaNombre.value.trim() || null;
    ultimoId = null;
    conexion.enviar({ tipo: "mariposa", nombre, rasgos });
    entradaNombre.value = "";
    mariposaSalida = { rasgos, creada: false };
    lienzo.classList.add("nitido");
    mostrar(mensaje, "Su mariposa ya vuela.<br>Sal a buscarla.");
    mensaje.classList.add("arriba");
    decir("salida");
  }
}

function boton() {
  if (estado === "reposo") {
    if (!pausada && tEstado >= BLOQUEO_REPOSO) ir("bienvenida");
  } else if (estado === "escuchando") {
    if (tEstado > 1.5) ir("soltar");
  } else if (estado === "nombre") {
    if (tEstado > 0.8) ir("vuela");
  }
}

function calibrar() {
  calibrando = { hasta: reloj + CALIBRACION, muestras: [] };
}

function terminarCalibracion() {
  const m = calibrando.muestras.sort((a, b) => a - b);
  calibrando = null;
  if (!m.length) return;
  // La mediana: si alguien habla o hace ruido un momento durante la medición,
  // casi no la mueve (el 95 % sí lo haría).
  const ruido = m[Math.floor(m.length * 0.5)];
  const nuevo = limitar(ruido * VECES_EL_RUIDO, 0.003, 0.1);
  umbral = nuevo;
  conexion.enviar({ tipo: "calibrado", valor: +nuevo.toFixed(4) });
}

window.addEventListener("keydown", (e) => {
  mic.reanudar();
  if (e.key === "F3") {
    calibrar();
    $("depurar").classList.add("visible");
    e.preventDefault();
    return;
  }
  if (e.key === "F2") {
    $("depurar").classList.toggle("visible");
    e.preventDefault();
    return;
  }
  if (e.key === "Enter" || (e.key === " " && estado !== "nombre")) {
    e.preventDefault();
    if (!e.repeat) boton();
    return;
  }
  if (estado === "nombre") ultimaTecla = reloj;
});
window.addEventListener("pointerdown", (e) => { e.preventDefault(); mic.reanudar(); boton(); });

// Control de sensibilidad (dentro de F2). Los clics ahí no cuentan como botón.
const controlSensibilidad = $("sensibilidad");
$("depurar").addEventListener("pointerdown", (e) => e.stopPropagation());
controlSensibilidad.addEventListener("input", () => {
  umbral = umbralDe(+controlSensibilidad.value);
  conexion.enviar({ tipo: "umbral", valor: +umbral.toFixed(4) });
});
entradaNombre.addEventListener("input", () => {
  nombreEscrito.textContent = entradaNombre.value;
  ultimaTecla = reloj;
});
entradaNombre.addEventListener("blur", () => {
  if (estado === "nombre") setTimeout(() => entradaNombre.focus(), 0);
});

// ---------------------------------------------------------------------------
// Detección de voz y renglones
// ---------------------------------------------------------------------------

// 0 = apenas sobre el umbral, 1 = voz fuerte. Se calibra solo con el umbral.
const intensidad = (n) => limitar((n - umbral) / (umbral * 5), 0, 1);

function nuevoRenglon() {
  sesion.fila += 1;
  const r = { fila: sesion.fila, puntos: [], sello: null };
  renglones.push(r);
  return r;
}

function empezarLinea() {
  sesion.lineas += 1;
  const sangria = Math.random() * 40 * k;
  sesion.actual = { renglon: nuevoRenglon(), x: margenIzq() + sangria };
  sesion.fase = Math.random() * 10;
  sesion.semilla = Math.random() * 10;
}

function terminarLinea() {
  if (!sesion?.actual) return;
  sellar(sesion.actual.renglon);
  sesion.actual = null;
}

function avanzarLinea(dt, i) {
  const linea = sesion.actual;
  linea.x += dt * 45 * k;
  if (linea.x > margenDer()) {
    // Una historia larga sigue en el siguiente renglón.
    sellar(linea.renglon);
    linea.renglon = nuevoRenglon();
    linea.x = margenIzq();
  }
  // Trazo tipo letra cursiva: el lápiz da vueltas mientras avanza, y de vez
  // en cuando sube más (como una "l" o una "d"). Alto, grosor y temblor
  // salen de la intensidad de la voz.
  sesion.fase += dt * (13 + i * 5);
  const f = sesion.fase;
  const alta = Math.pow(Math.max(0, Math.sin(f * 0.21 + sesion.semilla)), 6);
  const amplitud = (5 + i * 9) * k * (1 + alta * 1.6);
  const temblor = (Math.random() - 0.5) * i * 2.5 * k;
  const x = linea.x + Math.cos(f) * amplitud * 0.55;
  const y = -Math.sin(f) * amplitud * 0.9 + Math.sin(f * 0.5) * 2 * k + temblor;
  const ancho = (1.3 + i * 4.5) * k;
  const puntos = linea.renglon.puntos;
  const ultimo = puntos.at(-1);
  if (ultimo && Math.hypot(x - ultimo.x, y - ultimo.y) < 1.5 * k) {
    ultimo.w = Math.max(ultimo.w, ancho);
  } else {
    puntos.push({ x, y, w: ancho });
  }
}

function trazarRenglon(c, r, y0) {
  const p = r.puntos;
  if (p.length < 2) return;
  c.save();
  c.lineCap = "round";
  c.lineJoin = "round";
  c.strokeStyle = "rgba(255, 181, 71, 0.85)";
  c.shadowColor = "rgba(255, 150, 40, 0.9)";
  c.shadowBlur = 10 * k;
  for (let i = 1; i < p.length; i++) {
    c.lineWidth = (p[i - 1].w + p[i].w) / 2;
    c.beginPath();
    c.moveTo(p[i - 1].x, y0 + p[i - 1].y);
    c.lineTo(p[i].x, y0 + p[i].y);
    c.stroke();
  }
  c.restore();
}

// Un renglón terminado se dibuja una sola vez en su propio canvas.
function sellar(r) {
  const alto = interlineado() * 2;
  const sello = document.createElement("canvas");
  sello.width = Math.round(W * dpr);
  sello.height = Math.round(alto * dpr);
  const c = sello.getContext("2d");
  c.scale(dpr, dpr);
  trazarRenglon(c, r, alto / 2);
  r.sello = { lienzo: sello, alto };
}

function escuchar(dt) {
  const s = sesion;
  const hay = nivel > umbral;
  if (!s.actual) {
    s.arriba = hay ? s.arriba + dt : 0;
    if (s.arriba >= ATAQUE) { empezarLinea(); s.abajo = 0; }
  } else {
    const sigueHablando = nivel > umbral * 0.75;
    s.abajo = sigueHablando ? 0 : s.abajo + dt;
    if (s.abajo >= SOLTAR) {
      terminarLinea();
    } else if (sigueHablando) {
      const i = intensidad(nivel);
      avanzarLinea(dt, i);
      s.sumaIntensidad += i;
      s.muestrasVoz += 1;
      s.ultimaVoz = reloj;
    }
  }

  // Si la pantalla se llena, los renglones suben.
  const objetivo = Math.max(0, arriba() + s.fila * interlineado() - H * 0.78);
  desplazamiento += (objetivo - desplazamiento) * Math.min(1, dt * 2);

  // El silencio también es una forma de recordar.
  const callado = reloj - s.ultimaVoz;
  if (s.lineas === 0 && callado > AVISO_SILENCIO && !mensaje.classList.contains("visible")) {
    mostrar(mensaje, "Si no quieres decir nada, también está bien.<br>El silencio también es una forma de recordar.");
  } else if (s.actual && mensaje.classList.contains("visible")) {
    ocultar(mensaje);
  }
  if (callado > SILENCIO_MAXIMO) {
    if (s.lineas === 0) ir("reposo");
    else ir("soltar");
  }
}

// ---------------------------------------------------------------------------
// Dibujo
// ---------------------------------------------------------------------------

function dibujarFlama(x, y, escala, alfa) {
  const respira = 1 + Math.sin(reloj * 2 * Math.PI * 0.22) * 0.08;
  const parpadeo = 1 + (Math.sin(reloj * 13) * Math.sin(reloj * 7.3)) * 0.04;
  const h = 120 * k * escala * respira * parpadeo;
  const a = h * 0.36;
  const balanceo = Math.sin(reloj * 1.3) * a * 0.12;
  ctx.save();
  ctx.globalAlpha = alfa;
  dibujarBrillo(ctx, x, y - h * 0.3, h * 1.6, 0.35 * respira);
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, -h * 0.22, 0, 0, -h * 0.3, h * 0.7);
  g.addColorStop(0, "rgba(255, 250, 225, 1)");
  g.addColorStop(0.25, "rgba(255, 210, 110, 0.95)");
  g.addColorStop(0.6, "rgba(255, 140, 30, 0.75)");
  g.addColorStop(1, "rgba(200, 60, 10, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(balanceo, -h);
  ctx.bezierCurveTo(a * 0.4 + balanceo, -h * 0.6, a, -h * 0.25, a * 0.75, -h * 0.02);
  ctx.bezierCurveTo(a * 0.5, h * 0.22, -a * 0.5, h * 0.22, -a * 0.75, -h * 0.02);
  ctx.bezierCurveTo(-a, -h * 0.25, -a * 0.4 + balanceo, -h * 0.6, balanceo, -h);
  ctx.fill();
  ctx.restore();
}

function dibujarRenglones() {
  const soltando = estado === "soltar";
  const ts = reloj - soltandoDesde;
  for (const r of renglones) {
    let y = filaY(r.fila);
    let alfa = limitar((y - H * 0.04) / (H * 0.16), 0, 1);
    let dx = 0;
    if (soltando) {
      // Suben y se desvanecen como humo.
      y -= ts * ts * 55 * k + ts * r.fila * 4 * k;
      dx = Math.sin(ts * 1.5 + r.fila) * ts * 12 * k;
      alfa *= limitar(1 - ts / 2.6, 0, 1);
    }
    if (alfa <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alfa;
    if (r.sello) {
      ctx.drawImage(r.sello.lienzo, dx, y - r.sello.alto / 2, W, r.sello.alto);
    } else {
      ctx.translate(dx, 0);
      trazarRenglon(ctx, r, y);
    }
    ctx.restore();
  }
}

function dibujarSalida() {
  const m = mariposaSalida;
  if (!m.creada && (tEstado > 0.6 || ultimoId !== null)) {
    m.aspecto = aspecto({ id: ultimoId ?? 1, rasgos: m.rasgos });
    m.S = 70 * k * m.aspecto.tam;
    m.alas = crearAlas(m.aspecto, m.S, dpr);
    m.creada = true;
    m.t0 = tEstado;
  }
  if (!m.creada) return;
  const t = tEstado - m.t0;
  const p = limitar(t / 7, 0, 1);
  const x = W / 2 + Math.sin(t * 1.1) * W * 0.08;
  const y = mezclar(H * 0.85, -m.S * 2, p * p * (3 - 2 * p));
  const abierta = 0.18 + 0.82 * Math.pow(0.5 + 0.5 * Math.cos(t * Math.PI * 2 * m.aspecto.frecuencia * 0.7), 0.8);
  dibujarBrillo(ctx, x, y, m.S * 3.2, 0.5 * (1 - p));
  dibujarMariposa(ctx, m.alas, m.S, x, y, Math.cos(t * 1.1) * 0.25, abierta, limitar(t / 0.8, 0, 1));
}

function dibujar() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (estado === "reposo") {
    dibujarFlama(W / 2, H * 0.52, 1, limitar(tEstado / 1.5, 0, 1));
  } else if (estado === "bienvenida") {
    dibujarFlama(W / 2, H * 0.52, 1, limitar(1 - tEstado / 0.6, 0, 1));
  } else if (estado === "escuchando" || estado === "soltar") {
    dibujarRenglones();
  } else if (estado === "vuela") {
    dibujarSalida();
  }
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------

let ultimoNivelEnviado = 0;

function paso() {
  const ahora = performance.now() / 1000;
  const dt = Math.min(0.05, ahora - (paso.antes ?? ahora));
  paso.antes = ahora;
  reloj += dt;
  tEstado += dt;

  mic.activo = estado === "escuchando";
  nivel = micListo ? mic.nivel() : 0;
  señalPlana = micListo && mic.crudo === 0 ? señalPlana + dt : 0;
  if (calibrando) {
    calibrando.muestras.push(nivel);
    if (reloj >= calibrando.hasta) terminarCalibracion();
  }

  if (estado === "escuchando") escuchar(dt);
  if (estado === "nombre" && reloj - ultimaTecla > ESPERA_NOMBRE) ir("vuela");
  if (estado === "vuela" && tEstado > DURACION_SALIDA) ir("reposo");

  // El nivel (solo un número) se manda al panel para ajustar el umbral.
  if (reloj - ultimoNivelEnviado > 0.2) {
    ultimoNivelEnviado = reloj;
    conexion.enviar({ tipo: "nivel", valor: +nivel.toFixed(4), hablando: !!sesion?.actual, mic: estadoMic() },
      { importante: false });
  }

  dibujar();
  actualizarDepuracion();
  requestAnimationFrame(paso);
}

// Un resumen corto del micrófono, para F2 y para el panel.
function estadoMic() {
  if (micError) return `error: ${micError.name}`;
  if (!micListo) return "esperando permiso";
  if (mic.audio === "suspended") return "audio en pausa: presiona una tecla";
  if (señalPlana > 2) return "sin señal (nivel 0)";
  if (calibrando) return "calibrando…";
  return "listo";
}

function actualizarDepuracion() {
  const panel = $("depurar");
  if (!panel.classList.contains("visible")) return;
  $("depurarTexto").textContent =
    `estado: ${estado}  (${tEstado.toFixed(1)} s)\n` +
    `servidor: ${conectado ? "conectado" : "SIN CONEXIÓN"}  ·  pausa: ${pausada ? "sí" : "no"}\n` +
    `micrófono: ${estadoMic()}  ·  audio: ${mic.audio}\n` +
    `nivel: ${nivel.toFixed(4)}  umbral: ${umbral.toFixed(4)}  ${sesion?.actual ? "● hablando" : ""}\n` +
    `líneas: ${sesion?.lineas ?? 0}  ·  voz: ${vozElegida()}`;
  panel.querySelector("#nivelBarra i").style.width = `${enBarra(nivel)}%`;
  panel.querySelector("#nivelBarra b").style.left = `${enBarra(umbral)}%`;
  if (document.activeElement !== controlSensibilidad) controlSensibilidad.value = sensibilidad(umbral);
  $("sensibilidadValor").textContent = sensibilidad(umbral);
}

medir();
window.addEventListener("resize", medir);
ir("reposo");
tEstado = BLOQUEO_REPOSO;
requestAnimationFrame(paso);
