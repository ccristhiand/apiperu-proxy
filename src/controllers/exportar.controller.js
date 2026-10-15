const ExcelJS = require('exceljs');
const db      = require('../config/db');

/* Columnas fijas de cada hoja. Después de estas se agregan, como columnas
   extra, los demás campos que ApiPeruDev devolvió (guardados en datos_extra). */
const HOJAS = {
  ruc: {
    nombre: 'RUC',
    tabla:  'cache_ruc',
    buscar: '(ruc LIKE ? OR razon_social LIKE ?)',
    columnas: [
      { header: 'RUC',              key: 'ruc',                     width: 14, texto: true },
      { header: 'Razón social',     key: 'razon_social',            width: 45 },
      { header: 'Estado',           key: 'estado_contribuyente',    width: 12 },
      { header: 'Condición',        key: 'condicion_contribuyente', width: 14 },
      { header: 'Departamento',     key: 'departamento',            width: 16 },
      { header: 'Provincia',        key: 'provincia',               width: 16 },
      { header: 'Distrito',         key: 'distrito',                width: 20 },
      { header: 'Dirección',        key: 'direccion',               width: 55 },
      { header: 'Consultas',        key: 'consultas',               width: 11 },
      { header: 'Primera consulta', key: 'primera_consulta',        width: 18, fecha: true },
      { header: 'Última consulta',  key: 'ultima_consulta',         width: 18, fecha: true },
    ],
    // Campos de datos_extra que ya están en las columnas fijas
    omitirExtra: ['ruc', 'nombre_o_razon_social', 'estado', 'condicion',
                  'departamento', 'provincia', 'distrito', 'direccion', 'direccion_completa'],
  },
  dni: {
    nombre: 'DNI',
    tabla:  'cache_dni',
    buscar: '(dni LIKE ? OR nombres LIKE ? OR apellido_paterno LIKE ? OR apellido_materno LIKE ?)',
    columnas: [
      { header: 'DNI',                    key: 'dni',                 width: 11, texto: true },
      { header: 'Nombre completo',        key: 'nombre_completo',     width: 40 },
      { header: 'Nombres',                key: 'nombres',             width: 24 },
      { header: 'Apellido paterno',       key: 'apellido_paterno',    width: 20 },
      { header: 'Apellido materno',       key: 'apellido_materno',    width: 20 },
      { header: 'Código verificación',    key: 'codigo_verificacion', width: 12 },
      { header: 'Consultas',              key: 'consultas',           width: 11 },
      { header: 'Primera consulta',       key: 'primera_consulta',    width: 18, fecha: true },
      { header: 'Última consulta',        key: 'ultima_consulta',     width: 18, fecha: true },
    ],
    omitirExtra: ['numero', 'dni', 'nombres', 'apellido_paterno', 'apellido_materno',
                  'codigo_verificacion', 'nombre_completo'],
  },
  placa: {
    nombre: 'Placas',
    tabla:  'cache_placa',
    buscar: '(placa LIKE ? OR marca LIKE ? OR modelo LIKE ?)',
    columnas: [
      { header: 'Placa',            key: 'placa',           width: 10, texto: true },
      { header: 'Marca',            key: 'marca',           width: 18 },
      { header: 'Modelo',           key: 'modelo',          width: 24 },
      { header: 'Año',              key: 'anio',            width: 8 },
      { header: 'Tipo de vehículo', key: 'tipo_vehiculo',   width: 20 },
      { header: 'Clase',            key: 'clase_vehiculo',  width: 20 },
      { header: 'N° asientos',      key: 'numero_asientos', width: 11 },
      { header: 'VIN',              key: 'vin',             width: 22, texto: true },
      { header: 'Categoría MTC',    key: 'categoria_mtc',   width: 14 },
      { header: 'Consultas',        key: 'consultas',       width: 11 },
      { header: 'Primera consulta', key: 'primera_consulta', width: 18, fecha: true },
      { header: 'Última consulta',  key: 'ultima_consulta',  width: 18, fecha: true },
    ],
    omitirExtra: ['placa', 'marca', 'modelo', 'anio', 'tipo_vehiculo', 'clase_vehiculo',
                  'numero_asientos', 'vin', 'categoria_mtc'],
  },
};

/* Columnas comunes de cada tipo para la hoja "Todos". */
const RESUMEN = {
  ruc:   { hoja: HOJAS.ruc,   select: `ruc AS numero, 'RUC' AS tipo, razon_social AS nombre, estado_contribuyente AS estado` },
  dni:   { hoja: HOJAS.dni,   select: `dni AS numero, 'DNI' AS tipo, nombre_completo AS nombre, NULL AS estado` },
  placa: { hoja: HOJAS.placa, select: `placa AS numero, 'Placa' AS tipo, CONCAT_WS(' ', marca, modelo, anio) AS nombre, clase_vehiculo AS estado` },
};

/* Excel no guarda zona horaria: se escribe la hora de Lima (UTC-5, sin horario
   de verano) para que se vea igual que en el sistema. */
const OFFSET_LIMA_MS = 5 * 60 * 60 * 1000;
const aHoraLima = (fecha) => new Date(new Date(fecha).getTime() - OFFSET_LIMA_MS);

const etiqueta = (clave) => clave.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function parsearExtra(valor) {
  if (!valor) return {};
  if (typeof valor === 'object') return valor;    // mysql2 ya parseó el JSON
  try { return JSON.parse(valor); } catch { return {}; }
}

