/* ══════════════════════════════════════════════
   Utilidades de interfaz compartidas
══════════════════════════════════════════════ */

export const $ = (id) => document.getElementById(id);

/** Escapa texto antes de insertarlo con innerHTML (evita inyectar HTML). */
export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Icono del sprite SVG definido en index.html. */
export const icon = (nombre, clase = '') =>
  `<svg class="icon ${clase}"><use href="#i-${nombre}"/></svg>`;

export function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Valor para una celda: escapado, o guion si está vacío. */
export const cell = (v) => (v === null || v === undefined || v === '' ? '—' : esc(v));


/* ── Botón con estado de carga ── */
export function setLoading(btn, cargando, texto = '') {
  if (cargando) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${texto ? ` ${esc(texto)}` : ''}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
  }
}

/* ── Notificaciones ── */
let toastTimer;
export function toast(mensaje, tipo = 'success') {
  const el = $('toast');
  el.innerHTML = `${icon(tipo === 'error' ? 'alert' : 'check')}<span>${esc(mensaje)}</span>`;
  el.className = `toast show ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}

/* ── Estado de tabla (cargando / vacío) ── */
export function filaEstado(colspan, mensaje, tipo = 'vacio') {
  const visual = tipo === 'cargando' ? '<span class="spinner"></span>' : icon('inbox');
  return `<tr class="table-state"><td colspan="${colspan}">
    <span class="state">${visual}<span>${esc(mensaje)}</span></span>
  </td></tr>`;
}

/* ── Descargas ── */
export function descargar(contenido, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Selector segmentado (RUC / DNI) ── */
export function activarSegmento(botones, activo) {
  botones.forEach((b) => {
    const on = b === activo;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  });
}
