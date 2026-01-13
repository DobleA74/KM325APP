console.log("✅ SCRIPT NUEVO CARGADO - v2");

const form = document.getElementById("form-excel");
const inputArchivo = document.getElementById("archivo");
const tablaBody = document.getElementById("tabla-body");
const resumenDiv = document.getElementById("resumen");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!inputArchivo.files.length) {
    alert("Seleccioná un archivo Excel");
    return;
  }

  const formData = new FormData();
  formData.append("archivo", inputArchivo.files[0]);

  try {
    const res = await fetch("/importar", { method: "POST", body: formData });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Respuesta no OK:", res.status, text);
      alert("Error al importar (backend)");
      return;
    }

    const data = await res.json();
    console.log("✅ Respuesta servidor:", data);

    // Resumen
    if (resumenDiv) {
      resumenDiv.innerHTML = `
        <strong>Registros originales:</strong> ${
          data.registros_originales ?? "-"
        }<br>
        <strong>Registros procesados:</strong> ${
          data.registros_procesados ?? "-"
        }
      `;
    }

    // Tabla
    const registros = data.ejemplo || [];
    console.log("📌 Registros para tabla:", registros);

    renderTabla(registros);
  } catch (err) {
    console.error("❌ Error fetch:", err);
    alert("No se pudo importar el archivo (frontend)");
  }
});

function sumarUnDia(fechaISO) {
  const d = new Date(fechaISO + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// minutos entre dos horarios en el mismo “eje” (si cruza, suma 24h)
function minutosEntre(entrada, salida) {
  if (!entrada || !salida) return null;
  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);
  if ([hE, mE, hS, mS].some((n) => Number.isNaN(n))) return null;

  let ini = hE * 60 + mE;
  let fin = hS * 60 + mS;
  if (fin < ini) fin += 1440;
  return fin - ini;
}

// calcula minutos nocturnos dentro de la ventana 21:00–06:00 (dos tramos)
function minutosNocturnos(entrada, salida) {
  const dur = minutosEntre(entrada, salida);
  if (dur === null) return null;

  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);

  let ini = hE * 60 + mE;
  let fin = hS * 60 + mS;
  if (fin < ini) fin += 1440;

  // Ventana nocturna en el mismo eje:
  // tramo 1: 21:00–24:00  => [1260, 1440)
  // tramo 2: 00:00–06:00  => [1440, 1800) (al día siguiente)
  const noct1_ini = 21 * 60; // 1260
  const noct1_fin = 24 * 60; // 1440
  const noct2_ini = 24 * 60; // 1440
  const noct2_fin = 24 * 60 + 6 * 60; // 1800

  const solape = (a1, a2, b1, b2) =>
    Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

  const n1 = solape(ini, fin, noct1_ini, noct1_fin);
  const n2 = solape(ini, fin, noct2_ini, noct2_fin);

  return n1 + n2;
}

function renderTabla(registros) {
  tablaBody.innerHTML = "";

  if (!registros.length) {
    tablaBody.innerHTML = `<tr><td colspan="10">Sin registros para mostrar</td></tr>`;
    return;
  }

  registros.forEach((r) => {
    const tr = document.createElement("tr");

    tr.appendChild(tdTexto(r.legajo));
    tr.appendChild(tdTexto(r.nombre));
    tr.appendChild(tdTexto(r.sector));

    // PUESTO (editable por ahora)
    const tdPuesto = document.createElement("td");
    const selPuesto = document.createElement("select");
    selPuesto.className = "puesto";

    const opciones = [
      "", // vacío
      "Playero",
      "Auxiliar de playa",
      "Cajero shop",
    ];

    opciones.forEach((op) => {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op === "" ? "-- Seleccionar --" : op;
      selPuesto.appendChild(opt);
    });

    tdPuesto.appendChild(selPuesto);
    tr.appendChild(tdPuesto);

    // Fecha base (entrada)
    const tdFecha = tdTexto(r.fecha);
    tr.appendChild(tdFecha);

    // Entrada
    const tdEntrada = document.createElement("td");
    const inEntrada = document.createElement("input");
    inEntrada.type = "time";
    inEntrada.value = r.entrada || "";
    inEntrada.className = "entrada";
    tdEntrada.appendChild(inEntrada);
    tr.appendChild(tdEntrada);

    // Salida
    const tdSalida = document.createElement("td");
    const inSalida = document.createElement("input");
    inSalida.type = "time";
    inSalida.value = r.salida || "";
    inSalida.className = "salida";
    tdSalida.appendChild(inSalida);
    tr.appendChild(tdSalida);

    // Horas totales
    const tdHoras = document.createElement("td");
    tdHoras.className = "horas";
    tr.appendChild(tdHoras);

    // Fecha salida (calculada)
    const tdFechaSalida = document.createElement("td");
    tdFechaSalida.className = "fecha-salida";
    tr.appendChild(tdFechaSalida);

    // Horas nocturnas
    const tdNoct = document.createElement("td");
    tdNoct.className = "nocturnas";
    tr.appendChild(tdNoct);

    // Acción: invertir
    const tdAccion = document.createElement("td");
    const btnInvertir = document.createElement("button");
    btnInvertir.type = "button";
    btnInvertir.className = "invertir";
    btnInvertir.innerText = "↔";
    btnInvertir.title = "Invertir entrada/salida";
    tdAccion.appendChild(btnInvertir);
    tr.appendChild(tdAccion);

    const recalcular = () => {
      const entrada = inEntrada.value;
      const salida = inSalida.value;

      // Totales
      const mins = minutosEntre(entrada, salida);
      tdHoras.innerText = mins === null ? "" : (mins / 60).toFixed(2);

      // Fecha salida: si cruza medianoche -> +1 día
      if (entrada && salida) {
        const [hE] = entrada.split(":").map(Number);
        const [hS] = salida.split(":").map(Number);

        const cruza =
          hS * 60 + Number(salida.split(":")[1]) <
          hE * 60 + Number(entrada.split(":")[1]);
        tdFechaSalida.innerText = cruza ? sumarUnDia(r.fecha) : r.fecha;
      } else {
        tdFechaSalida.innerText = "";
      }

      // Nocturnas
      const noctMins = minutosNocturnos(entrada, salida);
      tdNoct.innerText = noctMins === null ? "" : (noctMins / 60).toFixed(2);

      // Resaltado sospechoso si > 12hs
      tr.classList.remove("sospechoso");
      if (mins !== null && mins / 60 > 12) tr.classList.add("sospechoso");
    };

    inEntrada.addEventListener("input", recalcular);
    inSalida.addEventListener("input", recalcular);

    btnInvertir.addEventListener("click", () => {
      const tmp = inEntrada.value;
      inEntrada.value = inSalida.value;
      inSalida.value = tmp;
      recalcular();
    });

    recalcular();
    tablaBody.appendChild(tr);
  });
}

function tdTexto(texto) {
  const td = document.createElement("td");
  td.innerText = texto ?? "";
  return td;
}

// Turno noche: si salida < entrada, se asume cruce de medianoche
function calcularHoras(entrada, salida) {
  if (!entrada || !salida) return "";

  const [hE, mE] = entrada.split(":").map(Number);
  const [hS, mS] = salida.split(":").map(Number);

  if ([hE, mE, hS, mS].some((n) => Number.isNaN(n))) return "";

  let inicio = hE * 60 + mE;
  let fin = hS * 60 + mS;

  if (fin < inicio) fin += 24 * 60;

  return ((fin - inicio) / 60).toFixed(2);
}
