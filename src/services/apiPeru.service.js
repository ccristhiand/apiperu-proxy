const axios = require('axios');

const BASE_URL = 'https://apiperu.dev/api';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    'Authorization': `Bearer ${process.env.APIPERU_TOKEN}`,
  },
});

/**
 * Consulta un RUC en ApiPeruDev.
 * Devuelve el objeto `data` de la respuesta o lanza un error.
 */
async function consultarRuc(ruc) {
  try {
    const { data } = await client.get(`/ruc/${ruc}`);

    if (!data.success) {
      const err = new Error(data.message || 'RUC no encontrado en ApiPeruDev');
      err.statusCode = 404;
      throw err;
    }

    console.log('📦 ApiPeruDev RUC response:', JSON.stringify(data.data, null, 2));
    return data.data;          // objeto con todos los campos del contribuyente
  } catch (err) {
    if (err.response) {
      const msg = err.response.data?.message || 'Error al consultar ApiPeruDev (RUC)';
      const e   = new Error(msg);
      e.statusCode = err.response.status;
      throw e;
    }
    throw err;
  }
}

/**
 * Consulta un DNI en ApiPeruDev (RENIEC).
 * Devuelve el objeto `data` de la respuesta o lanza un error.
 */
async function consultarDni(dni) {
  try {
    const { data } = await client.get(`/dni/${dni}`);

    if (!data.success) {
      const err = new Error(data.message || 'DNI no encontrado en ApiPeruDev');
      err.statusCode = 404;
      throw err;
    }

    return data.data;          // objeto con nombres, apellidos, etc.
  } catch (err) {
    if (err.response) {
      const msg = err.response.data?.message || 'Error al consultar ApiPeruDev (DNI)';
      const e   = new Error(msg);
      e.statusCode = err.response.status;
      throw e;
    }
    throw err;
  }
}

module.exports = { consultarRuc, consultarDni };