/* Arqueos (día vencido)
   - Playa: mañana/tarde/noche
   - Shop: mañana/tarde
   Flujo:
     1) Guardar montos -> /api/arqueos/guardar-y-calcular
     2) Editar $ final -> Confirmar -> /api/arqueos/confirmar
     3) Cargar guardado -> /api/arqueos?fecha=...
*/

const $ = (id) => document.getElementById(id);

const elFecha = $("fecha");
const elMsg = $("msg");
const elBody = $("tbody-propuestas");
const elTotales = $("tbody-totales");
const btnCalcular = $("btn-calcular");
const btnConfirmar = $("btn-confirmar");
const btnCargar = $("btn-cargar");

function setMsg(text, kind = "") {
  elMsg.textContent = text;
  elMsg.className = kind ? `notice ${kind}` : "notice";
}

function isoYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v) {
  const num = Number(v || 0);
  return num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Estado en memoria: { arqueos: [{id,sector,turno,monto_diferencia...}], propuestas: [...] }
let state = { arqueos: [], propuestas: [] };

function rowKey(p) {
  return `${p.arqueo_id}__${p.legajo}`;
}

function renderPropuestas(propuestas) {
  elBody.innerHTML = "";

  if (!propuestas.length) {
    btnConfirmar.disabled = true;
    elBody.innerHTML = `<tr><td colspan="8" class="small">Sin propuestas (revisá montos y asistencias del día).</td></tr>`;
    return;
  }

  for (const p of propuestas) {
    const tr = document.createElement("tr");
    tr.dataset.arqueoId = String(p.arqueo_id);
    tr.dataset.legajo = String(p.legajo);

    tr.innerHTML = `
      <td data-label="Sector">${p.sector || ""}</td>
      <td data-label="Turno">${p.turno || ""}</td>
      <td data-label="Legajo">${p.legajo || ""}</td>
      <td data-label="Nombre">${p.nombre || ""}</td>
      <td data-label="Puesto">${p.puesto || ""}</td>
      <td data-label="Minutos">${p.minutos || 0}</td>
      <td data-label="$ Propuesto">$ ${fmtMoney(p.monto_propuesto)}</td>
      <td data-label="$ Final (editable)">
        <input type="number" step="0.01" value="${n(p.monto_final)}" data-role="monto_final" />
      </td>
    `;

    elBody.appendChild(tr);
  }

  btnConfirmar.disabled = false;

  // recalcula totales cuando se edita el $ final
  elBody.querySelectorAll('input[data-role="monto_final"]').forEach((inp) => {
    inp.addEventListener("input", () => renderTotalesTurno());
  });

  renderTotalesTurno();
}

function montoTurnoDesdeInputs(sector, turno) {
  const s = String(sector || "").toLowerCase();
  const t = String(turno || "").toLowerCase();
  if (s.includes("playa")) {
    if (t === "mañana") return n($("playa_manana").value);
    if (t === "tarde") return n($("playa_tarde").value);
    if (t === "noche") return n($("playa_noche").value);
  }
  if (s.includes("shop")) {
    if (t === "mañana") return n($("shop_manana").value);
    if (t === "tarde") return n($("shop_tarde").value);
  }
  return 0;
}

function renderTotalesTurno() {
  if (!elTotales) return;
  elTotales.innerHTML = "";

  // Agrupar por (sector, turno)
  const map = new Map();
  const rows = Array.from(elBody.querySelectorAll("tr"));
  for (const tr of rows) {
    const arqueoId = Number(tr.dataset.arqueoId);
    const p = state.propuestas.find((x) => Number(x.arqueo_id) === arqueoId && String(x.legajo) === String(tr.dataset.legajo));
    if (!p) continue;

    const key = `${p.sector}__${p.turno}`;
    if (!map.has(key)) {
      map.set(key, { sector: p.sector, turno: p.turno, total: 0 });
    }

    const input = tr.querySelector('input[data-role="monto_final"]').value;
    map.get(key).total += n(input);
  }

  const keys = Array.from(map.keys()).sort();
  if (!keys.length) {
    elTotales.innerHTML = `<tr><td colspan="5" class="small">Sin datos para totales.</td></tr>`;
    return;
  }

  for (const key of keys) {
    const item = map.get(key);
    const montoTurno = montoTurnoDesdeInputs(item.sector, item.turno);
    const diff = Number((montoTurno - item.total).toFixed(2));

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-label="Sector">${item.sector}</td>
      <td data-label="Turno">${item.turno}</td>
      <td data-label="Monto turno">$ ${fmtMoney(montoTurno)}</td>
      <td data-label="Total asignado">$ ${fmtMoney(item.total)}</td>
      <td data-label="Diferencia">$ ${fmtMoney(diff)}</td>
    `;
    elTotales.appendChild(tr);
  }
}

async function apiJson(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const msg = data?.error || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function buildTurnosPayload(sector) {
  if (sector === "Playa") {
    return [
      { turno: "mañana", monto_diferencia: n($("playa_manana").value), observaciones: $("playa_obs").value || "" },
      { turno: "tarde", monto_diferencia: n($("playa_tarde").value), observaciones: $("playa_obs").value || "" },
      { turno: "noche", monto_diferencia: n($("playa_noche").value), observaciones: $("playa_obs").value || "" },
    ];
  }
  if (sector === "Shop") {
    return [
      { turno: "mañana", monto_diferencia: n($("shop_manana").value), observaciones: $("shop_obs").value || "" },
      { turno: "tarde", monto_diferencia: n($("shop_tarde").value), observaciones: $("shop_obs").value || "" },
    ];
  }
  return [];
}

async function guardarYCalcularSector(fecha, sector) {
  const payload = {
    fecha,
    sector,
    turnos: buildTurnosPayload(sector),
  };

  return apiJson("/api/arqueos/guardar-y-calcular", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function onGuardarYCalcular() {
  const fecha = elFecha.value;
  if (!fecha) return setMsg("Elegí una fecha.", "warn");

  btnCalcular.disabled = true;
  btnConfirmar.disabled = true;
  setMsg("Guardando y calculando...", "");

  try {
    const rPlaya = await guardarYCalcularSector(fecha, "Playa");
    const rShop = await guardarYCalcularSector(fecha, "Shop");

    // unificamos
    state.arqueos = [...(rPlaya.arqueos || []), ...(rShop.arqueos || [])];
    state.propuestas = [...(rPlaya.propuestas || []), ...(rShop.propuestas || [])];

    renderPropuestas(state.propuestas);
    setMsg("Propuesta generada. Podés editar el $ final y confirmar.", "ok");
  } catch (e) {
    console.error(e);
    setMsg(e.message || "Error", "err");
  } finally {
    btnCalcular.disabled = false;
  }
}

function collectAsignacionesByArqueoId() {
  // agrupa por arqueo_id
  const map = new Map();
  const rows = Array.from(elBody.querySelectorAll("tr"));
  for (const tr of rows) {
    const arqueoId = Number(tr.dataset.arqueoId);
    const legajo = tr.dataset.legajo;
    const input = tr.querySelector('input[data-role="monto_final"]');
    const montoFinal = n(input?.value);

    const p = state.propuestas.find((x) => String(x.arqueo_id) === String(arqueoId) && String(x.legajo) === String(legajo));
    if (!p) continue;

    const item = {
      legajo: p.legajo,
      nombre: p.nombre,
      puesto: p.puesto,
      minutos: p.minutos,
      monto_propuesto: p.monto_propuesto,
      monto_final: montoFinal,
    };

    if (!map.has(arqueoId)) map.set(arqueoId, []);
    map.get(arqueoId).push(item);
  }
  return map;
}

async function onConfirmar() {
  const byArq = collectAsignacionesByArqueoId();
  if (!byArq.size) return setMsg("No hay asignaciones para confirmar.", "warn");

  btnConfirmar.disabled = true;
  setMsg("Guardando asignaciones...", "");

  try {
    let total = 0;
    for (const [arqueoId, asignaciones] of byArq.entries()) {
      const r = await apiJson("/api/arqueos/confirmar", {
        method: "POST",
        body: JSON.stringify({ arqueo_id: arqueoId, asignaciones }),
      });
      total += r.guardadas || 0;
    }

    setMsg(`Asignaciones confirmadas (${total}).`, "ok");
    // Limpiamos la vista para que quede claro que ya se cargó exitosamente.
    clearAfterConfirm();
  } catch (e) {
    console.error(e);
    setMsg(e.message || "Error", "err");
  } finally {
    btnConfirmar.disabled = false;
  }
}

function clearAfterConfirm(){
  // No tocamos la fecha seleccionada para que puedas seguir trabajando el mismo día.
  // Limpia montos, observaciones y tablas.
  try {
    // inputs montos por sector/turno
    [elPlayaM, elPlayaT, elPlayaN, elShopM, elShopT].forEach((i)=>{ if(i) i.value = ""; });
    [elObsPlaya, elObsShop].forEach((i)=>{ if(i) i.value = ""; });
  } catch (_) {}

  // Estado de propuesta
  state.ultimaPropuesta = null;
  state.items = [];
  state.agrupado = { playa: { manana: [], tarde: [], noche: [] }, shop: { manana: [], tarde: [] } };

  renderTablaItems([]);
  renderPropuestaResumen(null);
  renderPropuestaTabla([]);

  btnConfirmar.disabled = true;
}

async function onCargarGuardado() {
  const fecha = elFecha.value;
  if (!fecha) return setMsg("Elegí una fecha.", "warn");

  btnCargar.disabled = true;
  btnConfirmar.disabled = true;
  setMsg("Cargando arqueos guardados...", "");

  try {
    const data = await apiJson(`/api/arqueos?fecha=${encodeURIComponent(fecha)}`);
    const arqueos = data.arqueos || [];
    const asignaciones = data.asignaciones || [];

    // setea inputs de montos
    const findArq = (sector, turno) => arqueos.find((a) => (a.sector || "").toLowerCase().includes(sector.toLowerCase()) && (a.turno || "").toLowerCase() === turno);

    const pm = findArq("playa", "mañana");
    const pt = findArq("playa", "tarde");
    const pn = findArq("playa", "noche");
    if (pm) $("playa_manana").value = n(pm.monto_diferencia);
    if (pt) $("playa_tarde").value = n(pt.monto_diferencia);
    if (pn) $("playa_noche").value = n(pn.monto_diferencia);
    if (pm?.observaciones || pt?.observaciones || pn?.observaciones) $("playa_obs").value = pm?.observaciones || pt?.observaciones || pn?.observaciones || "";

    const sm = findArq("shop", "mañana");
    const st = findArq("shop", "tarde");
    if (sm) $("shop_manana").value = n(sm.monto_diferencia);
    if (st) $("shop_tarde").value = n(st.monto_diferencia);
    if (sm?.observaciones || st?.observaciones) $("shop_obs").value = sm?.observaciones || st?.observaciones || "";

    // arma propuestas desde lo guardado
    state.arqueos = arqueos;
    state.propuestas = asignaciones.map((a) => ({
      arqueo_id: a.arqueo_id,
      sector: arqueos.find((x) => x.id === a.arqueo_id)?.sector || "",
      turno: arqueos.find((x) => x.id === a.arqueo_id)?.turno || "",
      legajo: a.legajo,
      nombre: a.nombre,
      puesto: a.puesto,
      minutos: a.minutos,
      monto_propuesto: a.monto_propuesto,
      monto_final: a.monto_final,
    }));

    renderPropuestas(state.propuestas);
    setMsg("Arqueos cargados. Podés editar y volver a confirmar.", "ok");
  } catch (e) {
    console.error(e);
    setMsg(e.message || "Error", "err");
  } finally {
    btnCargar.disabled = false;
  }
}

function init() {
  elFecha.value = isoYesterday();
  btnCalcular.addEventListener("click", onGuardarYCalcular);
  btnConfirmar.addEventListener("click", onConfirmar);
  btnCargar.addEventListener("click", onCargarGuardado);

  // Si se modifican los montos de turno, recalcular resumen
  ["playa_manana","playa_tarde","playa_noche","shop_manana","shop_tarde"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", () => renderTotalesTurno());
  });
}

init();
