/* ===============================
   IMPORTS
================================ */
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const XLSX = require("xlsx");
const sqlite3 = require("sqlite3").verbose();

/* ===============================
   APP
================================ */
const app = express();

// View engine (MVC)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const PORT = 3001;

app.use(express.json({ limit: "2mb" }));

// Page routes (rendered with EJS)
const pagesRoutes = require('./routes/pages.routes');
app.use(pagesRoutes);

// Static assets
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

/* ===============================
   SQLITE
================================ */
const db = new sqlite3.Database("km325.db");

// Promise helpers (para endpoints async)
function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// --- Simple migration helpers (idempotentes)
function addColumnIfMissing(table, colName, colDefSql) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err) return resolve(false);
      const exists = (rows || []).some((r) => String(r.name).toLowerCase() === String(colName).toLowerCase());
      if (exists) return resolve(false);
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDefSql}`, [], () => resolve(true));
    });
  });
}

/* ===============================
   ARQUEOS - HELPERS
================================ */
function normSector(v) {
  return String(v ?? "").trim();
}

function sectorKey(v) {
  return normSector(v).toLowerCase();
}

// Agrupa nombres de sector usados en el sistema y en la DB
// - 'MINI' suele ser el Shop (Mini/tienda)
function sectorGroup(v) {
  const s = sectorKey(v);
  if (!s) return '';
  if (s.includes('playa')) return 'playa';
  if (s.includes('shop') || s.includes('mini') || s.includes('tienda')) return 'shop';
  if (s.includes('admin') || s.includes('administr')) return 'admin';
  return s;
}

function turnosPorSector(sector) {
  const g = sectorGroup(sector);
  if (g === 'shop') return ['mañana', 'tarde']; // Shop/Mini no tiene noche
  if (g === 'playa') return ['mañana', 'tarde', 'noche'];
  return ['mañana', 'tarde', 'noche']; // fallback
}

function turnoWindow(sector, turno) {
  // minutos desde 00:00 del día (fecha_entrada)
  // Playa: mañana 05-13, tarde 13-21, noche 21-05
  // Shop/Mini: mañana 06-14, tarde 14-22
  const t = String(turno || '').toLowerCase();
  const g = sectorGroup(sector);

  if (g === 'shop') {
    if (t === 'mañana' || t === 'manana') return { start: 6 * 60, end: 14 * 60 };
    if (t === 'tarde') return { start: 14 * 60, end: 22 * 60 };
    return { start: 0, end: 24 * 60 };
  }

  // default: Playa / otros
  if (t === 'mañana' || t === 'manana') return { start: 5 * 60, end: 13 * 60 };
  if (t === 'tarde') return { start: 13 * 60, end: 21 * 60 };
  if (t === 'noche') return { start: 21 * 60, end: 29 * 60 }; // 05:00 del día siguiente
  return { start: 0, end: 24 * 60 };
}

// Devuelve una ventana de turno usando un "cfg" por puesto (si existe).
// cfg: { manana_start, manana_end, tarde_start, tarde_end, noche_start, noche_end }
function turnoWindowByCfg(cfg, turno) {
  const t = String(turno || '').toLowerCase();
  if (!cfg) return null;
  if (t === 'mañana' || t === 'manana') {
    if (cfg.manana_start == null || cfg.manana_end == null) return null;
    return { start: Number(cfg.manana_start), end: Number(cfg.manana_end) };
  }
  if (t === 'tarde') {
    if (cfg.tarde_start == null || cfg.tarde_end == null) return null;
    return { start: Number(cfg.tarde_start), end: Number(cfg.tarde_end) };
  }
  if (t === 'noche') {
    if (cfg.noche_start == null || cfg.noche_end == null) return null;
    return { start: Number(cfg.noche_start), end: Number(cfg.noche_end) };
  }
  return null;
}

function turnosPorCfg(cfg, sectorFallback) {
  if (cfg && cfg.noche_start != null && cfg.noche_end != null) return ['mañana', 'tarde', 'noche'];
  if (cfg) return ['mañana', 'tarde'];
  return turnosPorSector(sectorFallback);
}

function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  return Math.max(0, e - s);
}

function isPuestoPlaya(puesto) {
  const p = String(puesto || "").toLowerCase();
  return p.includes("playero") || p.includes("auxiliar de playa") || p.includes("auxiliar") && p.includes("playa");
}

function isPuestoShop(puesto) {
  const p = String(puesto || "").toLowerCase();
  return p.includes("cajero") || p.includes("auxiliar de caja") || (p.includes("auxiliar") && p.includes("caja"));
}

function puestoValidoParaSector(sector, puesto) {
  const g = sectorGroup(sector);
  if (g === 'playa') return isPuestoPlaya(puesto);
  if (g === 'shop') return isPuestoShop(puesto);
  return true;
}

/* ===============================
   HELPERS (GLOBAL)
================================ */
function normLegajo(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return String(Number(s));
  return s;
}

function excelDateToISO(serial) {
  const utc_days = Math.floor(Number(serial) - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().slice(0, 10);
}

function isPlayero(puesto) {
  return /playero/i.test(String(puesto || ""));
}
function esTemprano(hhmm) {
  return String(hhmm || "") <= "12:00";
}
function esTarde(hhmm) {
  return String(hhmm || "") >= "18:00";
}

function hhmmToMin(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minToHHMM(min) {
  if (min == null || Number.isNaN(Number(min))) return "";
  let m = Number(min);
  // Normaliza a 0..1439
  m = ((m % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function diffHoras(entrada, salida) {
  const a = hhmmToMin(entrada);
  let b = hhmmToMin(salida);
  if (a == null || b == null) return 0;
  if (b < a) b += 1440;
  return Math.max(0, b - a) / 60;
}

function nocturnasHoras(entrada, salida) {
  let a = hhmmToMin(entrada);
  let b = hhmmToMin(salida);
  if (a == null || b == null) return 0;
  if (b < a) b += 1440;

  const nightStart = 21 * 60;
  const nightEnd = 30 * 60; // 06:00 día siguiente

  if (a <= 360) a += 1440;

  const start = Math.max(a, nightStart);
  const end = Math.min(b, nightEnd);
  return Math.max(0, end - start) / 60;
}

function monthRange(yyyyMm) {
  // yyyyMm: "YYYY-MM" -> { start: YYYY-MM-01, end: YYYY-MM-last }
  const m = String(yyyyMm || "").trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split("-").map(Number);
  const startD = new Date(Date.UTC(y, mo - 1, 1));
  const endD = new Date(Date.UTC(y, mo, 0));
  const start = startD.toISOString().slice(0, 10);
  const end = endD.toISOString().slice(0, 10);
  return { start, end };
}

/* ===============================
   INIT DB
================================ */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS empleados (
      legajo TEXT PRIMARY KEY,
      nombre TEXT,
      sector TEXT,
      puesto TEXT,
      activo INTEGER DEFAULT 1
    )
  `);

  // Migraciones idempotentes (agregar columnas nuevas sin romper DB existente)
  addColumnIfMissing('empleados', 'categoria', 'categoria TEXT');
  addColumnIfMissing('empleados', 'fecha_ingreso', 'fecha_ingreso TEXT');

  // Migración: campos necesarios para Liquidación
  // - categoria: para vincular con escala salarial
  // - fecha_ingreso: para calcular antigüedad
  // (idempotente: si ya existen, no hace nada)
  // (ya ejecutado arriba)

  db.run(`
    CREATE TABLE IF NOT EXISTS asistencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT,
      nombre TEXT,
      sector TEXT,
      puesto TEXT,
      fecha_entrada TEXT,
      fecha_salida TEXT,
      entrada TEXT,
      salida TEXT,
      horas REAL,
      nocturnas REAL,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_asistencias_unq
    ON asistencias(legajo, fecha_entrada, entrada)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jornadas_abiertas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT,
      nombre TEXT,
      sector TEXT,
      puesto TEXT,
      fecha_entrada TEXT,
      entrada TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_jornadas_abiertas_unq
    ON jornadas_abiertas(legajo, fecha_entrada, entrada)
  `);

  // ==========================
  // ARQUEOS (caja) - día vencido
  // ==========================
  db.run(`
    CREATE TABLE IF NOT EXISTS arqueos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      sector TEXT,
      turno TEXT,
      monto_diferencia REAL DEFAULT 0,
      observaciones TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arqueos_unq
    ON arqueos(fecha, sector, turno)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS arqueo_asignaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arqueo_id INTEGER,
      legajo TEXT,
      nombre TEXT,
      puesto TEXT,
      minutos INTEGER DEFAULT 0,
      monto_propuesto REAL DEFAULT 0,
      monto_final REAL DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_arqueo_asig_unq
    ON arqueo_asignaciones(arqueo_id, legajo)
  `);

  // ==========================
  // FERIADOS (solo feriados nacionales + turísticos)
  // ==========================
  db.run(`
    CREATE TABLE IF NOT EXISTS feriados (
      fecha TEXT PRIMARY KEY,
      nombre TEXT,
      tipo TEXT CHECK(tipo IN ('nacional','turistico'))
    )
  `);

  // ==========================
  // LIQUIDACIÓN (nuevas tablas)
  // ==========================
  db.run(`
    CREATE TABLE IF NOT EXISTS escalas (
      mes TEXT,
      categoria TEXT,
      basico REAL DEFAULT 0,
      premio_asistencia REAL DEFAULT 0,
      premio_manejo_fondos REAL DEFAULT 0,
      creado_en TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (mes, categoria)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS adelantos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT,
      legajo TEXT,
      monto REAL DEFAULT 0,
      concepto TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_adelantos_mes_leg
    ON adelantos(fecha, legajo)
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS novedades_rrhh (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT,
      tipo TEXT,
      fecha_desde TEXT,
      fecha_hasta TEXT,
      dias INTEGER,
      observaciones TEXT,
      comprobante_url TEXT,
      requiere_comprobante INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tardanzas: cálculo automático pero editable
  db.run(`
    CREATE TABLE IF NOT EXISTS tardanzas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT,
      fecha TEXT,
      minutos_auto INTEGER DEFAULT 0,
      minutos_final INTEGER,
      motivo_override TEXT,
      creado_en TEXT DEFAULT (datetime('now')),
      UNIQUE (legajo, fecha)
    )
  `);

  // Migración tardanzas: campos para auditoría en UI (qué entrada se tomó y qué horario se esperaba)
  addColumnIfMissing('tardanzas', 'turno', 'turno TEXT');
  addColumnIfMissing('tardanzas', 'entrada_tomada', 'entrada_tomada TEXT');
  addColumnIfMissing('tardanzas', 'inicio_turno', 'inicio_turno TEXT');

  // Horarios por PUESTO (para tardanzas y asignación de turno)
  // Permite que dos personas del mismo sector tengan horarios distintos.
  // Valores en minutos desde 00:00. Para turno noche usar fin > 1440 (ej 29*60 para 05:00).
  db.run(`
    CREATE TABLE IF NOT EXISTS puesto_horarios (
      puesto TEXT PRIMARY KEY,
      manana_start INTEGER,
      manana_end INTEGER,
      tarde_start INTEGER,
      tarde_end INTEGER,
      noche_start INTEGER,
      noche_end INTEGER,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_puesto_horarios_puesto ON puesto_horarios(puesto)`);

  // ==========================
  // CALENDARIO: patrones + excepciones
  // ==========================
  db.run(`
    CREATE TABLE IF NOT EXISTS calendario_patrones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      ciclo_dias INTEGER NOT NULL,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS calendario_patron_detalle (
      patron_id INTEGER NOT NULL,
      dia_idx INTEGER NOT NULL,
      turno TEXT NOT NULL, -- MANIANA/TARDE/NOCHE/FRANCO
      puesto TEXT,         -- opcional (si es null, usa puesto del empleado)
      PRIMARY KEY (patron_id, dia_idx)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS calendario_empleado_patron (
      legajo TEXT PRIMARY KEY,
      patron_id INTEGER NOT NULL,
      fecha_inicio TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS calendario_excepciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      legajo TEXT NOT NULL,
      fecha TEXT NOT NULL, -- YYYY-MM-DD
      tipo TEXT NOT NULL,  -- CAMBIO/VACACIONES/LICENCIA/PERMISO/ENFERMEDAD/FRANCO_EXTRA
      puesto_override TEXT,
      turno_override TEXT,
      motivo TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_cal_ex_legajo_fecha ON calendario_excepciones(legajo, fecha)`);

  // Seed 2026 (idempotente: INSERT OR IGNORE)
  const feriados2026 = [
    // Nacionales (incluye trasladables ya aplicados)
    ['2026-01-01', 'Año Nuevo', 'nacional'],
    ['2026-02-16', 'Carnaval', 'nacional'],
    ['2026-02-17', 'Carnaval', 'nacional'],
    ['2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'nacional'],
    ['2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'nacional'],
    ['2026-04-03', 'Viernes Santo', 'nacional'],
    ['2026-05-01', 'Día del Trabajador', 'nacional'],
    ['2026-05-25', 'Día de la Revolución de Mayo', 'nacional'],
    ['2026-06-15', 'Paso a la Inmortalidad del General Martín Miguel de Güemes (trasladado)', 'nacional'],
    ['2026-06-20', 'Paso a la Inmortalidad del General Manuel Belgrano', 'nacional'],
    ['2026-07-09', 'Día de la Independencia', 'nacional'],
    ['2026-08-17', 'Paso a la Inmortalidad del Gral. José de San Martín (trasladable)', 'nacional'],
    ['2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'nacional'],
    ['2026-11-23', 'Día de la Soberanía Nacional (trasladado)', 'nacional'],
    ['2026-12-08', 'Inmaculada Concepción de María', 'nacional'],
    ['2026-12-25', 'Navidad', 'nacional'],

    // Turísticos (días no laborables con fines turísticos)
    ['2026-03-23', 'Día no laborable con fines turísticos', 'turistico'],
    ['2026-07-10', 'Día no laborable con fines turísticos', 'turistico'],
    ['2026-12-07', 'Día no laborable con fines turísticos', 'turistico'],
  ];

  const stmtF = db.prepare("INSERT OR IGNORE INTO feriados (fecha, nombre, tipo) VALUES (?,?,?)");
  feriados2026.forEach((row) => stmtF.run(row));
  stmtF.finalize();
});

/* ===============================
   UPLOAD EXCEL
================================ */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.post("/importar", upload.single("archivo"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Sin archivo" });

    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const fichadas = filas
      .filter((f) => /^\d+$/.test(String(f["Persona"])))
      .map((f) => ({
        fechaISO: excelDateToISO(f["Fecha / hora"]),
        hora: String(f["Evento"] || "").trim(),
        legajo: normLegajo(f["Persona"]),
        nombre: String(f["DEPARTAMENTO"] || "").trim(),
        sector: String(f["EmpresaVisita"] || "").trim(),
      }))
      .filter((x) => x.legajo && x.fechaISO && x.hora);

    const grupos = {};
    for (const f of fichadas) {
      const key = `${f.legajo}_${f.fechaISO}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(f);
    }

    db.all("SELECT legajo, sector, puesto, nombre FROM empleados", [], (err, empleados) => {
      if (err) return res.status(500).json({ error: "DB empleados" });

      const mapEmp = {};
      (empleados || []).forEach((e) => {
        const leg = normLegajo(e.legajo);
        if (!leg) return;
        mapEmp[leg] = { sector: e.sector || "", puesto: e.puesto || "", nombre: e.nombre || "" };
      });

      const resumen = [];

      for (const reg of Object.values(grupos)) {
        reg.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

        const legajo = reg[0].legajo;
        const fechaISO = reg[0].fechaISO;

        const puesto = (mapEmp[legajo]?.puesto || "").trim();
        const sector = (mapEmp[legajo]?.sector || reg[0].sector || "").trim();
        const nombre = (mapEmp[legajo]?.nombre || reg[0].nombre || "").trim();

        const times = reg.map((x) => x.hora).filter(Boolean);
        if (!times.length) continue;

        const first = times[0];
        const last = times[times.length - 1];

        // Playero: si hay temprano y tarde mismo día, lo partimos (cierre anterior + apertura)
        if (isPlayero(puesto) && esTemprano(first) && esTarde(last) && first !== last) {
          resumen.push({
            legajo, nombre, sector, puesto,
            fecha: fechaISO,
            entrada: first,
            salida: first,
            fecha_salida: fechaISO,
            horas: 0, nocturnas: 0,
          });
          resumen.push({
            legajo, nombre, sector, puesto,
            fecha: fechaISO,
            entrada: last,
            salida: last,
            fecha_salida: fechaISO,
            horas: 0, nocturnas: 0,
          });
          continue;
        }

        resumen.push({
          legajo, nombre, sector, puesto,
          fecha: fechaISO,
          entrada: first,
          salida: last,
          fecha_salida: fechaISO,
          horas: 0, nocturnas: 0,
        });
      }

      try { fs.unlinkSync(req.file.path); } catch {}

      res.json({
        registros_originales: fichadas.length,
        registros_procesados: resumen.length,
        ejemplo: resumen,
      });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error importando" });
  }
});

/* ===============================
   CONFIRMAR ASISTENCIAS
================================ */
app.post("/api/asistencias/confirmar", (req, res) => {
  const { registros } = req.body;
  if (!Array.isArray(registros)) {
    return res.status(400).json({ ok: false, error: "Formato inválido" });
  }

  let insertados = 0;
  let ignorados = 0;
  let abiertas_creadas = 0;
  let abiertas_cerradas = 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO asistencias
    (legajo,nombre,sector,puesto,fecha_entrada,fecha_salida,entrada,salida,horas,nocturnas)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  const items = registros.slice();

  function next() {
    const r = items.shift();
    if (!r) {
      return stmt.finalize(() => {
        res.json({ ok: true, insertados, ignorados, abiertas_creadas, abiertas_cerradas });
      });
    }

    const legajo = normLegajo(r.legajo);
    const nombre = String(r.nombre || "");
    const sector = String(r.sector || "");
    const puesto = String(r.puesto || "");
    const fecha = String(r.fecha || "");
    const fecha_salida = String(r.fecha_salida || r.fecha || "");
    const entrada = String(r.entrada || "");
    const salida = String(r.salida || "");

    if (!legajo || !fecha || !entrada || !salida) {
      ignorados++;
      return next();
    }

    const igual = entrada === salida;
    const aplicaPlayero = isPlayero(puesto);

    // 1) Playero + igual + temprano:
    //    - SI HAY abierta previa (noche) -> cerrar anterior
    //    - SI NO HAY abierta previa -> crear abierta (mañana, porque falta salida)
    if (aplicaPlayero && igual && esTemprano(entrada)) {
      db.get(
        `
        SELECT * FROM jornadas_abiertas
        WHERE legajo=?
          AND lower(puesto) LIKE '%playero%'
          AND (fecha_entrada < ? OR entrada >= '18:00')
        ORDER BY datetime(creado_en) DESC, id DESC
        LIMIT 1
        `,
        [legajo, fecha],
        (err, abierta) => {
          if (err) {
            console.error(err);
            ignorados++;
            return next();
          }

          // Si NO hay abierta previa -> la fichada temprana ES una ABIERTA nueva (turno mañana sin salida)
          if (!abierta) {
            db.run(
              `
              INSERT OR IGNORE INTO jornadas_abiertas
              (legajo,nombre,sector,puesto,fecha_entrada,entrada)
              VALUES (?,?,?,?,?,?)
              `,
              [legajo, nombre, sector, puesto, fecha, entrada],
              function (e2) {
                if (!e2 && this && this.changes === 1) abiertas_creadas++;
                else ignorados++;
                return next();
              }
            );
            return;
          }

          // Si HAY abierta previa -> cerramos
          const horas = Number(diffHoras(abierta.entrada, entrada).toFixed(2));
          const noct = Number(nocturnasHoras(abierta.entrada, entrada).toFixed(2));

          stmt.run(
            [
              legajo,
              abierta.nombre || nombre,
              abierta.sector || sector,
              abierta.puesto || puesto,
              abierta.fecha_entrada,
              fecha,
              abierta.entrada,
              entrada,
              horas,
              noct,
            ],
            function (e3) {
              if (!e3 && this && this.changes === 1) insertados++;
              else ignorados++;

              db.run(`DELETE FROM jornadas_abiertas WHERE id=?`, [abierta.id], () => {
                abiertas_cerradas++;
                next();
              });
            }
          );
        }
      );
      return;
    }

    // 2) Playero + igual + tarde -> abrir abierta (noche)
    if (aplicaPlayero && igual && esTarde(entrada)) {
      db.run(
        `
        INSERT OR IGNORE INTO jornadas_abiertas
        (legajo,nombre,sector,puesto,fecha_entrada,entrada)
        VALUES (?,?,?,?,?,?)
        `,
        [legajo, nombre, sector, puesto, fecha, entrada],
        function (err2) {
          if (!err2 && this && this.changes === 1) abiertas_creadas++;
          next();
        }
      );
      return;
    }

    // 3) igual (no playero) -> ignorar
    if (igual) {
      ignorados++;
      return next();
    }

    // 4) asistencia normal
    const horas = Number((r.horas != null ? r.horas : diffHoras(entrada, salida)).toFixed(2));
    const noct = Number((r.nocturnas != null ? r.nocturnas : nocturnasHoras(entrada, salida)).toFixed(2));

    stmt.run(
      [legajo, nombre, sector, puesto, fecha, fecha_salida, entrada, salida, horas, noct],
      function (err3) {
        if (!err3 && this && this.changes === 1) insertados++;
        else ignorados++;
        next();
      }
    );
  }

  next();
});

/* ===============================
   ABM EMPLEADOS (API)
================================ */
app.get("/api/empleados", (req, res) => {
  db.all("SELECT * FROM empleados ORDER BY legajo", [], (e, rows) => {
    if (e) return res.status(500).json({ error: "DB error" });
    res.json(rows || []);
  });
});

app.post("/api/empleados", (req, res) => {
  const { legajo, nombre, sector, puesto, categoria, fecha_ingreso } = req.body || {};
  const L = normLegajo(legajo);
  if (!L) return res.status(400).json({ error: "Falta legajo" });

  const cat = String(categoria || "").trim();
  const fi = String(fecha_ingreso || "").trim();
  const fiOk = !fi || /^\d{4}-\d{2}-\d{2}$/.test(fi);
  if (!fiOk) return res.status(400).json({ error: "Fecha ingreso inválida (YYYY-MM-DD)" });

  db.run(
    "INSERT OR REPLACE INTO empleados (legajo,nombre,sector,puesto,categoria,fecha_ingreso,activo) VALUES (?,?,?,?,?,?,1)",
    [L, String(nombre || ""), String(sector || ""), String(puesto || ""), cat, fi],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ ok: true });
    }
  );
});

