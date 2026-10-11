/* ══════════════════════════════════════════════
   Cliente HTTP de la API + manejo del token JWT
══════════════════════════════════════════════ */

const TOKEN_KEY = 'token';

let token = localStorage.getItem(TOKEN_KEY) || '';
let alExpirar = () => {};

export const getToken = () => token;

export function setToken(nuevo) {
  token = nuevo;
  localStorage.setItem(TOKEN_KEY, nuevo);
}

export function clearToken() {
  token = '';
  localStorage.removeItem(TOKEN_KEY);
}

/** Registra qué hacer cuando el servidor responde 401 (sesión expirada). */
export function onSesionExpirada(fn) {
  alExpirar = fn;
}

export class SesionExpiradaError extends Error {
  constructor() { super('Sesión expirada.'); }
}

/**
 * Llama a /api{path} y devuelve el JSON de respuesta.
 * Con `auth: true` (por defecto) envía el token y, si el servidor
 * responde 401, cierra la sesión y lanza SesionExpiradaError.
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (auth && res.status === 401) {
    alExpirar();
    throw new SesionExpiradaError();
  }

  try {
    return await res.json();
  } catch {
    return { ok: false, mensaje: `Respuesta inválida del servidor (${res.status}).` };
  }
}

/**
 * GET de un archivo (p. ej. Excel). Devuelve { blob, nombre }.
 */
export async function apiDescarga(path) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401) {
    alExpirar();
    throw new SesionExpiradaError();
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.mensaje || `Error del servidor (${res.status}).`);
  }

  const disposicion = res.headers.get('Content-Disposition') || '';
  const nombre = disposicion.match(/filename="?([^"]+)"?/)?.[1] || 'descarga';
  return { blob: await res.blob(), nombre, total: Number(res.headers.get('X-Total-Registros')) };
}

/**
 * POST a un endpoint que responde en vivo con NDJSON (un JSON por línea).
 * Llama a `onEvento` por cada línea recibida, hasta que el servidor termine.
 */
export async function apiStream(path, body, onEvento, signal) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 401) {
    alExpirar();
    throw new SesionExpiradaError();
  }
  if (!res.ok || !res.body) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.mensaje || `Error del servidor (${res.status}).`);
  }

  const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    let salto;
    while ((salto = pendiente.indexOf('\n')) >= 0) {
      const linea = pendiente.slice(0, salto).trim();
      pendiente = pendiente.slice(salto + 1);
      if (linea) onEvento(JSON.parse(linea));
    }
  }
  if (pendiente.trim()) onEvento(JSON.parse(pendiente));
}
