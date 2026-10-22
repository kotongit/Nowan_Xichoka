// Conexión WebSocket con el servidor, con reconexión automática.
// Si se cae la red, los mensajes se guardan en una cola y se mandan al volver:
// así ninguna mariposa se pierde.

export function conectar(rol, { alMensaje, alCambiarEstado = () => {}, clave = "" } = {}) {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocolo}://${location.host}/ws?rol=${rol}&clave=${encodeURIComponent(clave)}`;
  const cola = [];
  let ws = null;
  let espera = 500;
  let rendido = false;

  function abrir() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      espera = 500;
      alCambiarEstado(true);
      while (cola.length && ws.readyState === WebSocket.OPEN) ws.send(cola.shift());
    };
    ws.onmessage = (e) => {
      let mensaje;
      try { mensaje = JSON.parse(e.data); } catch { return; }
      if (mensaje.tipo === "clave_incorrecta") rendido = true;
      alMensaje?.(mensaje);
    };
    ws.onclose = (e) => {
      alCambiarEstado(false);
      if (rendido || e.code === 4401 || e.code === 4403) return;
      setTimeout(abrir, espera);
      espera = Math.min(espera * 2, 5000);
    };
  }
  abrir();

  return {
    // `importante`: si no hay conexión, se guarda para mandarlo después.
    enviar(mensaje, { importante = true } = {}) {
      const texto = JSON.stringify(mensaje);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(texto);
      else if (importante) cola.push(texto);
    },
  };
}