app.delete("/api/empleados/:legajo", (req, res) => {
  const L = normLegajo(req.params.legajo);
  db.run("DELETE FROM empleados WHERE legajo=?", [L], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    res.json({ ok: true });
  });
});

/* ===============================
   ASISTENCIAS (API) - gestión
================================ */
app.get("/api/asistencias", (req, res) => {
  const { desde, hasta, legajo, puesto, sector, order } = req.query;

  const where = [];
  const params = [];

  if (desde) { where.push("fecha_entrada >= ?"); params.push(String(desde)); }
  if (hasta) { where.push("fecha_entrada <= ?"); params.push(String(hasta)); }
  if (legajo) { where.push("legajo = ?"); params.push(normLegajo(legajo)); }
  if (puesto) { where.push("puesto = ?"); params.push(String(puesto)); }
  if (sector) { where.push("sector = ?"); params.push(String(sector)); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const orderMap = {
    id_desc: "id DESC",
    id_asc: "id ASC",
    fecha_entrada_desc: "fecha_entrada DESC, entrada DESC, id DESC",
    fecha_entrada_asc: "fecha_entrada ASC, entrada ASC, id ASC",
    legajo_asc: "legajo ASC, fecha_entrada DESC, entrada DESC",
    legajo_desc: "legajo DESC, fecha_entrada DESC, entrada DESC",
    horas_desc: "horas DESC, fecha_entrada DESC",
    horas_asc: "horas ASC, fecha_entrada DESC",
    nocturnas_desc: "nocturnas DESC, fecha_entrada DESC",
    nocturnas_asc: "nocturnas ASC, fecha_entrada DESC",
  };
  const orderSql = orderMap[order] || orderMap.fecha_entrada_desc;

  db.all(
    `SELECT * FROM asistencias ${whereSql} ORDER BY ${orderSql} LIMIT 500`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ rows: rows || [] });
    }
  );
});

