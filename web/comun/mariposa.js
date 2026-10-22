// Dibujo de mariposas monarca y flores de cempasúchil.
// Lo usan la proyección (todas) y la cabina (la despedida).
//
// Cada mariposa es única y sale de cómo habló la persona:
//   tamaño de alas   <- duración de la historia
//   calidez del color <- volumen promedio
//   ritmo de vuelo    <- número de líneas
// Lo demás (pequeñas variaciones de forma) sale del id, así que la misma
// entrada siempre se dibuja igual, aunque se reinicie todo.

export const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
export const mezclar = (a, b, t) => a + (b - a) * t;

// Generador de números al azar con semilla (mulberry32).
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function aspecto(entrada) {
  const r = entrada.rasgos || {};
  const rnd = azar(Math.imul(entrada.id || 1, 2654435761));
  const duracion = limitar(Math.log1p(r.duracion || 0) / Math.log1p(300), 0, 1);
  const volumen = limitar(r.volumen || 0, 0, 1);
  const lineas = limitar((r.lineas || 0) / 30, 0, 1);
  return {
    tam: 0.7 + 0.8 * duracion,                       // multiplicador del tamaño
    tono: mezclar(44, 18, volumen) + (rnd() - 0.5) * 5, // más voz = más cálido (rojizo)
    sat: mezclar(82, 100, volumen),
    luz: mezclar(60, 50, volumen),
    frecuencia: 1.3 + 2.6 * lineas + (rnd() - 0.5) * 0.3, // aleteos por segundo
    alarga: 0.9 + rnd() * 0.2,
    puntas: 0.92 + rnd() * 0.16,
    semilla: rnd() * 1e9,
  };
}

// ---------------------------------------------------------------------------
// Alas (se dibujan una vez por mariposa en un canvas aparte y luego solo se copian)
// ---------------------------------------------------------------------------

// Contornos del ala derecha. Unidad = media envergadura. El cuerpo está en x = 0.
// Cada tramo: [p0, c1, c2, p3]. `borde` = el tramo es orilla exterior (lleva puntos blancos).
function contornos(a) {
  const y = a.alarga, p = a.puntas;
  return {
    trasera: [
      { t: [[0, 0.02], [0.3, -0.02], [0.7 * p, 0.06 * y], [0.7 * p, 0.36 * y]], borde: true },
      { t: [[0.7 * p, 0.36 * y], [0.68 * p, 0.62 * y], [0.4, 0.74 * y], [0.2, 0.64 * y]], borde: true },
      { t: [[0.2, 0.64 * y], [0.08, 0.52 * y], [0.02, 0.3 * y], [0, 0.12]], borde: false },
    ],
    delantera: [
      { t: [[0, -0.02], [0.22, -0.5 * y], [0.6 * p, -0.92 * y], [0.97 * p, -0.8 * y]], borde: true },
      { t: [[0.97 * p, -0.8 * y], [1.03 * p, -0.58 * y], [0.88 * p, -0.28 * y], [0.58, -0.06]], borde: true },
      { t: [[0.58, -0.06], [0.38, 0.04], [0.16, 0.04], [0, 0.04]], borde: false },
    ],
  };
}

function punto(t, [p0, c1, c2, p3]) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
  ];
}

function trazo(tramos, S) {
  const path = new Path2D();
  const [x0, y0] = tramos[0].t[0];
  path.moveTo(x0 * S, y0 * S);
  for (const { t: [, c1, c2, p3] } of tramos) {
    path.bezierCurveTo(c1[0] * S, c1[1] * S, c2[0] * S, c2[1] * S, p3[0] * S, p3[1] * S);
  }
  path.closePath();
  return path;
}

