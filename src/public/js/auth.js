/* ══════════════════════════════════════════════
   Inicio y cierre de sesión
══════════════════════════════════════════════ */
import { api, getToken, setToken, clearToken, onSesionExpirada } from './api.js';
import { $, setLoading, toast } from './ui.js';

const setEstado = (estado) => { document.body.dataset.auth = estado; };

function mostrarUsuario(usuario, emailRespaldo = '') {
  const nombre = usuario?.nombre || emailRespaldo || 'Usuario';
  $('userName').textContent = nombre;
  $('userAvatar').textContent = nombre.trim().charAt(0).toUpperCase();
}

function logout() {
  clearToken();
  setEstado('out');
  $('loginPass').value = '';
  $('loginEmail').focus();
}

/**
 * Configura el login y verifica el token guardado.
 * `alIngresar` se ejecuta cada vez que hay una sesión válida.
 */
export function initAuth(alIngresar) {
  onSesionExpirada(() => {
    logout();
    toast('Sesión expirada. Vuelve a ingresar.', 'error');
  });

  $('btnLogout').addEventListener('click', logout);

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPass').value;
    const errEl = $('loginError');
    errEl.textContent = '';

    if (!email || !password) { errEl.textContent = 'Completa todos los campos.'; return; }

    const btn = $('btnLogin');
    setLoading(btn, true, 'Ingresando…');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
      if (!d.ok) { errEl.textContent = d.mensaje || 'Credenciales inválidas.'; return; }

      setToken(d.token);
      mostrarUsuario(d.usuario, email);
      setEstado('in');
      alIngresar();
    } catch {
      errEl.textContent = 'Error de red. Intenta nuevamente.';
    } finally {
      setLoading(btn, false);
    }
  });

  // ¿Hay un token guardado y sigue vigente?
  if (!getToken()) { setEstado('out'); return; }

  api('/auth/perfil')
    .then((d) => {
      if (!d.ok) return logout();
      mostrarUsuario(d.usuario);
      setEstado('in');
      alIngresar();
    })
    .catch(() => { if (document.body.dataset.auth !== 'out') logout(); });
}