app.put("/api/asistencias/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  const { fecha_entrada, entrada, fecha_salida, salida, puesto } = req.body || {};
  if (!fecha_entrada || !entrada || !fecha_salida || !salida) {
    return res.status(400).json({ ok: false, error: "Faltan campos" });
  }

  const horas = Number(diffHoras(entrada, salida).toFixed(2));
  const noct = Number(nocturnasHoras(entrada, salida).toFixed(2));

  db.run(
    `
    UPDATE asistencias
    SET fecha_entrada=?, entrada=?, fecha_salida=?, salida=?, puesto=?, horas=?, nocturnas=?
    WHERE id=?
    `,
    [String(fecha_entrada), String(entrada), String(fecha_salida), String(salida), String(puesto || ""), horas, noct, id],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "DB error" });
      res.json({ ok: true, changes: this.changes });
    }
  );
});

app.delete("/api/asistencias/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  db.run(`DELETE FROM asistencias WHERE id=?`, [id], function (err) {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    res.json({ ok: true, changes: this.changes });
  });
});

/* ===============================
   JORNADAS ABIERTAS (API)
================================ */
app.get("/api/jornadas-abiertas", (req, res) => {
  const leg = req.query.legajo ? normLegajo(req.query.legajo) : "";

  const where = [];
  const params = [];
  if (leg) { where.push("legajo=?"); params.push(leg); }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  db.all(
    `
    SELECT id, legajo, nombre, sector, puesto, fecha_entrada, entrada, creado_en
    FROM jornadas_abiertas
    ${whereSql}
    ORDER BY datetime(creado_en) DESC, id DESC
    `,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: "DB error" });
      res.json({ ok: true, rows: rows || [] });
    }
  );
});

app.post("/api/jornadas-abiertas", (req, res) => {
  const { legajo, nombre, sector, puesto, fecha_entrada, entrada } = req.body || {};
  const L = normLegajo(legajo);

  if (!L || !fecha_entrada || !entrada) {
    return res.status(400).json({ ok: false, error: "Faltan datos" });
  }

  db.run(
    `
    INSERT OR IGNORE INTO jornadas_abiertas
    (legajo,nombre,sector,puesto,fecha_entrada,entrada)
    VALUES (?,?,?,?,?,?)
    `,
    [L, String(nombre || ""), String(sector || ""), String(puesto || ""), String(fecha_entrada), String(entrada)],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "DB error" });
      res.json({ ok: true, id: this.lastID, changes: this.changes });
    }
  );
});

app.put("/api/jornadas-abiertas/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  const { nombre, sector, puesto, fecha_entrada, entrada } = req.body || {};

  db.run(
    `
    UPDATE jornadas_abiertas
    SET nombre=?, sector=?, puesto=?, fecha_entrada=?, entrada=?
    WHERE id=?
    `,
    [String(nombre || ""), String(sector || ""), String(puesto || ""), String(fecha_entrada || ""), String(entrada || ""), id],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: "DB error" });
      res.json({ ok: true, changes: this.changes });
    }
  );
});

app.delete("/api/jornadas-abiertas/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  db.run(`DELETE FROM jornadas_abiertas WHERE id=?`, [id], function (err) {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    res.json({ ok: true, changes: this.changes });
  });
});

app.post("/api/jornadas-abiertas/:id/cerrar", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  const { fecha_salida, salida } = req.body || {};
  if (!fecha_salida || !salida) {
    return res.status(400).json({ ok: false, error: "Faltan fecha_salida/salida" });
  }

  db.get(`SELECT * FROM jornadas_abiertas WHERE id=?`, [id], (err, a) => {
    if (err || !a) return res.status(404).json({ ok: false, error: "No encontrada" });

    const horas = Number(diffHoras(a.entrada, salida).toFixed(2));
    const noct = Number(nocturnasHoras(a.entrada, salida).toFixed(2));

    db.run(
      `
      INSERT OR IGNORE INTO asistencias
      (legajo,nombre,sector,puesto,fecha_entrada,fecha_salida,entrada,salida,horas,nocturnas)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      `,
      [a.legajo, a.nombre, a.sector, a.puesto, a.fecha_entrada, String(fecha_salida), a.entrada, String(salida), horas, noct],
      function (err2) {
        if (err2) return res.status(500).json({ ok: false, error: "DB error" });
        db.run(`DELETE FROM jornadas_abiertas WHERE id=?`, [id], () => res.json({ ok: true }));
      }
    );
  });
});

/* ===============================
   ARQUEOS (API) - día vencido
================================ */
function getAsistenciasParaFecha(db, fecha, cb) {
  // Traemos asistencias que puedan solapar el día/turnos:
  // - fecha_entrada = fecha
  // - o fecha_salida = fecha (por si alguien termina temprano por la mañana)
  db.all(
    `
    SELECT a.*, e.nombre AS emp_nombre, e.puesto AS emp_puesto, e.sector AS emp_sector
    FROM asistencias a
    LEFT JOIN empleados e ON e.legajo = a.legajo
    WHERE a.fecha_entrada = ? OR a.fecha_salida = ?
    `,
    [String(fecha), String(fecha)],
    (err, rows) => cb(err, rows || [])
  );
}

function asistenciaIntervalMin(a) {
  // minutos relativos al inicio del día de fecha_entrada
  const start = hhmmToMin(a.entrada);
  let end = hhmmToMin(a.salida);
  if (start == null || end == null) return null;

  // si cruza medianoche (o fecha_salida > fecha_entrada)
  if (String(a.fecha_salida || "") > String(a.fecha_entrada || "") || end < start) {
    end += 1440;
  }
  return { start, end };
}

function filtrarPorSector(sectorObjetivo, a) {
  const gObj = sectorGroup(sectorObjetivo);
  const gA = sectorGroup(a.emp_sector || a.sector || "");
  if (!gObj) return true;
  return gObj == gA;
}

// Encargados de turno (participan SOLO del turno al que pertenecen)
// - Playa: PLAYERO/A
// - Shop/MINI: CAJERO/A
function esEncargadoDeTurno(sector, puesto) {
  const g = sectorGroup(sector);
  const p = String(puesto || "").trim().toUpperCase();
  if (g === "playa") return p === "PLAYERO/A";
  if (g === "shop") return p === "CAJERO/A";
  return false;
}

// Como no existe campo "turno" en asistencias, inferimos el turno del encargado por la hora de ENTRADA.
// Shop: se asigna por cercanía al inicio del turno (06:00 vs 14:00), para contemplar aperturas (13:40/13:55).
// Playa: rangos amplios para contemplar aperturas/cierres.
function inferirTurnoEncargado(sector, entradaHHMM) {
  const g = sectorGroup(sector);
  const m = hhmmToMin(entradaHHMM);
  if (m == null) return null;

  if (g === "shop") {
    const dMan = Math.abs(m - 6 * 60);
    const dTar = Math.abs(m - 14 * 60);
    return dMan <= dTar ? "mañana" : "tarde";
  }

  if (g === "playa") {
    const h = Math.floor(m / 60);
    // Ventanas amplias para que el encargado no “salte” de turno por aperturas/cierres
    if (h >= 18 || h < 4) return "noche";
    if (h >= 4 && h < 12) return "mañana";
    if (h >= 12 && h < 18) return "tarde";
    return "noche";
  }

  return null;
}

function calcParticipaciones({ fecha, sector, turno }, asistencias) {
  const { start: wStart, end: wEnd } = turnoWindow(sector, turno);
  const parts = {};

  for (const a of asistencias) {
    if (!filtrarPorSector(sector, a)) continue;

    const puesto = (a.emp_puesto || a.puesto || "").trim();
    if (!puestoValidoParaSector(sector, puesto)) continue;

    // Encargados: solo participan del turno inferido por su ENTRADA
    if (esEncargadoDeTurno(sector, puesto)) {
      const tAsig = inferirTurnoEncargado(sector, a.entrada);
      if (tAsig && String(tAsig).toLowerCase() !== String(turno).toLowerCase()) {
        continue;
      }
    }

    const intv = asistenciaIntervalMin(a);
    if (!intv) continue;

    const mins = overlapMinutes(intv.start, intv.end, wStart, wEnd);
    if (mins <= 0) continue;

    const leg = normLegajo(a.legajo);
    if (!leg) continue;

    if (!parts[leg]) {
      parts[leg] = {
        legajo: leg,
        nombre: (a.emp_nombre || a.nombre || "").trim(),
        puesto,
        minutos: 0,
      };
    }
    parts[leg].minutos += mins;
  }

  return Object.values(parts).filter((x) => x.minutos > 0);
}

function upsertArqueo({ fecha, sector, turno, monto_diferencia, observaciones }, cb) {
  const f = String(fecha);
  const s = normSector(sector);
  const t = String(turno);
  const m = Number(monto_diferencia || 0);
  const o = String(observaciones || "");

  db.run(
    `
    INSERT INTO arqueos (fecha, sector, turno, monto_diferencia, observaciones)
    VALUES (?,?,?,?,?)
    ON CONFLICT(fecha, sector, turno) DO UPDATE SET
      monto_diferencia=excluded.monto_diferencia,
      observaciones=excluded.observaciones
    `,
    [f, s, t, m, o],
    (err) => {
      if (err) return cb(err);
      db.get(
        `SELECT * FROM arqueos WHERE fecha=? AND sector=? AND turno=?`,
        [f, s, t],
        (err2, row) => cb(err2, row)
      );
    }
  );
}

