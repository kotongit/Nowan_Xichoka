// Instrucciones de voz.
// Si existe el archivo grabado en /audio (por ejemplo audio/bienvenida.mp3),
// se reproduce ese. Si no, se usa la voz sintética del navegador como
// respaldo, para poder probar antes de grabar las instrucciones reales.

export const TEXTOS = {
  bienvenida: "Este es un espacio para recordar. Cuéntanos de quien extrañas. Nada de lo que digas se guarda. Cuando termines, presiona el botón.",
  nombre: "Si quieres, escribe su nombre. Si no, presiona el botón.",
  salida: "Su mariposa ya vuela. Sal a buscarla.",
};

const sinArchivo = new Set();
let actual = null;

function reproducirArchivo(clave) {
  return new Promise((resolver, rechazar) => {
    const audio = new Audio(`/audio/${clave}.mp3`);
    actual = audio;
    audio.onended = resolver;
    audio.onpause = resolver; // si se interrumpe con callar(), también termina
    audio.onerror = () => {
      sinArchivo.add(clave);
      rechazar();
    };
    audio.play().catch(rechazar);
  });
}

function vozDelNavegador(texto) {
  return new Promise((resolver) => {
    const respaldo = setTimeout(resolver, texto.length * 75 + 1500);
    if (!("speechSynthesis" in window)) return;
    const frase = new SpeechSynthesisUtterance(texto);
    const voces = speechSynthesis.getVoices();
    frase.voice = voces.find((v) => v.lang === "es-MX") || voces.find((v) => v.lang.startsWith("es")) || null;
    frase.lang = "es-MX";
    frase.rate = 0.9;
    frase.onend = () => { clearTimeout(respaldo); resolver(); };
    speechSynthesis.speak(frase);
  });
}

// Devuelve una promesa que se cumple cuando termina de hablar.
export async function decir(clave) {
  callar();
  if (!sinArchivo.has(clave)) {
    try {
      await reproducirArchivo(clave);
      return;
    } catch { /* no hay archivo: se usa la voz del navegador */ }
  }
  await vozDelNavegador(TEXTOS[clave]);
}

export function callar() {
  if (actual) { actual.pause(); actual = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
