/* ══════════════════════════════════════════════
   Pestaña: Carga masiva
   - Cada número conserva la línea del texto/archivo de donde salió.
   - El servidor envía cada resultado en cuanto lo tiene (NDJSON), así
     que el progreso y la tabla se actualizan en tiempo real.
══════════════════════════════════════════════ */
import { apiStream, SesionExpiradaError } from './api.js';
import { $, cell, esc, toast, descargar, filaEstado, activarSegmento } from './ui.js';

let tipo = 'ruc';
let filtro = 'todos';            // todos | ok | error
let resultado = null;            // { tipo, filas: [{ linea, numero, ok, fuente, datos, mensaje, reintentable }] }
let proceso = null;              // lote en curso: { objetivo, controller, inicio, esperaHasta, timer }

/** Texto de ejemplo del área de pegado según el tipo. */
const EJEMPLOS = {
  ruc:   ['20100070970', '10749697682', '20601138498'].join('\n'),
  dni:   ['74969768', '12345678', '01234567'].join('\n'),
  placa: ['ABC123', 'B7X-456', 'M2B789'].join('\n'),
};

const COLUMNAS = {
  ruc: {
    titulos: ['Razón social', 'Estado', 'Condición'],
    datos: (d) => [
      cell(d?.razon_social || d?.nombre_o_razon_social),
      cell(d?.estado_contribuyente || d?.estado),
      cell(d?.condicion_contribuyente || d?.condicion),
    ],
  },
  dni: {
    titulos: ['Nombres', 'Ap. paterno', 'Ap. materno'],
    datos: (d) => [cell(d?.nombres), cell(d?.apellido_paterno), cell(d?.apellido_materno)],
  },
  placa: {
    titulos: ['Vehículo', 'Año', 'Clase'],
    datos: (d) => [
      cell([d?.marca, d?.modelo].filter(Boolean).join(' ')),
      cell(d?.anio),
      cell(d?.clase_vehiculo),
    ],
  },
};

/* ── Utilidades ── */

/** Divide el texto en números, recordando el número de línea de cada uno. */
function parsear(texto) {
  const items = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    linea.split(/[,;\t ]+/).map((s) => s.trim()).filter(Boolean)
      .forEach((numero) => items.push({ numero, linea: i + 1 }));
  });
  return items;
}

const fmtDuracion = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

const estaPendiente = (f) => f.ok === null;
const esReintentable = (f) => f.ok === false && f.reintentable !== false;

function actualizarContador() {
  const n = parsear($('bulkTexto').value).length;
  $('bulkContador').textContent = `${n} número${n === 1 ? '' : 's'}`;
}

function leerArchivo(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    $('bulkTexto').value = e.target.result;
    actualizarContador();
    toast(`Archivo cargado: ${file.name}`);
  };
  reader.readAsText(file);
}

/* ── Render (con límite de frecuencia para lotes grandes) ── */

let renderProgramado = false;
function programarRender() {
  if (renderProgramado) return;
  renderProgramado = true;
  setTimeout(() => {
    renderProgramado = false;
    renderTodo();
  }, 150);
}

function renderTodo() {
  renderResumen();
  renderProgreso();
  renderTabla();
}

function renderResumen() {
  if (!resultado) return;
  const f = resultado.filas;
  const ok = f.filter((x) => x.ok === true).length;
  const err = f.filter((x) => x.ok === false).length;

  $('bulkResumen').hidden = false;
  $('resTot').textContent = f.length;
  $('resOk').textContent = ok;
  $('resErr').textContent = err;
  $('resCacheBulk').textContent = f.filter((x) => x.ok && x.fuente === 'cache').length;
  $('resApiBulk').textContent = f.filter((x) => x.ok && x.fuente === 'api').length;
  $('cntTodos').textContent = f.length;
  $('cntOk').textContent = ok;
  $('cntErr').textContent = err;

  const reintentables = f.filter(esReintentable).length;
  const btn = $('btnReintentar');
  btn.disabled = !!proceso || !reintentables;
  btn.querySelector('span').textContent = reintentables ? `Reintentar errores (${reintentables})` : 'Reintentar errores';
}

