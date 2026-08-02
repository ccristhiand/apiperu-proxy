const db              = require('../config/db');
const apiPeruService  = require('../services/apiPeru.service');

async function consultarRuc(req, res) {
  const { ruc } = req.params;

  if (!/^\d{11}$/.test(ruc)) {
    return res.status(400).json({ ok: false, mensaje: 'El RUC debe tener exactamente 11 dígitos' });
  }

  try {
    // ── 1. Buscar en caché ───────────────────────────────────────
    const [filas] = await db.query('SELECT * FROM cache_ruc WHERE ruc = ?', [ruc]);

    if (filas.length) {
      await db.query('UPDATE cache_ruc SET consultas = consultas + 1 WHERE ruc = ?', [ruc]);
      await registrarLog(req, 'ruc', ruc, 'cache');
      return res.json({ ok: true, fuente: 'cache', datos: formatearRuc(filas[0]) });
    }

    // ── 2. Consultar ApiPeruDev ──────────────────────────────────
    const apiData = await apiPeruService.consultarRuc(ruc);

    // Guardar en caché con los campos reales que devuelve ApiPeruDev
    await db.query(
      `INSERT INTO cache_ruc
         (ruc, razon_social, estado_contribuyente, condicion_contribuyente,
          departamento, provincia, distrito, direccion, datos_extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ruc,
        apiData.nombre_o_razon_social            || '',
        apiData.estado                           || null,
        apiData.condicion                        || null,
        apiData.departamento                     || null,
        apiData.provincia                        || null,
        apiData.distrito                         || null,
        apiData.direccion_completa || apiData.direccion || null,
        JSON.stringify(apiData),
      ]
    );

    await registrarLog(req, 'ruc', ruc, 'api');
    return res.json({ ok: true, fuente: 'api', datos: apiData });

  } catch (err) {
    console.error('consultarRuc error:', err.message);
    return res.status(err.statusCode || 500).json({ ok: false, mensaje: err.message });
  }
}

function formatearRuc(fila) {
  const { datos_extra, ...rest } = fila;
  return rest;
}

async function registrarLog(req, tipo, numero, fuente) {
  try {
    await db.query(
      'INSERT INTO log_consultas (usuario_id, tipo, numero, fuente, ip) VALUES (?, ?, ?, ?, ?)',
      [req.usuario?.id || null, tipo, numero, fuente, req.ip]
    );
  } catch (e) {
    console.error('Error al registrar log:', e.message);
  }
}

module.exports = { consultarRuc };