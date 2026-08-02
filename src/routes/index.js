const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');

const authCtrl   = require('../controllers/auth.controller');
const rucCtrl    = require('../controllers/ruc.controller');
const dniCtrl    = require('../controllers/dni.controller');

// ── Auth (pública) ──────────────────────────────────────────
router.post('/auth/login',    authCtrl.login);
router.post('/auth/registro', authCtrl.registro);
router.get ('/auth/perfil',   auth, authCtrl.perfil);

// ── Consultas (protegidas con JWT) ──────────────────────────
router.get('/ruc/:ruc', auth, rucCtrl.consultarRuc);
router.get('/dni/:dni', auth, dniCtrl.consultarDni);

// ── Health check ─────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true, mensaje: 'API funcionando' }));

module.exports = router;
