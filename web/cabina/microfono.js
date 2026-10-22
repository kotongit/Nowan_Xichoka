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

  // Hay que llamarlo después de que la persona presione el botón
  // (los navegadores no dejan iniciar audio sin una acción del usuario).
  reanudar() {
    return this.contexto?.resume();
  }

  nivel() {
    if (!this.analizador) return 0;
    this.analizador.getFloatTimeDomainData(this.muestras);
    let suma = 0;
    for (const m of this.muestras) suma += m * m;
    const rms = Math.sqrt(suma / this.muestras.length);
    // Sube rápido, baja despacio: así el nivel no parpadea entre sílabas.
    this.suave = rms > this.suave ? rms : this.suave * 0.9 + rms * 0.1;
    return this.suave;
  }
}

// Para probar sin micrófono (?simular en la URL): inventa ráfagas de "voz".
export class MicrofonoSimulado {
  async iniciar() {
    this.t = 0;
    this.hablando = false;
    this.siguiente = 1;
    this.fuerza = 0.1;
  }
  reanudar() {}
  nivel() {
    this.t += 1 / 60;
    if (this.t > this.siguiente) {
      this.hablando = !this.hablando;
      this.siguiente = this.t + (this.hablando ? 1 + Math.random() * 6 : 0.8 + Math.random() * 2);
      this.fuerza = 0.05 + Math.random() * 0.2;
    }
    const ruido = 0.004 + Math.random() * 0.004;
    if (!this.hablando) return ruido;
    return ruido + this.fuerza * (0.6 + 0.4 * Math.abs(Math.sin(this.t * 7) * Math.sin(this.t * 2.3)));
  }
}