function pintarAla(ctx, tramos, S, a, venas, centro) {
  const path = trazo(tramos, S);
  ctx.save();
  ctx.clip(path);

  const grad = ctx.createLinearGradient(0, 0, S, 0);
  grad.addColorStop(0, `hsl(${a.tono - 4} ${a.sat}% ${a.luz - 14}%)`);
  grad.addColorStop(0.45, `hsl(${a.tono} ${a.sat}% ${a.luz}%)`);
  grad.addColorStop(1, `hsl(${a.tono + 6} ${a.sat}% ${a.luz + 6}%)`);
  ctx.fillStyle = grad;
  ctx.fill(path);

  // Venas negras
  ctx.strokeStyle = "#160b05";
  ctx.lineCap = "round";
  ctx.lineWidth = S * 0.035;
  for (const [x, y, cx, cy] of venas) {
    ctx.beginPath();
    ctx.moveTo(0.02 * S, 0);
    ctx.quadraticCurveTo(cx * S, cy * S, x * S, y * S);
    ctx.stroke();
  }

  // Orilla negra (al estar recortado, solo queda la mitad de adentro)
  ctx.lineWidth = S * 0.17;
  ctx.stroke(path);

  // Puntos blancos sobre la orilla
  ctx.fillStyle = "rgba(255, 250, 235, 0.95)";
  for (const tramo of tramos) {
    if (!tramo.borde) continue;
    for (let i = 1; i < 6; i++) {
      const [px, py] = punto(i / 6, tramo.t);
      // Un poco hacia adentro del ala, para que caigan en la franja negra.
      const dx = centro[0] - px, dy = centro[1] - py;
      const d = Math.hypot(dx, dy) || 1;
      const x = px + (dx / d) * 0.04, y = py + (dy / d) * 0.04;
      ctx.beginPath();
      ctx.arc(x * S, y * S, S * (i % 2 ? 0.02 : 0.014), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "#0d0603";
  ctx.lineWidth = S * 0.025;
  ctx.stroke(path);
}

// Crea el "sello" del ala derecha. S = media envergadura en px de pantalla.
export function crearAlas(a, S, dpr = 1) {
  const pad = S * 0.08;
  const ancho = S * 1.08 + pad, alto = S * 1.8;
  const origenY = S * 0.98;
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.ceil(ancho * dpr);
  lienzo.height = Math.ceil(alto * dpr);
  const ctx = lienzo.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(pad * 0.2, origenY);

  const c = contornos(a);
  const y = a.alarga;
  pintarAla(ctx, c.trasera, S, a,
    [[0.66, 0.3 * y, 0.35, 0.05], [0.56, 0.58 * y, 0.3, 0.2], [0.36, 0.7 * y, 0.2, 0.3], [0.18, 0.6 * y, 0.08, 0.3]],
    [0.32, 0.32 * y]);
  pintarAla(ctx, c.delantera, S, a,
    [[0.95, -0.78 * y, 0.45, -0.45], [0.9, -0.55 * y, 0.5, -0.3], [0.76, -0.3 * y, 0.45, -0.15], [0.56, -0.08, 0.3, -0.05]],
    [0.5, -0.4 * y]);

  return { lienzo, ancho, alto, x: -pad * 0.2, y: -origenY };
}

let brilloDorado = null;
function brillo() {
  if (brilloDorado) return brilloDorado;
  brilloDorado = document.createElement("canvas");
  brilloDorado.width = brilloDorado.height = 128;
  const ctx = brilloDorado.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 220, 120, 0.85)");
  g.addColorStop(0.35, "rgba(255, 190, 70, 0.35)");
  g.addColorStop(1, "rgba(255, 170, 40, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return brilloDorado;
}

// Dibuja un halo suave (para mariposas sin nombre y para la recién llegada).
export function dibujarBrillo(ctx, x, y, radio, alfa = 1) {
  ctx.save();
  ctx.globalAlpha *= alfa;
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(brillo(), x - radio, y - radio, radio * 2, radio * 2);
  ctx.restore();
}

// abierta: 1 = alas extendidas, ~0.15 = casi cerradas.
export function dibujarMariposa(ctx, alas, S, x, y, angulo, abierta, alfa = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angulo);
  ctx.globalAlpha *= alfa;
  for (const lado of [1, -1]) {
    ctx.save();
    ctx.scale(lado * abierta, 1);
    ctx.drawImage(alas.lienzo, alas.x, alas.y, alas.ancho, alas.alto);
    ctx.restore();
  }
  // Cuerpo, cabeza y antenas
  ctx.fillStyle = "#120904";
  ctx.beginPath();
  ctx.ellipse(0, S * 0.08, S * 0.055, S * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -S * 0.36, S * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#120904";
  ctx.lineWidth = Math.max(1, S * 0.02);
  for (const lado of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(lado * S * 0.02, -S * 0.4);
    ctx.quadraticCurveTo(lado * S * 0.08, -S * 0.62, lado * S * 0.18, -S * 0.72);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cempasúchil
// ---------------------------------------------------------------------------

// crecer: 0 a 1 (animación de floración). Devuelve nada; dibuja directo en ctx.
export function dibujarFlor(ctx, x, y, tam, a, crecer = 1) {
  const rnd = azar(a.semilla);
  const s = tam * crecer;
  if (s <= 0.5) return;
  ctx.save();
  ctx.translate(x, y);

  // Tallo y hoja (crecen primero)
  const tallo = Math.min(1, crecer * 1.6);
  ctx.strokeStyle = "hsl(105 38% 20%)";
  ctx.lineWidth = tam * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, tam * 0.15);
  ctx.quadraticCurveTo(tam * 0.06, tam * 0.5, (rnd() - 0.5) * tam * 0.1, tam * (0.15 + 0.75 * tallo));
  ctx.stroke();
  ctx.fillStyle = "hsl(110 35% 18%)";
  ctx.beginPath();
  const lado = rnd() < 0.5 ? -1 : 1;
  ctx.ellipse(lado * tam * 0.16, tam * 0.55, tam * 0.18 * tallo, tam * 0.06 * tallo, lado * -0.6, 0, Math.PI * 2);
  ctx.fill();

  // Pétalos en capas: de afuera (más oscuro) hacia adentro (más brillante)
  const tono = limitar(a.tono, 22, 40);
  const capas = 5;
  for (let c = 0; c < capas; c++) {
    const k = c / (capas - 1);
    const radio = s * 0.5 * (1 - k * 0.72);
    const n = Math.round(18 - k * 10);
    const giro = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const ang = giro + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const d = radio * (0.55 + rnd() * 0.12);
      const luz = mezclar(40, 60, k) + (rnd() - 0.5) * 8;
      ctx.fillStyle = `hsl(${tono + mezclar(-4, 8, k) + (rnd() - 0.5) * 4} 96% ${luz}%)`;
      ctx.beginPath();
      ctx.ellipse(Math.cos(ang) * d, Math.sin(ang) * d * 0.85, radio * 0.42, radio * 0.3, ang, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "hsl(24 85% 28%)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc((rnd() - 0.5) * s * 0.12, (rnd() - 0.5) * s * 0.1, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
