const db             = require('../config/db');
const apiPeruService = require('../services/apiPeru.service');

/* ─────────────────────────────────────────
   POST /api/bulk/ruc
   Body: { "numeros": ["20100070970", ...] }
───────────────────────────────────────── */
async function bulkRuc(req, res) {
  const { numeros } = req.body;

  if (!Array.isArray(numeros) || !numeros.length)
    return res.status(400).json({ ok: false, mensaje: 'Envía un array "numeros" con los RUCs.' });


  const invalidos = numeros.filter(n => !/^\d{11}$/.test(String(n).trim()));
  if (invalidos.length)
    return res.status(400).json({ ok: false, mensaje: `RUCs inválidos: ${invalidos.join(', ')}` });

  const resultados = [];

  for (const rucRaw of numeros) {
    const ruc = String(rucRaw).trim();
    try {
      // ¿Está en caché?
      const [filas] = await db.query('SELECT * FROM cache_ruc WHERE ruc = ?', [ruc]);
      if (filas.length) {
        await db.query('UPDATE cache_ruc SET consultas = consultas + 1 WHERE ruc = ?', [ruc]);
        await _log(req, 'ruc', ruc, 'cache');
        const { datos_extra, ...rest } = filas[0];
        resultados.push({ ruc, fuente: 'cache', ok: true, datos: rest });
        continue;
      }

      // No está → consultar API
      const apiData = await apiPeruService.consultarRuc(ruc);
      await db.query(
        `INSERT INTO cache_ruc
           (ruc, razon_social, estado_contribuyente, condicion_contribuyente,
            departamento, provincia, distrito, direccion, datos_extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ruc,
          apiData.nombre_o_razon_social || '',
          apiData.estado              || null,
          apiData.condicion           || null,
          apiData.departamento        || null,
          apiData.provincia           || null,
          apiData.distrito            || null,
          apiData.direccion_completa || apiData.direccion || null,
          JSON.stringify(apiData),
        ]
      );
      await _log(req, 'ruc', ruc, 'api');
      resultados.push({ ruc, fuente: 'api', ok: true, datos: apiData });

    } catch (err) {
      resultados.push({ ruc, ok: false, mensaje: err.message });
    }
  }

  return res.json({
    ok: true,
    resumen: {
      total:        resultados.length,
      exitosos:     resultados.filter(r => r.ok).length,
      errores:      resultados.filter(r => !r.ok).length,
      desde_cache:  resultados.filter(r => r.ok && r.fuente === 'cache').length,
      desde_api:    resultados.filter(r => r.ok && r.fuente === 'api').length,
    },
    resultados,
  });
}

/* ─────────────────────────────────────────
   POST /api/bulk/dni
   Body: { "numeros": ["74969768", ...] }
───────────────────────────────────────── */
async function bulkDni(req, res) {
  const { numeros } = req.body;

  if (!Array.isArray(numeros) || !numeros.length)
    return res.status(400).json({ ok: false, mensaje: 'Envía un array "numeros" con los DNIs.' });


  const invalidos = numeros.filter(n => !/^\d{8}$/.test(String(n).trim()));
  if (invalidos.length)
    return res.status(400).json({ ok: false, mensaje: `DNIs inválidos: ${invalidos.join(', ')}` });

  const resultados = [];

  for (const dniRaw of numeros) {
    const dni = String(dniRaw).trim();
    try {
      const [filas] = await db.query('SELECT * FROM cache_dni WHERE dni = ?', [dni]);
      if (filas.length) {
        await db.query('UPDATE cache_dni SET consultas = consultas + 1 WHERE dni = ?', [dni]);
        await _log(req, 'dni', dni, 'cache');
        const { datos_extra, ...rest } = filas[0];
        resultados.push({ dni, fuente: 'cache', ok: true, datos: rest });
        continue;
      }

      const apiData = await apiPeruService.consultarDni(dni);
      await db.query(
        `INSERT INTO cache_dni
           (dni, nombres, apellido_paterno, apellido_materno, codigo_verificacion, datos_extra)
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
      await _log(req, 'dni', dni, 'api');
      resultados.push({ dni, fuente: 'api', ok: true, datos: apiData });

    } catch (err) {
      resultados.push({ dni, ok: false, mensaje: err.message });
    }
  }

  return res.json({
    ok: true,
    resumen: {
      total:        resultados.length,
      exitosos:     resultados.filter(r => r.ok).length,
      errores:      resultados.filter(r => !r.ok).length,
      desde_cache:  resultados.filter(r => r.ok && r.fuente === 'cache').length,
      desde_api:    resultados.filter(r => r.ok && r.fuente === 'api').length,
    },
    resultados,
  });
}

/* helper: registrar en log_consultas (sin romper si falla) */
async function _log(req, tipo, numero, fuente) {
  try {
    await db.query(
      'INSERT INTO log_consultas (usuario_id, tipo, numero, fuente, ip) VALUES (?, ?, ?, ?, ?)',
      [req.usuario?.id || null, tipo, numero, fuente, req.ip]
    );
  } catch (e) {
    console.error('Log error:', e.message);
  }
}

module.exports = { bulkRuc, bulkDni };