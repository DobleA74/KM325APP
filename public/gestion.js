console.log("✅ gestion.js cargado");

const $ = (id) => document.getElementById(id);

const desde = $("desde");
const hasta = $("hasta");
const legajo = $("legajo");
const puesto = $("puesto");
const sector = $("sector");

const btnBuscar = $("btn-buscar");
const btnLimpiar = $("btn-limpiar");
const btnExportar = $("btn-exportar");

const status = $("status");
const tbody = $("rows");
const tabla = $("tabla");

const modal = $("modal");
const m_fecha_entrada = $("m_fecha_entrada");
const m_entrada = $("m_entrada");
const m_fecha_salida = $("m_fecha_salida");
const m_salida = $("m_salida");
const m_puesto = $("m_puesto");
const m_cancelar = $("m_cancelar");
const m_guardar = $("m_guardar");

let rowsCache = [];
let editId = null;
let sorter = null;

const PUESTOS_POR_SECTOR = {
  PLAYA: ["Playero/a", "Auxiliar de playa"],
  MINI: ["Cajero/a", "Auxiliar de shop"],
  "ADMINISTRACIÓN": ["Encargado"],
};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoMinusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function fillPuestoSelect(selectEl, sec, value = "", includeTodos = false) {
  const opts = PUESTOS_POR_SECTOR[String(sec || "")] || [];
  const all = Object.values(PUESTOS_POR_SECTOR).flat();
  const list = sec ? opts : all;

  selectEl.innerHTML = "";
  if (includeTodos)
    selectEl.insertAdjacentHTML("beforeend", '<option value="">(Todos)</option>');
  else
    selectEl.insertAdjacentHTML("beforeend", '<option value="">-- Seleccionar --</option>');

  const uniq = [...new Set(list)].sort((a, b) => a.localeCompare(b, "es"));
  uniq.forEach((p) => {
    const sel = String(p) === String(value) ? "selected" : "";
    selectEl.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(p)}" ${sel}>${escapeHtml(p)}</option>`
    );
  });
}

function cargarPuestos() {
  fillPuestoSelect(puesto, sector.value, puesto.value, true);
}

sector.addEventListener("change", () => {
  const prev = puesto.value;
  cargarPuestos();
  const allowed = PUESTOS_POR_SECTOR[sector.value] || [];
  if (sector.value && prev && !allowed.includes(prev)) puesto.value = "";
});

function render() {
  tbody.innerHTML = rowsCache
    .map(
      (r) => `
    <tr>
      <td data-label="ID">${escapeHtml(r.id)}</td>
      <td data-label="Fecha entrada">${escapeHtml(r.fecha_entrada)}</td>
      <td data-label="Fecha salida">${escapeHtml(r.fecha_salida)}</td>
      <td data-label="Legajo">${escapeHtml(r.legajo)}</td>
      <td data-label="Nombre">${escapeHtml(r.nombre)}</td>
      <td data-label="Sector">${escapeHtml(r.sector)}</td>
      <td data-label="Puesto">${escapeHtml(r.puesto)}</td>
      <td data-label="Entrada">${escapeHtml(r.entrada)}</td>
      <td data-label="Salida">${escapeHtml(r.salida)}</td>
      <td data-label="Horas">${Number(r.horas || 0).toFixed(2)}</td>
      <td data-label="Nocturnas">${Number(r.nocturnas || 0).toFixed(2)}</td>
      <td data-label="Acciones" class="actions">
        <button class="icon-btn" type="button" title="Editar" data-edit="${r.id}">✏️</button>
        <button class="icon-btn danger" type="button" title="Eliminar" data-del="${r.id}">🗑</button>
        <button class="icon-btn" type="button" title="Pasar a jornada abierta" data-open="${r.id}">📌</button>
      </td>
    </tr>
  `
    )
    .join("");

  tbody.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openEdit(Number(b.dataset.edit)))
  );
  tbody.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () => eliminar(Number(b.dataset.del)))
  );
  tbody.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => pasarAAbierta(Number(b.dataset.open)))
  );
}


// ✅ init sorter 1 vez
function initSorter() {
  if (!window.makeSortableTable) {
    console.error("❌ Falta cargar sortable.js antes de gestion.js");
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
    "fecha_entrada",
    "desc"
  );
}

