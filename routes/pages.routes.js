const express = require('express');
const pages = require('../controllers/pages.controller');

const router = express.Router();

// Primary routes
router.get('/', pages.home);
router.get('/rrhh', pages.rrhh);

router.get('/asistencias', pages.asistenciasMenu);
router.get('/asistencias/carga', pages.asistenciasCarga);
router.get('/asistencias/jornadas', pages.jornadasAbiertas);
router.get('/asistencias/gestion', pages.gestionAsistencias);

router.get('/empleados', pages.abmEmpleados);
router.get('/arqueos', pages.arqueos);

// Liquidación (nuevo)
router.get('/liquidacion', pages.liquidacion);
router.get('/liquidacion/tardanzas', pages.liquidacionTardanzas);
router.get('/liquidacion/escalas', pages.liquidacionEscalas);
router.get('/liquidacion/print', pages.liquidacionPrint);

// Backwards compatible static paths
router.get('/index.html', (req, res) => res.redirect('/'));
router.get('/rrhh.html', (req, res) => res.redirect('/rrhh'));
router.get('/asistencias-menu.html', (req, res) => res.redirect('/asistencias'));
router.get('/asistencias-carga.html', (req, res) => res.redirect('/asistencias/carga'));
router.get('/jornadas-abiertas.html', (req, res) => res.redirect('/asistencias/jornadas'));
router.get('/gestion-asistencias.html', (req, res) => res.redirect('/asistencias/gestion'));
router.get('/abm-empleados.html', (req, res) => res.redirect('/empleados'));
router.get('/arqueos.html', (req, res) => res.redirect('/arqueos'));
router.get('/liquidacion.html', (req, res) => res.redirect('/liquidacion'));

module.exports = router;