app.get("/api/arqueos", (req, res) => {
  const { fecha, sector } = req.query;
  if (!fecha) return res.status(400).json({ ok: false, error: "Falta fecha" });
  const s = normSector(sector || "");

  const where = ["fecha=?"];
  const params = [String(fecha)];
  if (s) { where.push("sector=?"); params.push(s); }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  db.all(`SELECT * FROM arqueos ${whereSql} ORDER BY sector ASC, turno ASC`, params, (err, arqueos) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    const ids = (arqueos || []).map((a) => a.id);
    if (!ids.length) return res.json({ ok: true, arqueos: [], asignaciones: [] });

    db.all(
      `SELECT * FROM arqueo_asignaciones WHERE arqueo_id IN (${ids.map(() => "?").join(",")}) ORDER BY arqueo_id, legajo`,
      ids,
      (err2, asigs) => {
        if (err2) return res.status(500).json({ ok: false, error: "DB error" });
        res.json({ ok: true, arqueos: arqueos || [], asignaciones: asigs || [] });
      }
    );
  });
});

/* ===============================
   FERIADOS
================================ */
app.get("/api/feriados", (req, res) => {
  const anio = String(req.query.anio || "").trim();
  if (anio && !/^\d{4}$/.test(anio)) {
    return res.status(400).json({ ok: false, error: "anio inválido" });
  }
  const params = [];
  let sql = "SELECT fecha, nombre, tipo FROM feriados";
  if (anio) {
    sql += " WHERE substr(fecha,1,4)=?";
    params.push(anio);
  }
  sql += " ORDER BY fecha";
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    res.json({ ok: true, feriados: rows || [] });
  });
});

// Cuenta feriados trabajados (solo nacionales + turísticos) por legajo en un mes
app.get("/api/feriados/trabajados", (req, res) => {
  const mes = String(req.query.mes || "").trim(); // YYYY-MM
  const rng = monthRange(mes);
  if (!rng) return res.status(400).json({ ok: false, error: "mes inválido" });

  const sql = `
    SELECT a.legajo AS legajo, a.nombre AS nombre, COUNT(DISTINCT a.fecha_entrada) AS feriados_trabajados
    FROM asistencias a
    JOIN feriados f ON f.fecha = a.fecha_entrada
    WHERE a.fecha_entrada BETWEEN ? AND ?
      AND f.tipo IN ('nacional','turistico')
    GROUP BY a.legajo, a.nombre
    ORDER BY a.nombre
  `;

  db.all(sql, [rng.start, rng.end], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });
    res.json({ ok: true, mes, desde: rng.start, hasta: rng.end, items: rows || [] });
  });
});

