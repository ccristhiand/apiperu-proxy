/* ══════════════════════════════════════════════
   Pestaña: Consulta individual (RUC / DNI / Placa)
══════════════════════════════════════════════ */
import { api, SesionExpiradaError } from './api.js';
import { $, esc, icon, setLoading, toast, activarSegmento } from './ui.js';

const TIPOS = {
  ruc: {
    maxLength: 11, placeholder: '20100070970', hint: 'RUC de 11 dígitos',
    limpiar: (v) => v.replace(/\D/g, ''),
    valido: (v) => /^\d{11}$/.test(v), error: 'El RUC debe tener 11 dígitos.',
    modo: 'numeric', icono: 'building',
  },
  dni: {
    maxLength: 8, placeholder: '74969768', hint: 'DNI de 8 dígitos',
    limpiar: (v) => v.replace(/\D/g, ''),
    valido: (v) => /^\d{8}$/.test(v), error: 'El DNI debe tener 8 dígitos.',
    modo: 'numeric', icono: 'user',
  },
  placa: {
    maxLength: 7, placeholder: 'ABC123', hint: 'Placa de 6 o 7 letras y números, sin guion · consume 2 consultas del plan',
    limpiar: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    valido: (v) => /^[A-Z0-9]{6,7}$/.test(v), error: 'La placa debe tener 6 o 7 letras y números.',
    modo: 'text', icono: 'car',
  },
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
  placa: 'Placa', marca: 'Marca', modelo: 'Modelo', anio: 'Año',
  tipo_vehiculo: 'Tipo de vehículo', clase_vehiculo: 'Clase', numero_asientos: 'N° de asientos',
  vin: 'VIN', categoria_mtc: 'Categoría MTC',
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
  input.maxLength = cfg.maxLength;
  input.inputMode = cfg.modo;
  input.value = cfg.limpiar(input.value).slice(0, cfg.maxLength);
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
  const nombre = datos.razon_social || datos.nombre_o_razon_social || datos.nombre_completo
    || [datos.marca, datos.modelo, datos.anio].filter(Boolean).join(' ') || '—';
  const id = datos.ruc || datos.dni || datos.placa || '';

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
      <span class="hero-icon">${icon(TIPOS[tipo].icono)}</span>
      <div>
        <div class="hero-name">${esc(nombre)}</div>
        <div class="hero-id">${esc(tipo.toUpperCase())} ${esc(id)}</div>
      </div>
    </div>
    <div class="data-grid">${items}</div>`;
}

async function consultar(e) {
  e.preventDefault();
  const cfg = TIPOS[tipo];
  const num = cfg.limpiar($('inputNumero').value);

  if (!num) return;
  if (!cfg.valido(num)) {
    toast(cfg.error, 'error');
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

  // Solo los caracteres válidos para el tipo elegido (dígitos, o letras y números en placas)
  $('inputNumero').addEventListener('input', (e) => {
    e.target.value = TIPOS[tipo].limpiar(e.target.value);
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
