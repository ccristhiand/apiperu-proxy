const axios = require('axios');
const { RateLimiter, dormir } = require('./rateLimiter');

const BASE_URL = 'https://apiperu.dev/api';

// Consultas por minuto que permite el plan de ApiPeruDev (plan "micro" = 60).
const RPM = parseInt(process.env.APIPERU_RPM, 10) || 60;
// Reintentos cuando ApiPeruDev responde "demasiadas solicitudes" o "servicio no disponible".
const MAX_REINTENTOS = 5;
// Pausa por defecto tras "demasiadas solicitudes", si la API no indica cuánto esperar.
const PAUSA_LIMITE_MS = 15_000;
// Pausa tras "servicio no disponible" (503 / retryable), crece con cada intento.
const PAUSA_NO_DISPONIBLE_MS = 5_000;

/** Cupos del plan que consume cada tipo de consulta (según la documentación de ApiPeruDev). */
const COSTO = { ruc: 1, dni: 1, placa: 2 };

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

/** Errores temporales del proveedor que vale la pena reintentar. */
const esNoDisponible = (status, data) =>
  status === 503 || data?.retryable === true || data?.code === 'upstream_unavailable';

/** Pausa tras "demasiadas solicitudes": crece con cada reintento (15 s, 30 s, 45 s…). */
function pausaSugerida(headers, intento) {
  const seg = parseInt(headers?.['retry-after'], 10);
  const indicada = Number.isFinite(seg) && seg > 0 ? seg * 1000 : 0;
  return Math.max(indicada, PAUSA_LIMITE_MS * (intento + 1));
}

/**
 * Hace una consulta a ApiPeruDev respetando el límite por minuto.
 * Si la API responde "demasiadas solicitudes" o "no disponible", espera y reintenta.
 *
 * @param {object} peticion  { metodo, ruta, cuerpo, etiqueta, costo }
 * @param {{ onEspera?: (ms:number)=>void, signal?: AbortSignal }} [opciones]
 */
async function consultar({ metodo = 'get', ruta, cuerpo, etiqueta, costo = 1 }, { onEspera, signal } = {}) {
  for (let intento = 0; ; intento++) {
    await limiter.acquire(onEspera, signal, costo);

    let status, data, headers;
    try {
      const respuesta = metodo === 'post'
        ? await client.post(ruta, cuerpo, { signal })
        : await client.get(ruta, { signal });
      ({ status, data, headers } = respuesta);
    } catch (err) {
      if (!err.response) throw err;   // red, timeout o cancelación
      ({ status, data, headers } = err.response);
    }

    if (data?.success) return data.data;

    const msg = data?.message || `Error al consultar ApiPeruDev (${etiqueta})`;

    if (intento < MAX_REINTENTOS) {
      if (esLimiteExcedido(status, msg)) {
        limiter.bloquear(pausaSugerida(headers, intento));
        continue;
      }
      if (esNoDisponible(status, data)) {
        const pausa = PAUSA_NO_DISPONIBLE_MS * (intento + 1);
        onEspera?.(pausa);
        await dormir(pausa, signal);
        continue;
      }
    }

    const e = new Error(
      data?.code === 'document_not_found' || status === 404 || (status >= 200 && status < 300)
        ? (data?.message || `${etiqueta} no encontrado en ApiPeruDev`)
        : msg
    );
    e.statusCode = status >= 400 ? status : 404;
    throw e;
  }
}

/** Consulta un RUC. Devuelve el objeto `data` de ApiPeruDev o lanza un error. */
const consultarRuc = (ruc, opciones) =>
  consultar({ ruta: `/ruc/${ruc}`, etiqueta: 'RUC', costo: COSTO.ruc }, opciones);

/** Consulta un DNI (RENIEC). Devuelve el objeto `data` de ApiPeruDev o lanza un error. */
const consultarDni = (dni, opciones) =>
  consultar({ ruta: `/dni/${dni}`, etiqueta: 'DNI', costo: COSTO.dni }, opciones);

/** Consulta una placa vehicular (fuente: Pacífico). Consume 2 consultas del plan. */
const consultarPlaca = (placa, opciones) =>
  consultar({ metodo: 'post', ruta: '/placa', cuerpo: { placa }, etiqueta: 'Placa', costo: COSTO.placa }, opciones);

module.exports = { consultarRuc, consultarDni, consultarPlaca, RPM, COSTO };
