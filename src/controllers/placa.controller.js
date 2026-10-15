const { procesarLote } = require('../services/bulk.service');

/**
 * GET /api/placa/:placa
 * 1. Busca en caché (BD). Si existe → responde desde BD.
 * 2. Si no existe → consulta ApiPeruDev (consume 2 del plan), guarda en BD, responde.
 *
 * Usa el mismo flujo que la carga masiva (normalización, caché, límite por
 * minuto, reintentos y log), con un lote de un solo elemento.
 */
async function consultarPlaca(req, res) {
  try {
    const [r] = await procesarLote('placa', [req.params.placa], {
      usuarioId: req.usuario?.id,
      ip:        req.ip,
    });

    if (r.ok) return res.json({ ok: true, fuente: r.fuente, datos: r.datos });

    const status = r.mensaje?.startsWith('Formato inválido') ? 400 : r.reintentable ? 503 : 404;
    return res.status(status).json({ ok: false, mensaje: r.mensaje });

  } catch (err) {
    console.error('consultarPlaca error:', err.message);
    return res.status(500).json({ ok: false, mensaje: 'Error al consultar la placa.' });
  }
}

module.exports = { consultarPlaca };
