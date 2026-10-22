// Sensibilidad del micrófono, para los controles deslizantes de la cabina y del panel.
//
// Por dentro el sistema usa un "umbral": el nivel de volumen a partir del cual
// se considera que alguien habla. Para las personas es más claro al revés:
// más sensibilidad = umbral más bajo = capta voces más bajitas.
// La escala es logarítmica para que el control se sienta parejo.

export const UMBRAL_MIN = 0.001;  // sensibilidad 100
export const UMBRAL_MAX = 0.2;    // sensibilidad 0

const rango = Math.log(UMBRAL_MAX / UMBRAL_MIN);

// umbral -> sensibilidad de 0 a 100
export function sensibilidad(umbral) {
  const u = Math.min(UMBRAL_MAX, Math.max(UMBRAL_MIN, umbral));
  return Math.round(100 * (1 - Math.log(u / UMBRAL_MIN) / rango));
}

// sensibilidad de 0 a 100 -> umbral
export function umbralDe(sens) {
  return UMBRAL_MIN * Math.exp(rango * (1 - sens / 100));
}

// Posición (0 a 100 %) de un nivel en la barra, en la misma escala que el control.
export function enBarra(nivel) {
  return 100 - sensibilidad(Math.max(nivel, UMBRAL_MIN));
}
