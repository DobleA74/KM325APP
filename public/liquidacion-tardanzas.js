/* Tardanzas (auto + editable)
   - Cargar: GET /api/liquidacion/tardanzas?mes=YYYY-MM
   - Recalcular auto: POST /api/liquidacion/tardanzas/recalcular {mes}
   - Guardar override: POST /api/liquidacion/tardanzas/override
*/

const $ = (id) => document.getElementById(id);

const elMes = $("mes");
const elPuesto = $("puesto");
const elMsg = $("msg");
const elBody = $("tbody");
const btnCargar = $("btn-cargar");
const btnRecalc = $("btn-recalcular");

let lastItems = [];

function setMsg(text, kind = "") {
  elMsg.textContent = text;
  elMsg.className = kind ? `notice ${kind}` : "notice";
}

function defaultMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function getMes() {
  const fromQuery = new URLSearchParams(window.location.search).get("mes");
  const m = (elMes.value || fromQuery || "").trim();
  return m || defaultMonth();
}

function upsertPuestos(items) {
  if (!elPuesto) return;
  const current = elPuesto.value || "";
  const puestos = Array.from(new Set((items || []).map(i => (i.puesto || "").trim()).filter(Boolean))).sort();
  elPuesto.innerHTML = `<option value="">Todos</option>` + puestos.map(p => `<option value="${p.replace(/"/g, '&quot;')}">${p}</option>`).join("");
  if (puestos.includes(current)) elPuesto.value = current;
}

function getPuesto() {
  return (elPuesto?.value || "").trim();
}

function render(items) {
  lastItems = items || [];
  elBody.innerHTML = "";
  if (!items || !items.length) {
    elBody.innerHTML = `<tr><td colspan="10" class="small">Sin tardanzas cargadas/calculadas para ese mes. Usá “Recalcular (auto)”.</td></tr>`;
    return;
  }

  const filtroPuesto = getPuesto();
  for (const it of items) {
    if (filtroPuesto && String(it.puesto || "").trim() !== filtroPuesto) continue;
    const tr = document.createElement("tr");
    tr.dataset.legajo = String(it.legajo || "");
    tr.dataset.fecha = String(it.fecha || "");
    const finalVal = (it.minutos_final === null || it.minutos_final === undefined) ? "" : String(it.minutos_final);
    tr.innerHTML = `
      <td data-label="Fecha">${it.fecha || ""}</td>
      <td data-label="Legajo">${it.legajo || ""}</td>
      <td data-label="Puesto">${it.puesto || ""}</td>
      <td data-label="Turno">${it.turno || ""}</td>
      <td data-label="Entrada tomada">${it.entrada_tomada || ""}</td>
      <td data-label="Inicio esperado">${it.inicio_turno || ""}</td>
      <td data-label="Minutos auto">${it.minutos_auto ?? 0}</td>
      <td data-label="Minutos final (editable)"><input type="number" min="0" step="1" value="${finalVal}" data-role="final" placeholder="(usa auto)" /></td>
      <td data-label="Motivo"><input type="text" value="${(it.motivo_override || "").replace(/"/g, "&quot;")}" data-role="motivo" placeholder="opcional" /></td>
      <td data-label="">
        <button class="btn" type="button" data-role="guardar">Guardar</button>
      </td>
    `;
    elBody.appendChild(tr);
  }

  elBody.querySelectorAll('button[data-role="guardar"]').forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      const tr = ev.target.closest("tr");
      if (!tr) return;
      const legajo = tr.dataset.legajo;
      const fecha = tr.dataset.fecha;
      const mins = tr.querySelector('input[data-role="final"]').value;
      const motivo = tr.querySelector('input[data-role="motivo"]').value;

      setMsg(`Guardando ${legajo} · ${fecha}...`);
      try {
        const resp = await fetch("/api/liquidacion/tardanzas/override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            legajo,
            fecha,
            minutos_final: mins === "" ? null : Number(mins),
            motivo,
          }),
        });
        const data = await resp.json();
        if (!data.ok) throw new Error(data.error || "Error");
        setMsg(`OK · ${legajo} · ${fecha}`);
      } catch (e) {
        console.error(e);
        setMsg(`Error: ${e.message || e}`, "danger");
      }
    });
  });
}

async function cargar() {
  const mes = getMes();
  elMes.value = mes;
  setMsg("Cargando...");
  elBody.innerHTML = `<tr><td colspan="10" class="small">Cargando...</td></tr>`;
  try {
    const resp = await fetch(`/api/liquidacion/tardanzas?mes=${encodeURIComponent(mes)}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Error");
    upsertPuestos(data.items || []);
    render(data.items || []);
    setMsg(`OK · ${mes} · filas: ${(data.items || []).length}`);
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, "danger");
    elBody.innerHTML = `<tr><td colspan="10" class="small">Error cargando.</td></tr>`;
  }
}

async function recalcular() {
  const mes = getMes();
  setMsg("Recalculando...");
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
btnRecalc?.addEventListener("click", recalcular);
elPuesto?.addEventListener("change", () => render(lastItems));
elPuesto?.addEventListener("change", () => render(lastItems));
elPuesto?.addEventListener("change", cargar);

// init
elMes.value = getMes();
cargar();