/** Valor apto para una celda: listas/objetos como texto JSON. */
function valorCelda(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Da formato al encabezado (fila 1) y activa los filtros de columna. */
function estilizarEncabezado(hoja) {
  const encabezado = hoja.getRow(1);
  encabezado.height = 22;
  encabezado.eachCell((celda) => {
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B4FF5' } };
    celda.alignment = { vertical: 'middle' };
  });
  if (hoja.columnCount) {
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
  }
}

/** WHERE de búsqueda de una hoja y sus parámetros. */
function filtro(cfg, q) {
  if (!q) return { where: '1=1', params: [] };
  const n = (cfg.buscar.match(/\?/g) || []).length;
  return { where: cfg.buscar, params: Array(n).fill(`%${q}%`) };
}

/**
 * Hoja "Todos": RUC, DNI y placas juntos con las columnas comunes (igual que
 * la vista "Todos" de la pantalla). Va primero para que se vea la data
 * completa al abrir el archivo.
 */
async function agregarHojaTodos(libro, q) {
  const partes = Object.values(RESUMEN).map((r) => ({ ...r, ...filtro(r.hoja, q) }));
  const [filas] = await db.query(
    `${partes.map((p) => `(SELECT ${p.select}, consultas, primera_consulta, ultima_consulta
                             FROM ${p.hoja.tabla} WHERE ${p.where})`).join(' UNION ALL ')}
     ORDER BY ultima_consulta DESC`,
    partes.flatMap((p) => p.params)
  );

  const hoja = libro.addWorksheet('Todos', { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = [
    { header: 'Número',           key: 'numero',           width: 14 },
    { header: 'Tipo',             key: 'tipo',             width: 8 },
    { header: 'Nombre / Razón social / Vehículo', key: 'nombre', width: 45 },
    { header: 'Estado',           key: 'estado',           width: 12 },
    { header: 'Consultas',        key: 'consultas',        width: 11 },
    { header: 'Primera consulta', key: 'primera_consulta', width: 18 },
    { header: 'Última consulta',  key: 'ultima_consulta',  width: 18 },
  ];
  for (const f of filas) {
    hoja.addRow({
      ...f,
      numero: String(f.numero ?? ''),
      primera_consulta: f.primera_consulta ? aHoraLima(f.primera_consulta) : null,
      ultima_consulta:  f.ultima_consulta  ? aHoraLima(f.ultima_consulta)  : null,
    });
  }
  hoja.getColumn(1).numFmt = '@';
  hoja.getColumn(6).numFmt = 'dd/mm/yyyy hh:mm';
  hoja.getColumn(7).numFmt = 'dd/mm/yyyy hh:mm';
  estilizarEncabezado(hoja);
  return filas.length;
}

async function agregarHoja(libro, cfg, q) {
  const { where, params } = filtro(cfg, q);

  const [filas] = await db.query(
    `SELECT * FROM ${cfg.tabla} WHERE ${where} ORDER BY ultima_consulta DESC`, params
  );

  // Columnas extra: todas las claves de datos_extra que no estén ya cubiertas
  const extras = new Set();
  for (const f of filas) {
    f._extra = parsearExtra(f.datos_extra);
    Object.keys(f._extra).forEach((k) => { if (!cfg.omitirExtra.includes(k)) extras.add(k); });
  }

  const hoja = libro.addWorksheet(cfg.nombre, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  hoja.columns = [
    ...cfg.columnas.map(({ header, key, width }) => ({ header, key, width })),
    ...[...extras].map((k) => ({ header: etiqueta(k), key: `extra_${k}`, width: 20 })),
  ];

  for (const f of filas) {
    const fila = {};
    for (const c of cfg.columnas) {
      const v = f[c.key];
      fila[c.key] = c.texto ? String(v ?? '') : (c.fecha && v ? aHoraLima(v) : valorCelda(v));
    }
    for (const k of extras) fila[`extra_${k}`] = valorCelda(f._extra[k]);
    hoja.addRow(fila);
  }

  // Formatos: RUC/DNI como texto (conserva ceros a la izquierda), fechas legibles
  cfg.columnas.forEach((c, i) => {
    const col = hoja.getColumn(i + 1);
    if (c.texto) col.numFmt = '@';
    if (c.fecha) col.numFmt = 'dd/mm/yyyy hh:mm';
  });

  estilizarEncabezado(hoja);
  return filas.length;
}

/**
 * GET /api/listado/exportar?tipo=todos|ruc|dni|placa&q=texto
 * Descarga un Excel con TODOS los registros que coinciden con el filtro
 * (sin paginación). Con tipo=todos la primera hoja "Todos" junta RUC, DNI y placas,
 * seguida de una hoja de detalle para cada tipo.
 */
async function exportarExcel(req, res) {
  const tipo = HOJAS[req.query.tipo] ? req.query.tipo : 'todos';
  const q    = (req.query.q || '').trim();

  try {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'ApiPeru Proxy';
    libro.created = new Date();

    let total = 0;
    if (tipo === 'todos') {
      // Primero la hoja con todo junto; luego el detalle completo de cada tipo
      total = await agregarHojaTodos(libro, q);
      for (const cfg of Object.values(HOJAS)) await agregarHoja(libro, cfg, q);
    } else {
      total = await agregarHoja(libro, HOJAS[tipo], q);
    }

    const sello = aHoraLima(Date.now()).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="registros_${tipo}_${sello}.xlsx"`);
    res.setHeader('X-Total-Registros', String(total));

    await libro.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar Excel:', err);
    if (!res.headersSent) res.status(500).json({ ok: false, mensaje: 'Error al generar el Excel.' });
    else res.end();
  }
}

module.exports = { exportarExcel };