async function buscar() {
  status.textContent = "Buscando...";

  const params = new URLSearchParams();
  if (desde.value) params.set("desde", desde.value);
  if (hasta.value) params.set("hasta", hasta.value);
  if (legajo.value.trim()) params.set("legajo", legajo.value.trim());
  if (puesto.value) params.set("puesto", puesto.value);
  if (sector.value) params.set("sector", sector.value);

  const res = await fetch(`/api/asistencias?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  rowsCache = data.rows || [];

  const totalHoras = rowsCache.reduce((a, r) => a + Number(r.horas || 0), 0);
  const totalNoct = rowsCache.reduce((a, r) => a + Number(r.nocturnas || 0), 0);

  status.innerHTML = `<strong>OK (${rowsCache.length} registros)</strong> &nbsp;|&nbsp; Total horas: ${totalHoras.toFixed(
    2
  )} &nbsp;|&nbsp; Total nocturnas: ${totalNoct.toFixed(2)}`;

  initSorter();
  sorter?.setRows(rowsCache); // ✅ mantiene el orden seleccionado
  render();
}

function limpiar() {
  desde.value = isoMinusDays(7);
  hasta.value = isoToday();
  legajo.value = "";
  puesto.value = "";
  sector.value = "";
  buscar();
}

async function eliminar(id) {
  if (!confirm(`Eliminar asistencia ID ${id}?`)) return;
  const res = await fetch(`/api/asistencias/${id}`, { method: "DELETE" });
  if (!res.ok) return alert("No se pudo eliminar");
  await buscar();
}

async function pasarAAbierta(id) {
  const r = rowsCache.find((x) => Number(x.id) === Number(id));
  if (!r) return;

  const ok = confirm(
    `Pasar a Jornada Abierta?\n\nLegajo: ${r.legajo}\nFecha entrada: ${r.fecha_entrada}\nEntrada: ${r.entrada}\n\nEsto crea la abierta y borra esta asistencia del histórico.`
  );
  if (!ok) return;

  const payload = {
    legajo: String(r.legajo),
    nombre: r.nombre || "",
    sector: r.sector || "",
    puesto: r.puesto || "",
    fecha_entrada: r.fecha_entrada || "",
    entrada: r.entrada || "",
  };

  const res1 = await fetch("/api/jornadas-abiertas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res1.ok) return alert("No se pudo crear la jornada abierta");

  const res2 = await fetch(`/api/asistencias/${id}`, { method: "DELETE" });
  if (!res2.ok)
    return alert("Se creó la abierta, pero no se pudo borrar la asistencia. (Revisar)");

  alert("Pasado a Jornada Abierta ✅");
  await buscar();
}

function openEdit(id) {
  const r = rowsCache.find((x) => Number(x.id) === Number(id));
  if (!r) return;

  editId = id;
  m_fecha_entrada.value = r.fecha_entrada || "";
  m_entrada.value = r.entrada || "";
  m_fecha_salida.value = r.fecha_salida || "";
  m_salida.value = r.salida || "";
  fillPuestoSelect(m_puesto, r.sector || "", r.puesto || "", false);
  modal.classList.add("open");
}

function closeEdit() {
  modal.classList.remove("open");
  editId = null;
}

m_cancelar.addEventListener("click", closeEdit);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeEdit();
});

m_guardar.addEventListener("click", async () => {
  if (!editId) return;

  const payload = {
    fecha_entrada: m_fecha_entrada.value,
    entrada: m_entrada.value,
    fecha_salida: m_fecha_salida.value,
    salida: m_salida.value,
    puesto: m_puesto.value.trim(),
  };

  const res = await fetch(`/api/asistencias/${editId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert("No se pudo guardar cambios");

  closeEdit();
  await buscar();
});

btnBuscar.addEventListener("click", buscar);
btnLimpiar.addEventListener("click", limpiar);

btnExportar.addEventListener("click", () => {
  if (!rowsCache.length) return alert("No hay datos para exportar");

  const headers = [
    "id",
    "fecha_entrada",
    "fecha_salida",
    "legajo",
    "nombre",
    "sector",
    "puesto",
    "entrada",
    "salida",
    "horas",
    "nocturnas",
    "creado_en",
  ];
  const lines = [headers.join(",")];

  for (const r of rowsCache) {
    const row = headers.map((h) =>
      `"${String(r[h] ?? "").replaceAll('"', '""')}"`
    );
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `asistencias_${desde.value || "desde"}_${hasta.value || "hasta"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// init
(async () => {
  cargarPuestos();
  desde.value = isoMinusDays(7);
  hasta.value = isoToday();
  await buscar();
})();
