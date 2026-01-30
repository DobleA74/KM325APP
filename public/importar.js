console.log("✅ importar.js cargado");

const form = document.getElementById("form-excel");
const inputArchivo = document.getElementById("archivo");
const resumen = document.getElementById("resumen");
const tbody = document.getElementById("rows");
const btnConfirmar = document.getElementById("btn-confirmar");

// Modal Falta de fichada
const modalFalta = document.getElementById("modal-falta-fichada");
const faltaList = document.getElementById("falta-fichada-list");
const btnFaltaCerrar = document.getElementById("btn-falta-cerrar");
const btnFaltaRRHH = document.getElementById("btn-falta-rrhh");
const btnFaltaRegularizar = document.getElementById("btn-falta-regularizar");

let faltasPendientes = [];

function openFaltaModal(faltas){
  faltasPendientes = Array.isArray(faltas) ? faltas : [];
  if(!modalFalta || !faltaList) return;

  if(!faltasPendientes.length){
    modalFalta.classList.remove('open');
    return;
  }

  faltaList.innerHTML = faltasPendientes.map(f => {
    const fecha = f.fecha || '';
    const count = f.count || (f.empleados||[]).length || 0;
    const emps = (f.empleados || []).map(e => `${escapeHtml(e.nombre || '')} <span class="small">(${escapeHtml(e.legajo || '')})</span>`).join('<br/>');
    return `<div style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:12px; margin-bottom:10px;">
      <div style="font-weight:700; margin-bottom:6px;">${escapeHtml(fecha)} — ${count} empleado(s)</div>
      <div class="small">${emps || '—'}</div>
    </div>`;
  }).join('');

  modalFalta.classList.add('open');
}

if(btnFaltaCerrar){
  btnFaltaCerrar.addEventListener('click', () => {
    if(modalFalta) modalFalta.classList.remove('open');
    faltasPendientes = [];
  });
}


if(btnFaltaRegularizar){
  btnFaltaRegularizar.addEventListener('click', () => {
    if(!faltasPendientes.length) return;

    // Guardamos en localStorage para abrir Jornadas abiertas con los casos ya listados
    try{
      localStorage.setItem('km325_faltas_pendientes', JSON.stringify(faltasPendientes));
    }catch(e){}

    // Ir a la pantalla donde se puede crear/editar/cerrar manualmente
    window.location.href = '/asistencias/jornadas?from=faltas';
  });
}

