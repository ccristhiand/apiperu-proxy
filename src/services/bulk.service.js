const db             = require('../config/db');
const apiPeruService = require('./apiPeru.service');

// Cuántas consultas a ApiPeruDev se hacen en paralelo (el límite por minuto
// lo sigue controlando el RateLimiter; esto solo evita esperar una por una).
const CONCURRENCIA = parseInt(process.env.APIPERU_CONCURRENCIA, 10) || 3;

const sinEspacios = (n) => String(n ?? '').trim();
const entero = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Definición de cada tipo de consulta: tabla de caché, cómo validar el número
 * y cómo guardar la respuesta de ApiPeruDev. Para agregar un tipo nuevo basta
 * con sumar una entrada aquí (y su tabla en sql/).
 */
const CONFIG = {
  ruc: {
    tabla: 'cache_ruc',
    campo: 'ruc',
    normalizar: sinEspacios,
    formato: /^\d{11}$/,
    mensajeFormato: 'el RUC debe tener 11 dígitos',
    consultar: apiPeruService.consultarRuc,
    insertar: (ruc, d) => [
      `INSERT INTO cache_ruc
         (ruc, razon_social, estado_contribuyente, condicion_contribuyente,
          departamento, provincia, distrito, direccion, datos_extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE consultas = consultas + 1`,
      [
        ruc,
        d.nombre_o_razon_social || '',
        d.estado                || null,
        d.condicion             || null,
        d.departamento          || null,
        d.provincia             || null,
        d.distrito              || null,
        d.direccion_completa || d.direccion || null,
        JSON.stringify(d),
      ],
    ],
  },
  dni: {
    tabla: 'cache_dni',
    campo: 'dni',
    normalizar: sinEspacios,
    formato: /^\d{8}$/,
    mensajeFormato: 'el DNI debe tener 8 dígitos',
    consultar: apiPeruService.consultarDni,
    insertar: (dni, d) => [
      `INSERT INTO cache_dni
         (dni, nombres, apellido_paterno, apellido_materno, codigo_verificacion, datos_extra)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE consultas = consultas + 1`,
      [
        dni,
        d.nombres             || '',
        d.apellido_paterno    || null,
        d.apellido_materno    || null,
        d.codigo_verificacion || null,
        JSON.stringify(d),
      ],
    ],
  },
  placa: {
    tabla: 'cache_placa',
    campo: 'placa',
    // "abc-123" o "ABC 123" → "ABC123"
    normalizar: (n) => String(n ?? '').toUpperCase().replace(/[\s-]/g, ''),
    formato: /^[A-Z0-9]{6,7}$/,
    mensajeFormato: 'la placa debe tener 6 o 7 letras y números',
    consultar: apiPeruService.consultarPlaca,
    insertar: (placa, d) => [
      `INSERT INTO cache_placa
         (placa, marca, modelo, anio, tipo_vehiculo, clase_vehiculo,
          numero_asientos, vin, categoria_mtc, datos_extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE consultas = consultas + 1`,
      [
        placa,
        d.marca          || null,
        d.modelo         || null,
        entero(d.anio),
        d.tipo_vehiculo  || null,
        d.clase_vehiculo || null,
        entero(d.numero_asientos),
        d.vin            || null,
        d.categoria_mtc  || null,
        JSON.stringify(d),
      ],
    ],
  },
};

/* Registra varias consultas en log_consultas con un solo INSERT (sin romper si falla). */
async function registrarLog(filas) {
  if (!filas.length) return;
  try {
    await db.query(
      'INSERT INTO log_consultas (usuario_id, tipo, numero, fuente, ip) VALUES ?',
      [filas]
    );
  } catch (e) {
    console.error('Log error:', e.message);
  }
}

/* Suma las consultas de los aciertos de caché con un solo UPDATE. */
async function sumarConsultas(cfg, numeros) {
  const conteo = new Map();
  numeros.forEach((n) => conteo.set(n, (conteo.get(n) || 0) + 1));

  const casos = [...conteo].map(() => 'WHEN ? THEN ?').join(' ');
  const params = [...conteo].flat();
  await db.query(
    `UPDATE ${cfg.tabla}
        SET consultas = consultas + CASE ${cfg.campo} ${casos} ELSE 0 END
      WHERE ${cfg.campo} IN (?)`,
    [...params, [...conteo.keys()]]
  );
}