/* ===============================
   DASHBOARD (HOME)
   Endpoint liviano para la pantalla inicial.
================================ */
app.get('/api/dashboard', (req, res) => {
  // Dashboard "operativo" para el inicio: estado de asistencias, arqueos y alertas.
  // Mantiene compatibilidad con campos antiguos (ultimos_arqueos/ultimas_asistencias/ultimas_novedades).

  // Fecha local AR (UTC-03). Evita corrimientos raros si el servidor corre en otra zona.
  function isoDateAR(d) {
    const ms = d.getTime() - (d.getTimezoneOffset() * 60000) + (3 * 60 * 60000);
    return new Date(ms).toISOString().slice(0, 10);
  }

  const hoy = isoDateAR(new Date());
  const ayer = isoDateAR(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const qUltArq = `SELECT fecha, COUNT(*) AS cant FROM arqueos GROUP BY fecha ORDER BY fecha DESC LIMIT 1`;
  const qUltAsi = `SELECT fecha_entrada AS fecha, COUNT(*) AS cant FROM asistencias GROUP BY fecha_entrada ORDER BY fecha_entrada DESC LIMIT 1`;
  const qAyerAsi = `SELECT COUNT(*) AS cant FROM asistencias WHERE fecha_entrada = ?`;
  const qPendJorn = `SELECT COUNT(*) AS cant FROM jornadas_abiertas`;

  // Arqueos esperados por día (regla fija)
  const ESPERADOS = {
    playa: ['mañana', 'tarde', 'noche'],
    shop: ['mañana', 'tarde'],
  };

  function getArqueosEstadoPorFecha(fecha, cb) {
    const q = `SELECT sector, turno FROM arqueos WHERE fecha = ?`;
    db.all(q, [fecha], (err, rows) => {
      if (err) return cb(err);

      const have = { playa: new Set(), shop: new Set() };
      for (const r of rows || []) {
        const s = String(r.sector || '').toLowerCase();
        const t = String(r.turno || '').toLowerCase();
        if (have[s]) have[s].add(t);
      }

      const resu = {};
      for (const [sec, turnos] of Object.entries(ESPERADOS)) {
        const cargados = have[sec] ? Array.from(have[sec]) : [];
        const faltan = turnos.filter((t) => !have[sec] || !have[sec].has(t));
        resu[sec] = {
          esperados: turnos.length,
          cargados: cargados.length,
          faltan,
        };
      }
      cb(null, resu);
    });
  }

  db.get(qUltArq, (e1, r1) => {
    if (e1) return res.status(500).json({ ok: false, error: 'DB arqueos' });
    db.get(qUltAsi, (e2, r2) => {
      if (e2) return res.status(500).json({ ok: false, error: 'DB asistencias' });

      db.get(qAyerAsi, [ayer], (e3, r3) => {
        if (e3) return res.status(500).json({ ok: false, error: 'DB asistencias ayer' });
        db.get(qPendJorn, (e4, r4) => {
          if (e4) return res.status(500).json({ ok: false, error: 'DB jornadas abiertas' });

          const ultArqStr = r1 ? `${r1.fecha} (${r1.cant} turnos)` : '—';
          const ultAsiStr = r2 ? `${r2.fecha} (${r2.cant} registros)` : '—';

          const asist = {
            ultima_fecha: r2 ? r2.fecha : null,
            ultima_cant: r2 ? r2.cant : 0,
            ayer_fecha: ayer,
            ayer_cant: r3 ? r3.cant : 0,
            ayer_cargado: (r3 ? r3.cant : 0) > 0,
          };

          const jornadas = { pendientes: r4 ? r4.cant : 0 };

          const fechaArq = r1 ? r1.fecha : null;
          const fechaChequeoArq = fechaArq || ayer;

          getArqueosEstadoPorFecha(fechaChequeoArq, (e5, estadoArq) => {
            if (e5) return res.status(500).json({ ok: false, error: 'DB arqueos estado' });

            const arqueos = {
              ultima_fecha: fechaArq,
              // estado del ultimo dia de arqueos (si no hay, se calcula sobre ayer)
              estado: estadoArq,
              fecha_estado: fechaChequeoArq,
            };

            // Novedades: si existe la tabla, contamos el mes actual
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const mes = `${yyyy}-${mm}`;
            const rng = monthRange(mes);

            const qChk = `SELECT name FROM sqlite_master WHERE type='table' AND name='novedades'`;
            db.get(qChk, (e6, t) => {
              const base = {
                ok: true,
                hoy,
                ayer,
                ultimos_arqueos: ultArqStr,
                ultimas_asistencias: ultAsiStr,
                ultimas_novedades: '—',
                asistencias: asist,
                arqueos,
                jornadas_abiertas: jornadas,
                alertas: [],
              };

              // alertas
              if (!asist.ayer_cargado) {
                base.alertas.push({ tipo: 'asistencias', mensaje: `Falta cargar asistencias de ${ayer}.` });
              }
              if (jornadas.pendientes > 0) {
                base.alertas.push({ tipo: 'jornadas', mensaje: `Tenés ${jornadas.pendientes} jornada(s) abierta(s) pendiente(s).` });
              }
              for (const sec of Object.keys(ESPERADOS)) {
                const st = (estadoArq && estadoArq[sec]) ? estadoArq[sec] : { esperados: ESPERADOS[sec].length, cargados: 0, faltan: ESPERADOS[sec] };
                if (st.faltan && st.faltan.length) {
                  base.alertas.push({ tipo: 'arqueos', mensaje: `Arqueos incompletos (${sec}) en ${fechaChequeoArq}: faltan ${st.faltan.join(', ')}.` });
                }
              }

              if (e6 || !t) return res.json(base);

              const qNov = `SELECT COUNT(*) AS cant FROM novedades WHERE fecha BETWEEN ? AND ?`;
              db.get(qNov, [rng.start, rng.end], (e7, r7) => {
                if (e7) return res.json(base);
                const cant = r7 ? r7.cant : 0;
                base.ultimas_novedades = `${cant} este mes`;
                base.novedades = { mes, cant };
                return res.json(base);
              });
            });
          });
        });
      });
    });
  });
});

app.post("/api/arqueos/guardar-y-calcular", (req, res) => {
  const { fecha, sector, turnos } = req.body || {};
  if (!fecha || !sector || !Array.isArray(turnos)) {
    return res.status(400).json({ ok: false, error: "Faltan datos" });
  }

  const turnosValidos = turnosPorSector(sector);
  const turnosIn = turnos.filter((t) => turnosValidos.includes(String(t.turno || "").toLowerCase()));

  // 1) upsert arqueos
  const guardados = [];
  const items = turnosIn.slice();

  function nextUpsert() {
    const it = items.shift();
    if (!it) {
      // 2) calcular participaciones con asistencias del día
      return getAsistenciasParaFecha(db, fecha, (e2, asistencias) => {
        if (e2) return res.status(500).json({ ok: false, error: "DB asistencias" });

        const propuestas = [];
        for (const arq of guardados) {
          const parts = calcParticipaciones({ fecha, sector: arq.sector, turno: arq.turno }, asistencias);
          const totalMins = parts.reduce((acc, p) => acc + p.minutos, 0) || 0;
          for (const p of parts) {
            const prop = totalMins > 0 ? p.minutos / totalMins : 0;
            const montoPropuesto = Number((Number(arq.monto_diferencia || 0) * prop).toFixed(2));
            propuestas.push({
              arqueo_id: arq.id,
              fecha: arq.fecha,
              sector: arq.sector,
              turno: arq.turno,
              legajo: p.legajo,
              nombre: p.nombre,
              puesto: p.puesto,
              minutos: p.minutos,
              monto_propuesto: montoPropuesto,
              monto_final: montoPropuesto,
            });
          }
        }

        res.json({ ok: true, arqueos: guardados, propuestas });
      });
    }

    upsertArqueo(
      {
        fecha,
        sector,
        turno: String(it.turno || "").toLowerCase(),
        monto_diferencia: it.monto_diferencia,
        observaciones: it.observaciones,
      },
      (err, row) => {
        if (err) return res.status(500).json({ ok: false, error: "DB arqueos" });
        guardados.push(row);
        nextUpsert();
      }
    );
  }

  nextUpsert();
});

app.post("/api/arqueos/confirmar", (req, res) => {
  const { arqueo_id, asignaciones } = req.body || {};
  const id = Number(arqueo_id);
  if (!id || !Array.isArray(asignaciones)) {
    return res.status(400).json({ ok: false, error: "Faltan datos" });
  }

  db.run(`DELETE FROM arqueo_asignaciones WHERE arqueo_id=?`, [id], (err) => {
    if (err) return res.status(500).json({ ok: false, error: "DB error" });

    const stmt = db.prepare(
      `
      INSERT INTO arqueo_asignaciones
      (arqueo_id, legajo, nombre, puesto, minutos, monto_propuesto, monto_final)
      VALUES (?,?,?,?,?,?,?)
      `
    );

    let count = 0;
    for (const a of asignaciones) {
      const leg = normLegajo(a.legajo);
      if (!leg) continue;
      stmt.run([
        id,
        leg,
        String(a.nombre || ""),
        String(a.puesto || ""),
        Number(a.minutos || 0),
        Number(a.monto_propuesto || 0),
        Number(a.monto_final || 0),
      ]);
      count++;
    }

    stmt.finalize((err2) => {
      if (err2) return res.status(500).json({ ok: false, error: "DB error" });
      res.json({ ok: true, guardadas: count });
    });
  });
});

/* ===============================
   LIQUIDACIÓN - HELPERS
================================ */
function ymdToDate(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function diffAniosCompletos(desdeYmd, hastaYmd) {
  const d1 = ymdToDate(desdeYmd);
  const d2 = ymdToDate(hastaYmd);
  if (!d1 || !d2) return 0;
  let years = d2.getFullYear() - d1.getFullYear();
  const m2 = d2.getMonth();
  const m1 = d1.getMonth();
  if (m2 < m1 || (m2 === m1 && d2.getDate() < d1.getDate())) years -= 1;
  return Math.max(0, years);
}

function clampInt(v, def = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.trunc(n);
}

function defaultCfgForSector(sector) {
  const g = sectorGroup(sector);
  if (g === 'shop') {
    return { manana_start: 6 * 60, manana_end: 14 * 60, tarde_start: 14 * 60, tarde_end: 22 * 60, noche_start: null, noche_end: null };
  }
  // Playa y fallback
  return { manana_start: 5 * 60, manana_end: 13 * 60, tarde_start: 13 * 60, tarde_end: 21 * 60, noche_start: 21 * 60, noche_end: 29 * 60 };
}

// Algunos puestos siguen horario "Shop" aunque estén en sector PLAYA (p.ej. Auxiliar de playa = como Cajero/a).
function defaultCfgForPuesto(puesto, sector) {
  const p = String(puesto || '').toLowerCase();
  const esShopPorPuesto = p.includes('cajer') || p.includes('cajera') || p.includes('auxiliar de playa');
  if (esShopPorPuesto) return defaultCfgForSector('shop');
  return defaultCfgForSector(sector);
}

function esPuestoShopSchedule(puesto) {
  const p = String(puesto || '').toLowerCase();
  return p.includes('cajer') || p.includes('cajera') || p.includes('auxiliar de playa');
}

function assignTurnoPorVentana({ sector, entrada, salida, cfg }) {
  const g = sectorGroup(sector);
  const turnos = turnosPorCfg(cfg, g);

  const aStartRaw = hhmmToMin(entrada);
  let aEndRaw = hhmmToMin(salida);
  if (aStartRaw == null || aEndRaw == null) return null;
  if (aEndRaw < aStartRaw) aEndRaw += 1440;

  // Ajuste para madrugada SOLO si existe turno noche en la configuración (para evaluar 21-05).
  // Si el puesto no tiene noche (cfg.noche_start == null), NO desplazamos la hora, porque genera falsos positivos.
  let aStart = aStartRaw;
  let aEnd = aEndRaw;
  const tieneNoche = cfg && cfg.noche_start != null;
  if (tieneNoche) {
    if (aStart <= 360) aStart += 1440;
    if (aEnd <= 360) aEnd += 1440;
  }

  let best = { turno: null, mins: -1 };
  for (const t of turnos) {
    const w = (cfg ? turnoWindowByCfg(cfg, t) : null) || turnoWindow(g, t);
    const mins = overlapMinutes(aStart, aEnd, w.start, w.end);
    if (mins > best.mins) best = { turno: t, mins };
  }
  return best.turno;
}

function turnoStartMin(sector, turno, cfg) {
  const g = sectorGroup(sector);
  const w = (cfg ? turnoWindowByCfg(cfg, turno) : null) || turnoWindow(g, turno);
  return w.start;
}

/* ===============================
   LIQUIDACIÓN - API
================================ */

// (1) Recalcular tardanzas automáticas del mes (pero respetar overrides)
app.post('/api/liquidacion/tardanzas/recalcular', (req, res) => {
  const { mes } = req.body || {};
  const r = monthRange(mes);
  if (!r) return res.status(400).json({ ok: false, error: 'Mes inválido (YYYY-MM)' });

  // Candidatos de inicio de turno (minutos desde 00:00) para inferir horarios por puesto
  // cuando no hay configuración explícita en puesto_horarios.
  const SHIFT_START_CANDIDATES = [
    5 * 60,  // 05:00 (Playa mañana)
    6 * 60,  // 06:00 (Shop mañana)
    13 * 60, // 13:00 (Playa tarde)
    14 * 60, // 14:00 (Shop tarde)
    21 * 60, // 21:00 (Playa noche)
    22 * 60  // 22:00 (Shop tarde si se extiende / referencia)
  ];

  const nearestCandidate = (min, candidates) => {
    if (min == null) return null;
    let best = candidates[0];
    let bestD = Math.abs(min - best);
    for (const c of candidates) {
      const d = Math.abs(min - c);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  };

  const median = (arr) => {
    const a = (arr || []).slice().filter(v => typeof v === 'number' && !Number.isNaN(v)).sort((x,y)=>x-y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid-1] + a[mid]) / 2);
  };

  // Inferir cfg de un puesto mirando las entradas reales del mes (evita asumir 05:00 para todos los puestos de playa)
  const inferCfgForPuesto = (puesto, rowsForPuesto) => {
    const entries = (rowsForPuesto || [])
      .map(r => hhmmToMin(r.entrada))
      .filter(v => v != null);

    // Split aproximado por franjas horarias
    const morning = entries.filter(m => m >= 3*60 && m <= 10*60);
    const afternoon = entries.filter(m => m >= 11*60 && m <= 18*60);
    const evening = entries.filter(m => m >= 18*60 && m <= 23*60);

    const mMed = median(morning);
    const tMed = median(afternoon);
    const nMed = median(evening);

    // Si no hay datos suficientes, devolvemos null para usar defaults.
    if (mMed == null && tMed == null && nMed == null) return null;

    // Tomamos el candidato más cercano (05/06, 13/14, 21/22)
    const mananaStart = mMed != null ? nearestCandidate(mMed, [5*60, 6*60]) : null;
    const tardeStart = tMed != null ? nearestCandidate(tMed, [13*60, 14*60]) : null;
    const nocheStart = nMed != null ? nearestCandidate(nMed, [21*60, 22*60]) : null;

    // End estimado: +8hs (o ventanas estándar si es nocturno y cruza medianoche)
    const makeEnd = (start) => (start == null ? null : start + 8*60);
    const cfg = {
      manana_start: mananaStart,
      manana_end: makeEnd(mananaStart),
      tarde_start: tardeStart,
      tarde_end: makeEnd(tardeStart),
      noche_start: nocheStart,
      // Si el inicio es 21/22, el fin sería 29/30 (cruza medianoche)
      noche_end: nocheStart == null ? null : (nocheStart + 8*60)
    };
    return cfg;
  };

  db.all(
    `SELECT legajo, sector, puesto, fecha_entrada, entrada, salida
     FROM asistencias
     WHERE fecha_entrada BETWEEN ? AND ?`,
    [r.start, r.end],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB asistencias' });

      // Cargar configuración de horarios por PUESTO (si existe). Si no existe, se usa el default por sector.
      const puestos = Array.from(new Set((rows || []).map(r => String(r.puesto || '').trim()).filter(Boolean)));
      const cfgMap = new Map(); // puesto -> cfg

      const seedMissing = (missing) => new Promise((resolve) => {
        if (!missing.length) return resolve();
        const ins = db.prepare(
          `INSERT OR IGNORE INTO puesto_horarios (puesto, manana_start, manana_end, tarde_start, tarde_end, noche_start, noche_end)
           VALUES (?,?,?,?,?,?,?)`
        );
        for (const m of missing) {
          // Primero intentamos inferir horarios por puesto mirando las entradas reales del mes.
          // Esto evita asumir 05:00 para todos los puestos de "Playa".
          const rowsP = (rows || []).filter(rr => String(rr.puesto || '').trim() === m);
          const inf = inferCfgForPuesto(m, rowsP);

          // Fallback: si no se puede inferir (pocos datos), usamos el default por sector.
          const row = rowsP[0] || (rows || []).find(rr => String(rr.puesto || '').trim() === m);
          const def = defaultCfgForPuesto(m, row?.sector);

          const cfg = inf || def;
          ins.run([m, cfg.manana_start, cfg.manana_end, cfg.tarde_start, cfg.tarde_end, cfg.noche_start, cfg.noche_end]);
        }
        ins.finalize(() => resolve());
      });

      const loadCfg = () => new Promise((resolve) => {
        if (!puestos.length) return resolve();
        const placeholders = puestos.map(() => '?').join(',');
        db.all(
          `SELECT puesto, manana_start, manana_end, tarde_start, tarde_end, noche_start, noche_end
           FROM puesto_horarios
           WHERE puesto IN (${placeholders})`,
          puestos,
          (e2, rows2) => {
            if (!e2) {
              for (const c of rows2 || []) cfgMap.set(String(c.puesto).trim(), c);
            }
            resolve();
          }
        );
      });

      const missing = puestos.filter(p => !cfgMap.has(p));
      // Cargamos configs existentes, seed para los faltantes y recargamos
      return loadCfg()
        .then(() => {
          const missing2 = puestos.filter(p => !cfgMap.has(p));
          return seedMissing(missing2);
        })
        .then(() => loadCfg())
        .then(() => {

      // Si el puesto ya estaba sembrado con defaults por sector (auto-seed) pero los datos del mes
      // muestran otro horario típico, actualizamos automáticamente para evitar tardanzas falsas.
      // No tocamos configuraciones que ya difieran del default (asumimos que ahí hubo ajuste manual).
      const updPromises = puestos.map((p) => new Promise((resolve) => {
        const current = cfgMap.get(p);
        const rowsP = (rows || []).filter(rr => String(rr.puesto || '').trim() === p);
        const sectorRef = rowsP[0]?.sector;
        const def = defaultCfgForPuesto(p, sectorRef);
        const inf = inferCfgForPuesto(p, rowsP);

        // Regla fija por negocio: ciertos puestos siguen SIEMPRE horario tipo "Shop"
        // aunque estén en sector PLAYA (p.ej. "Auxiliar de playa" = 06-14 / 14-22).
        const pLower = String(p || '').toLowerCase();
        const esShopPorPuesto = pLower.includes('auxiliar de playa') || pLower.includes('cajer') || pLower.includes('cajera');
        if (esShopPorPuesto && current) {
          const shopDef = defaultCfgForSector('shop');
          const yaEsShop =
            current.manana_start === shopDef.manana_start && current.manana_end === shopDef.manana_end &&
            current.tarde_start === shopDef.tarde_start && current.tarde_end === shopDef.tarde_end &&
            (current.noche_start ?? null) === (shopDef.noche_start ?? null) &&
            (current.noche_end ?? null) === (shopDef.noche_end ?? null);

          if (!yaEsShop) {
            return db.run(
              `UPDATE puesto_horarios
               SET manana_start=?, manana_end=?, tarde_start=?, tarde_end=?, noche_start=?, noche_end=?
               WHERE puesto=?`,
              [shopDef.manana_start, shopDef.manana_end, shopDef.tarde_start, shopDef.tarde_end, shopDef.noche_start, shopDef.noche_end, p],
              () => {
                cfgMap.set(p, { puesto: p, ...shopDef });
                return resolve();
              }
            );
          }
        }

        const isDefault = current && def &&
          current.manana_start === def.manana_start && current.manana_end === def.manana_end &&
          current.tarde_start === def.tarde_start && current.tarde_end === def.tarde_end &&
          current.noche_start === def.noche_start && current.noche_end === def.noche_end;

        const differsFromInf = current && inf && (
          current.manana_start !== inf.manana_start || current.tarde_start !== inf.tarde_start || current.noche_start !== inf.noche_start
        );

        if (!isDefault || !inf || !differsFromInf) return resolve();

        db.run(
          `UPDATE puesto_horarios
           SET manana_start=?, manana_end=?, tarde_start=?, tarde_end=?, noche_start=?, noche_end=?
           WHERE puesto=?`,
          [inf.manana_start, inf.manana_end, inf.tarde_start, inf.tarde_end, inf.noche_start, inf.noche_end, p],
          () => {
            // refrescamos el map in-memory
            cfgMap.set(p, { puesto: p, ...inf });
            resolve();
          }
        );
      }));

      return Promise.all(updPromises).then(() => {

      // Importante: una persona puede tener varias asistencias el mismo día (p. ej. doble fichada).
      // Para tardanza SOLO tomamos la PRIMERA entrada del día (la más temprana) y calculamos sobre esa.
      // Si usamos la más tarde, puede marcar tardanza falsa (por ejemplo regreso de almuerzo).
      const calc = new Map(); // key: legajo|fecha -> { entAdjMin, late, entradaStr, inicioStr, turno }
      for (const a of rows || []) {
        const leg = normLegajo(a.legajo);
        const fecha = String(a.fecha_entrada || '');
        if (!leg || !fecha) continue;

        const puesto = String(a.puesto || '').trim();
        const cfg = cfgMap.get(puesto) || null;
        const turno = assignTurnoPorVentana({ sector: a.sector, entrada: a.entrada, salida: a.salida, cfg });
        if (!turno) continue;

        const start = turnoStartMin(a.sector, turno, cfg);
        const ent = hhmmToMin(a.entrada);
        if (ent == null) continue;

        // Ajuste de madrugada SOLO para turno noche (21:00-05:00).
        // Para turnos de día, si alguien entra antes, NO debe convertirse en "1426 min tarde".
        let entAdj = ent;
        if (turno === 'noche' && start >= 21 * 60 && start > entAdj && entAdj <= 360) entAdj += 1440;

        const late = Math.max(0, entAdj - start);
        const key = `${leg}|${fecha}`;
        const prev = calc.get(key);
        if (!prev || entAdj < prev.entAdjMin) {
          calc.set(key, {
            entAdjMin: entAdj,
            late,
            entradaStr: String(a.entrada || ''),
            inicioStr: minToHHMM(start),
            turno
          });
        }
      }

      const stmt = db.prepare(
        `INSERT INTO tardanzas (legajo, fecha, minutos_auto, turno, entrada_tomada, inicio_turno)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(legajo, fecha) DO UPDATE SET
           minutos_auto=excluded.minutos_auto,
           turno=excluded.turno,
           entrada_tomada=excluded.entrada_tomada,
           inicio_turno=excluded.inicio_turno`
      );
      let count = 0;
      for (const [key, obj] of calc.entries()) {
        const [legajo, fecha] = key.split('|');
        const mins = obj?.late ?? 0;
        stmt.run([
          legajo,
          fecha,
          clampInt(mins, 0),
          String(obj?.turno || ''),
          String(obj?.entradaStr || ''),
          String(obj?.inicioStr || '')
        ]);
        count++;
      }
      stmt.finalize(() => res.json({ ok: true, recalculadas: count }));
      });
        });
    }
  );
});

