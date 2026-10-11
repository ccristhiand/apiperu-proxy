const db = require('../config/db');

/**
 * GET /api/listado
 * Query params:
 *   tipo   = 'ruc' | 'dni' | 'todos'  (default: 'todos')
 *   pagina = número de página           (default: 1)
 *   limite = registros por página       (default: 20, máx: 100)
 *   q      = búsqueda libre (nombre / número)
 */
async function listado(req, res) {
  const tipo   = req.query.tipo   || 'todos';
  const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
  const limite = Math.min(100, Math.max(1, parseInt(req.query.limite) || 20));
  const q      = (req.query.q || '').trim();
  const offset = (pagina - 1) * limite;

  try {
    let rucs = [], dnis = [], totalRuc = 0, totalDni = 0;

    /* ── RUC ── */
    if (tipo === 'ruc' || tipo === 'todos') {
      let where = '1=1';
      const params = [];
      if (q) {
        where += ' AND (ruc LIKE ? OR razon_social LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
      }

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM cache_ruc WHERE ${where}`, params
      );
      totalRuc = total;

      if (tipo === 'ruc') {
        const [rows] = await db.query(
          `SELECT ruc, razon_social, estado_contribuyente, condicion_contribuyente,
                  departamento, provincia, distrito, consultas,
                  primera_consulta, ultima_consulta
             FROM cache_ruc WHERE ${where}
            ORDER BY ultima_consulta DESC
            LIMIT ? OFFSET ?`,
          [...params, limite, offset]
        );
        rucs = rows;
      } else {
        // En modo 'todos' traemos los primeros 'limite/2' de cada tabla
        const mitad = Math.ceil(limite / 2);
        const [rows] = await db.query(
          `SELECT ruc AS numero, 'ruc' AS tipo, razon_social AS nombre,
                  estado_contribuyente AS estado, consultas, ultima_consulta
             FROM cache_ruc WHERE ${where}
            ORDER BY ultima_consulta DESC
            LIMIT ? OFFSET ?`,
          [...params, mitad, offset]
        );
        rucs = rows;
      }
    }

    /* ── DNI ── */
    if (tipo === 'dni' || tipo === 'todos') {
      let where = '1=1';
      const params = [];
      if (q) {
        where += ' AND (dni LIKE ? OR nombres LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ?)';
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      }

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM cache_dni WHERE ${where}`, params
      );
      totalDni = total;

      if (tipo === 'dni') {
        const [rows] = await db.query(
          `SELECT dni, nombres, apellido_paterno, apellido_materno, nombre_completo,
                  codigo_verificacion, consultas, primera_consulta, ultima_consulta
             FROM cache_dni WHERE ${where}
            ORDER BY ultima_consulta DESC
            LIMIT ? OFFSET ?`,
          [...params, limite, offset]
        );
        dnis = rows;
      } else {
        const mitad = Math.floor(limite / 2);
        const [rows] = await db.query(
          `SELECT dni AS numero, 'dni' AS tipo, nombre_completo AS nombre,
                  NULL AS estado, consultas, ultima_consulta
             FROM cache_dni WHERE ${where}
            ORDER BY ultima_consulta DESC
            LIMIT ? OFFSET ?`,
          [...params, mitad, offset]
        );
        dnis = rows;
      }
    }

    /* ── Ensamblar respuesta ── */
    const total = tipo === 'ruc' ? totalRuc
                : tipo === 'dni' ? totalDni
                : totalRuc + totalDni;

    const registros = tipo === 'todos'
      ? [...rucs, ...dnis].sort((a, b) =>
          new Date(b.ultima_consulta) - new Date(a.ultima_consulta)
        )
      : tipo === 'ruc' ? rucs : dnis;

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