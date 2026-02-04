console.log("✅ abiertas.js cargado");

// Si venimos desde "Fichada incompleta o ausente", traemos casos desde localStorage
try{
  const raw = localStorage.getItem("km325_faltas_pendientes");
  if(raw){
    const faltas = JSON.parse(raw);
    if(Array.isArray(faltas) && faltas.length){
      const first = faltas[0];
      const firstEmp = (first.empleados||[])[0];
      // Prefill: legajo y fecha. El resto lo completa el usuario.
      window.__KM325_FALTAS_PENDIENTES__ = faltas;
      window.__KM325_FALTA_FIRST__ = { fecha: first.fecha, emp: firstEmp };
    }
    localStorage.removeItem("km325_faltas_pendientes");
  }
}catch(e){}


const $ = (id) => document.getElementById(id);

const status = $("status");
const tbody = $("rows");
const btnRefresh = $("btn-refresh");

const tabla = document.getElementById("tabla-abiertas");

// crear manual
const m_legajo = $("m_legajo");
const m_nombre = $("m_nombre");
const m_sector = $("m_sector");
const m_puesto = $("m_puesto");
const m_fecha_entrada = $("m_fecha_entrada");
const m_entrada = $("m_entrada");
const btnCrear = $("btn-crear");

// Prefill desde modal de faltas (si aplica)
if(window.__KM325_FALTA_FIRST__){
  const { fecha, emp } = window.__KM325_FALTA_FIRST__;
  if(m_legajo && emp?.legajo) m_legajo.value = emp.legajo;
  if(m_nombre && emp?.nombre) m_nombre.value = emp.nombre;
  if(m_fecha_entrada && fecha) m_fecha_entrada.value = fecha;

  // Usamos esto para, una vez cargada la tabla, abrir directamente el caso a regularizar
  window.__KM325_FALTA_TARGET__ = { legajo: String(emp?.legajo||''), fecha: String(fecha||'') };

  if(status){
    const total = (window.__KM325_FALTAS_PENDIENTES__||[]).reduce((acc,f)=> acc + ((f.empleados||[]).length||0), 0);
    status.textContent = `Venís desde "Fichada incompleta": ${total} caso(s) para regularizar. Cargá/edita manualmente y refrescá la lista.`;
  }
}

// modal editar
const modalEdit = $("modal-edit");
const e_id = $("e_id");
const e_legajo = $("e_legajo");
const e_nombre = $("e_nombre");
const e_sector = $("e_sector");
const e_puesto = $("e_puesto");
const e_fecha_entrada = $("e_fecha_entrada");
const e_entrada = $("e_entrada");
const e_cancelar = $("e_cancelar");
const e_guardar = $("e_guardar");

// modal cerrar
const modalCerrar = $("modal-cerrar");
const c_id = $("c_id");
const c_legajo = $("c_legajo");
const c_existente = $("c_existente");
const c_tipo_entrada = $("c_tipo_entrada");
const c_tipo_salida = $("c_tipo_salida");
const c_fecha_salida = $("c_fecha_salida");
const c_salida = $("c_salida");
const c_entrada = $("c_entrada");
const c_grp_salida = $("c_grp_salida");
const c_grp_entrada = $("c_grp_entrada");
const c_cancelar = $("c_cancelar");
const c_confirmar = $("c_confirmar");

const puestosPorSector = {
  PLAYA: ["Playero/a", "Auxiliar de playa"],
  MINI: ["Cajero/a", "Auxiliar de shop"],
  "ADMINISTRACIÓN": ["Encargado"],
  ADMINISTRACION: ["Encargado"],
};