function renderProgreso() {
  if (!proceso) return;
  const { objetivo } = proceso;

  const total = objetivo.length;
  const ok = objetivo.filter((f) => f.ok === true).length;
  const err = objetivo.filter((f) => f.ok === false).length;
  const hechos = ok + err;
  const pct = total ? Math.floor((hechos / total) * 100) : 0;

  $('progHechos').textContent = hechos;
  $('progTotal').textContent = total;
  $('progFaltan').textContent = total - hechos;
  $('progPct').textContent = `${pct}%`;
  $('progBarra').setAttribute('aria-valuenow', pct);
  $('progFillOk').style.width = `${total ? (ok / total) * 100 : 0}%`;
  $('progFillErr').style.width = `${total ? (err / total) * 100 : 0}%`;
}

/** Reloj: tiempo transcurrido, estimado restante y espera por cupo de la API. */
function tick() {
  if (!proceso) return;
  const ahora = Date.now();
  const transcurrido = ahora - proceso.inicio;
  const total = proceso.objetivo.length;
  const hechos = proceso.objetivo.filter((f) => !estaPendiente(f)).length;

  const faltan = total - hechos;
  const espera = proceso.esperaHasta - ahora;

  // Estimado: ritmo observado; si el límite por minuto manda, se usa ese ritmo.
  let restante = hechos ? (transcurrido / hechos) * faltan : 0;
  if (proceso.rpm && (proceso.huboEspera || faltan > proceso.rpm)) {
    restante = Math.max(restante, (faltan / proceso.rpm) * 60_000, espera);
  }

  $('progTiempo').textContent = fmtDuracion(transcurrido);
  $('progEta').textContent = faltan && restante ? ` · ≈ ${fmtDuracion(restante)} restantes` : '';

  const estado = $('progEstado');
  if (espera > 0) {
    estado.className = 'progress-status waiting';
    estado.textContent = `Límite de ApiPeruDev alcanzado — se reanuda en ${fmtDuracion(espera)}`;
  } else {
    estado.className = 'progress-status';
    estado.innerHTML = `<span class="spinner"></span> ${hechos ? 'Consultando ApiPeruDev…' : 'Buscando en caché…'}`;
  }
}

function renderTabla() {
  if (!resultado) return;
  const cols = COLUMNAS[resultado.tipo];
  const totalCols = 3 + cols.titulos.length + 1;
  $('bulkTablaCard').hidden = false;

  $('bulkThead').innerHTML = `<tr>
    <th class="num">Línea</th>
    <th>${resultado.tipo.toUpperCase()}</th>
    <th class="center">Estado</th>
    ${cols.titulos.map((t) => `<th>${t}</th>`).join('')}
    <th>Fuente</th>
  </tr>`;

  const visibles = resultado.filas.filter((f) =>
    filtro === 'todos' || (filtro === 'ok' ? f.ok === true : f.ok === false));

  if (!visibles.length) {
    $('bulkTbody').innerHTML = filaEstado(totalCols,
      filtro === 'error' ? 'Ninguna línea tiene errores.' : 'Aún no hay líneas procesadas sin errores.');
    return;
  }

  $('bulkTbody').innerHTML = visibles.map((f) => {
    const inicio = `
      <td class="num linea">${f.linea}</td>
      <td><code>${esc(f.numero)}</code></td>`;

    if (estaPendiente(f)) {
      return `<tr class="row-pending">
        ${inicio}
        <td class="center"><span class="badge">En cola</span></td>
        <td colspan="${cols.titulos.length + 1}" class="muted">—</td>
      </tr>`;
    }
    if (!f.ok) {
      return `<tr class="row-error">
        ${inicio}
        <td class="center"><span class="badge badge-error">Error</span></td>
        <td colspan="${cols.titulos.length + 1}" class="wrap error-text">${esc(f.mensaje || 'Error desconocido')}</td>
      </tr>`;
    }
    return `<tr>
      ${inicio}
      <td class="center"><span class="badge badge-ok">OK</span></td>
      ${cols.datos(f.datos).map((c, i) => `<td${i === 0 ? ' class="wrap"' : ''}>${c}</td>`).join('')}
      <td><span class="badge badge-${f.fuente === 'cache' ? 'cache' : 'api'}">${esc(f.fuente)}</span></td>
    </tr>`;
  }).join('');
}

