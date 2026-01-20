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
  const { legajo, nombre, sector, puesto } = req.body || {};
  const L = normLegajo(legajo);
  if (!L) return res.status(400).json({ error: "Falta legajo" });

  db.run(
    "INSERT OR REPLACE INTO empleados (legajo,nombre,sector,puesto,activo) VALUES (?,?,?,?,1)",
    [L, String(nombre || ""), String(sector || ""), String(puesto || "")],
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
   START
================================ */
app.listen(PORT, () => console.log(`✅ KM325 corriendo en http://localhost:${PORT}`));