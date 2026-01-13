console.log("✅ SCRIPT ASISTENCIAS CARGADO - vFINAL");

let registrosTabla = []; // datos que vienen del servidor (/importar)

// ===============================
// HELPERS: tiempo y cálculos
// ===============================
function hhmmToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToHoursDecimal(min) {
  return Math.round((min / 60) * 100) / 100; // 2 decimales
}

function calcHoras(entrada, salida) {
  const ini = hhmmToMinutes(entrada);
  const fin0 = hhmmToMinutes(salida);
  if (ini === null || fin0 === null) return 0;

  let fin = fin0;
  if (fin < ini) fin += 24 * 60; // cruza medianoche

  const diff = fin - ini;
  if (diff < 0) return 0;
  return minutesToHoursDecimal(diff);
}

// calcula minutos nocturnos en ventana 21:00 → 06:00 (del día siguiente)
function calcNocturnas(entrada, salida) {
  const ini = hhmmToMinutes(entrada);
  const fin0 = hhmmToMinutes(salida);
  if (ini === null || fin0 === null) return 0;

  let fin = fin0;
  if (fin < ini) fin += 24 * 60;

  // tramo trabajado [ini, fin]
  // tramo nocturno: [21:00, 30:00] (06:00 del día siguiente = 24+6=30)
  const noctIni = 21 * 60;
  const noctFin = 30 * 60;

  // si el inicio está de madrugada (ej 02:00) lo interpretamos como 26:00 para el cálculo continuo
  let iniAdj = ini;
  if (ini < 6 * 60) iniAdj += 24 * 60;

  // lo mismo con fin si cae de madrugada y todavía no ajustamos (pero arriba ya ajusta por cruce)
  let finAdj = fin;
  if (finAdj < 6 * 60) finAdj += 24 * 60;

  const a = Math.max(iniAdj, noctIni);
  const b = Math.min(finAdj, noctFin);

  const minutos = Math.max(0, b - a);
  return minutesToHoursDecimal(minutos);
}

// Fecha salida: si cruza medianoche => fecha+1
function calcFechaSalida(fechaISO, entrada, salida) {
  const ini = hhmmToMinutes(entrada);
  const fin = hhmmToMinutes(salida);
  if (ini === null || fin === null) return fechaISO;

  if (fin < ini) {
    const d = new Date(fechaISO + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return fechaISO;
}

// ===============================
// RENDER TABLA
// ===============================
function crearSelectPuesto(valorActual) {
  const puestos = ["", "Playero", "Auxiliar de playa", "Cajero shop"];
  const sel = document.createElement("select");

  puestos.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p ? p : "-- Seleccionar --";
    if ((valorActual || "") === p) opt.selected = true;
    sel.appendChild(opt);
  });

  return sel;
}

function renderTabla() {
  const tbody = document.getElementById("tabla-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  registrosTabla.forEach((r, idx) => {
    const tr = document.createElement("tr");

    // Legajo
    tr.appendChild(tdText(r.legajo));

    // Nombre
    tr.appendChild(tdText(r.nombre));

    // Sector
    tr.appendChild(tdText(r.sector));

    // Puesto (editable)
    const tdPuesto = document.createElement("td");
    const selPuesto = crearSelectPuesto(r.puesto || "");
    selPuesto.addEventListener("change", () => {
      registrosTabla[idx].puesto = selPuesto.value;
    });
    tdPuesto.appendChild(selPuesto);
    tr.appendChild(tdPuesto);

    // Fecha
    tr.appendChild(tdText(r.fecha));

    // Entrada editable (time)
    const tdEntrada = document.createElement("td");
    const inEntrada = document.createElement("input");
    inEntrada.type = "time";
    inEntrada.value = r.entrada || "";
    inEntrada.addEventListener("input", () => {
      registrosTabla[idx].entrada = inEntrada.value;
      recalcularFila(idx);
    });
    tdEntrada.appendChild(inEntrada);
    tr.appendChild(tdEntrada);

    // Salida editable (time)
    const tdSalida = document.createElement("td");
    const inSalida = document.createElement("input");
    inSalida.type = "time";
    inSalida.value = r.salida || "";
    inSalida.addEventListener("input", () => {
      registrosTabla[idx].salida = inSalida.value;
      recalcularFila(idx);
    });
    tdSalida.appendChild(inSalida);
    tr.appendChild(tdSalida);

    // Horas
    const tdHoras = tdText(format2(r.horas || 0));
    tdHoras.dataset.role = "horas";
    tr.appendChild(tdHoras);

    // Fecha salida
    const tdFechaSalida = tdText(r.fecha_salida || r.fecha);
    tdFechaSalida.dataset.role = "fecha_salida";
    tr.appendChild(tdFechaSalida);

    // Nocturnas
    const tdNoct = tdText(format2(r.nocturnas || 0));
    tdNoct.dataset.role = "nocturnas";
    tr.appendChild(tdNoct);

    // Acción: botón invertir (por turnos noche)
    const tdAcc = document.createElement("td");
    const btn = document.createElement("button");
    btn.className = "btn-mini";
    btn.type = "button";
    btn.textContent = "↔";
    btn.title = "Invertir Entrada/Salida (turno noche)";
    btn.addEventListener("click", () => {
      const temp = registrosTabla[idx].entrada;
      registrosTabla[idx].entrada = registrosTabla[idx].salida;
      registrosTabla[idx].salida = temp;
      // refrescar inputs (re-render más simple)
      renderTabla();
      recalcularFila(idx);
    });
    tdAcc.appendChild(btn);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);

    // cálculo inicial
    recalcularFila(idx);
  });
}

