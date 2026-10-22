# Nowan Xichoka · “Llora conmigo”

Una ofrenda que escucha. Instalación interactiva para Día de Muertos 2026.

Una persona entra a la cabina, cuenta en voz alta la historia de alguien que ya se fue,
y la computadora **solo escucha**: cada vez que habla aparece un renglón difuminado que
nadie puede leer. Al terminar, si quiere, escribe el nombre. En la pared proyectada
afuera nace una mariposa monarca con ese nombre. Las 150 más recientes vuelan; las
anteriores bajan y florecen como cempasúchil.

---

## Cómo está hecho

```
cabina (navegador)  ──WebSocket──►  servidor (Python)  ──WebSocket──►  proyección (navegador)
                                         ▲
                                         └──WebSocket──  panel de moderación (celular)
```

| Carpeta / archivo | Qué es | Rol del equipo |
|---|---|---|
| `web/proyeccion/` | La pared: vuelo, regla de las 150, aterrizaje, floración | Proyección |
| `web/comun/mariposa.js` | Cómo se dibujan la mariposa y la flor | Proyección |
| `web/cabina/` | Micrófono, detección de voz, renglones, botón, nombre, voz | Cabina |
| `servidor/servidor.py` | WebSockets, guardado en JSON, pausa, umbral | Servidor y filtro |
| `servidor/filtro.py` | Filtro anti-spam (forma, groserías, repeticiones) | Servidor y filtro |
| `servidor/palabras_bloqueadas.txt` | Lista de palabras bloqueadas (se puede editar) | Servidor y filtro |
| `web/panel/` | Panel de moderación para el celular | Servidor y filtro |
| `audio/` | Instrucciones de voz grabadas (ver abajo) | Construcción |
| `datos/` | Aquí se guarda `mariposas.json` | — |

Todo corre en red local. **No necesita internet** el día de la exposición (solo para instalar).

---

## Instalar (una sola vez, con internet)

Necesitan **Python 3.10 o más nuevo** y **Chrome o Edge**.

- **Windows:** doble clic en `instalar.bat`.
  (Si no tienen Python: descárguenlo de python.org y marquen *Add python.exe to PATH*.)
- **Mac:** `iniciar.command` instala solo la primera vez.

## Arrancar

- **Windows:** doble clic en `iniciar.bat`
- **Mac:** doble clic en `iniciar.command`

Esto abre:
1. la ventana del **servidor** (no la cierren; ahí aparece la dirección y la **clave del panel**),
2. la **proyección** en pantalla completa en el proyector,
3. la **cabina** en pantalla completa en el monitor de la cabina.

Antes de usarlo, abran `iniciar.bat` (o `.command`) con un editor de texto y ajusten
`POS_PROYECTOR`: es dónde empieza la pantalla del proyector. Si el monitor de la cabina
mide 1920 px de ancho y el proyector está “a la derecha”, se queda en 1920.

Para salir del modo kiosco: **Alt+F4** (Windows) o **Cmd+Q** (Mac).

### Modo ensayo

`iniciar.bat prueba` (o `./iniciar.command prueba`) guarda en `datos/ensayo.json` en lugar
de los datos reales, y el panel muestra botones para crear mariposas de prueba
(+1, +20, +160 para ver la regla de las 150).

También se puede arrancar a mano:

```bash
.venv/bin/python servidor/servidor.py --prueba --datos datos/ensayo.json --clave 1234
```

Y abrir `http://localhost:8000/` para ver todas las páginas.

### Probar sin hardware

- `http://localhost:8000/cabina/?simular` — cabina con una voz inventada (sin micrófono).
- `http://localhost:8000/proyeccion/?demo=180&cada=3` — proyección sin servidor,
  con 180 mariposas inventadas y una nueva cada 3 segundos. Ideal para trabajar
  en los dibujos sin depender de nadie.

---

## La cabina

| Tecla | Qué hace |
|---|---|
| **Enter** | Es “el botón”. Configuren el botón arcade (encoder USB) para que mande **Enter**. |
| Espacio / clic | También cuentan como botón (menos al escribir el nombre). |
| **F2** | Muestra/oculta la depuración: estado, nivel del micrófono, umbral, conexión. |

Flujo: flama → botón → instrucciones → la persona habla (renglones) → botón → los renglones
suben como humo → “Si quieres, escribe su nombre” → Enter → “Su mariposa ya vuela. Sal a buscarla.”

Tiempos automáticos (en `web/cabina/cabina.js`, arriba del archivo):
- 3 min sin voz: la cabina termina sola (si no dijo nada, vuelve al inicio).
- 90 s sin teclear el nombre: la mariposa sale sin nombre.
- 12 s mostrando la despedida, y 3 s de espera antes de aceptar a la siguiente persona.

**El micrófono:** el navegador solo deja usarlo en `localhost`, por eso la cabina siempre se
abre en la misma computadora que el servidor. `iniciar.bat` ya da el permiso solo.

### Instrucciones de voz

