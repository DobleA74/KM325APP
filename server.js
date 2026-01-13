/* ===============================
   IMPORTS
================================ */
const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

/* ===============================
   CONFIGURACIÓN INICIAL
================================ */
const app = express();
const PORT = 3001;

/* ===============================
   MIDDLEWARES
================================ */
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// evitar error favicon
app.get("/favicon.ico", (req, res) => res.status(204).end());

// carpeta uploads
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

/* ===============================
   SQLITE
================================ */
const db = new sqlite3.Database(path.join(__dirname, "km325.db"));


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
    CREATE TABLE IF NOT EXISTS jornadas_abiertas (
      legajo TEXT PRIMARY KEY,
      nombre TEXT,
      sector TEXT,
      puesto TEXT,
      fecha_entrada TEXT,
      entrada TEXT,
      creado_en TEXT DEFAULT (datetime('now'))
    )
  `);
});

/* ===============================
   MULTER
================================ */
const upload = multer({ dest: "uploads/" });

/* ===============================
   UTILIDADES
================================ */
function excelDateToISO(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().slice(0, 10);
}

function agruparPorDia(fichadas) {
  const grupos = {};

  fichadas.forEach((f) => {
    const key = `${f.legajo}_${f.fecha}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(f);
  });

  return Object.values(grupos).map((reg) => {
    reg.sort((a, b) => a.hora.localeCompare(b.hora));
    return {
      legajo: reg[0].legajo,
      nombre: reg[0].nombre,
      sector: reg[0].sector,
      fecha: excelDateToISO(reg[0].fecha),
      entrada: reg[0].hora,
      salida: reg[reg.length - 1].hora,
    };
  });
}

const esTarde = (h) => h >= "18:00";
const esTemprano = (h) => h <= "12:00";

/* ===============================
   IMPORTAR EXCEL
================================ */
app.post("/importar", upload.single("archivo"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Sin archivo" });

    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const fichadas = filas
      .filter((f) => /^\d+$/.test(f["Persona"]))
      .map((f) => ({
        fecha: f["Fecha / hora"],
        hora: f["Evento"],
        legajo: f["Persona"],
        nombre: f["DEPARTAMENTO"],
        sector: f["EmpresaVisita"],
      }));

    const resumen = agruparPorDia(fichadas);

    db.all("SELECT legajo, puesto FROM empleados", [], (err, empleados) => {
      const mapPuesto = {};
      (empleados || []).forEach((e) => (mapPuesto[e.legajo] = e.puesto));

      const registros = resumen.map((r) => ({
        ...r,
        puesto: mapPuesto[r.legajo] || "",
        abierta: r.entrada === r.salida && esTarde(r.entrada),
      }));

      // cerrar jornadas abiertas con fichada temprana
      registros.forEach((r) => {
        if (r.entrada === r.salida && esTemprano(r.entrada)) {
          db.get(
            "SELECT * FROM jornadas_abiertas WHERE legajo=?",
            [r.legajo],
            (err, abierta) => {
              if (!abierta) return;

              db.run(
                `INSERT INTO asistencias
                 (legajo,nombre,sector,puesto,fecha_entrada,fecha_salida,entrada,salida,horas,nocturnas)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [
                  abierta.legajo,
                  abierta.nombre,
                  abierta.sector,
                  abierta.puesto,
                  abierta.fecha_entrada,
                  r.fecha,
                  abierta.entrada,
                  r.entrada,
                  0,
                  0,
                ],
                () => {
                  db.run("DELETE FROM jornadas_abiertas WHERE legajo=?", [
                    r.legajo,
                  ]);
                }
              );
            }
          );
        }
      });

      // abrir nuevas jornadas
      registros.forEach((r) => {
        if (r.abierta) {
          db.run(
            `INSERT OR REPLACE INTO jornadas_abiertas
             (legajo,nombre,sector,puesto,fecha_entrada,entrada)
             VALUES (?,?,?,?,?,?)`,
            [r.legajo, r.nombre, r.sector, r.puesto, r.fecha, r.entrada]
          );
        }
      });

      try {
        fs.unlinkSync(req.file.path);
      } catch {}

      res.json({
        registros_originales: fichadas.length,
        registros_procesados: registros.length,
        ejemplo: registros,
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
  if (!Array.isArray(registros))
    return res.status(400).json({ error: "Formato inválido" });

  const stmt = db.prepare(`
    INSERT INTO asistencias
    (legajo,nombre,sector,puesto,fecha_entrada,fecha_salida,entrada,salida,horas,nocturnas)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  registros.forEach((r) => {
    if (!r.abierta) {
      stmt.run([
        r.legajo,
        r.nombre,
        r.sector,
        r.puesto,
        r.fecha,
        r.fecha_salida,
        r.entrada,
        r.salida,
        Number(r.horas || 0),
        Number(r.nocturnas || 0),
      ]);
    }
  });

  stmt.finalize();
  res.json({ ok: true, guardados: registros.length });
});

/* ===============================
   ABM EMPLEADOS (API)
================================ */


app.delete("/api/empleados/:legajo", (req, res) => {
  const legajo = req.params.legajo;

  db.run("DELETE FROM empleados WHERE legajo=?", [legajo], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ ok: true });
  });
});

app.get("/api/empleados", (req, res) => {
  db.all("SELECT * FROM empleados ORDER BY legajo", [], (e, rows) => {
    if (e) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

app.post("/api/empleados", (req, res) => {
  const { legajo, nombre, sector, puesto } = req.body;
  if (!legajo) return res.status(400).json({ error: "Falta legajo" });

  db.run(
    "INSERT OR REPLACE INTO empleados VALUES (?,?,?,?,1)",
    [legajo, nombre || "", sector || "", puesto || ""],
    () => res.json({ ok: true })
  );
});
/* ===============================
   API: CONSULTAR ASISTENCIAS
   GET /api/asistencias?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&legajo=&puesto=&sector=
================================ */
app.get("/api/asistencias", (req, res) => {
  const { desde, hasta, legajo, puesto, sector } = req.query;

  let where = [];
  let params = [];

  // filtro por rango de fechas (usamos fecha_entrada)
  if (desde) {
    where.push("fecha_entrada >= ?");
    params.push(desde);
  }
  if (hasta) {
    where.push("fecha_entrada <= ?");
    params.push(hasta);
  }

  if (legajo) {
    where.push("legajo = ?");
    params.push(legajo);
  }
  if (puesto) {
    where.push("puesto = ?");
    params.push(puesto);
  }
  if (sector) {
    where.push("sector = ?");
    params.push(sector);
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT id, legajo, nombre, sector, puesto,
           fecha_entrada, fecha_salida, entrada, salida,
           horas, nocturnas
    FROM asistencias
    ${whereSQL}
    ORDER BY fecha_entrada DESC, entrada DESC, id DESC
    LIMIT 500
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ rows: rows || [] });
  });
});

/* ===============================
   API: ELIMINAR ASISTENCIA
   DELETE /api/asistencias/:id
================================ */
app.delete("/api/asistencias/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  db.run("DELETE FROM asistencias WHERE id = ?", [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB error" });
    }
    res.json({ ok: true });
  });
});

/* ===============================
   RUTA PRINCIPAL
================================ */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ===============================
   START
================================ */
app.listen(PORT, () => {
  console.log(`✅ KM325 RRHH - Servidor OK en http://localhost:${PORT}`);
});
