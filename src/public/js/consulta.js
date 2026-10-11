/* ══════════════════════════════════════════════
   Pestaña: Consulta individual (RUC / DNI)
══════════════════════════════════════════════ */
import { api, SesionExpiradaError } from './api.js';
import { $, esc, icon, setLoading, toast, activarSegmento } from './ui.js';

const TIPOS = {
  ruc: { largo: 11, placeholder: '20100070970', hint: 'RUC de 11 dígitos' },
  dni: { largo: 8,  placeholder: '74969768',    hint: 'DNI de 8 dígitos' },
};

/** Etiquetas legibles para las claves que devuelve la API. */
const ETIQUETAS = {
  ruc: 'RUC', dni: 'DNI',
  razon_social: 'Razón social', nombre_o_razon_social: 'Razón social',
  estado_contribuyente: 'Estado', condicion_contribuyente: 'Condición',
  estado: 'Estado', condicion: 'Condición',
  direccion: 'Dirección', direccion_completa: 'Dirección completa',
  departamento: 'Departamento', provincia: 'Provincia', distrito: 'Distrito', ubigeo: 'Ubigeo',
  nombres: 'Nombres', apellido_paterno: 'Apellido paterno', apellido_materno: 'Apellido materno',
  nombre_completo: 'Nombre completo', codigo_verificacion: 'Código de verificación',
};

const CAMPOS_ANCHOS = new Set(['direccion', 'direccion_completa']);

let tipo = 'ruc';
let ultimoJson = '';

const etiqueta = (clave) =>
  ETIQUETAS[clave] ?? clave.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function badgeEstado(clave, valor) {
  const v = String(valor).toUpperCase();
  if (clave.startsWith('estado'))    return `<span class="badge ${v === 'ACTIVO' ? 'badge-ok' : 'badge-warning'}">${esc(valor)}</span>`;
  if (clave.startsWith('condicion')) return `<span class="badge ${v === 'HABIDO' ? 'badge-ok' : 'badge-warning'}">${esc(valor)}</span>`;
  return null;
}

function setTipo(nuevo, boton) {
  tipo = nuevo;
  const cfg = TIPOS[tipo];
  const input = $('inputNumero');
  activarSegmento(document.querySelectorAll('[data-tipo]'), boton);
  input.placeholder = cfg.placeholder;
  input.maxLength = cfg.largo;
  input.value = input.value.slice(0, cfg.largo);
  $('hintNumero').textContent = cfg.hint;
  $('resultCard').hidden = true;
  input.focus();
}

function renderResultado(d) {
  const body = $('resultBody');
  const json = $('resultJson');
  $('resultCard').hidden = false;
  json.hidden = true;
  $('btnToggleJson').querySelector('span').textContent = 'Ver JSON';

  if (!d.ok) {
    ultimoJson = JSON.stringify(d, null, 2);
    $('badgeFuente').innerHTML = '';
    body.innerHTML = `<div class="result-error">${icon('alert')}<span>${esc(d.mensaje || 'Error en la consulta.')}</span></div>`;
    json.textContent = ultimoJson;
    return;
  }

  const { fuente, ...resto } = d;
  ultimoJson = JSON.stringify(resto, null, 2);
  json.textContent = ultimoJson;

  $('badgeFuente').innerHTML = fuente === 'cache'
    ? `<span class="badge badge-cache">${icon('database')} Caché</span>`
    : `<span class="badge badge-api">${icon('globe')} API</span>`;

  const datos = d.datos || {};
  const nombre = datos.razon_social || datos.nombre_o_razon_social || datos.nombre_completo || '—';
  const id = datos.ruc || datos.dni || '';

  const items = Object.entries(datos).map(([clave, valor]) => {
    const vacio = valor === null || valor === undefined || valor === '';
    const texto = typeof valor === 'object' && !vacio ? JSON.stringify(valor) : valor;
    const contenido = vacio ? '—' : (badgeEstado(clave, texto) ?? esc(texto));
    return `<div class="data-item${CAMPOS_ANCHOS.has(clave) ? ' wide' : ''}">
      <div class="data-label">${esc(etiqueta(clave))}</div>
      <div class="data-value${vacio ? ' empty' : ''}">${contenido}</div>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="result-hero">
      <span class="hero-icon">${icon(tipo === 'ruc' ? 'building' : 'user')}</span>
      <div>
        <div class="hero-name">${esc(nombre)}</div>
        <div class="hero-id">${esc(tipo.toUpperCase())} ${esc(id)}</div>
      </div>
    </div>
    <div class="data-grid">${items}</div>`;
}

async function consultar(e) {
  e.preventDefault();
  const num = $('inputNumero').value.trim();
  const { largo } = TIPOS[tipo];

  if (!num) return;
  if (num.length !== largo) {
    toast(`El ${tipo.toUpperCase()} debe tener ${largo} dígitos.`, 'error');
    return;
  }

  const btn = $('btnConsultar');
  setLoading(btn, true);
  try {
    renderResultado(await api(`/${tipo}/${encodeURIComponent(num)}`));
  } catch (err) {
    if (!(err instanceof SesionExpiradaError)) toast('Error de red', 'error');
  } finally {
    setLoading(btn, false);
  }
}

export function initConsulta() {
  document.querySelectorAll('[data-tipo]').forEach((b) =>
    b.addEventListener('click', () => setTipo(b.dataset.tipo, b)));

  // Solo dígitos
  $('inputNumero').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  $('consultaForm').addEventListener('submit', consultar);

  $('btnToggleJson').addEventListener('click', (e) => {
    const json = $('resultJson');
    json.hidden = !json.hidden;
    $('resultBody').hidden = !json.hidden;
    e.currentTarget.querySelector('span').textContent = json.hidden ? 'Ver JSON' : 'Ver ficha';
  });

  $('btnCopiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ultimoJson);
      toast('JSON copiado al portapapeles');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  });
}
