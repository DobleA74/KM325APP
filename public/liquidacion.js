/* Liquidación mensual
   - Carga resumen: /api/liquidacion?mes=YYYY-MM
   - Recalcula tardanzas: POST /api/liquidacion/tardanzas/recalcular {mes}
   - Links pasan el mes por query para comodidad
*/

const $ = (id) => document.getElementById(id);

const elMes = $("mes");
const elMsg = $("msg");
const elBody = $("tbody");
const elFilterApellido = $("filter-apellido");

const btnCargar = $("btn-cargar");
const btnRecalcular = $("btn-recalcular");

const aTard = $("btn-tardanzas");
const aEsc = $("btn-escalas");
const aPrint = $("btn-print");

function setMsg(text, kind = "") {
  elMsg.textContent = text;
  elMsg.className = kind ? `notice ${kind}` : "notice";
}

function fmtMoney(v) {
  const num = Number(v || 0);
  return num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function qsSetMesInLinks(mes) {
  const q = `?mes=${encodeURIComponent(mes)}`;
  if (aTard) aTard.href = `/liquidacion/tardanzas${q}`;
  if (aEsc) aEsc.href = `/liquidacion/escalas${q}`;
  if (aPrint) aPrint.href = `/liquidacion/print${q}`;
}

function getMes() {
  const fromQuery = new URLSearchParams(window.location.search).get("mes");
  const m = (elMes.value || fromQuery || "").trim();
  return m || defaultMonth();
}

// Orden por apellido (nombre esperado: "Apellido, Nombre")
function sortPorApellido(items) {
  return [...(items || [])].sort((a, b) => {
    const ka = String(a?.nombre || "").split(",")[0].trim().toLowerCase();
    const kb = String(b?.nombre || "").split(",")[0].trim().toLowerCase();
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es");
  });
}

let _lastItems = [];

function applyFilters() {
  const q = String(elFilterApellido?.value || "").trim().toLowerCase();
  let items = sortPorApellido(_lastItems);
  if (q) {
    items = items.filter((it) => String(it?.nombre || "").toLowerCase().includes(q));
  }
  render(items);
  setMsg(`OK · ${getMes()} · empleados: ${items.length}${q ? ` · filtro: "${q}"` : ""}`);
}

function render(items) {
  elBody.innerHTML = "";
  if (!items || !items.length) {
    elBody.innerHTML = `<tr><td colspan="12" class="small">Sin datos para ese mes.</td></tr>`;
    return;
  }

  for (const it of items) {
    const tr = document.createElement("tr");
    const pres = it.pierde_presentismo ? "No" : "Sí";
    tr.innerHTML = `
      <td data-label="Legajo">${it.legajo || ""}</td>
      <td data-label="Nombre">${it.nombre || ""}</td>
      <td data-label="Días">${it.dias_trabajados ?? 0}</td>
      <td data-label="Noches">${it.noches_turnos ?? 0}</td>
      <td data-label="Feriados">${it.feriados_trabajados ?? 0}</td>
      <td data-label="Tardanzas">${it.tardanzas ?? 0}</td>
      <td data-label="Presentismo">${pres}</td>
      <td data-label="$ Nocturnidad">$ ${fmtMoney(it.adicional_nocturnidad)}</td>
      <td data-label="$ Prem. Asistencia">$ ${fmtMoney(it.premio_asistencia)}</td>
      <td data-label="$ Manejo fondos">$ ${fmtMoney(it.premio_manejo_fondos)}</td>
      <td data-label="$ Ajuste arqueo">$ ${fmtMoney(it.ajuste_manejo_fondos)}</td>
      <td data-label="$ Adelantos">$ ${fmtMoney(it.adelantos)}</td>
    `;
    elBody.appendChild(tr);
  }
}

async function cargar() {
  const mes = getMes();
  elMes.value = mes;
  qsSetMesInLinks(mes);
  setMsg("Cargando...", "");
  elBody.innerHTML = `<tr><td colspan="12" class="small">Cargando...</td></tr>`;
  try {
    const resp = await fetch(`/api/liquidacion?mes=${encodeURIComponent(mes)}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Error");
    _lastItems = data.items || [];
    applyFilters();
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, "danger");
    elBody.innerHTML = `<tr><td colspan="12" class="small">Error cargando.</td></tr>`;
  }
}

async function recalcular() {
  const mes = getMes();
  setMsg("Recalculando tardanzas...", "");
  try {
    const resp = await fetch("/api/liquidacion/tardanzas/recalcular", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Error");
    setMsg(`Recalculadas: ${data.recalculadas || 0}`);
    await cargar();
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, "danger");
  }
}

btnCargar?.addEventListener("click", cargar);
btnRecalcular?.addEventListener("click", recalcular);
elFilterApellido?.addEventListener("input", () => applyFilters());

// init
elMes.value = getMes();
qsSetMesInLinks(elMes.value);
