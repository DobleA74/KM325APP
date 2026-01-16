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
const PORT = 3001;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ===============================
   SQLITE
================================ */
const db = new sqlite3.Database("km325.db");

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
   START
================================ */
app.listen(PORT, () => console.log(`✅ KM325 corriendo en http://localhost:${PORT}`));