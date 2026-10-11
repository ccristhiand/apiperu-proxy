const { procesarLote, resumir, TIPOS } = require('../services/bulk.service');
const { RPM } = require('../services/apiPeru.service');

function validarNumeros(req, res) {
  const { numeros } = req.body;
  if (!Array.isArray(numeros) || !numeros.length) {
    res.status(400).json({ ok: false, mensaje: 'Envía un array "numeros" con los RUCs o DNIs.' });
    return null;
  }
  return numeros;
}

/* ─────────────────────────────────────────
   POST /api/bulk/ruc   y   POST /api/bulk/dni
   Body: { "numeros": ["20100070970", ...] }
   Responde todo junto al terminar.
───────────────────────────────────────── */
const bulkPorTipo = (tipo) => async (req, res) => {
  const numeros = validarNumeros(req, res);
  if (!numeros) return;

  try {
    const resultados = await procesarLote(tipo, numeros, { usuarioId: req.usuario?.id, ip: req.ip });
    return res.json({ ok: true, resumen: resumir(resultados), resultados });
  } catch (err) {
    console.error(`bulk ${tipo} error:`, err);
    return res.status(500).json({ ok: false, mensaje: 'Error al procesar el lote.' });
  }
};

/* ─────────────────────────────────────────
   POST /api/bulk/:tipo/stream
   Body: { "numeros": [...] }

   Responde en vivo con NDJSON (un objeto JSON por línea):
     { "evento": "inicio",    "total": 500, "rpm": 60 }
     { "evento": "resultado", "i": 12, "resultado": { ok, fuente, datos | mensaje } }
     { "evento": "espera",    "ms": 35000 }      ← esperando cupo de ApiPeruDev
     { "evento": "ping" }                        ← mantiene viva la conexión
     { "evento": "fin",       "resumen": { ... } }
     { "evento": "error",     "mensaje": "..." }
   Si el cliente cierra la conexión, el proceso se cancela.
───────────────────────────────────────── */
async function bulkStream(req, res) {
  const { tipo } = req.params;
  if (!TIPOS.includes(tipo))
    return res.status(404).json({ ok: false, mensaje: 'Tipo no soportado. Usa "ruc" o "dni".' });

  const numeros = validarNumeros(req, res);
  if (!numeros) return;

  res.writeHead(200, {
    'Content-Type':      'application/x-ndjson; charset=utf-8',
    'Cache-Control':     'no-cache, no-transform',
    'X-Accel-Buffering': 'no',   // Nginx: no acumular la respuesta
  });

  const enviar = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };

  const cancelar = new AbortController();
  res.on('close', () => { if (!res.writableEnded) cancelar.abort(); });
  const ping = setInterval(() => enviar({ evento: 'ping' }), 15_000);

  enviar({ evento: 'inicio', total: numeros.length, rpm: RPM });

  try {
    const resultados = await procesarLote(tipo, numeros, {
      usuarioId:   req.usuario?.id,
      ip:          req.ip,
      signal:      cancelar.signal,
      onResultado: (i, resultado) => enviar({ evento: 'resultado', i, resultado }),
      onEspera:    (ms) => enviar({ evento: 'espera', ms }),
    });
    enviar({ evento: 'fin', resumen: resumir(resultados) });
  } catch (err) {
    if (!cancelar.signal.aborted) {
      console.error(`bulk stream ${tipo} error:`, err);
      enviar({ evento: 'error', mensaje: 'Error al procesar el lote.' });
    }
  } finally {
    clearInterval(ping);
    res.end();
  }
}

module.exports = { bulkRuc: bulkPorTipo('ruc'), bulkDni: bulkPorTipo('dni'), bulkStream };
