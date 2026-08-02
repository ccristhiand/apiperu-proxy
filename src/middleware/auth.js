const jwt = require('jsonwebtoken');
const db  = require('../config/db');

/**
 * Middleware que verifica el Bearer token JWT.
 * Adjunta req.usuario con los datos del usuario autenticado.
 */
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok:      false,
        mensaje: 'Token no proporcionado. Usa: Authorization: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        ok:      false,
        mensaje: e.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido',
      });
    }

    // Verificar que el usuario sigue activo en BD
    const [rows] = await db.query(
      'SELECT id, nombre, email, activo FROM usuarios WHERE id = ?',
      [payload.id]
    );

    if (!rows.length || !rows[0].activo) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario inactivo o no encontrado' });
    }

    req.usuario = rows[0];
    next();

  } catch (err) {
    console.error('authMiddleware error:', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno de autenticación' });
  }
}

module.exports = authMiddleware;