// (2) Guardar override (editable)
app.post('/api/liquidacion/tardanzas/override', (req, res) => {
  const { legajo, fecha, minutos_final, motivo } = req.body || {};
  const leg = normLegajo(legajo);
  const f = String(fecha || '').trim();
  if (!leg || !/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    return res.status(400).json({ ok: false, error: 'Datos inválidos' });
  }
  const mins = minutos_final === null || minutos_final === undefined || minutos_final === ''
    ? null
    : clampInt(minutos_final, 0);
  db.run(
    `INSERT INTO tardanzas (legajo, fecha, minutos_auto, minutos_final, motivo_override)
     VALUES (?,?,0,?,?)
     ON CONFLICT(legajo, fecha) DO UPDATE SET minutos_final=excluded.minutos_final, motivo_override=excluded.motivo_override`,
    [leg, f, mins, String(motivo || '')],
    (err) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB tardanzas' });
      res.json({ ok: true });
    }
  );
});

// (2b) Listado tardanzas del mes (auto + final)
app.get('/api/liquidacion/tardanzas', (req, res) => {
  const mes = String(req.query.mes || '').trim();
  const r = monthRange(mes);
  if (!r) return res.status(400).json({ ok: false, error: 'Mes inválido (YYYY-MM)' });
  db.all(
    `SELECT t.legajo, e.nombre, e.puesto, t.fecha,
            t.turno, t.entrada_tomada, t.inicio_turno,
            t.minutos_auto, t.minutos_final, t.motivo_override
     FROM tardanzas t
     LEFT JOIN empleados e ON e.legajo = t.legajo
     WHERE t.fecha BETWEEN ? AND ?
     ORDER BY t.fecha, t.legajo`,
    [r.start, r.end],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB tardanzas' });
      res.json({ ok: true, mes, rango: r, items: rows || [] });
    }
  );
});

// (3) CRUD escalas (upsert simple)
app.post('/api/liquidacion/escalas/upsert', (req, res) => {
  const { mes, categoria, basico, premio_asistencia, premio_manejo_fondos } = req.body || {};
  const m = String(mes || '').trim();
  const c = String(categoria || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m) || !c) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
  db.run(
    `INSERT INTO escalas (mes, categoria, basico, premio_asistencia, premio_manejo_fondos)
     VALUES (?,?,?,?,?)
     ON CONFLICT(mes, categoria) DO UPDATE SET basico=excluded.basico, premio_asistencia=excluded.premio_asistencia, premio_manejo_fondos=excluded.premio_manejo_fondos`,
    [m, c, Number(basico || 0), Number(premio_asistencia || 0), Number(premio_manejo_fondos || 0)],
    (err) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB escalas' });
      res.json({ ok: true });
    }
  );
});

// (3b) Listar escalas del mes
app.get('/api/liquidacion/escalas', (req, res) => {
  const mes = String(req.query.mes || '').trim();
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ ok: false, error: 'Mes inválido (YYYY-MM)' });
  db.all(
    `SELECT mes, categoria, basico, premio_asistencia, premio_manejo_fondos
     FROM escalas
     WHERE mes=?
     ORDER BY categoria`,
    [mes],
    (err, rows) => {
      if (err) return res.status(500).json({ ok: false, error: 'DB escalas' });
      res.json({ ok: true, mes, items: rows || [] });
    }
  );
});