function tdText(val) {
  const td = document.createElement("td");
  td.textContent = val ?? "";
  return td;
}

function format2(n) {
  const num = Number(n || 0);
  return num.toFixed(2);
}

// Recalcula horas / nocturnas / fecha salida de una fila
function recalcularFila(idx) {
  const r = registrosTabla[idx];
  if (!r) return;

  r.horas = calcHoras(r.entrada, r.salida);
  r.nocturnas = calcNocturnas(r.entrada, r.salida);
  r.fecha_salida = calcFechaSalida(r.fecha, r.entrada, r.salida);

  const tbody = document.getElementById("tabla-body");
  if (!tbody) return;
  const row = tbody.children[idx];
  if (!row) return;

  const tdHoras = row.querySelector('td[data-role="horas"]');
  const tdFechaSalida = row.querySelector('td[data-role="fecha_salida"]');
  const tdNoct = row.querySelector('td[data-role="nocturnas"]');

  if (tdHoras) tdHoras.textContent = format2(r.horas);
  if (tdFechaSalida) tdFechaSalida.textContent = r.fecha_salida;
  if (tdNoct) tdNoct.textContent = format2(r.nocturnas);

  // marcar sospechoso si horas == 0 y entrada==salida (posible jornada abierta)
  row.classList.toggle("sospechoso", (r.horas === 0 && r.entrada && r.salida && r.entrada === r.salida));
}

// ===============================
// IMPORTAR EXCEL
// ===============================
const form = document.getElementById("form-excel");
const inputArchivo = document.getElementById("archivo");
const resumenDiv = document.getElementById("resumen");

if (form && inputArchivo) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!inputArchivo.files.length) {
      alert("Seleccioná un archivo .xlsx");
      return;
    }

    const formData = new FormData();
    formData.append("archivo", inputArchivo.files[0]);

    try {
      const res = await fetch("/importar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Error al subir archivo");

      const data = await res.json();
      console.log("✅ Respuesta servidor:", data);

      // Guardamos registros para render
      registrosTabla = (data.ejemplo || []).map((r) => ({
        ...r,
        // aseguramos campos
        puesto: r.puesto || "",
        horas: Number(r.horas || 0),
        nocturnas: Number(r.nocturnas || 0),
        fecha_salida: r.fecha_salida || r.fecha,
        abierta: r.abierta ? 1 : 0,
      }));

      if (resumenDiv) {
        resumenDiv.innerHTML = `
          <strong>Registros originales:</strong> ${data.registros_originales ?? "-"}<br>
          <strong>Registros procesados:</strong> ${data.registros_procesados ?? "-"}
        `;
      }

      renderTabla();
    } catch (err) {
      console.error(err);
      alert("No se pudo subir el archivo");
    }
  });
}

// ===============================
// CONFIRMAR Y GUARDAR (DB)
// ===============================
const btnGuardar = document.getElementById("btn-guardar") || document.getElementById("btn-guardar") || document.getElementById("btn-guardar");
const btnConfirmar = document.getElementById("btn-confirmar") || document.getElementById("btn-guardar") || document.getElementById("btn-guardar");
const estado = document.getElementById("estado-guardado") || document.getElementById("guardado");

const botonFinal = document.getElementById("btn-guardar") || document.getElementById("btn-confirmar") || document.getElementById("btn-guardar") || null;

// compat: tu botón puede llamarse btn-guardar o btn-confirmar, tomamos cualquiera
const btn = document.getElementById("btn-guardar") || document.getElementById("btn-confirmar");

if (btn) {
  btn.addEventListener("click", async () => {
    if (!registrosTabla.length) {
      alert("Primero importá un archivo.");
      return;
    }

    // armamos payload para backend
    const payload = {
      registros: registrosTabla.map((r) => ({
        legajo: r.legajo,
        nombre: r.nombre,
        sector: r.sector,
        puesto: r.puesto || "",
        fecha: r.fecha,
        fecha_salida: r.fecha_salida || r.fecha,
        entrada: r.entrada || "",
        salida: r.salida || "",
        horas: Number(r.horas || 0),
        nocturnas: Number(r.nocturnas || 0),
        abierta: r.abierta ? 1 : 0
      })),
    };

    try {
      const res = await fetch("/api/asistencias/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No se pudo guardar");
      }

      if (estado) {
        estado.textContent = `✅ Guardado OK: ${data.guardados ?? payload.registros.length} registros`;
      } else {
        alert("Guardado OK");
      }
    } catch (err) {
      console.error(err);
      alert("Error guardando en la base");
      if (estado) estado.textContent = "❌ Error al guardar";
    }
  });
}