function setFiltro(nuevo) {
  filtro = nuevo;
  const segs = document.querySelectorAll('#bulkTablaCard [data-filtro]');
  activarSegmento(segs, [...segs].find((b) => b.dataset.filtro === nuevo));
  document.querySelectorAll('#bulkResumen [data-filtro]').forEach((b) =>
    b.classList.toggle('active', b.dataset.filtro === nuevo && nuevo !== 'todos'));
  renderTabla();
}

function setEnCurso(enCurso) {
  $('btnBulk').disabled = enCurso;
  $('btnBulkLimpiar').disabled = enCurso;
  document.querySelectorAll('[data-bulk-tipo]').forEach((b) => { b.disabled = enCurso; });
  $('btnDetener').hidden = !enCurso;
}

/* ── Proceso en vivo ── */

/**
 * Procesa las filas `objetivo` (todas o solo las que fallaron, al reintentar)
 * actualizando cada una a medida que llegan los resultados del servidor.
 */
async function ejecutar(objetivo) {
  objetivo.forEach((f) => Object.assign(f, { ok: null, fuente: undefined, datos: undefined, mensaje: undefined }));

  const card = $('bulkProgreso');
  card.hidden = false;
  card.className = 'card progress-card running';
  $('progTitulo').textContent = `Procesando ${objetivo.length} ${resultado.tipo.toUpperCase()}`;

  proceso = {
    objetivo,
    controller: new AbortController(),
    inicio: Date.now(),
    esperaHasta: 0,
  };
  proceso.timer = setInterval(tick, 500);
  setEnCurso(true);
  renderTodo();
  tick();

  let final = 'completo';
  let mensajeFinal = '';
  try {
    await apiStream(
      `/bulk/${resultado.tipo}/stream`,
      { numeros: objetivo.map((f) => f.numero) },
      (ev) => {
        switch (ev.evento) {
          case 'inicio':
            proceso.rpm = ev.rpm;
            break;
          case 'resultado': {
            const fila = objetivo[ev.i];
            if (fila) Object.assign(fila, ev.resultado);
            proceso.esperaHasta = 0;
            programarRender();
            break;
          }
          case 'espera':
            proceso.huboEspera = true;
            proceso.esperaHasta = Math.max(proceso.esperaHasta, Date.now() + ev.ms);
            tick();
            break;
          case 'error':
            final = 'error';
            mensajeFinal = ev.mensaje;
            break;
        }
      },
      proceso.controller.signal,
    );
  } catch (err) {
    if (err instanceof SesionExpiradaError) final = 'sesion';
    else if (err.name === 'AbortError') final = 'detenido';
    else { final = 'error'; mensajeFinal = err.message; }
  }

  // Lo que quedó sin respuesta se marca como error reintentable
  const motivo = final === 'detenido' ? 'No procesado: el lote se detuvo.' : 'No procesado: se perdió la conexión.';
  objetivo.filter(estaPendiente).forEach((f) =>
    Object.assign(f, { ok: false, reintentable: true, mensaje: mensajeFinal || motivo }));

  clearInterval(proceso.timer);
  const duracion = Date.now() - proceso.inicio;
  renderProgreso();
  proceso = null;
  setEnCurso(false);
  renderResumen();
  renderTabla();

  const ok = objetivo.filter((f) => f.ok).length;
  const err = objetivo.length - ok;
  const estado = $('progEstado');
  estado.className = 'progress-status';
  $('progEta').textContent = '';
  $('progTiempo').textContent = fmtDuracion(duracion);

  if (final === 'completo' && !mensajeFinal) {
    card.className = 'card progress-card done';
    $('progTitulo').textContent = 'Lote completado';
    estado.textContent = `${ok} sin errores · ${err} con errores · en ${fmtDuracion(duracion)}`;
    toast(err ? `${ok} sin errores, ${err} con errores.` : `${ok} procesados sin errores.`, err ? 'error' : 'success');
  } else {
    card.className = 'card progress-card stopped';
    $('progTitulo').textContent = final === 'detenido' ? 'Lote detenido' : 'Lote interrumpido';
    estado.textContent = `${ok} sin errores · ${err} pendientes o con errores. Puedes reintentarlos.`;
    if (final === 'error') toast(mensajeFinal || 'Error al procesar el lote', 'error');
  }
}

