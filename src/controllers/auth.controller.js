const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Devuelve un JWT si las credenciales son correctas.
 */
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Email y password son requeridos' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });
    }

    const usuario = rows[0];
    const valido  = await bcrypt.compare(password, usuario.password);

    if (!valido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      ok: true,
      token,
      usuario: {
        id:     usuario.id,
        nombre: usuario.nombre,
        email:  usuario.email,
      },
    });

  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

/**
 * POST /api/auth/registro
 * Body: { nombre, email, password }
 * Crea un nuevo usuario.
 * (Puedes restringir esto solo a admins si lo necesitas)
 */
async function registro(req, res) {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ ok: false, mensaje: 'nombre, email y password son requeridos' });
  }

  if (password.length < 8) {
    return res.status(400).json({ ok: false, mensaje: 'El password debe tener al menos 8 caracteres' });
  }

  try {
    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length) {
      return res.status(409).json({ ok: false, mensaje: 'El email ya está registrado' });
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
      [nombre, email, hash]
    );

    return res.status(201).json({
      ok:  true,
      mensaje: 'Usuario creado correctamente',
      id:  result.insertId,
    });

  } catch (err) {
    console.error('registro error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

/**
 * GET /api/auth/perfil
 * Devuelve los datos del usuario autenticado.
 */
async function perfil(req, res) {
  res.json({ ok: true, usuario: req.usuario });
}

module.exports = { login, registro, perfil };
