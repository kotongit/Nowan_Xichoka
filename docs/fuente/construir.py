"""
Genera docs/Nowan_Xichoka.pdf a partir de documento.html.

Necesita WeasyPrint (y pango, que WeasyPrint usa por dentro):
    Mac:     brew install pango   y   pip install weasyprint
    Windows: ver https://doc.courtbouillon.org/weasyprint/stable/first_steps.html

Uso:
    python docs/fuente/construir.py

Los dibujos (papel picado, mariposas, cempasúchil, la pantalla de la cabina)
se generan aquí como SVG y se insertan en el HTML donde dice {{NOMBRE}}.
"""

import math
import random
from pathlib import Path

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI.parent / "Nowan_Xichoka.pdf"


def mariposa(ancho=60):
    """Monarca vista desde arriba, alas abiertas."""
    alas = []
    for lado in (1, -1):
        t = f'transform="translate(50 40) scale({lado} 1)"'
        alas.append(f'''<g {t}>
          <path d="M0 2 C 18 4, 40 12, 36 30 C 33 40, 18 40, 9 34 C 4 28, 2 16, 0 8 Z"
                fill="url(#gradAla)" stroke="#1a0c04" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M0 -2 C 10 -20, 30 -38, 47 -32 C 50 -22, 44 -8, 28 -1 C 18 2, 8 1, 0 1 Z"
                fill="url(#gradAla)" stroke="#1a0c04" stroke-width="2.6" stroke-linejoin="round"/>
          <g stroke="#1a0c04" stroke-width="1.2" fill="none" stroke-linecap="round">
            <path d="M1 -1 Q 22 -18, 45 -30"/><path d="M1 -1 Q 25 -12, 44 -18"/>
            <path d="M1 0 Q 22 -4, 36 -6"/><path d="M1 4 Q 20 12, 33 26"/>
            <path d="M1 5 Q 14 18, 20 34"/><path d="M1 6 Q 8 18, 10 32"/>
          </g>
          <g fill="#fffaf0">
            <circle cx="46" cy="-28" r="1.3"/><circle cx="47.5" cy="-23" r="1"/><circle cx="46" cy="-17" r="1.3"/>
            <circle cx="41" cy="-10" r="1"/><circle cx="34" cy="-5" r="1.3"/><circle cx="39" cy="-33" r="1"/>
            <circle cx="34" cy="20" r="1.2"/><circle cx="33" cy="28" r="1"/><circle cx="28" cy="35" r="1.2"/>
            <circle cx="20" cy="38" r="1"/><circle cx="12" cy="36" r="1.2"/>
          </g>
        </g>''')
    alto = ancho * 0.8
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="{ancho}" height="{alto:.0f}">
      <defs><linearGradient id="gradAla" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#d9560f"/><stop offset=".5" stop-color="#f28a1e"/><stop offset="1" stop-color="#ffb23d"/>
      </linearGradient></defs>
      {"".join(alas)}
      <ellipse cx="50" cy="42" rx="2.2" ry="15" fill="#1a0c04"/>
      <circle cx="50" cy="26" r="2.8" fill="#1a0c04"/>
      <path d="M49 24 Q 46 16, 42 12 M51 24 Q 54 16, 58 12" stroke="#1a0c04" stroke-width="1" fill="none"/>
    </svg>'''


def flor(ancho=60, semilla=1):
    """Cempasúchil: capas de pétalos, de afuera (oscuro) hacia adentro (brillante)."""
    rnd = random.Random(semilla)
    partes = []
    capas = [(46, 22, "#c9480b"), (38, 18, "#e2610f"), (30, 15, "#f07d14"), (22, 12, "#f99a1c"), (14, 9, "#ffb52a")]
    for radio, n, color in capas:
        giro = rnd.random() * 360
        for i in range(n):
            ang = giro + i * 360 / n
            x = 50 + math.cos(math.radians(ang)) * radio * 0.6
            y = 50 + math.sin(math.radians(ang)) * radio * 0.6
            partes.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{radio * 0.42:.1f}" ry="{radio * 0.3:.1f}" '
                          f'transform="rotate({ang:.0f} {x:.1f} {y:.1f})" fill="{color}"/>')
    partes.append('<circle cx="50" cy="50" r="5" fill="#ffc94a"/><circle cx="50" cy="50" r="2.4" fill="#a8400a"/>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{ancho}" height="{ancho}">{"".join(partes)}</svg>'


def papel_picado():
    colores = ["#f07f1e", "#d92d72", "#6d2fa3", "#2e9a59", "#f6c21c", "#ef5fa0", "#f07f1e"]
    banderas = []
    for i, c in enumerate(colores):
        x = 6 + i * 87
        # Orilla de abajo con festones, de derecha a izquierda.
        festones = "".join(f"Q {x + 75 - 7.5 - j * 15} 129, {x + 75 - 15 * (j + 1)} 120 " for j in range(5))
        hoyos = []
        estilo = i % 3
        cx, cy = x + 37.5, 62
        if estilo == 0:   # flor
            for k in range(8):
                a = math.radians(k * 45)
                hoyos.append(f'<ellipse cx="{cx + math.cos(a) * 13:.1f}" cy="{cy + math.sin(a) * 13:.1f}" rx="6" ry="3.5" '
                             f'transform="rotate({k * 45} {cx + math.cos(a) * 13:.1f} {cy + math.sin(a) * 13:.1f})"/>')
            hoyos.append(f'<circle cx="{cx}" cy="{cy}" r="6"/>')
        elif estilo == 1:  # rombos
            for dx, dy in [(-16, -18), (16, -18), (0, 0), (-16, 18), (16, 18)]:
                px, py = cx + dx, cy + dy
                hoyos.append(f'<path d="M{px} {py - 7} L{px + 6} {py} L{px} {py + 7} L{px - 6} {py} Z"/>')
        else:              # sol
            for k in range(12):
                a = math.radians(k * 30)
                hoyos.append(f'<circle cx="{cx + math.cos(a) * 18:.1f}" cy="{cy + math.sin(a) * 18:.1f}" r="2.4"/>')
            hoyos.append(f'<circle cx="{cx}" cy="{cy}" r="9"/>')
        puntos = "".join(f'<circle cx="{x + 10 + k * 13.5}" cy="20" r="2"/>' for k in range(5))
        banderas.append(f'''<g><path d="M{x} 8 L{x + 75} 8 L{x + 75} 120 {festones}Z"
            fill="{c}"/><g fill="#121014">{puntos}{"".join(hoyos)}</g></g>''')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 135" width="816" height="180">
      <path d="M0 9 Q 306 18, 612 9" stroke="#d8b25a" stroke-width="1.2" fill="none"/>
      {"".join(banderas)}</svg>'''