if(btnFaltaRRHH){
  btnFaltaRRHH.addEventListener('click', async () => {
    if(!faltasPendientes.length) return;

    const payload = {
      faltas: faltasPendientes.map(f => ({
        fecha: f.fecha,
        legajos: (f.empleados||[]).map(e => e.legajo).filter(Boolean),
      }))
    };

    btnFaltaRRHH.disabled = true;
    try{
      const r = await fetch('/api/novedades/falta-fichada', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar');

      alert(`Marcado como ausencia en novedades RRHH: ${data.insertados} (ignorados: ${data.ignorados})`);
      if(modalFalta) modalFalta.classList.remove('open');
      faltasPendientes = [];
    }catch(e){
      alert(e.message || 'Error registrando ausencia');
    }finally{
      btnFaltaRRHH.disabled = false;
    }
  });
}
const tabla = document.getElementById("tabla");

let registros = [];
let openIndex = {}; // { legajo: [ {fecha_entrada, entrada, puesto} ... ] }

let sortableInit = false; // evita loop

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isPlayero(puesto) {
  return /playero/i.test(String(puesto || ""));
}
function esTarde(hhmm) {
  return String(hhmm || "") >= "18:00";
}
function esTemprano(hhmm) {
  return String(hhmm || "") <= "12:00";
}

const PUESTOS_POR_SECTOR = {
  PLAYA: ["Playero/a", "Auxiliar de playa", "Refuerzo de playa"],
  MINI: ["Cajero/a", "Auxiliar de shop"],
  "ADMINISTRACIÓN": ["Encargado"],
};

function puestosParaSector(sec) {
  return PUESTOS_POR_SECTOR[String(sec || "").trim().toUpperCase()] || [];
}
function buildPuestoOptions(sec, selected) {
  const opts = puestosParaSector(sec);
  const first = `<option value="">-- Seleccionar --</option>`;
  return [first]
    .concat(
      opts.map((p) => {
        const sel = String(p) === String(selected || "") ? "selected" : "";
        return `<option value="${escapeHtml(p)}" ${sel}>${escapeHtml(p)}</option>`;
      })
    )
    .join("");
}

function badgeHtml(estado) {
  if (estado === "ABRIR_ABIERTA") return `<span class="badge warn">ABIERTA</span>`;
  if (estado === "CERRAR_ANTERIOR") return `<span class="badge info">CIERRA ANTERIOR</span>`;
  if (estado === "NORMAL") return `<span class="badge ok">NORMAL</span>`;
  return `<span class="badge">PENDIENTE</span>`;
}

/* ==========================
   Cálculo Horas / Nocturnas
   ========================== */

// "YYYY-MM-DD" + "HH:MM" -> Date local
function toLocalDate(fechaISO, hhmm) {
  const f = String(fechaISO || "");
  const t = String(hhmm || "");
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!f || !m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const d = new Date(f + "T00:00:00");
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(hh, mm, 0, 0);
  return d;
}

function minutesBetween(a, b) {
  const ta = a?.getTime?.();
  const tb = b?.getTime?.();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round((tb - ta) / 60000);
}

// minutos de solapamiento entre [start,end) y [rangeStart,rangeEnd)
function overlapMinutes(start, end, rangeStart, rangeEnd) {
  const s = Math.max(start.getTime(), rangeStart.getTime());
  const e = Math.min(end.getTime(), rangeEnd.getTime());
  const diff = e - s;
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

// Nocturnas: solapamiento con 22:00 -> 06:00 (cruza medianoche)
function calcNocturnasMinutes(fechaEntradaISO, entradaHHMM, fechaSalidaISO, salidaHHMM) {
  const start = toLocalDate(fechaEntradaISO, entradaHHMM);
  const end = toLocalDate(fechaSalidaISO, salidaHHMM);
  if (!start || !end) return 0;

  // si end quedó antes o igual que start, asumimos que cruza día
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }

  let total = 0;

  // iteramos por días (por si el turno cruza más de una noche)
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    const nightStart = new Date(cursor);
    nightStart.setHours(22, 0, 0, 0);

    const nightEnd = new Date(cursor);
    nightEnd.setDate(nightEnd.getDate() + 1);
    nightEnd.setHours(6, 0, 0, 0);

    total += overlapMinutes(start, end, nightStart, nightEnd);

    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}

function calcHorasYNocturnas(r) {
  const fEnt = r.fecha;
  const hEnt = r.entrada;
  const fSal = r.fecha_salida || r.fecha;
  const hSal = r.salida;

  const dEnt = toLocalDate(fEnt, hEnt);
  const dSal = toLocalDate(fSal, hSal);

  if (!dEnt || !dSal) {
    r.horas = 0;
    r.nocturnas = 0;
    return;
  }

  // si salida <= entrada, asumimos que cruza día
  if (dSal.getTime() <= dEnt.getTime()) {
    dSal.setDate(dSal.getDate() + 1);
  }

  const mins = minutesBetween(dEnt, dSal);
  const noctMins = calcNocturnasMinutes(fEnt, hEnt, fSal, hSal);

  r.horas = Math.max(0, (mins || 0) / 60);
  r.nocturnas = Math.max(0, noctMins / 60);
}

/* ==========================
   Estado ABIERTA / CIERRA / etc
   ========================== */

// ¿Existe abierta previa "de noche" que pueda cerrarse?
function hayAbiertaAnterior(legajo, fechaISO) {
  const arr = openIndex[String(legajo || "")] || [];
  return arr.some((a) => {
    const f = String(a.fecha_entrada || "");
    const ent = String(a.entrada || "");
    return (f && f < String(fechaISO || "")) || ent >= "18:00";
  });
}

function computeEstado(r) {
  const puesto = r.puesto || "";
  const entrada = String(r.entrada || "");
  const salida = String(r.salida || "");
  const igual = entrada && salida && entrada === salida;

  if (isPlayero(puesto) && igual && esTarde(entrada)) return "ABRIR_ABIERTA";

  // temprano igual NO siempre es cierre anterior
  if (isPlayero(puesto) && igual && esTemprano(entrada)) {
    return hayAbiertaAnterior(r.legajo, r.fecha) ? "CERRAR_ANTERIOR" : "ABRIR_ABIERTA";
  }

  if (igual) return "PENDIENTE";
  return "NORMAL";
}

function applyEstado(r) {
  r.estado = computeEstado(r);
  r.abierta = r.estado === "ABRIR_ABIERTA";
}

function refreshResumen() {
  const originales = registros.__originales || 0;
  const procesados = registros.length;
  const pendientes = registros.filter((r) => r.abierta).length;
  const guardables = registros.filter((r) => !r.abierta).length;

  resumen.innerHTML = `
    <strong>Registros originales:</strong> ${originales}
    &nbsp;|&nbsp;
    <strong>Registros procesados:</strong> ${procesados}
    &nbsp;|&nbsp;
    <strong>Pendientes (abiertas):</strong> ${pendientes}
    &nbsp;|&nbsp;
    <strong>Guardables:</strong> ${guardables}
  `;

  btnConfirmar.disabled = registros.length === 0;
}

/* ==========================
   Render
   ========================== */

function renderSoloBody() {
  tbody.innerHTML = registros
    .map((r, i) => {
      // recalcular siempre antes de mostrar
      calcHorasYNocturnas(r);
      applyEstado(r);

      const rowClass = r.abierta ? "row-open" : "";

      return `
      <tr class="${rowClass}" data-i="${i}">
        <td data-label="ID">${escapeHtml(i + 1)}</td>
        <td data-label="Fecha entrada">${escapeHtml(r.fecha)}</td>
        <td data-label="Fecha salida">
          <input class="fecha_salida" type="date" value="${escapeHtml(r.fecha_salida || r.fecha)}">
        </td>
        <td data-label="Legajo">${escapeHtml(r.legajo)}</td>
        <td data-label="Nombre">${escapeHtml(r.nombre)}</td>
        <td data-label="Sector">${escapeHtml(r.sector)}</td>
        <td data-label="Puesto">
          <select class="puesto">
            ${buildPuestoOptions(r.sector, r.puesto)}
          </select>
        </td>
        <td data-label="Entrada">
          <input class="entrada" type="time" value="${escapeHtml(r.entrada)}">
        </td>
        <td data-label="Salida">
          <input class="salida" type="time" value="${escapeHtml(r.salida)}">
        </td>
        <td data-label="Horas" class="td-horas">${escapeHtml(Number(r.horas || 0).toFixed(2))}</td>
        <td data-label="Nocturnas" class="td-nocturnas">${escapeHtml(Number(r.nocturnas || 0).toFixed(2))}</td>
        <td data-label="Acciones" class="actions">
          ${badgeHtml(r.estado)}
          <button class="icon-btn btn-open" type="button" title="Forzar a jornada abierta">↔</button>
        </td>
      </tr>
    `;
    })
    .join("");

  // listeners por fila
  tbody.querySelectorAll("tr").forEach((tr) => {
    const i = Number(tr.dataset.i);

    const entrada = tr.querySelector(".entrada");
    const salida = tr.querySelector(".salida");
    const fechaSalida = tr.querySelector(".fecha_salida");
    const puestoSel = tr.querySelector(".puesto");
    const btnOpen = tr.querySelector(".btn-open");

    function recalc() {
      registros[i].entrada = entrada?.value || "";
      registros[i].salida = salida?.value || "";
      registros[i].fecha_salida = fechaSalida?.value || registros[i].fecha || "";
      registros[i].puesto = puestoSel?.value || "";

      // recalcula horas/nocturnas + estado
      calcHorasYNocturnas(registros[i]);
      applyEstado(registros[i]);

      tr.classList.toggle("row-open", !!registros[i].abierta);

      // refresca badge
      const actionsTd = tr.querySelector(".actions");
      const oldBadge = actionsTd?.querySelector(".badge");
      if (oldBadge) oldBadge.outerHTML = badgeHtml(registros[i].estado);

      // refresca horas/nocturnas (sin depender de índices)
      const tdHoras = tr.querySelector(".td-horas");
      const tdNoct = tr.querySelector(".td-nocturnas");
      if (tdHoras) tdHoras.textContent = Number(registros[i].horas || 0).toFixed(2);
      if (tdNoct) tdNoct.textContent = Number(registros[i].nocturnas || 0).toFixed(2);

      refreshResumen();
    }

    entrada?.addEventListener("input", recalc);
    salida?.addEventListener("input", recalc);
    fechaSalida?.addEventListener("change", recalc);
    puestoSel?.addEventListener("change", recalc);

    btnOpen?.addEventListener("click", () => {
      // fuerza "abierta" dejando salida = entrada
      registros[i].salida = registros[i].entrada || registros[i].salida || "";
      if (salida) salida.value = registros[i].salida;
      registros[i].estado = "ABRIR_ABIERTA";
      registros[i].abierta = true;
      recalc();
    });
  });

  refreshResumen();
}



// ✅ Inicializa sortable UNA vez, y re-renderiza body en el callback
function initSortableOnce() {
  if (sortableInit) return;
  if (!window.makeSortableTable) return;

  sortableInit = true;

  window.makeSortableTable(
    tabla,
    registros,
    (row, key) => row[key],
    () => {
      renderSoloBody();
    },
    "fecha",
    "desc"
  );
}

async function cargarOpenIndex() {
  openIndex = {};
  try {
    const r = await fetch("/api/jornadas-abiertas");
    const data = await r.json().catch(() => ({}));
    const rows = data.rows || [];
    rows.forEach((x) => {
      const leg = String(x.legajo || "").trim();
      if (!leg) return;
      if (!openIndex[leg]) openIndex[leg] = [];
      openIndex[leg].push({
        fecha_entrada: x.fecha_entrada || "",
        entrada: x.entrada || "",
        puesto: x.puesto || "",
      });
    });
  } catch {}
}

// SUBIR EXCEL
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!inputArchivo.files.length) return alert("Seleccioná un archivo");

  const formData = new FormData();
  formData.append("archivo", inputArchivo.files[0]);

  resumen.textContent = "Subiendo y procesando...";
  tbody.innerHTML = "";
  registros = [];
  registros.__originales = 0;
  btnConfirmar.disabled = true;

  try {
    const res = await fetch("/importar", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Error importando");

    registros = data.ejemplo || [];
    registros.__originales = data.registros_originales || 0;

    // autocompleta sector/puesto/nombre desde empleados
    try {
      const empRes = await fetch("/api/empleados");
      const emp = await empRes.json();
      const map = {};
      (emp || []).forEach((e) => {
        const leg = String(e.legajo || "").trim();
        if (!leg) return;
        map[leg] = { sector: e.sector || "", puesto: e.puesto || "", nombre: e.nombre || "" };
      });

      registros.forEach((r) => {
        const leg = String(r.legajo || "").trim();
        if (map[leg]) {
          if (map[leg].sector) r.sector = map[leg].sector;
          if (map[leg].puesto) r.puesto = map[leg].puesto;
          if (map[leg].nombre) r.nombre = map[leg].nombre;
        }
      });
    } catch {}

    await cargarOpenIndex();

    // ✅ precálculo para que ya se vean horas/nocturnas correctas
    registros.forEach((r) => {
      calcHorasYNocturnas(r);
      applyEstado(r);
    });

    initSortableOnce();
    renderSoloBody();
  } catch (err) {
    console.error(err);
    alert("No se pudo importar");
  }
});

// CONFIRMAR
btnConfirmar.addEventListener("click", async () => {
  if (!registros.length) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Guardando...";

  try {
    // ✅ antes de confirmar, recalcula todo por si quedaron edits sin refrescar
    registros.forEach((r) => {
      calcHorasYNocturnas(r);
      applyEstado(r);
    });

    const res = await fetch("/api/asistencias/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registros }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("Confirmar error:", data);
      alert(data.error || "No se pudo confirmar");
      return;
    }

    alert(
      `✅ Confirmado\n\n` +
        `Asistencias insertadas: ${data.insertados}\n` +
        `Ignoradas: ${data.ignorados}\n` +
        `Abiertas creadas: ${data.abiertas_creadas}\n` +
        `Abiertas cerradas: ${data.abiertas_cerradas}\n`
    );

    if (data.faltas_fichada_total && data.faltas_fichada_total > 0) {
      openFaltaModal(data.faltas_fichada);
    }

    registros = [];
    registros.__originales = 0;
    tbody.innerHTML = "";
    refreshResumen();
  } catch (e) {
    console.error(e);
    alert("Error guardando");
  } finally {
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmar y guardar";
  }
});
