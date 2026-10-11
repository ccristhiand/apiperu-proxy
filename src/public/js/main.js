/* ══════════════════════════════════════════════
   Punto de entrada: pestañas, tema y arranque
══════════════════════════════════════════════ */
import { $ } from './ui.js';
import { initAuth } from './auth.js';
import { initConsulta } from './consulta.js';
import { initBulk } from './bulk.js';
import { initListado, cargarListado } from './listado.js';

/* ── Pestañas ── */
function showTab(nombre) {
  document.querySelectorAll('.tab').forEach((t) => {
    const activo = t.dataset.tab === nombre;
    t.classList.toggle('active', activo);
    t.setAttribute('aria-selected', String(activo));
  });
  document.querySelectorAll('.panel').forEach((p) =>
    p.classList.toggle('active', p.id === `panel-${nombre}`));

  if (nombre === 'listado') cargarListado();
}

/* ── Tema claro / oscuro (se recuerda en localStorage) ── */
function toggleTema() {
  const root = document.documentElement;
  const oscuroActual = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const nuevo = oscuroActual ? 'light' : 'dark';
  root.dataset.theme = nuevo;
  try { localStorage.setItem('tema', nuevo); } catch { /* sin almacenamiento */ }
}

document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => showTab(t.dataset.tab)));
$('btnTheme').addEventListener('click', toggleTema);

initConsulta();
initBulk();
initListado();
initAuth(() => cargarListado(1));
