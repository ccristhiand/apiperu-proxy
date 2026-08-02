const db             = require('../config/db');
const apiPeruService = require('../services/apiPeru.service');

/**
 * GET /api/dni/:dni
 * 1. Busca en caché (BD). Si existe → responde desde BD.
 * 2. Si no existe → consulta ApiPeruDev/RENIEC, guarda en BD, responde.
 */
async function consultarDni(req, res) {
  const { dni } = req.params;

  // Validación básica
  if (!/^\d{8}$/.test(dni)) {
    return res.status(400).json({ ok: false, mensaje: 'El DNI debe tener exactamente 8 dígitos' });
  }

  try {
    // ── 1. Buscar en caché ───────────────────────────────────────
    const [filas] = await db.query(
      'SELECT * FROM cache_dni WHERE dni = ?',
      [dni]
    );

    if (filas.length) {
      // Actualizar contador
      await db.query(
        'UPDATE cache_dni SET consultas = consultas + 1 WHERE dni = ?',
        [dni]
      );

      await registrarLog(req, 'dni', dni, 'cache');

      return res.json({
        ok:     true,
        fuente: 'cache',
        datos:  formatearDni(filas[0]),
      });
    }

    // ── 2. Consultar ApiPeruDev / RENIEC ─────────────────────────
    const apiData = await apiPeruService.consultarDni(dni);

    await db.query(
      `INSERT INTO cache_dni
         (dni, nombres, apellido_paterno, apellido_materno,
          codigo_verificacion, datos_extra)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        dni,
        apiData.nombres          || '',
        apiData.apellido_paterno || null,
        apiData.apellido_materno || null,
        apiData.codigo_verificacion || null,
        JSON.stringify(apiData),
      ]
    );

    await registrarLog(req, 'dni', dni, 'api');

    return res.json({
      ok:     true,
      fuente: 'api',
      datos:  apiData,
    });

  } catch (err) {
    console.error('consultarDni error:', err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, mensaje: err.message });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatearDni(fila) {
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

module.exports = { consultarDni };
