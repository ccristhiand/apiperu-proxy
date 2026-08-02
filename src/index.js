require('dotenv').config();

const path       = require('path');
const express    = require('express');
const rateLimit  = require('express-rate-limit');
const routes     = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ─────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting: máx 100 peticiones por IP cada 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, mensaje: 'Demasiadas peticiones. Intenta de nuevo en 15 minutos.' },
});
app.use(limiter);

// Trust proxy si está detrás de nginx
app.set('trust proxy', 1);

// ── Vista estática ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Rutas ────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 handler ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada' });
});

// ── Error handler global ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
});

// ── Arrancar servidor ────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
});