Graben (Audacity) tres archivos MP3 y pónganlos en `audio/` con estos nombres exactos:

| Archivo | Texto |
|---|---|
| `audio/bienvenida.mp3` | “Este es un espacio para recordar. Cuéntanos de quien extrañas. Nada de lo que digas se guarda. Cuando termines, presiona el botón.” |
| `audio/nombre.mp3` | “Si quieres, escribe su nombre. Si no, presiona el botón.” |
| `audio/salida.mp3` | “Su mariposa ya vuela. Sal a buscarla.” |

Mientras no existan, la cabina usa la voz sintética del navegador como respaldo.

---

## El panel de moderación (celular)

1. El celular tiene que estar en **la misma red** (Wi-Fi o hotspot) que la computadora.
2. Abran la dirección que imprime el servidor, por ejemplo `http://192.168.1.20:8000/panel/?clave=4821`.

Desde ahí:
- **Pausar cabina** — nadie nuevo puede empezar; quien está adentro termina normal.
- **Micrófono** — barra en vivo y control del umbral. Con la cabina en silencio la barra debe
  quedar *abajo* de la línea roja; al hablar, *arriba*. Si capta ruido de afuera, suban el umbral.
  El umbral se guarda en `datos/ajustes.json`.
- **Quitar nombre** — la mariposa (o flor) se queda, pero sin nombre. Se toca dos veces.

La clave cambia cada vez que se abre el servidor (o fíjenla con `--clave 1234`).

---

## Reglas visuales (dónde se cambian)

- **Mariposa** (`web/comun/mariposa.js`, función `aspecto`):
  tamaño ← duración · calidez del color ← volumen promedio · ritmo de aleteo ← número de líneas.
  Sin nombre: vuela con un brillo dorado.
- **Pared** (`web/proyeccion/proyeccion.js`): `MAX_VUELO = 150`, `DURACION_FLORACION`,
  y `lugarFlor()` decide dónde va cada flor (siempre en el mismo lugar, para que al
  reiniciar quede igual). La recién llegada brilla 45 s para que la persona la encuentre.
- **Renglones** (`web/cabina/cabina.js`, `avanzarLinea`): largo ← tiempo hablando;
  alto, grosor y temblor ← intensidad de la voz.

---

## Privacidad

Lo único que viaja por la red y se guarda por cada historia es:

```json
{ "id": 214, "nombre": "María Guadalupe", "hora": "2026-10-30T19:42:10",
  "rasgos": { "duracion": 94, "volumen": 0.42, "lineas": 17 } }
```

- El micrófono solo mide el volumen en ese instante (`web/cabina/microfono.js`). No graba, no transcribe.
- El servidor descarta cualquier otro dato que le llegue en `rasgos`.
- El filtro **falla en silencio**: un nombre que no pasa se vuelve mariposa sin nombre. Nunca se muestra “rechazado”.
- El panel pide clave; la cabina solo se acepta desde la misma computadora.
- Al cerrar la exposición, el equipo decide si borra `datos/mariposas.json`.

## Filtro anti-spam

En `servidor/filtro.py`. Capas:
1. **Forma:** 2–40 caracteres, solo letras (con ñ y acentos), espacios, apóstrofes y guiones, máximo 6 palabras.
2. **Lista:** normaliza (minúsculas, sin acentos, sin leetspeak, sin letras repetidas, junta “p u t o”)
   y compara **palabras completas** contra `palabras_bloqueadas.txt`, para no bloquear apellidos reales.
3. **Ritmo:** el mismo nombre más de 2 veces en 10 minutos ya no se muestra. La cabina además
   espera ~15 s entre personas.
4. **Persona:** el panel.

Pruebas automáticas:

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest pruebas
```

---

## Si algo falla

| Problema | Qué hacer |
|---|---|
| Se trabó o se reinició algo | Cierren todo y vuelvan a abrir `iniciar`. Todo se reconstruye desde `datos/mariposas.json`. |
| Punto rojo arriba a la derecha de la proyección | Perdió conexión con el servidor; se reconecta sola. Revisen que la ventana del servidor siga abierta. |
| La cabina no dibuja renglones | F2: ¿dice “micrófono: ERROR”? Revisen que el micrófono esté conectado y elegido en Windows. ¿El nivel nunca pasa el umbral? Bájenlo desde el panel. |
| Dibuja renglones sin que nadie hable | Suban el umbral desde el panel. |
| El panel no abre en el celular | Mismo Wi-Fi que la computadora. El firewall de Windows puede preguntar si permite Python: digan que sí (red privada). |
| La proyección se ve deslavada | Oscurezcan el espacio. El fondo ya es negro puro. |

## Opción B (dos computadoras)

El servidor corre en la computadora de la **cabina** (por el micrófono). En la del proyector
abran `http://IP-DE-LA-CABINA:8000/proyeccion/` en Chrome en modo kiosco.

---

## Licencia

MIT. Ver [LICENSE](LICENSE): cualquiera puede usar, modificar y compartir el código, siempre que conserve el aviso de autoría.