def pantalla_cabina():
    """Maqueta de la pantalla: renglones que nadie puede leer."""
    lineas = []
    rnd = random.Random(7)
    y = 34
    for largo in [0.82, 0.55, 0.9, 0.38, 0.7, 0.62, 0.86, 0.3]:
        x0, x1 = 30, 30 + 250 * largo
        # El brillo se finge con trazos cada vez más anchos y transparentes.
        for ancho, alfa in [(9, 0.08), (6, 0.14), (3.5, 0.3), (1.8, 0.85)]:
            d = f"M{x0} {y}"
            pasos = int((x1 - x0) / 6)
            for k in range(1, pasos + 1):
                d += f" L{x0 + k * 6:.0f} {y + (rnd.random() - 0.5) * 3:.1f}"
            lineas.append(f'<path d="{d}" stroke="#ffb547" stroke-opacity="{alfa}" stroke-width="{ancho}" '
                          f'fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
        y += 17
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 220" width="330" height="220">
      <rect x="0" y="0" width="330" height="220" rx="14" fill="#e3d6b0"/>
      <rect x="12" y="12" width="306" height="182" rx="16" fill="#0b0704" stroke="#b9a678" stroke-width="2"/>
      {"".join(lineas)}
      <text x="30" y="182" font-family="VT323" font-size="15" fill="#ffb547">&gt; Si quieres, escribe su nombre: _</text>
      <text x="165" y="211" font-family="Cinzel" font-size="7" letter-spacing="2.5" fill="#8b7a55" text-anchor="middle">PANTALLA DE LA CABINA · MAQUETA</text>
    </svg>'''


def adorno():
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 14" width="220" height="14">
      <line x1="0" y1="7" x2="92" y2="7" stroke="#c9a352" stroke-width=".8"/>
      <line x1="128" y1="7" x2="220" y2="7" stroke="#c9a352" stroke-width=".8"/>
      <circle cx="98" cy="7" r="1.2" fill="#c9a352"/><circle cx="122" cy="7" r="1.2" fill="#c9a352"/>
      <path d="M110 1 L116 7 L110 13 L104 7 Z" fill="none" stroke="#c9a352" stroke-width="1"/>
      <circle cx="110" cy="7" r="1.6" fill="#c9a352"/></svg>'''


def main():
    from weasyprint import HTML

    html = (AQUI / "documento.html").read_text(encoding="utf-8")
    reemplazos = {
        "{{PAPEL}}": papel_picado(),
        "{{MARIPOSA_GRANDE}}": mariposa(78),
        "{{MARIPOSA}}": mariposa(46),
        "{{MARIPOSA_CHICA}}": mariposa(30),
        "{{MARIPOSA_ILUSTRACION}}": mariposa(150),
        "{{PANTALLA}}": pantalla_cabina(),
        "{{ADORNO}}": adorno(),
    }
    for clave, svg in reemplazos.items():
        html = html.replace(clave, svg)
    # Cada flor con su propia semilla, para que no sean idénticas.
    n = 0
    while "{{FLOR" in html:
        i = html.index("{{FLOR")
        j = html.index("}}", i) + 2
        ancho = int(html[i + 6:j - 2] or 60)
        n += 1
        html = html[:i] + flor(ancho, n) + html[j:]

    HTML(string=html, base_url=str(AQUI)).write_pdf(SALIDA)
    print(f"Listo: {SALIDA}")


if __name__ == "__main__":
    main()
