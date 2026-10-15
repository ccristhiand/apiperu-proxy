const db = require('../config/db');

/**
 * Cómo listar cada tipo:
 *  - columnas:  SELECT para ver el detalle de ese tipo
 *  - resumen:   columnas comunes para la vista "todos" (numero, tipo, nombre, estado, ...)
 *  - buscar:    condición de búsqueda libre (cada ? recibe el texto buscado)
 */
const TIPOS = {
  ruc: {
    tabla: 'cache_ruc',
    columnas: `ruc, razon_social, estado_contribuyente, condicion_contribuyente,
               departamento, provincia, distrito, consultas,
               primera_consulta, ultima_consulta`,
    resumen: `ruc AS numero, 'ruc' AS tipo, razon_social AS nombre,
              estado_contribuyente AS estado, consultas, ultima_consulta`,
    buscar: '(ruc LIKE ? OR razon_social LIKE ?)',
  },
  dni: {
    tabla: 'cache_dni',
    columnas: `dni, nombres, apellido_paterno, apellido_materno, nombre_completo,
               codigo_verificacion, consultas, primera_consulta, ultima_consulta`,
    resumen: `dni AS numero, 'dni' AS tipo, nombre_completo AS nombre,
              NULL AS estado, consultas, ultima_consulta`,
    buscar: '(dni LIKE ? OR nombres LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ?)',
  },
  placa: {
    tabla: 'cache_placa',
    columnas: `placa, marca, modelo, anio, tipo_vehiculo, clase_vehiculo,
               numero_asientos, vin, categoria_mtc, consultas,
               primera_consulta, ultima_consulta`,
    resumen: `placa AS numero, 'placa' AS tipo,
              CONCAT_WS(' ', marca, modelo, anio) AS nombre,
              clase_vehiculo AS estado, consultas, ultima_consulta`,
    buscar: '(placa LIKE ? OR marca LIKE ? OR modelo LIKE ?)',
  },
};

/** Arma el WHERE de búsqueda de un tipo y sus parámetros. */
function filtro(cfg, q) {
  if (!q) return { where: '1=1', params: [] };
  const n = (cfg.buscar.match(/\?/g) || []).length;
  return { where: cfg.buscar, params: Array(n).fill(`%${q}%`) };
}

/**
 * GET /api/listado
 * Query params:
 *   tipo   = 'ruc' | 'dni' | 'placa' | 'todos'  (default: 'todos')
 *   pagina = número de página                    (default: 1)
 *   limite = registros por página                (default: 20, máx: 100)
 *   q      = búsqueda libre (nombre / número / marca)
 */
async function listado(req, res) {
  const tipo   = TIPOS[req.query.tipo] ? req.query.tipo : 'todos';
  const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
  const limite = Math.min(100, Math.max(1, parseInt(req.query.limite) || 20));
  const q      = (req.query.q || '').trim();
  const offset = (pagina - 1) * limite;

  try {
    let total, registros;

    if (tipo !== 'todos') {
      const cfg = TIPOS[tipo];
      const { where, params } = filtro(cfg, q);

      const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM ${cfg.tabla} WHERE ${where}`, params);
      [registros] = await db.query(
        `SELECT ${cfg.columnas} FROM ${cfg.tabla} WHERE ${where}
          ORDER BY ultima_consulta DESC LIMIT ? OFFSET ?`,
        [...params, limite, offset]
      );
      total = n;
    } else {
      // Todos los tipos juntos, ordenados por última consulta y paginados de verdad
      const partes = Object.values(TIPOS).map((cfg) => ({ cfg, ...filtro(cfg, q) }));

      const conteos = await Promise.all(partes.map(({ cfg, where, params }) =>
        db.query(`SELECT COUNT(*) AS n FROM ${cfg.tabla} WHERE ${where}`, params)));
      total = conteos.reduce((suma, [[{ n }]]) => suma + Number(n), 0);

      [registros] = await db.query(
        `${partes.map(({ cfg, where }) => `(SELECT ${cfg.resumen} FROM ${cfg.tabla} WHERE ${where})`).join(' UNION ALL ')}
         ORDER BY ultima_consulta DESC LIMIT ? OFFSET ?`,
        [...partes.flatMap((p) => p.params), limite, offset]
      );
    }

    return res.json({
      ok: true,
      paginacion: {
        pagina,
        limite,
        total,
        paginas: Math.ceil(total / limite),
      },
      registros,
    });

  } catch (err) {
    console.error('Error en listado:', err);
    return res.status(500).json({ ok: false, mensaje: 'Error al obtener el listado.' });
  }
}

module.exports = { listado };
