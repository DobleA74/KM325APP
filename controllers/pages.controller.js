// MVC: pages controller

exports.home = (req, res) => {
  res.render('pages/home', {
    pageTitle: 'KM325 – Inicio',
    topbarMode: 'home',
  });
};

exports.rrhh = (req, res) => {
  res.render('pages/rrhh', {
    pageTitle: 'KM325 RRHH – Módulo',
    topbarMode: 'internal',
  });
};

exports.asistenciasMenu = (req, res) => {
  res.render('pages/asistencias-menu', {
    pageTitle: 'KM325 RRHH – Asistencias',
    topbarMode: 'internal',
  });
};

exports.asistenciasCarga = (req, res) => {
  res.render('pages/asistencias-carga', {
    pageTitle: 'KM325 RRHH – Carga de Asistencias',
    topbarMode: 'internal',
  });
};

exports.jornadasAbiertas = (req, res) => {
  res.render('pages/jornadas-abiertas', {
    pageTitle: 'KM325 RRHH – Jornadas abiertas',
    topbarMode: 'internal',
  });
};

exports.gestionAsistencias = (req, res) => {
  res.render('pages/gestion-asistencias', {
    pageTitle: 'KM325 RRHH – Gestión de asistencias',
    topbarMode: 'internal',
  });
};

exports.abmEmpleados = (req, res) => {
  res.render('pages/abm-empleados', {
    pageTitle: 'KM325 RRHH – ABM Empleados',
    topbarMode: 'internal',
  });
};

exports.arqueos = (req, res) => {
  res.render('pages/arqueos', {
    pageTitle: 'KM325 RRHH – Arqueos',
    topbarMode: 'internal',
  });
};

// Calendario
// /calendario -> grilla mensual tipo Excel (PLAYA / SHOP)
exports.calendarioGrid = (req, res) => {
  res.render('pages/calendario-grid', {
    pageTitle: 'KM325 RRHH – Calendario (grilla)',
    topbarMode: 'internal',
  });
};

// /calendario/patrones -> pantalla de patrones + excepciones (detalle por empleado)
exports.calendario = (req, res) => {
  res.render('pages/calendario', {
    pageTitle: 'KM325 RRHH – Calendario (patrones)',
    topbarMode: 'internal',
  });
};

// Liquidación
exports.liquidacion = (req, res) => {
  res.render('pages/liquidacion', {
    pageTitle: 'KM325 RRHH – Liquidación',
    topbarMode: 'internal',
  });
};

exports.liquidacionTardanzas = (req, res) => {
  res.render('pages/liquidacion-tardanzas', {
    pageTitle: 'KM325 RRHH – Tardanzas',
    topbarMode: 'internal',
  });
};

exports.liquidacionEscalas = (req, res) => {
  res.render('pages/liquidacion-escalas', {
    pageTitle: 'KM325 RRHH – Escalas',
    topbarMode: 'internal',
  });
};

exports.liquidacionPrint = (req, res) => {
  res.render('pages/liquidacion-print', {
    pageTitle: 'KM325 RRHH – Liquidación (Imprimir)',
    topbarMode: 'internal',
    bodyClass: 'no-table-cards',
  });
};