// (4) Resumen de liquidación
app.get('/api/liquidacion', (req, res) => {
  const mes = String(req.query.mes || '').trim();
  const r = monthRange(mes);
  if (!r) return res.status(400).json({ ok: false, error: 'Mes inválido (YYYY-MM)' });

  // Pre-carga para acelerar: feriados del rango
  db.all(`SELECT fecha FROM feriados WHERE fecha BETWEEN ? AND ?`, [r.start, r.end], (errF, ferRows) => {
    if (errF) return res.status(500).json({ ok: false, error: 'DB feriados' });
    const setFeriados = new Set((ferRows || []).map((x) => x.fecha));

    // Asistencias del mes
    db.all(
      `SELECT legajo, nombre, sector, puesto, fecha_entrada, entrada, salida
       FROM asistencias
       WHERE fecha_entrada BETWEEN ? AND ?`,
      [r.start, r.end],
      (errA, asis) => {
        if (errA) return res.status(500).json({ ok: false, error: 'DB asistencias' });

        // Empleados activos
        db.all(`SELECT legajo, nombre, sector, puesto, categoria, fecha_ingreso, activo FROM empleados WHERE activo=1`, [], (errE, emps) => {
          if (errE) return res.status(500).json({ ok: false, error: 'DB empleados' });

          const mapEmp = new Map();
          for (const e of emps || []) {
            const leg = normLegajo(e.legajo);
            if (!leg) continue;
            mapEmp.set(leg, e);
          }

          // Index asistencias por legajo
          const byLeg = new Map();
          for (const a of asis || []) {
            const leg = normLegajo(a.legajo);
            if (!leg) continue;
            if (!byLeg.has(leg)) byLeg.set(leg, []);
            byLeg.get(leg).push(a);
          }

          // Tardanzas efectivas del mes
          db.all(
            `SELECT legajo, fecha, minutos_auto, minutos_final
             FROM tardanzas
             WHERE fecha BETWEEN ? AND ?`,
            [r.start, r.end],
            (errT, tRows) => {
              if (errT) return res.status(500).json({ ok: false, error: 'DB tardanzas' });
              const tMap = new Map(); // leg|fecha -> effective
              for (const t of tRows || []) {
                const leg = normLegajo(t.legajo);
                const f = String(t.fecha || '');
                const eff = (t.minutos_final === null || t.minutos_final === undefined) ? Number(t.minutos_auto || 0) : Number(t.minutos_final || 0);
                tMap.set(`${leg}|${f}`, clampInt(eff, 0));
              }

              // Escalas del mes
              db.all(`SELECT * FROM escalas WHERE mes=?`, [mes], (errS, sRows) => {
                if (errS) return res.status(500).json({ ok: false, error: 'DB escalas' });
                const sMap = new Map(); // categoria -> row
                for (const s of sRows || []) sMap.set(String(s.categoria || '').trim(), s);

                // Arqueos imputados por empleado (solo faltantes)
                db.all(
                  `SELECT aa.legajo, aa.monto_final, a.fecha
                   FROM arqueo_asignaciones aa
                   JOIN arqueos a ON a.id = aa.arqueo_id
                   WHERE a.fecha BETWEEN ? AND ?`,
                  [r.start, r.end],
                  (errArq, arqRows) => {
                    if (errArq) return res.status(500).json({ ok: false, error: 'DB arqueos' });
                    const faltantes = new Map(); // legajo -> sumAbsNeg
                    for (const row of arqRows || []) {
                      const leg = normLegajo(row.legajo);
                      const mf = Number(row.monto_final || 0);
                      if (!leg) continue;
                      if (mf < 0) {
                        const prev = faltantes.get(leg) || 0;
                        faltantes.set(leg, prev + Math.abs(mf));
                      }
                    }

                    // Adelantos del mes
                    db.all(
                      `SELECT legajo, SUM(monto) as total
                       FROM adelantos
                       WHERE fecha BETWEEN ? AND ?
                       GROUP BY legajo`,
                      [r.start, r.end],
                      (errAd, adRows) => {
                        if (errAd) return res.status(500).json({ ok: false, error: 'DB adelantos' });
                        const adMap = new Map();
                        for (const a of adRows || []) adMap.set(normLegajo(a.legajo), Number(a.total || 0));

                        const TOL = 10;
                        const NOCT_PCT = 0.25;

                        const out = [];
                        for (const [leg, emp] of mapEmp.entries()) {
                          const rows = byLeg.get(leg) || [];

                          // Días trabajados (únicos)
                          const diasSet = new Set(rows.map((x) => String(x.fecha_entrada || '')));
                          diasSet.delete('');
                          const diasTrab = diasSet.size;

                          // Noches por turno (únicos por fecha)
                          const nochesSet = new Set();
                          for (const a of rows) {
                            const turno = assignTurnoPorVentana({ sector: a.sector, entrada: a.entrada, salida: a.salida });
                            if (String(turno).toLowerCase() === 'noche') nochesSet.add(String(a.fecha_entrada));
                          }
                          nochesSet.delete('');
                          const nochesTurnos = nochesSet.size;

                          // Feriados trabajados (únicos por fecha)
                          const ferSet = new Set();
                          for (const a of rows) {
                            const f = String(a.fecha_entrada || '');
                            if (setFeriados.has(f)) ferSet.add(f);
                          }
                          const feriadosTrab = ferSet.size;

                          // Tardanzas: contar días con tardanza efectiva > tolerancia
                          const tardSet = new Set();
                          for (const d of diasSet) {
                            const mins = tMap.get(`${leg}|${d}`);
                            if (mins != null && mins > TOL) tardSet.add(d);
                          }
                          const tardanzas = tardSet.size;
                          const pierdePresentismo = tardanzas >= 3;

                          // Escala salarial
                          const cat = String(emp.categoria || '').trim();
                          const esc = sMap.get(cat) || { basico: 0, premio_asistencia: 0, premio_manejo_fondos: 0 };
                          const basico = Number(esc.basico || 0);

                          // Antigüedad
                          const anios = diffAniosCompletos(emp.fecha_ingreso, r.end);
                          const montoAnt = basico * 0.02 * anios;
                          const valorHora = (basico + montoAnt) / 200;

                          // Nocturnidad por turnos (8h)
                          const horasNoct = nochesTurnos * 8;
                          const adicionalNoct = valorHora * horasNoct * NOCT_PCT;

                          // Premios
                          const premioAsis = pierdePresentismo ? 0 : Number(esc.premio_asistencia || 0);
                          const falt = Number(faltantes.get(leg) || 0);
                          const premioMfRaw = Number(esc.premio_manejo_fondos || 0);
                          const premioMf = Math.max(0, premioMfRaw - falt);

                          // Adelantos
                          const adelantos = Number(adMap.get(leg) || 0);

                          out.push({
                            legajo: leg,
                            nombre: emp.nombre,
                            sector: emp.sector,
                            puesto: emp.puesto,
                            categoria: cat,
                            fecha_ingreso: emp.fecha_ingreso,
                            dias_trabajados: diasTrab,
                            noches_turnos: nochesTurnos,
                            feriados_trabajados: feriadosTrab,
                            tardanzas,
                            pierde_presentismo: pierdePresentismo,
                            basico,
                            anios_antiguedad: anios,
                            monto_antiguedad: Number(montoAnt.toFixed(2)),
                            adicional_nocturnidad: Number(adicionalNoct.toFixed(2)),
                            premio_asistencia: Number(premioAsis.toFixed(2)),
                            premio_manejo_fondos_bruto: Number(premioMfRaw.toFixed(2)),
                            ajuste_manejo_fondos: Number(falt.toFixed(2)),
                            premio_manejo_fondos: Number(premioMf.toFixed(2)),
                            adelantos: Number(adelantos.toFixed(2)),
                          });
                        }

                        out.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
                        res.json({ ok: true, mes, rango: r, items: out });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      }
    );
  });
});


/* ===============================
   START
================================ */

/* ===============================
   CALENDARIO – API
================================ */

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00');
  const dbb = new Date(b + 'T00:00:00');
  const ms = dbb - da;
  return Math.floor(ms / (24 * 3600 * 1000));
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function turnoToHorario(puesto, turno) {
  return new Promise((resolve) => {
    if (!puesto || !turno || turno === 'FRANCO') return resolve({ inicio: null, fin: null });
    db.get('SELECT * FROM puesto_horarios WHERE puesto = ?', [puesto], (err, row) => {
      if (err || !row) return resolve({ inicio: null, fin: null });
      if (turno === 'MANIANA') return resolve({ inicio: row.manana_start ?? null, fin: row.manana_end ?? null });
      if (turno === 'TARDE') return resolve({ inicio: row.tarde_start ?? null, fin: row.tarde_end ?? null });
      if (turno === 'NOCHE') return resolve({ inicio: row.noche_start ?? null, fin: row.noche_end ?? null });
      return resolve({ inicio: null, fin: null });
    });
  });
}

// Patrones
app.get('/api/patrones', (req, res) => {
  db.all('SELECT * FROM calendario_patrones ORDER BY id DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error leyendo patrones' });
    res.json(rows || []);
  });
});

app.post('/api/patrones', (req, res) => {
  const { nombre, ciclo_dias, detalle } = req.body || {};
  if (!nombre || !ciclo_dias) return res.status(400).json({ error: 'Faltan datos (nombre, ciclo_dias)' });

  db.run('INSERT INTO calendario_patrones (nombre, ciclo_dias) VALUES (?, ?)', [nombre, Number(ciclo_dias)], function (err) {
    if (err) return res.status(500).json({ error: 'Error creando patrón' });
    const patron_id = this.lastID;

    if (Array.isArray(detalle) && detalle.length) {
      const stmt = db.prepare('INSERT INTO calendario_patron_detalle (patron_id, dia_idx, turno, puesto) VALUES (?, ?, ?, ?)');
      detalle.forEach((d) => {
        stmt.run([patron_id, Number(d.dia_idx), String(d.turno || '').toUpperCase(), d.puesto || null]);
      });
      stmt.finalize(() => res.json({ ok: true, id: patron_id }));
    } else {
      db.run(
        'INSERT INTO calendario_patron_detalle (patron_id, dia_idx, turno, puesto) VALUES (?, ?, ?, ?)',
        [patron_id, 0, 'FRANCO', null],
        () => res.json({ ok: true, id: patron_id })
      );
    }
  });
});

// Asignación patrón empleado
app.get('/api/empleados/:legajo/patron', (req, res) => {
  const legajo = req.params.legajo;
  db.get(
    'SELECT ep.legajo, ep.patron_id, ep.fecha_inicio, p.nombre as patron_nombre, p.ciclo_dias FROM calendario_empleado_patron ep JOIN calendario_patrones p ON p.id = ep.patron_id WHERE ep.legajo = ?',
    [legajo],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Error leyendo asignación' });
      if (!row) return res.json({});
      res.json(row);
    }
  );
});

app.put('/api/empleados/:legajo/patron', (req, res) => {
  const legajo = req.params.legajo;
  const { patron_id, fecha_inicio } = req.body || {};
  if (!patron_id || !fecha_inicio) return res.status(400).json({ error: 'Faltan datos (patron_id, fecha_inicio)' });

  db.get('SELECT id FROM calendario_patrones WHERE id = ?', [Number(patron_id)], (err, pRow) => {
    if (err || !pRow) return res.status(400).json({ error: 'Patrón inexistente' });
    db.run(
      "INSERT INTO calendario_empleado_patron (legajo, patron_id, fecha_inicio) VALUES (?, ?, ?) ON CONFLICT(legajo) DO UPDATE SET patron_id=excluded.patron_id, fecha_inicio=excluded.fecha_inicio",
      [legajo, Number(patron_id), fecha_inicio],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'Error guardando asignación' });
        res.json({ ok: true });
      }
    );
  });
});

// Excepciones (upsert por legajo+fecha)
app.post('/api/calendario/excepciones', (req, res) => {
  const { legajo, fecha, tipo, puesto_override, turno_override, motivo } = req.body || {};
  if (!legajo || !fecha || !tipo) return res.status(400).json({ error: 'Faltan datos (legajo, fecha, tipo)' });

  db.get('SELECT id FROM calendario_excepciones WHERE legajo=? AND fecha=?', [legajo, fecha], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error leyendo excepción' });

    const fields = [tipo, puesto_override || null, turno_override || null, motivo || null, legajo, fecha];
    if (row?.id) {
      db.run(
        'UPDATE calendario_excepciones SET tipo=?, puesto_override=?, turno_override=?, motivo=? WHERE legajo=? AND fecha=?',
        fields,
        (err2) => {
          if (err2) return res.status(500).json({ error: 'Error actualizando excepción' });
          res.json({ ok: true, id: row.id });
        }
      );
    } else {
      db.run(
        'INSERT INTO calendario_excepciones (tipo, puesto_override, turno_override, motivo, legajo, fecha) VALUES (?, ?, ?, ?, ?, ?)',
        fields,
        function (err2) {
          if (err2) return res.status(500).json({ error: 'Error creando excepción' });
          res.json({ ok: true, id: this.lastID });
        }
      );
    }
  });
});

app.delete('/api/calendario/excepciones/:id', (req, res) => {
  const id = Number(req.params.id);
  db.run('DELETE FROM calendario_excepciones WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error eliminando excepción' });
    res.json({ ok: true });
  });
});

