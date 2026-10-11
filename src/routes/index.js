const express      = require('express');
const router       = express.Router();

const authCtrl     = require('../controllers/auth.controller');
const rucCtrl      = require('../controllers/ruc.controller');
const dniCtrl      = require('../controllers/dni.controller');
const bulkCtrl     = require('../controllers/bulk.controller');
const listadoCtrl  = require('../controllers/listado.controller');
const exportarCtrl = require('../controllers/exportar.controller');
const auth         = require('../middleware/auth');

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
router.post('/bulk/:tipo/stream', auth, bulkCtrl.bulkStream);   // progreso en vivo (NDJSON)

// ── Listado de registros cacheados ────────────────────────────
router.get('/listado', auth, listadoCtrl.listado);
router.get('/listado/exportar', auth, exportarCtrl.exportarExcel);   // Excel con todos los registros

// ── Health check ──────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = router;