let rowsCache = [];
let sorter = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updatePuestos() {
  const sec = String(m_sector.value || "").toUpperCase();
  const opts = puestosPorSector[sec] || [];
  m_puesto.innerHTML = "";

  if (!sec) {
    m_puesto.disabled = true;
    m_puesto.innerHTML =
      '<option value="">-- Seleccionar sector primero --</option>';
    return;
  }

  m_puesto.disabled = false;
  m_puesto.insertAdjacentHTML(
    "beforeend",
    '<option value="">-- Seleccionar --</option>'
  );
  opts.forEach((p) =>
    m_puesto.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`
    )
  );
}
m_sector.addEventListener("change", updatePuestos);
updatePuestos();

function openModal(el) {
  el.classList.add("open");
}
function closeModal(el) {
  el.classList.remove("open");
}

// --- Cerrar jornada: permitir decidir si el horario existente es ENTRADA o SALIDA
function syncCerrarUI(){
  const tipo = c_tipo_salida?.checked ? "salida" : "entrada";
  if(tipo === "entrada"){
    if(c_grp_salida) c_grp_salida.style.display = "";
    if(c_grp_entrada) c_grp_entrada.style.display = "none";
  }else{
    if(c_grp_salida) c_grp_salida.style.display = "none";
    if(c_grp_entrada) c_grp_entrada.style.display = "";
  }
}

c_tipo_entrada?.addEventListener("change", syncCerrarUI);
c_tipo_salida?.addEventListener("change", syncCerrarUI);

e_cancelar?.addEventListener("click", () => closeModal(modalEdit));
c_cancelar?.addEventListener("click", () => closeModal(modalCerrar));

modalEdit?.addEventListener("click", (e) => {
  if (e.target === modalEdit) closeModal(modalEdit);
});
modalCerrar?.addEventListener("click", (e) => {
  if (e.target === modalCerrar) closeModal(modalCerrar);
});

function render() {
  tbody.innerHTML = rowsCache
    .map(
      (r) => `
    <tr>
      <td data-label="ID">${escapeHtml(r.id)}</td>
      <td data-label="Legajo">${escapeHtml(r.legajo)}</td>
      <td data-label="Nombre">${escapeHtml(r.nombre)}</td>
      <td data-label="Sector">${escapeHtml(r.sector)}</td>
      <td data-label="Puesto">${escapeHtml(r.puesto)}</td>
      <td data-label="Fecha entrada">${escapeHtml(r.fecha_entrada)}</td>
      <td data-label="Entrada">${escapeHtml(r.entrada)}</td>
      <td data-label="Acciones" class="actions">
        <button class="btn ghost" type="button" data-edit="${r.id}">Editar</button>
        <button class="btn ghost" type="button" data-close="${r.id}">Cerrar</button>
        <button class="btn ghost" type="button" data-del="${r.id}">Eliminar</button>
      </td>
    </tr>
  `
    )
    .join("");

  tbody
    .querySelectorAll("[data-edit]")
    .forEach((b) => b.addEventListener("click", () => openEdit(Number(b.dataset.edit))));
  tbody
    .querySelectorAll("[data-close]")
    .forEach((b) => b.addEventListener("click", () => openClose(Number(b.dataset.close))));
  tbody
    .querySelectorAll("[data-del]")
    .forEach((b) => b.addEventListener("click", () => eliminar(Number(b.dataset.del))));
}


// ✅ inicializa sorter UNA sola vez
function initSorter() {
  if (!window.makeSortableTable) {
    console.error("❌ Falta cargar sortable.js antes de abiertas.js");
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
    "creado_en",
    "desc"
  );
}

async function cargar() {
  status.textContent = "Cargando...";

  const res = await fetch("/api/jornadas-abiertas");
  const data = await res.json().catch(() => ({}));

  rowsCache = data.rows || [];
  status.textContent = `Abiertas: ${rowsCache.length}`;

  initSorter();
  sorter?.setRows(rowsCache); // ✅ re-aplica orden actual
  render();

  // Si venimos desde el modal "Fichada incompleta", intentamos abrir automáticamente
  // la jornada abierta correspondiente (si existe) para que el usuario complete el horario faltante.
  if(window.__KM325_FALTA_TARGET__ && !window.__KM325_FALTA_TARGET_DONE__){
    const t = window.__KM325_FALTA_TARGET__;
    const match = rowsCache.find(r => String(r.legajo) === String(t.legajo) && String(r.fecha_entrada) === String(t.fecha));
    if(match){
      window.__KM325_FALTA_TARGET_DONE__ = true;
      openClose(Number(match.id));
    }
  }
}

async function crear() {
  const body = {
    legajo: String(m_legajo.value || "").trim(),
    nombre: String(m_nombre.value || "").trim(),
    sector: String(m_sector.value || ""),
    puesto: String(m_puesto.value || ""),
    fecha_entrada: String(m_fecha_entrada.value || ""),
    entrada: String(m_entrada.value || ""),
  };

  if (!body.legajo || !body.fecha_entrada)
    return alert("Faltan legajo / fecha entrada");

  const res = await fetch("/api/jornadas-abiertas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || "No se pudo crear");

  await cargar();
}

function openEdit(id) {
  const r = rowsCache.find((x) => Number(x.id) === Number(id));
  if (!r) return;

  e_id.value = r.id;
  e_legajo.value = r.legajo || "";
  e_nombre.value = r.nombre || "";
  e_sector.value = r.sector || "";
  e_puesto.value = r.puesto || "";
  e_fecha_entrada.value = r.fecha_entrada || "";
  e_entrada.value = r.entrada || "";

  openModal(modalEdit);
}

async function guardarEdit() {
  const id = Number(e_id.value);

  const body = {
    nombre: e_nombre.value,
    sector: e_sector.value,
    puesto: e_puesto.value,
    fecha_entrada: e_fecha_entrada.value,
    entrada: e_entrada.value,
  };

  const res = await fetch(`/api/jornadas-abiertas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || "No se pudo guardar");

  closeModal(modalEdit);
  await cargar();
}

