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
  dest: "uploads/"
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

  fichadas.forEach(f => {
    const key = `${f.legajo}_${f.fecha}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(f);
  });

  return Object.values(grupos).map(registros => {
    registros.sort((a, b) => a.hora.localeCompare(b.hora));

    return {
      legajo: registros[0].legajo,
      nombre: registros[0].nombre,
      sector: registros[0].sector,
      sucursal: registros[0].sucursal,
      fecha: excelDateToJSDate(registros[0].fecha),
      entrada: registros[0].hora,
      salida: registros[registros.length - 1].hora
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
      .filter(f => /^\d+$/.test(f["Persona"]))
      .map(f => ({
        fecha: f["Fecha / hora"],
        hora: f["Evento"],
        legajo: f["Persona"],
        nombre: f["DEPARTAMENTO"],
        sector: f["EmpresaVisita"],
        sucursal: f["__EMPTY"]
      }));

    // Agrupar por día
    const resumen = agruparPorDia(fichadas);

    // Borrar archivo temporal
    fs.unlinkSync(req.file.path);

    // Enviar tabla HTML editable
    res.send(renderTabla(resumen));

  } catch (error) {
    console.error(error);
    res.status(500).send("Error procesando el archivo");
  }
});

/* ===============================
   HTML TABLA EDITABLE
================================ */

function renderTabla(registros) {

  const filasHTML = registros.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.legajo}</td>
      <td>${r.nombre}</td>
      <td>${r.sector}</td>
      <td>${r.fecha}</td>
      <td contenteditable="true" class="entrada">${r.entrada}</td>
      <td contenteditable="true" class="salida">${r.salida}</td>
      <td contenteditable="true" class="total">00:00</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Control de Asistencias</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 6px; text-align: center; }
    th { background: #eee; }
    td[contenteditable] { background: #fff3cd; }
    .total { background: #d1ecf1; font-weight: bold; }
    button { margin-top: 15px; padding: 10px 20px; }
  </style>
</head>
<body>

<h2>Tabla preliminar de fichadas</h2>
<p>Editá entradas y salidas. El total se calcula automáticamente.</p>

<table id="tabla">
  <thead>
    <tr>
      <th>#</th>
      <th>Legajo</th>
      <th>Nombre</th>
      <th>Sector</th>
      <th>Fecha</th>
      <th>Entrada</th>
      <th>Salida</th>
      <th>Horas trabajadas</th>
    </tr>
  </thead>
  <tbody>
    ${filasHTML}
  </tbody>
</table>

<button onclick="alert('Próximo paso: guardar definitivo')">
  Confirmar
</button>

<script>
function calcularHoras(entrada, salida) {
  if (!entrada || !salida) return "00:00";

  const [eh, em] = entrada.split(":").map(Number);
  const [sh, sm] = salida.split(":").map(Number);

  if (isNaN(eh) || isNaN(sh)) return "00:00";

  let inicio = eh * 60 + em;
  let fin = sh * 60 + sm;

  if (fin < inicio) fin += 24 * 60; // cruza medianoche

  const diff = fin - inicio;
  const horas = Math.floor(diff / 60);
  const minutos = diff % 60;

  return \`\${String(horas).padStart(2, "0")}:\${String(minutos).padStart(2, "0")}\`;
}

// Recalcular cuando se edita
document.querySelectorAll("#tabla tbody tr").forEach(row => {
  const entrada = row.querySelector(".entrada");
  const salida = row.querySelector(".salida");
  const total = row.querySelector(".total");

  function actualizar() {
    total.innerText = calcularHoras(entrada.innerText, salida.innerText);
  }

  entrada.addEventListener("input", actualizar);
  salida.addEventListener("input", actualizar);

  // cálculo inicial
  actualizar();
});
</script>

</body>
</html>
`;
}


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