// Calendario resuelto
app.get('/api/calendario/resuelto', async (req, res) => {
  const { legajo, desde, hasta } = req.query || {};
  if (!legajo || !desde || !hasta) return res.status(400).json({ error: 'Faltan parámetros (legajo, desde, hasta)' });

  try {
    const emp = await allSql('SELECT * FROM empleados WHERE legajo = ?', [legajo]);
    if (!emp.length) return res.status(404).json({ error: 'Legajo inexistente' });
    const empleado = emp[0];

    const asign = await allSql('SELECT * FROM calendario_empleado_patron WHERE legajo = ?', [legajo]);
    const excepciones = await allSql(
      'SELECT * FROM calendario_excepciones WHERE legajo=? AND fecha BETWEEN ? AND ? ORDER BY fecha',
      [legajo, desde, hasta]
    );
    const exMap = new Map(excepciones.map((x) => [x.fecha, x]));

    let patron = null;
    let detalleMap = new Map();
    if (asign.length) {
      patron = (await allSql('SELECT * FROM calendario_patrones WHERE id = ?', [asign[0].patron_id]))[0] || null;
      const det = await allSql('SELECT * FROM calendario_patron_detalle WHERE patron_id = ? ORDER BY dia_idx', [asign[0].patron_id]);
      detalleMap = new Map(det.map((d) => [Number(d.dia_idx), d]));
    }

    const dias = [];
    let curDate = desde;
    while (curDate <= hasta) {
      const ex = exMap.get(curDate);
      let fuente = '';
      let turno = '';
      let puesto = '';
      let excepcion_id = null;

      if (ex) {
        fuente = 'Excepción';
        excepcion_id = ex.id;
        turno = ex.turno_override ? String(ex.turno_override).toUpperCase() : '';
        puesto = ex.puesto_override || empleado.puesto || '';
        if (!turno) {
          if (['VACACIONES', 'LICENCIA', 'PERMISO', 'ENFERMEDAD'].includes(String(ex.tipo).toUpperCase())) turno = 'AUSENCIA';
        }
        if (String(ex.tipo).toUpperCase() === 'FRANCO_EXTRA' && !turno) turno = 'FRANCO';
      } else if (patron && asign.length) {
        fuente = 'Patrón';
        const diff = daysBetween(asign[0].fecha_inicio, curDate);
        const idx = ((diff % patron.ciclo_dias) + patron.ciclo_dias) % patron.ciclo_dias;
        const d = detalleMap.get(idx);
        turno = d ? String(d.turno).toUpperCase() : 'FRANCO';
        puesto = d && d.puesto ? d.puesto : (empleado.puesto || '');
      } else {
        fuente = 'Sin patrón';
        turno = '';
        puesto = empleado.puesto || '';
      }

      let hora_inicio_min = null;
      let hora_fin_min = null;
      if (['MANIANA', 'TARDE', 'NOCHE', 'FRANCO'].includes(turno)) {
        const h = await turnoToHorario(puesto, turno);
        hora_inicio_min = h.inicio;
        hora_fin_min = h.fin;
      }

      dias.push({
        fecha: curDate,
        puesto,
        turno,
        hora_inicio_min,
        hora_fin_min,
        fuente,
        excepcion_id,
        excepcion: ex
          ? {
              id: ex.id,
              tipo: ex.tipo,
              puesto_override: ex.puesto_override,
              turno_override: ex.turno_override ? String(ex.turno_override).toUpperCase() : '',
              motivo: ex.motivo,
            }
          : null,
      });

      curDate = addDays(curDate, 1);
    }

    res.json({ ok: true, dias });

// Calendario mensual para grilla (todos los empleados)
// Devuelve items: { fecha, sector, puesto, turno, horario, legajo, nombre }
app.get('/api/calendario/resuelto-mes', async (req, res) => {
  const { desde, hasta } = req.query || {};
  if (!desde || !hasta) return res.status(400).send('Faltan parametros desde/hasta');

  function normSectorForGrid(sector) {
    const g = sectorGroup(sector);
    if (g === 'shop') return 'MINI';
    if (g === 'playa') return 'PLAYA';
    // fallback: si es algo raro, lo mandamos a PLAYA para no perderlo
    return 'PLAYA';
  }

  function normPuestoForGrid(puesto) {
    const p = String(puesto || '').toLowerCase().trim();
    if (!p) return '';
    if (p.includes('playero')) return 'Playero/a';
    if (p.includes('auxiliar') && p.includes('playa')) return 'Auxiliar de playa';
    if (p.includes('refuerzo') && p.includes('playa')) return 'Refuerzo de playa';
    if (p.includes('cajer')) return 'Cajero/a';
    if (p.includes('auxiliar') && (p.includes('shop') || p.includes('caja'))) return 'Auxiliar de shop';
    return puesto;
  }

  function turnoLetter(turnoUpper) {
    const t = String(turnoUpper || '').toUpperCase();
    if (t === 'MANIANA') return 'M';
    if (t === 'TARDE') return 'T';
    if (t === 'NOCHE') return 'N';
    return '';
  }

  async function horarioKeyFor(puesto, turnoUpper) {
    const t = String(turnoUpper || '').toUpperCase();
    if (!puesto || !t) return '';
    if (!['MANIANA','TARDE','NOCHE'].includes(t)) return '';

    const h = await turnoToHorario(puesto, t);
    if (h.inicio == null || h.fin == null) return '';
    const ini = minToHHMM(h.inicio);
    const fin = minToHHMM(h.fin);
    return `${ini}-${fin}`;
  }

  async function resolveForEmpleado(empleado) {
    const legajo = normLegajo(empleado.legajo);
    if (!legajo) return [];

    const asign = await allSql('SELECT * FROM calendario_empleado_patron WHERE legajo = ?', [legajo]);
    const excepciones = await allSql(
      'SELECT * FROM calendario_excepciones WHERE legajo=? AND fecha BETWEEN ? AND ? ORDER BY fecha',
      [legajo, desde, hasta]
    );
    const exMap = new Map(excepciones.map((x) => [x.fecha, x]));

    let patron = null;
    let detalleMap = new Map();
    if (asign.length) {
      patron = (await allSql('SELECT * FROM calendario_patrones WHERE id = ?', [asign[0].patron_id]))[0] || null;
      const det = await allSql('SELECT * FROM calendario_patron_detalle WHERE patron_id = ? ORDER BY dia_idx', [asign[0].patron_id]);
      detalleMap = new Map(det.map((d) => [Number(d.dia_idx), d]));
    }

    const out = [];
    let curDate = desde;
    while (curDate <= hasta) {
      const ex = exMap.get(curDate);
      let turno = '';
      let puesto = '';

      if (ex) {
        turno = ex.turno_override ? String(ex.turno_override).toUpperCase() : '';
        puesto = ex.puesto_override || empleado.puesto || '';
        if (!turno) {
          const tipo = String(ex.tipo || '').toUpperCase();
          if (['VACACIONES','LICENCIA','PERMISO','ENFERMEDAD'].includes(tipo)) turno = 'AUSENCIA';
          if (tipo === 'FRANCO_EXTRA') turno = 'FRANCO';
        }
      } else if (patron && asign.length) {
        const diff = daysBetween(asign[0].fecha_inicio, curDate);
        const idx = ((diff % patron.ciclo_dias) + patron.ciclo_dias) % patron.ciclo_dias;
        const d = detalleMap.get(idx);
        turno = d ? String(d.turno).toUpperCase() : 'FRANCO';
        puesto = d && d.puesto ? d.puesto : (empleado.puesto || '');
      } else {
        // sin patrón: celda vacía
        turno = '';
        puesto = empleado.puesto || '';
      }

      const letra = turnoLetter(turno);
      if (letra) {
        const puestoGrid = normPuestoForGrid(puesto);
        const horario = await horarioKeyFor(puestoGrid, turno);
        out.push({
          fecha: curDate,
          sector: normSectorForGrid(empleado.sector),
          puesto: puestoGrid,
          turno: letra,
          horario,
          legajo,
          nombre: empleado.nombre || '',
        });
      }

      curDate = addDays(curDate, 1);
    }

    return out;
  }

  try {
    const empleados = await allSql('SELECT legajo, nombre, puesto, sector FROM empleados WHERE activo=1 ORDER BY nombre');
    const salida = [];
    for (const emp of empleados) {
      const items = await resolveForEmpleado(emp);
      salida.push(...items);
    }
    res.json(salida);
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message || 'Error generando calendario mensual');
  }
});

  } catch (e) {
    res.status(500).json({ error: 'Error generando calendario' });
  }
});



// // Seed / actualización de patrones base (idempotente por NOMBRE)
// Nota: si ya existen con el mismo nombre pero tenían el ciclo/orden mal, se corrigen.
function ensurePatron(nombre, ciclo_dias, detalle) {
  return new Promise((resolve) => {
    db.get('SELECT id FROM calendario_patrones WHERE nombre=?', [nombre], (err, row) => {
      if (err) return resolve();
      const upsertHeader = (id) => {
        db.run('UPDATE calendario_patrones SET ciclo_dias=? WHERE id=?', [Number(ciclo_dias), id], () => {
          db.run('DELETE FROM calendario_patron_detalle WHERE patron_id=?', [id], () => {
            const stmt = db.prepare('INSERT INTO calendario_patron_detalle (patron_id, dia_idx, turno, puesto) VALUES (?,?,?,?)');
            (detalle || []).forEach((d) => {
              stmt.run([id, Number(d.dia_idx), String(d.turno || '').toUpperCase(), d.puesto || null]);
            });
            stmt.finalize(() => resolve());
          });
        });
      };

      if (row?.id) return upsertHeader(row.id);

      db.run('INSERT INTO calendario_patrones (nombre, ciclo_dias) VALUES (?, ?)', [nombre, Number(ciclo_dias)], function (err2) {
        if (err2) return resolve();
        upsertHeader(this.lastID);
      });
    });
  });
}

(async () => {
  try {
    await ensurePatron('Fijo Mañana (trabaja)', 1, [
      { dia_idx: 0, turno: 'MANIANA', puesto: null },
    ]);

    // PLAYEROS: 5xM + 1F - 5xT + 1F - 5xN + 3F  (20 días)
    await ensurePatron('Playero/a — 5M+1F+5T+1F+5N+3F (20d)', 20, [
      ...Array.from({ length: 5 }).map((_, i) => ({ dia_idx: i, turno: 'MANIANA', puesto: null })),
      { dia_idx: 5, turno: 'FRANCO', puesto: null },
      ...Array.from({ length: 5 }).map((_, i) => ({ dia_idx: 6 + i, turno: 'TARDE', puesto: null })),
      { dia_idx: 11, turno: 'FRANCO', puesto: null },
      ...Array.from({ length: 5 }).map((_, i) => ({ dia_idx: 12 + i, turno: 'NOCHE', puesto: null })),
      { dia_idx: 17, turno: 'FRANCO', puesto: null },
      { dia_idx: 18, turno: 'FRANCO', puesto: null },
      { dia_idx: 19, turno: 'FRANCO', puesto: null },
    ]);

    // CAJERO SHOP: 4xM + 2F - 4xT + 2F  (12 días)
    await ensurePatron('Cajero/a — 4M+2F+4T+2F (12d)', 12, [
      ...Array.from({ length: 4 }).map((_, i) => ({ dia_idx: i, turno: 'MANIANA', puesto: null })),
      { dia_idx: 4, turno: 'FRANCO', puesto: null },
      { dia_idx: 5, turno: 'FRANCO', puesto: null },
      ...Array.from({ length: 4 }).map((_, i) => ({ dia_idx: 6 + i, turno: 'TARDE', puesto: null })),
      { dia_idx: 10, turno: 'FRANCO', puesto: null },
      { dia_idx: 11, turno: 'FRANCO', puesto: null },
    ]);

    // AUXILIAR DE PLAYA: base L-V fijo; fines de semana se gestionan con EXCEPCIONES (rotación manual)
    await ensurePatron('Auxiliar de playa — L a V Mañana + finde manual (7d)', 7, [
      { dia_idx: 0, turno: 'MANIANA', puesto: null }, // L
      { dia_idx: 1, turno: 'MANIANA', puesto: null }, // M
      { dia_idx: 2, turno: 'MANIANA', puesto: null }, // X
      { dia_idx: 3, turno: 'MANIANA', puesto: null }, // J
      { dia_idx: 4, turno: 'MANIANA', puesto: null }, // V
      { dia_idx: 5, turno: 'FRANCO', puesto: null },  // S (manual)
      { dia_idx: 6, turno: 'FRANCO', puesto: null },  // D (manual)
    ]);

    await ensurePatron('Auxiliar de playa — L a V Tarde + finde manual (7d)', 7, [
      { dia_idx: 0, turno: 'TARDE', puesto: null }, // L
      { dia_idx: 1, turno: 'TARDE', puesto: null }, // M
      { dia_idx: 2, turno: 'TARDE', puesto: null }, // X
      { dia_idx: 3, turno: 'TARDE', puesto: null }, // J
      { dia_idx: 4, turno: 'TARDE', puesto: null }, // V
      { dia_idx: 5, turno: 'FRANCO', puesto: null }, // S (manual)
      { dia_idx: 6, turno: 'FRANCO', puesto: null }, // D (manual)
    ]);

    // AUXILIAR SHOP: siempre L-V mañana (6-14); fines de semana vacío
    await ensurePatron('Auxiliar de shop — L a V Mañana fijo (7d)', 7, [
      { dia_idx: 0, turno: 'MANIANA', puesto: null },
      { dia_idx: 1, turno: 'MANIANA', puesto: null },
      { dia_idx: 2, turno: 'MANIANA', puesto: null },
      { dia_idx: 3, turno: 'MANIANA', puesto: null },
      { dia_idx: 4, turno: 'MANIANA', puesto: null },
      { dia_idx: 5, turno: 'FRANCO', puesto: null },
      { dia_idx: 6, turno: 'FRANCO', puesto: null },
    ]);
  } catch (e) {
    // no tirar abajo el server por seed
    console.error('Seed patrones: ', e?.message || e);
  }
})();
app.listen(PORT, () => console.log(`✅ KM325 corriendo en http://localhost:${PORT}`));