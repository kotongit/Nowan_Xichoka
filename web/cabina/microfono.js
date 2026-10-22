// Micrófono: SOLO mide el volumen en tiempo real.
// No graba, no guarda, no transcribe. Cada cuadro se lee el nivel (RMS) del
// audio que está entrando en ese instante y se descarta.

export class Microfono {
  async iniciar() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    });
    this.contexto = new AudioContext();
    const fuente = this.contexto.createMediaStreamSource(this.stream);
    this.analizador = this.contexto.createAnalyser();
    this.analizador.fftSize = 1024;
    this.muestras = new Float32Array(this.analizador.fftSize);
    fuente.connect(this.analizador); // no se conecta a la bocina ni a nada más
    this.suave = 0;
  }

  // Los navegadores dejan el audio "en pausa" hasta que alguien presiona una
  // tecla o hace clic. Se llama en cada tecla/clic, por si acaso.
  reanudar() {
    if (this.contexto && this.contexto.state !== "running") return this.contexto.resume();
  }

  // "running" = funcionando. "suspended" = en pausa (falta una tecla o clic).
  get audio() {
    return this.contexto?.state ?? "sin iniciar";
  }

  nivel() {
    if (!this.analizador) return 0;
    this.analizador.getFloatTimeDomainData(this.muestras);
    let suma = 0;
    for (const m of this.muestras) suma += m * m;
    const rms = Math.sqrt(suma / this.muestras.length);
    this.crudo = rms; // exactamente 0 = no está llegando nada de audio
    // Sube rápido, baja despacio: así el nivel no parpadea entre sílabas.
    this.suave = rms > this.suave ? rms : this.suave * 0.9 + rms * 0.1;
    return this.suave;
  }
}

// Para probar sin micrófono (?simular en la URL): inventa ráfagas de "voz".
// Solo "habla" cuando `activo` es true (la cabina lo prende al escuchar);
// el resto del tiempo es puro ruido de fondo, como una cabina callada.
export class MicrofonoSimulado {
  async iniciar() {
    this.t = 0;
    this.hablando = false;
    this.siguiente = 1;
    this.fuerza = 0.1;
  }
  reanudar() {}
  get audio() { return "simulado"; }
  nivel() {
    this.t += 1 / 60;
    if (this.t > this.siguiente) {
      this.hablando = !this.hablando;
      this.siguiente = this.t + (this.hablando ? 1 + Math.random() * 6 : 0.8 + Math.random() * 2);
      this.fuerza = 0.05 + Math.random() * 0.2;
    }
    const ruido = 0.004 + Math.random() * 0.004;
    if (!this.hablando || !this.activo) return ruido;
    return ruido + this.fuerza * (0.6 + 0.4 * Math.abs(Math.sin(this.t * 7) * Math.sin(this.t * 2.3)));
  }
}
