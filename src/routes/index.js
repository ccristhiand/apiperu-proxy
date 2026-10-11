const express      = require('express');
const router       = express.Router();

const authCtrl     = require('../controllers/auth.controller');
const rucCtrl      = require('../controllers/ruc.controller');
const dniCtrl      = require('../controllers/dni.controller');
const bulkCtrl     = require('../controllers/bulk.controller');
const listadoCtrl  = require('../controllers/listado.controller');
const auth         = require('../middlewares/auth.middleware');

// ── Auth ──────────────────────────────────────────────────────
router.post('/auth/login',    authCtrl.login);
router.post('/auth/registro', authCtrl.registro);
router.get ('/auth/perfil',   auth, authCtrl.perfil);

// ── Consulta individual ───────────────────────────────────────
router.get('/ruc/:ruc', auth, rucCtrl.consultarRuc);
router.get('/dni/:dni', auth, dniCtrl.consultarDni);

// ── Carga masiva ──────────────────────────────────────────────
router.post('/bulk/ruc', auth, bulkCtrl.bulkRuc);
router.post('/bulk/dni', auth, bulkCtrl.bulkDni);

// ── Listado de registros cacheados ────────────────────────────
router.get('/listado', auth, listadoCtrl.listado);

// ── Health check ──────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = router;