async function procesar() {
  if (proceso) return;
  const items = parsear($('bulkTexto').value);
  if (!items.length) { toast('Ingresa al menos un número.', 'error'); return; }

  resultado = { tipo, filas: items.map((it) => ({ ...it, ok: null })) };
  setFiltro('todos');
  await ejecutar(resultado.filas);
}

async function reintentarErrores() {
  if (proceso || !resultado) return;
  const objetivo = resultado.filas.filter(esReintentable);
  if (!objetivo.length) return;
  setFiltro('todos');
  await ejecutar(objetivo);
}

async function copiarErrores() {
  const conError = resultado?.filas.filter((f) => f.ok === false) ?? [];
  if (!conError.length) { toast('No hay números con error.'); return; }
  try {
    await navigator.clipboard.writeText(conError.map((f) => f.numero).join('\n'));
    toast(`${conError.length} número(s) con error copiados.`);
  } catch {
    toast('No se pudo copiar', 'error');
  }
}

export function initBulk() {
  document.querySelectorAll('[data-bulk-tipo]').forEach((b) =>
    b.addEventListener('click', () => {
      tipo = b.dataset.bulkTipo;
      activarSegmento(document.querySelectorAll('[data-bulk-tipo]'), b);
      $('bulkTexto').placeholder = EJEMPLOS[tipo];
    }));

  $('bulkTexto').addEventListener('input', actualizarContador);
  $('bulkArchivo').addEventListener('change', (e) => { leerArchivo(e.target.files[0]); e.target.value = ''; });

  // Arrastrar y soltar
  const zona = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove('over')));
  zona.addEventListener('drop', (e) => { e.preventDefault(); leerArchivo(e.dataTransfer.files[0]); });

  $('btnBulkLimpiar').addEventListener('click', () => {
    $('bulkTexto').value = '';
    actualizarContador();
  });

  $('btnBulk').addEventListener('click', procesar);
  $('btnDetener').addEventListener('click', () => proceso?.controller.abort());
  $('btnReintentar').addEventListener('click', reintentarErrores);

  // Filtros: los botones del detalle y las tarjetas del resumen
  document.querySelectorAll('[data-filtro]').forEach((b) =>
    b.addEventListener('click', () => setFiltro(b.dataset.filtro)));

  $('btnCopiarErrores').addEventListener('click', copiarErrores);

  $('btnExportarBulk').addEventListener('click', () => {
    if (!resultado) return;
    descargar(JSON.stringify(resultado, null, 2),
      `bulk_${resultado.tipo}_${Date.now()}.json`, 'application/json');
  });

  // Avisar si se intenta salir con un lote en curso
  window.addEventListener('beforeunload', (e) => { if (proceso) e.preventDefault(); });
}
