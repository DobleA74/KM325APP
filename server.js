/* ===============================
   IMPORTS
================================ */

// Framework para servidor HTTP
const express = require("express");

// Middleware para subir archivos (input type="file")
const multer = require("multer");

// Librería para leer archivos Excel
const XLSX = require("xlsx");

// Manejo de rutas de archivos
const path = require("path");

// Manejo de sistema de archivos
const fs = require("fs");

/* ===============================
   CONFIGURACIÓN INICIAL
================================ */

const app = express();
const PORT = 3001;

// Permite servir archivos estáticos (HTML, CSS, JS)
app.use(express.static("public"));

// Permite leer datos de formularios
app.use(express.urlencoded({ extended: true }));

/* ===============================
   CONFIG MULTER
   (archivos temporales)
================================ */

const upload = multer({
  dest: "uploads/",
});

/* ===============================
   UTILIDADES
================================ */

// Convierte fecha Excel (número) a YYYY-MM-DD
function excelDateToJSDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split("T")[0];
}

// Agrupa fichadas por legajo + fecha
function agruparPorDia(fichadas) {
  const grupos = {};

  fichadas.forEach((f) => {
    const key = `${f.legajo}_${f.fecha}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(f);
  });

  return Object.values(grupos).map((registros) => {
    registros.sort((a, b) => a.hora.localeCompare(b.hora));

    return {
      legajo: registros[0].legajo,
      nombre: registros[0].nombre,
      sector: registros[0].sector,
      sucursal: registros[0].sucursal,
      fecha: excelDateToJSDate(registros[0].fecha),
      entrada: registros[0].hora,
      salida: registros[registros.length - 1].hora,
    };
  });
}

/* ===============================
   ENDPOINT IMPORTAR EXCEL
================================ */

app.post("/importar", upload.single("archivo"), (req, res) => {
  try {
    if (!req.file) {
      return res.send("No se recibió ningún archivo");
    }

    // Leer archivo Excel
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir a JSON
    const filas = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Normalizar fichadas válidas
    const fichadas = filas
      .filter((f) => /^\d+$/.test(f["Persona"]))
      .map((f) => ({
        fecha: f["Fecha / hora"],
        hora: f["Evento"],
        legajo: f["Persona"],
        nombre: f["DEPARTAMENTO"],
        sector: f["EmpresaVisita"],
        sucursal: f["__EMPTY"],
      }));

    // Agrupar por día
    const resumen = agruparPorDia(fichadas);

    // Borrar archivo temporal
    fs.unlinkSync(req.file.path);

    // Enviar tabla HTML editable
    res.json({
      registros_originales: fichadas.length,
      registros_procesados: resumen.length,
      ejemplo: resumen,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error procesando el archivo");
  }
});

/* ===============================
   HTML TABLA EDITABLE
================================ */


/* ===============================
   RUTA PRINCIPAL
================================ */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ===============================
   INICIO DEL SERVIDOR
================================ */

app.listen(PORT, () => {
  console.log(`✅ KM325 RRHH - Servidor OK en http://localhost:${PORT}`);
});
