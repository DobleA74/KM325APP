console.log("✅ empleados.js cargado");

const $ = (id) => document.getElementById(id);

const legajo = $("legajo");
const nombre = $("nombre");
const sector = $("sector");
const puesto = $("puesto");
const btnGuardar = $("btn-guardar");
const tbody = $("empleados-body");
const msg = $("msg");

const tabla = document.getElementById("tabla-empleados");

const PUESTOS_POR_SECTOR = {
  PLAYA: ["Playero/a", "Auxiliar de playa"],
  MINI: ["Cajero/a", "Auxiliar de shop"],
  "ADMINISTRACIÓN": ["Encargado"],
};

let editLegajo = null;
let rowsCache = [];
let sorter = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setPuestosBySector(sec, currentValue = "") {
  const opts = PUESTOS_POR_SECTOR[String(sec || "")] || [];
  puesto.innerHTML = "";

  if (!sec) {
    puesto.disabled = true;
    puesto.innerHTML = '<option value="">-- Seleccionar sector primero --</option>';
    return;
  }

  puesto.disabled = false;
  puesto.insertAdjacentHTML("beforeend", '<option value="">-- Seleccionar --</option>');
  opts.forEach((p) => {
    const sel = String(p) === String(currentValue) ? "selected" : "";
    puesto.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(p)}" ${sel}>${escapeHtml(p)}</option>`
    );
  });
}

sector.addEventListener("change", () => setPuestosBySector(sector.value));
setPuestosBySector(sector.value);

function render() {
  tbody.innerHTML = rowsCache
    .map(
      (r) => `
      <tr>
        <td data-label="Legajo">${escapeHtml(r.legajo)}</td>
        <td data-label="Nombre">${escapeHtml(r.nombre)}</td>
        <td data-label="Sector">${escapeHtml(r.sector)}</td>
        <td data-label="Puesto">${escapeHtml(r.puesto)}</td>
        <td data-label="Acciones" class="actions">
          <button class="btn ghost" type="button" data-edit="${escapeHtml(r.legajo)}">Editar</button>
          <button class="btn ghost" type="button" data-del="${escapeHtml(r.legajo)}">Eliminar</button>
        </td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const l = b.dataset.edit;
      const row = rowsCache.find((x) => String(x.legajo) === String(l));
      if (!row) return;

      editLegajo = row.legajo;
      legajo.value = row.legajo;
      nombre.value = row.nombre || "";
      sector.value = row.sector || "";
      setPuestosBySector(sector.value, row.puesto || "");
      puesto.value = row.puesto || "";
      msg.textContent = `Editando legajo ${row.legajo}`;
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const l = b.dataset.del;
      if (!confirm(`Eliminar legajo ${l}?`)) return;

      const res = await fetch(`/api/empleados/${encodeURIComponent(l)}`, {
        method: "DELETE",
      });
      if (!res.ok) return alert("No se pudo eliminar");

      msg.textContent = `Eliminado ${l}`;
      await cargar();
    });
  });
}



function initSorter() {
  if (!window.makeSortableTable) {
    console.error("❌ Falta cargar sortable.js antes de empleados.js");
    return;
  }
  if (sorter) return;

  sorter = window.makeSortableTable(
    tabla,
    rowsCache,
    (row, key) => row[key],
    (sorted) => {
      rowsCache = sorted;
      render();
    },
    "legajo",
    "asc"
  );
}

async function cargar() {
  const res = await fetch("/api/empleados");
  rowsCache = (await res.json().catch(() => [])) || [];

  initSorter();
  sorter?.setRows(rowsCache);
  render();
}

btnGuardar.addEventListener("click", async () => {
  const body = {
    legajo: legajo.value.trim(),
    nombre: nombre.value.trim(),
    sector: sector.value,
    puesto: puesto.value.trim(),
  };
  if (!body.legajo) return alert("Falta legajo");

  const res = await fetch("/api/empleados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return alert("No se pudo guardar");

  msg.textContent = `Guardado OK: ${body.legajo}`;
  editLegajo = null;
  legajo.value = "";
  nombre.value = "";
  sector.value = "";
  setPuestosBySector("", "");
  await cargar();
});

cargar();
