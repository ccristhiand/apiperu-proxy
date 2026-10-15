/* ══════════════════════════════════════════════
   Pestaña: Listado de registros en caché
══════════════════════════════════════════════ */
import { api, apiDescarga, SesionExpiradaError } from './api.js';
import { $, cell, esc, icon, fmtDate, toast, filaEstado, setLoading } from './ui.js';

let pagina = 1;
let debounceTimer;

/** Columnas por tipo: [título, función que arma la celda, clase opcional] */
const COLUMNAS = {
  ruc: [
    ['RUC', (r) => `<code>${esc(r.ruc)}</code>`],
    ['Razón social', (r) => cell(r.razon_social), 'wrap'],
    ['Estado', (r) => cell(r.estado_contribuyente)],
    ['Condición', (r) => cell(r.condicion_contribuyente)],
    ['Departamento', (r) => cell(r.departamento)],
    ['Consultas', (r) => cell(r.consultas), 'num'],
    ['Última consulta', (r) => fmtDate(r.ultima_consulta)],
  ],
  dni: [
    ['DNI', (r) => `<code>${esc(r.dni)}</code>`],
    ['Nombre completo', (r) => cell(r.nombre_completo), 'wrap'],
    ['Nombres', (r) => cell(r.nombres)],
    ['Ap. paterno', (r) => cell(r.apellido_paterno)],
    ['Ap. materno', (r) => cell(r.apellido_materno)],
    ['Consultas', (r) => cell(r.consultas), 'num'],
    ['Última consulta', (r) => fmtDate(r.ultima_consulta)],
  ],
  placa: [
    ['Placa', (r) => `<code>${esc(r.placa)}</code>`],
    ['Marca', (r) => cell(r.marca)],
    ['Modelo', (r) => cell(r.modelo), 'wrap'],
    ['Año', (r) => cell(r.anio), 'num'],
    ['Clase', (r) => cell(r.clase_vehiculo)],
    ['Consultas', (r) => cell(r.consultas), 'num'],
    ['Última consulta', (r) => fmtDate(r.ultima_consulta)],
  ],
  todos: [
    ['Número', (r) => `<code>${esc(r.numero)}</code>`],
    ['Tipo', (r) => `<span class="badge badge-tipo-${esc(r.tipo)}">${esc(String(r.tipo).toUpperCase())}</span>`],
    ['Nombre / Vehículo', (r) => cell(r.nombre), 'wrap'],
    ['Estado / Clase', (r) => cell(r.estado)],
    ['Consultas', (r) => cell(r.consultas), 'num'],
    ['Última consulta', (r) => fmtDate(r.ultima_consulta)],
  ],
};

const filtros = () => ({
  tipo: $('lstTipo').value,
  q: $('lstQ').value.trim(),
  limite: $('lstLimite').value,
});

function renderCabecera(cols) {
  $('lstThead').innerHTML = `<tr>${cols.map(([t, , cls]) =>
    `<th${cls === 'num' ? ' class="num"' : ''}>${t}</th>`).join('')}</tr>`;
}

function renderPaginacion(pag) {
  const total = pag.paginas || 1;
  const actual = pag.pagina;
  if (total <= 1) { $('lstPaginacion').innerHTML = ''; return; }

  const boton = (p, contenido, { activo = false, deshabilitado = false, label = '' } = {}) =>
    `<button class="page-btn${activo ? ' active' : ''}" data-page="${p}"
      ${deshabilitado ? 'disabled' : ''} ${label ? `aria-label="${label}"` : ''}
      ${activo ? 'aria-current="page"' : ''}>${contenido}</button>`;

  let html = boton(actual - 1, icon('chevron-left'), { deshabilitado: actual <= 1, label: 'Anterior' });
  const desde = Math.max(1, actual - 2);
  const hasta = Math.min(total, actual + 2);
  for (let i = desde; i <= hasta; i++) html += boton(i, i, { activo: i === actual });
  html += boton(actual + 1, icon('chevron-right'), { deshabilitado: actual >= total, label: 'Siguiente' });

  $('lstPaginacion').innerHTML = html;
}

export async function cargarListado(nuevaPagina = pagina) {
  pagina = nuevaPagina;
  const { tipo, q, limite } = filtros();
  const cols = COLUMNAS[tipo];

  renderCabecera(cols);
  $('lstTbody').innerHTML = filaEstado(cols.length, 'Cargando…', 'cargando');

  const params = new URLSearchParams({ tipo, pagina, limite });
  if (q) params.set('q', q);

  try {
    const d = await api(`/listado?${params}`);
    if (!d.ok) { toast(d.mensaje, 'error'); return; }

    const { registros, paginacion } = d;
    $('lstEstado').textContent =
      `${paginacion.total} registro(s) · Página ${paginacion.pagina} de ${paginacion.paginas || 1}`;

    $('lstTbody').innerHTML = registros.length
      ? registros.map((r) => `<tr>${cols.map(([, fn, cls]) =>
          `<td${cls ? ` class="${cls}"` : ''}>${fn(r)}</td>`).join('')}</tr>`).join('')
      : filaEstado(cols.length, q ? 'Sin resultados para esa búsqueda.' : 'Sin registros.');

    renderPaginacion(paginacion);
  } catch (err) {
    if (!(err instanceof SesionExpiradaError)) toast('Error al cargar listado', 'error');
  }
}

/** Descarga en Excel todos los registros que coinciden con el filtro (sin paginar). */
async function exportarExcel() {
  const { tipo, q } = filtros();
  const params = new URLSearchParams({ tipo });
  if (q) params.set('q', q);

  const btn = $('btnExportarListado');
  setLoading(btn, true, 'Generando…');
  try {
    const { blob, nombre, total } = await apiDescarga(`/listado/exportar?${params}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Excel generado con ${total} registro(s).`);
  } catch (err) {
    if (!(err instanceof SesionExpiradaError)) toast(err.message || 'Error al exportar', 'error');
  } finally {
    setLoading(btn, false);
  }
}

export function initListado() {
  $('lstTipo').addEventListener('change', () => cargarListado(1));
  $('lstLimite').addEventListener('change', () => cargarListado(1));
  $('lstQ').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => cargarListado(1), 400);
  });

  $('lstPaginacion').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (btn && !btn.disabled) cargarListado(Number(btn.dataset.page));
  });

  $('btnExportarListado').addEventListener('click', exportarExcel);
}
