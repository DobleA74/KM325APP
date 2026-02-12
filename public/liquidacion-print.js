/* Liquidación - vista para imprimir / PDF
   - Carga: /api/liquidacion?mes=YYYY-MM
   - Botón imprimir: window.print()
*/

const $ = (id) => document.getElementById(id);

const elMes = $("mes");
const elMsg = $("msg");
const elBody = $("tbody");
const elTitulo = $("titulo");
const elFechaEmision = $("fecha-emision");
const btnCargar = $("btn-cargar");
const btnImprimir = $("btn-imprimir");

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

function getMes() {
  const fromQuery = new URLSearchParams(window.location.search).get("mes");
  const m = (elMes?.value || fromQuery || "").trim();
  return m || defaultMonth();
}

function mesTexto(yyyyMm) {
  // yyyy-mm -> "Enero 2026"
  const [y, m] = String(yyyyMm || "").split("-");
  const year = Number(y);
  const month = Number(m);
  if (!year || !month) return "";
  const d = new Date(Date.UTC(year, month - 1, 1));
  const name = d.toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  // Capitalizar 1ra letra
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function setHeader(mes) {
  if (elTitulo) elTitulo.textContent = `Novedades del mes: ${mesTexto(mes) || mes}`;
  if (elFechaEmision) {
    const hoy = new Date();
    const fecha = hoy.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    elFechaEmision.textContent = `Fecha de emisión: ${fecha}`;
  }
}

function render(items) {
  elBody.innerHTML = "";
  if (!items || !items.length) {
    elBody.innerHTML = `<tr><td colspan="8" class="small">Sin datos para ese mes.</td></tr>`;
    return;
  }

  // Orden por apellido (el formato en el sistema es "Apellido, Nombre")
  const sorted = [...items].sort((a, b) => {
    const ka = String(a?.nombre || "").split(",")[0].trim().toLowerCase();
    const kb = String(b?.nombre || "").split(",")[0].trim().toLowerCase();
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es");
  });

  for (const it of sorted) {
    const tr = document.createElement("tr");
    const pres = it.pierde_presentismo ? "No" : "Sí";
    tr.innerHTML = `
      <td>${it.legajo || ""}</td>
      <td>${it.nombre || ""}</td>
      <td>${it.dias_trabajados ?? 0}</td>
      <td>${it.noches_turnos ?? 0}</td>
      <td>${it.feriados_trabajados ?? 0}</td>
      <td>${pres}</td>
      <td>$ ${fmtMoney(it.ajuste_manejo_fondos)}</td>
      <td>$ ${fmtMoney(it.adelantos)}</td>
    `;
    elBody.appendChild(tr);
  }
}

async function cargar() {
  const mes = getMes();
  if (elMes) elMes.value = mes;
  setHeader(mes);
  setMsg("Cargando...");
  elBody.innerHTML = `<tr><td colspan="8" class="small">Cargando...</td></tr>`;
  try {
    const resp = await fetch(`/api/liquidacion?mes=${encodeURIComponent(mes)}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Error");
    render(data.items || []);
    setMsg(`OK · ${mes} · empleados: ${(data.items || []).length}`);
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, "danger");
    elBody.innerHTML = `<tr><td colspan="8" class="small">Error cargando.</td></tr>`;
  }
}

btnCargar?.addEventListener("click", cargar);
btnImprimir?.addEventListener("click", () => window.print());

// init
if (elMes) elMes.value = getMes();
cargar();
