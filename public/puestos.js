console.log("✅ puestos.js cargado");

const $ = (id) => document.getElementById(id);

const inpPuesto = $("puesto");
const mIni = $("m_ini");
const mFin = $("m_fin");
const tIni = $("t_ini");
const tFin = $("t_fin");
const nIni = $("n_ini");
const nFin = $("n_fin");
const btnGuardar = $("btn-guardar");
const btnLimpiar = $("btn-limpiar");
const tbody = $("puestos-body");
const msg = $("msg");
const tabla = document.getElementById("tabla-puestos");

let editPuesto = null;
let rowsCache = [];
let sorter = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitRange(range) {
  const s = String(range || "").trim();
  const m = s.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  return m ? { ini: m[1], fin: m[2] } : { ini: "", fin: "" };
}

function clearForm() {
  editPuesto = null;
  inpPuesto.value = "";
  mIni.value = "";
  mFin.value = "";
  tIni.value = "";
  tFin.value = "";
  nIni.value = "";
  nFin.value = "";
  msg.textContent = "Listo.";
}

btnLimpiar.addEventListener("click", clearForm);

function render() {
  tbody.innerHTML = rowsCache
    .map(
      (r) => `
      <tr>
        <td data-label="Puesto">${escapeHtml(r.puesto)}</td>
        <td data-label="Mañana">${escapeHtml(r.manana || "")}</td>
        <td data-label="Tarde">${escapeHtml(r.tarde || "")}</td>
        <td data-label="Noche">${escapeHtml(r.noche || "")}</td>
        <td data-label="Acciones" class="actions">
          <button class="btn ghost" type="button" data-edit="${escapeHtml(r.puesto)}">Editar</button>
          <button class="btn ghost" type="button" data-del="${escapeHtml(r.puesto)}">Eliminar</button>
        </td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll("[data-edit]").forEach((b) => {
    b.addEventListener("click", () => {
      const p = b.dataset.edit;
      const row = rowsCache.find((x) => String(x.puesto) === String(p));
      if (!row) return;

      editPuesto = row.puesto;
      inpPuesto.value = row.puesto;

      const rm = splitRange(row.manana);
      const rt = splitRange(row.tarde);
      const rn = splitRange(row.noche);

      mIni.value = rm.ini;
      mFin.value = rm.fin;
      tIni.value = rt.ini;
      tFin.value = rt.fin;
      nIni.value = rn.ini;
      nFin.value = rn.fin;

      msg.textContent = `Editando: ${row.puesto}`;
    });
  });

  tbody.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", async () => {
      const p = b.dataset.del;
      if (!confirm(`Eliminar puesto "${p}"?`)) return;

      const res = await fetch(`/api/puestos/${encodeURIComponent(p)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return alert(data.error || "No se pudo eliminar");

      msg.textContent = `Eliminado: ${p}`;
      await cargar();
      clearForm();
    });
  });
}

function initSorter() {
  if (!window.makeSortableTable) return;
  if (sorter) return;

  sorter = window.makeSortableTable(tabla, {
    getData: () =>
      rowsCache.map((r) => ({
        puesto: r.puesto,
        manana: r.manana || "",
        tarde: r.tarde || "",
        noche: r.noche || "",
      })),
    onSorted: (sortedRows) => {
      const map = new Map(rowsCache.map((r) => [r.puesto, r]));
      rowsCache = sortedRows.map((x) => map.get(x.puesto)).filter(Boolean);
      render();
    },
  });
}

async function cargar() {
  const res = await fetch("/api/puestos");
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return;

  rowsCache = data.items || [];
  initSorter();
  render();
}

btnGuardar.addEventListener("click", async () => {
  const p = String(inpPuesto.value || "").trim();
  if (!p) return alert("Falta puesto");

  const body = {
    puesto: p,
    manana_start: mIni.value || null,
    manana_end: mFin.value || null,
    tarde_start: tIni.value || null,
    tarde_end: tFin.value || null,
    noche_start: nIni.value || null,
    noche_end: nFin.value || null,
  };

  const res = await fetch("/api/puestos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || "No se pudo guardar");

  msg.textContent = `Guardado: ${p}`;
  await cargar();
  clearForm();
});

cargar();