/**
 * Procesa un lote de RUCs, DNIs o placas.
 *  1. Los de formato inválido se marcan como error (no detienen el lote).
 *  2. Los que ya están en caché se resuelven con una sola consulta a la BD.
 *  3. El resto se consulta en ApiPeruDev respetando el límite por minuto.
 *
 * Cada resultado se entrega en cuanto está listo mediante `onResultado(indice, resultado)`,
 * donde `indice` es la posición del número en el arreglo recibido.
 *
 * @returns {Promise<object[]>} resultados en el mismo orden que `numeros`
 */
async function procesarLote(tipo, numeros, { usuarioId = null, ip = null, onResultado, onEspera, signal } = {}) {
  const cfg = CONFIG[tipo];
  const resultados = new Array(numeros.length);

  const emitir = (i, numero, r) => {
    resultados[i] = { [cfg.campo]: numero, ...r };
    onResultado?.(i, resultados[i]);
  };

  // 1. Formato
  const validos = [];
  numeros.forEach((n, i) => {
    const numero = cfg.normalizar(n);
    if (cfg.formato.test(numero)) validos.push({ i, numero });
    else emitir(i, numero, {
      ok: false,
      reintentable: false,
      mensaje: `Formato inválido: ${cfg.mensajeFormato}.`,
    });
  });
  if (!validos.length) return resultados;

  // 2. Caché (una sola consulta para todo el lote)
  const unicos = [...new Set(validos.map((v) => v.numero))];
  const [filas] = await db.query(`SELECT * FROM ${cfg.tabla} WHERE ${cfg.campo} IN (?)`, [unicos]);
  const cache = new Map(filas.map((f) => [f[cfg.campo], f]));

  const aciertos = validos.filter((v) => cache.has(v.numero));
  if (aciertos.length) {
    for (const v of aciertos) {
      const { datos_extra, ...datos } = cache.get(v.numero);
      emitir(v.i, v.numero, { ok: true, fuente: 'cache', datos });
    }
    await sumarConsultas(cfg, aciertos.map((a) => a.numero));
    await registrarLog(aciertos.map((a) => [usuarioId, tipo, a.numero, 'cache', ip]));
  }

  // 3. ApiPeruDev — los números repetidos se consultan una sola vez
  const pendientes = new Map();
  for (const v of validos) {
    if (cache.has(v.numero)) continue;
    if (!pendientes.has(v.numero)) pendientes.set(v.numero, []);
    pendientes.get(v.numero).push(v.i);
  }
  const cola = [...pendientes];

  const trabajador = async () => {
    while (cola.length && !signal?.aborted) {
      const [numero, indices] = cola.shift();
      let r;
      try {
        const datos = await cfg.consultar(numero, { onEspera, signal });
        await db.query(...cfg.insertar(numero, datos));
        await registrarLog([[usuarioId, tipo, numero, 'api', ip]]);
        r = { ok: true, fuente: 'api', datos };
      } catch (err) {
        if (signal?.aborted) return;
        // "No encontrado" o dato inválido no cambia al reintentar (y gastaría cupo)
        const definitivo = err.statusCode === 404 || err.statusCode === 400;
        r = { ok: false, reintentable: !definitivo, mensaje: err.message };
      }
      indices.forEach((i) => emitir(i, numero, r));
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, trabajador));
  return resultados;
}

function resumir(resultados) {
  const r = resultados.filter(Boolean);
  return {
    total:       r.length,
    exitosos:    r.filter((x) => x.ok).length,
    errores:     r.filter((x) => !x.ok).length,
    desde_cache: r.filter((x) => x.ok && x.fuente === 'cache').length,
    desde_api:   r.filter((x) => x.ok && x.fuente === 'api').length,
  };
}

module.exports = { procesarLote, resumir, CONFIG, TIPOS: Object.keys(CONFIG) };