function openClose(id) {
  const r = rowsCache.find((x) => Number(x.id) === Number(id));
  if (!r) return;

  c_id.value = r.id;
  c_legajo.value = r.legajo || "";
  if(c_existente) c_existente.value = r.entrada || "";

  // Default: usamos la fecha de entrada como base (sobre todo para turnos noche)
  c_fecha_salida.value = r.fecha_entrada || new Date().toISOString().slice(0, 10);

  // Por defecto interpretamos el "horario registrado" como ENTRADA (es lo que guarda la tabla)
  if(c_tipo_entrada) c_tipo_entrada.checked = true;
  if(c_tipo_salida) c_tipo_salida.checked = false;

  // El usuario completa el horario faltante
  if(c_salida) c_salida.value = "";
  if(c_entrada) c_entrada.value = "";
  syncCerrarUI();

  openModal(modalCerrar);
}

async function confirmarCierre() {
  const id = Number(c_id.value);

  const fecha_salida = String(c_fecha_salida?.value || "").trim();
  if(!fecha_salida) return alert("Falta fecha salida");

  const horarioRegistrado = String(c_existente?.value || "").trim();
  const tipo = c_tipo_salida?.checked ? "salida" : "entrada";

  // Caso A: horario registrado = ENTRADA -> el usuario completa SALIDA
  if(tipo === "entrada"){
    const salida = String(c_salida?.value || "").trim();
    if(!salida) return alert("Falta hora salida");

    const res = await fetch(`/api/jornadas-abiertas/${id}/cerrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha_salida, salida }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return alert(data.error || "No se pudo cerrar");
  }

  // Caso B: horario registrado = SALIDA -> el usuario completa ENTRADA
  else {
    if(!horarioRegistrado) return alert("No hay horario registrado para usar como salida");
    const entrada = String(c_entrada?.value || "").trim();
    if(!entrada) return alert("Falta hora entrada");

    // 1) Actualizamos la jornada abierta para que su 'entrada' sea la que completa el usuario
    const resUp = await fetch(`/api/jornadas-abiertas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entrada }),
    });
    const up = await resUp.json().catch(() => ({}));
    if(!resUp.ok || !up.ok) return alert(up.error || "No se pudo guardar la entrada");

    // 2) Cerramos usando como salida el horario registrado
    const res = await fetch(`/api/jornadas-abiertas/${id}/cerrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha_salida, salida: horarioRegistrado }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return alert(data.error || "No se pudo cerrar");
  }

  closeModal(modalCerrar);
  await cargar();
}

async function eliminar(id) {
  if (!confirm(`Eliminar jornada abierta ID ${id}?`)) return;

  const res = await fetch(`/api/jornadas-abiertas/${id}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || "No se pudo eliminar");

  await cargar();
}

btnRefresh?.addEventListener("click", cargar);
btnCrear?.addEventListener("click", crear);
e_guardar?.addEventListener("click", guardarEdit);
c_confirmar?.addEventListener("click", confirmarCierre);

cargar();
