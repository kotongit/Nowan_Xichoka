// Instrucciones de voz.
//
// Cada integrante del equipo puede grabar su propia versión. Van en carpetas:
//   audio/ana/bienvenida.mp3   audio/ana/nombre.mp3   audio/ana/salida.mp3
//   audio/beto/bienvenida.mp3  ...
// Para cada persona que entra se elige una voz al azar (elegirVoz), y esa
// misma voz la acompaña en las tres instrucciones. Si a esa voz le falta un
// clip, se usa el de otra voz; si no hay ninguna grabación, se usa la voz
// sintética del navegador como respaldo.

export const TEXTOS = {
  bienvenida: "Este es un espacio para recordar. Cuéntanos de quien extrañas. Nada de lo que digas se guarda. Cuando termines, presiona el botón.",
  nombre: "Si quieres, escribe su nombre. Si no, presiona el botón.",
  salida: "Su mariposa ya vuela. Sal a buscarla.",
};

let voces = {};          // { ana: { bienvenida: url, ... }, ... }
let vozActual = null;
let anterior = null;
let actual = null;

export async function cargarVoces() {
  try {
    voces = await (await fetch("/api/voces")).json();
  } catch {
    voces = {};
  }
  return Object.keys(voces);
}
cargarVoces();

// Se llama al empezar cada visita. Evita repetir la voz de la persona anterior
// cuando hay más de una.
export function elegirVoz() {
  cargarVoces(); // por si agregaron grabaciones sin reiniciar
  const nombres = Object.keys(voces);
  const opciones = nombres.length > 1 ? nombres.filter((n) => n !== anterior) : nombres;
  vozActual = opciones.length ? opciones[Math.floor(Math.random() * opciones.length)] : null;
  anterior = vozActual;
  return vozActual;
}

function urlPara(clave) {
  if (vozActual && voces[vozActual]?.[clave]) return voces[vozActual][clave];
  const otras = Object.values(voces).filter((v) => v[clave]);
  return otras.length ? otras[Math.floor(Math.random() * otras.length)][clave] : null;
}

function reproducir(url) {
  return new Promise((resolver, rechazar) => {
    const audio = new Audio(url);
    actual = audio;
    audio.onended = resolver;
    audio.onpause = resolver; // si se interrumpe con callar(), también termina
    audio.onerror = rechazar;
    audio.play().catch(rechazar);
  });
}

function vozDelNavegador(texto) {
  return new Promise((resolver) => {
    const respaldo = setTimeout(resolver, texto.length * 75 + 1500);
    if (!("speechSynthesis" in window)) return;
    const frase = new SpeechSynthesisUtterance(texto);
    const disponibles = speechSynthesis.getVoices();
    frase.voice = disponibles.find((v) => v.lang === "es-MX") || disponibles.find((v) => v.lang.startsWith("es")) || null;
    frase.lang = "es-MX";
    frase.rate = 0.9;
    frase.onend = () => { clearTimeout(respaldo); resolver(); };
    speechSynthesis.speak(frase);
  });
}

// Devuelve una promesa que se cumple cuando termina de hablar.
export async function decir(clave) {
  callar();
  const url = urlPara(clave);
  if (url) {
    try {
      await reproducir(url);
      return;
    } catch { /* archivo dañado o formato no soportado: voz del navegador */ }
  }
  await vozDelNavegador(TEXTOS[clave]);
}

export function callar() {
  if (actual) { actual.pause(); actual = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

// Para F2: qué voz le tocó a esta visita.
export const vozElegida = () => vozActual ?? "navegador";
