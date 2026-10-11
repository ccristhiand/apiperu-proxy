const axios = require('axios');
const { RateLimiter } = require('./rateLimiter');

const BASE_URL = 'https://apiperu.dev/api';

// Consultas por minuto que permite el plan de ApiPeruDev (plan "micro" = 60).
const RPM = parseInt(process.env.APIPERU_RPM, 10) || 60;
// Reintentos cuando ApiPeruDev responde "demasiadas solicitudes".
const MAX_REINTENTOS = 5;
// Pausa por defecto tras ese error, si la API no indica cuánto esperar.
const PAUSA_LIMITE_MS = 15_000;

const limiter = new RateLimiter(RPM);

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'Authorization': `Bearer ${process.env.APIPERU_TOKEN}`,
  },
});

const esLimiteExcedido = (status, mensaje) =>
  status === 429 || /demasiadas solicitudes|too many requests/i.test(mensaje || '');

/** Pausa tras "demasiadas solicitudes": crece con cada reintento (15 s, 30 s, 45 s…). */
function pausaSugerida(headers, intento) {
  const seg = parseInt(headers?.['retry-after'], 10);
  const indicada = Number.isFinite(seg) && seg > 0 ? seg * 1000 : 0;
  return Math.max(indicada, PAUSA_LIMITE_MS * (intento + 1));
}

/**
 * Hace una consulta a ApiPeruDev respetando el límite por minuto.
 * Si aun así la API responde "demasiadas solicitudes", espera y reintenta.
 *
 * @param {string} ruta      p. ej. '/ruc/20100070970'
 * @param {string} etiqueta  'RUC' | 'DNI' (para los mensajes de error)
 * @param {{ onEspera?: (ms:number)=>void, signal?: AbortSignal }} [opciones]
 */
async function consultar(ruta, etiqueta, { onEspera, signal } = {}) {
  for (let intento = 0; ; intento++) {
    await limiter.acquire(onEspera, signal);

    let respuesta;
    try {
      respuesta = await client.get(ruta, { signal });
    } catch (err) {
      if (!err.response) throw err;   // red, timeout o cancelación

      const msg = err.response.data?.message || `Error al consultar ApiPeruDev (${etiqueta})`;
      if (esLimiteExcedido(err.response.status, msg) && intento < MAX_REINTENTOS) {
        limiter.bloquear(pausaSugerida(err.response.headers, intento));
        continue;
      }
      const e = new Error(msg);
      e.statusCode = err.response.status;
      throw e;
    }

    const { data } = respuesta;
    if (data.success) return data.data;

    if (esLimiteExcedido(null, data.message) && intento < MAX_REINTENTOS) {
      limiter.bloquear(pausaSugerida(respuesta.headers, intento));
      continue;
    }
    const e = new Error(data.message || `${etiqueta} no encontrado en ApiPeruDev`);
    e.statusCode = 404;
    throw e;
  }
}

/** Consulta un RUC. Devuelve el objeto `data` de ApiPeruDev o lanza un error. */
const consultarRuc = (ruc, opciones) => consultar(`/ruc/${ruc}`, 'RUC', opciones);

/** Consulta un DNI (RENIEC). Devuelve el objeto `data` de ApiPeruDev o lanza un error. */
const consultarDni = (dni, opciones) => consultar(`/dni/${dni}`, 'DNI', opciones);

module.exports = { consultarRuc, consultarDni, RPM };
