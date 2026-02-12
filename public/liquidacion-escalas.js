/* Escalas salariales
   - Listar: GET /api/liquidacion/escalas?mes=YYYY-MM
   - Upsert: POST /api/liquidacion/escalas/upsert
*/

const $ = (id) => document.getElementById(id);

const elMes = $("mes");
const elMsg = $("msg");
const elBody = $("tbody");
const btnCargar = $("btn-cargar");
const btnAdd = $("btn-add");

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

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function render(items) {
  elBody.innerHTML = "";
  const rows = items && items.length ? items : [];
  if (!rows.length) {
    elBody.innerHTML = `<tr><td colspan="5" class="small">Sin escalas para ese mes. Agregá filas y guardá.</td></tr>`;
    return;
  }
  for (const it of rows) {
    addRow(it);
  }
}

function addRow(it = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td data-label="Categoría"><input type="text" data-role="categoria" value="${(it.categoria || "").replace(/"/g, "&quot;")}" placeholder="Operario" /></td>
    <td data-label="Básico"><input type="number" step="0.01" data-role="basico" value="${it.basico ?? ""}" /></td>
    <td data-label="Premio Asistencia"><input type="number" step="0.01" data-role="premio_asistencia" value="${it.premio_asistencia ?? ""}" /></td>
    <td data-label="Premio Manejo Fondos"><input type="number" step="0.01" data-role="premio_manejo_fondos" value="${it.premio_manejo_fondos ?? ""}" /></td>
    <td data-label="">
      <button class="btn" type="button" data-role="guardar">Guardar</button>
    </td>
  `;
  elBody.appendChild(tr);

  tr.querySelector('button[data-role="guardar"]').addEventListener("click", async () => {
    const mes = getMes();
    const categoria = tr.querySelector('input[data-role="categoria"]').value.trim();
    const basico = n(tr.querySelector('input[data-role="basico"]').value);
    const premio_asistencia = n(tr.querySelector('input[data-role="premio_asistencia"]').value);
    const premio_manejo_fondos = n(tr.querySelector('input[data-role="premio_manejo_fondos"]').value);

    if (!categoria) {
      setMsg("La categoría es obligatoria.", "danger");
      return;
    }

    setMsg(`Guardando ${categoria}...`);
    try {
      const resp = await fetch("/api/liquidacion/escalas/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, categoria, basico, premio_asistencia, premio_manejo_fondos }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setMsg(`OK · ${mes} · ${categoria}`);
    } catch (e) {
      console.error(e);
      setMsg(`Error: ${e.message || e}`, "danger");
    }
  });
}

async function cargar() {
  const mes = getMes();
  elMes.value = mes;
  setMsg("Cargando...");
  elBody.innerHTML = `<tr><td colspan="5" class="small">Cargando...</td></tr>`;
  try {
    const resp = await fetch(`/api/liquidacion/escalas?mes=${encodeURIComponent(mes)}`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "Error");
    render(data.items || []);
    setMsg(`OK · ${mes}`);
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, "danger");
    elBody.innerHTML = `<tr><td colspan="5" class="small">Error cargando.</td></tr>`;
  }
}

btnCargar?.addEventListener("click", cargar);
btnAdd?.addEventListener("click", () => {
  // si estaba el placeholder “sin escalas”, lo limpiamos
  const only = elBody.querySelectorAll("tr").length === 1 && elBody.querySelector("td.small");
  if (only) elBody.innerHTML = "";
  addRow({});
});

// init
elMes.value = getMes();
cargar();
