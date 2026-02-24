/* Arqueos (día vencido)
   Frontend adaptado al API actual del server (server.js):
   - POST /api/arqueos/guardar-y-calcular  { fecha, sector, turnos:[{turno,monto_diferencia,observaciones}] }
   - GET  /api/arqueos?fecha=YYYY-MM-DD   -> { arqueos, asignaciones }
   - POST /api/arqueos/confirmar          { arqueo_id, asignaciones:[{legajo,monto_final}] }

   UI:
   - Totales por sector+turno
   - Detalle editable por empleado
   - Export PNG del bloque #export-area
   - Si no hay arqueos para la fecha: muestra alerta y limpia pantalla (sin dejar “restos” del día anterior)*/

const $ = (id) => document.getElementById(id);

const elFecha = $('fecha');
const elMsg = $('msg');
const elBody = $('tbody-propuestas');
const elTotales = $('tbody-totales');

const btnCalcular = $('btn-calcular');
const btnConfirmar = $('btn-confirmar');
const btnCargar = $('btn-cargar');
const btnExport = $('btn-export');
const exportArea = $('export-area');

function setMsg(text, kind = '') {
  if (!elMsg) return;
  elMsg.textContent = text;
  elMsg.className = kind ? `notice ${kind}` : 'notice';}

function isoYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');  return `${yyyy}-${mm}-${dd}`;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v) {
  const num = Number(v || 0);
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function keySectorTurno(obj) {
  return `${String(obj.sector || '').toLowerCase()}__${String(obj.turno || '').toLowerCase()}`;
}

let state = {
  arqueos: [],
  propuestas: [],
};

function clearTablesOnly() {
  state.arqueos = [];
  state.propuestas = [];
  if (elTotales) elTotales.innerHTML = '';
  if (elBody) elBody.innerHTML = '';
  btnConfirmar && (btnConfirmar.disabled = true);
  btnExport && (btnExport.style.display = 'none');
}

function clearInputsOnly() {
  $('playa_manana').value = '';
  $('playa_tarde').value = '';
  $('playa_noche').value = '';
  $('playa_obs').value = '';
  $('shop_manana').value = '';
  $('shop_tarde').value = '';
  $('shop_obs').value = '';
}

function clearScreen(full = true) {
  clearTablesOnly();
  if (full) clearInputsOnly();
}

async function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Respuesta no JSON (${resp.status}). ${text.slice(0, 160)}`);
  }
  return await resp.json();
}

function collectFinalesFromTable() {
  const map = new Map(); // arqueoId__legajo -> monto_final
  [...elBody.querySelectorAll('tr[data-arqueo-id]')].forEach((tr) => {
    const k = `${tr.dataset.arqueoId}__${tr.dataset.legajo}`;
    const inp = tr.querySelector('input[data-role="monto_final"]');
    map.set(k, n(inp?.value));
  });
  return map;
}

function renderTotales(arqueos, propuestas) {
  if (!elTotales) return;
  elTotales.innerHTML = '';

  if (!arqueos?.length) {
    elTotales.innerHTML = `<tr><td colspan="5" class="small">Sin arqueos cargados.</td></tr>`;
    return;
  }

  // Total asignado por arqueo
  const sumAsign = new Map(); // arqueo_id -> sum
  for (const p of propuestas || []) {
    const prev = sumAsign.get(p.arqueo_id) || 0;
    sumAsign.set(p.arqueo_id, prev + n(p.monto_final));
  }

  for (const a of arqueos) {
    const asig = n(sumAsign.get(a.id) || 0);
    const dif = n(a.monto_diferencia || 0) - asig;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Sector">${a.sector || ''}</td>
      <td data-label="Turno">${a.turno || ''}</td>
      <td data-label="Monto turno">$ ${fmtMoney(a.monto_diferencia)}</td>
      <td data-label="Total asignado">$ ${fmtMoney(asig)}</td>
      <td data-label="Diferencia">$ ${fmtMoney(dif)}</td>    `;
    elTotales.appendChild(tr);
  }
}

function renderPropuestasAgrupadas(propuestas, arqueos) {
  if (!elBody) return;
  elBody.innerHTML = '';

  if (!propuestas?.length) {
    btnConfirmar && (btnConfirmar.disabled = true);
    btnExport && (btnExport.style.display = 'none');
    elBody.innerHTML = `<tr><td colspan="8" class="small">Sin propuestas (revisá montos y asistencias del día).</td></tr>`;
    return;
  }

  const arqById = new Map((arqueos || []).map((a) => [a.id, a]));

  const groups = new Map();
  for (const p of propuestas) {
    const k = keySectorTurno(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  const turnoOrder = { manana: 1, mañana: 1, tarde: 2, noche: 3 };
  const sectorOrder = { playa: 1, shop: 2, mini: 2 };

  const entries = [...groups.entries()].sort(([ka], [kb]) => {
    const [sa, ta] = ka.split('__');
    const [sb, tb] = kb.split('__');
    const ds = (sectorOrder[sa] || 99) - (sectorOrder[sb] || 99);
    if (ds) return ds;
    return (turnoOrder[ta] || 99) - (turnoOrder[tb] || 99);
  });

  for (const [, list] of entries) {
    const first = list[0];
    const arq = arqById.get(first.arqueo_id);
    const totalTurno = n(arq?.monto_diferencia || 0);
    const totalAsign = list.reduce((s, p) => s + n(p.monto_final), 0);
    const diff = totalTurno - totalAsign;

    const trHead = document.createElement('tr');
    trHead.className = 'group-row';
    trHead.innerHTML = `
      <td colspan="8" class="group-cell">
        <span class="group-title">${first.sector || ''} – ${first.turno || ''}</span>
        <span class="group-meta">Total turno: $ ${fmtMoney(totalTurno)} · Asignado: $ ${fmtMoney(totalAsign)} · Dif: $ ${fmtMoney(diff)}</span>
      </td>
    `;
    elBody.appendChild(trHead);

    for (const p of list) {
      const tr = document.createElement('tr');
      tr.dataset.arqueoId = String(p.arqueo_id);
      tr.dataset.legajo = String(p.legajo);

      tr.innerHTML = `
        <td data-label="Sector">${p.sector || ''}</td>
        <td data-label="Turno">${p.turno || ''}</td>
        <td data-label="Legajo">${p.legajo || ''}</td>
        <td data-label="Nombre">${p.nombre || ''}</td>
        <td data-label="Puesto">${p.puesto || ''}</td>
        <td data-label="Minutos">${p.minutos || 0}</td>
        <td data-label="$ Propuesto">$ ${fmtMoney(p.monto_propuesto)}</td>
        <td data-label="$ Final (editable)">
          <input type="number" step="0.01" value="${n(p.monto_final)}" data-role="monto_final" />
        </td>
      `;
      elBody.appendChild(tr);
    }
  }

  btnConfirmar && (btnConfirmar.disabled = false);
  btnExport && (btnExport.style.display = 'inline-flex');
}

function setInputsFromArqueos(arqueos) {
  const map = new Map();
  for (const a of arqueos || []) {
    map.set(`${a.sector}_${a.turno}`.toLowerCase(), n(a.monto_diferencia || 0));
  }
  $('playa_manana').value = map.get('playa_mañana') ?? map.get('playa_manana') ?? '';
  $('playa_tarde').value = map.get('playa_tarde') ?? '';
  $('playa_noche').value = map.get('playa_noche') ?? '';
  $('shop_manana').value = map.get('shop_mañana') ?? map.get('shop_manana') ?? '';
  $('shop_tarde').value = map.get('shop_tarde') ?? '';
}

function buildTurnos(sector) {
  if (sector === 'playa') {
    return [
      { turno: 'mañana', monto_diferencia: n($('playa_manana').value) },
      { turno: 'tarde', monto_diferencia: n($('playa_tarde').value) },
      { turno: 'noche', monto_diferencia: n($('playa_noche').value) },
    ];
  }
  // shop
  return [
    { turno: 'mañana', monto_diferencia: n($('shop_manana').value) },
    { turno: 'tarde', monto_diferencia: n($('shop_tarde').value) },
  ];
}

function obsFor(sector) {
  return String($(sector === 'playa' ? 'playa_obs' : 'shop_obs').value || '').trim();
}

function hasAnyMonto(turnos) {
  return (turnos || []).some((t) => Math.abs(n(t.monto_diferencia)) > 0);
}

async function guardarYCalcularSector({ fecha, sector }) {
  const turnos = buildTurnos(sector);
  // Si todos 0 y sin obs, no llames al API (evita 400/ruido)
  if (!hasAnyMonto(turnos) && !obsFor(sector)) {
    return { ok: true, arqueos: [], propuestas: [] };
  }

  const payload = {
    fecha,
    sector,
    turnos: turnos.map((t) => ({
      turno: t.turno,
      monto_diferencia: n(t.monto_diferencia),
      observaciones: obsFor(sector),
    })),
  };

  const resp = await fetch('/api/arqueos/guardar-y-calcular', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(resp);
  if (!data.ok) throw new Error(data.error || 'Error');
  return data;
}

async function doCalcular() {
  const fecha = elFecha?.value;
  if (!fecha) return setMsg('Elegí una fecha.', 'warn');

  btnCalcular && (btnCalcular.disabled = true);
  try {
    // Siempre limpiamos las tablas primero, así no quedan “restos” si falla.
    clearTablesOnly();

    const r1 = await guardarYCalcularSector({ fecha, sector: 'playa' });
    const r2 = await guardarYCalcularSector({ fecha, sector: 'shop' });

    state.arqueos = [...(r1.arqueos || []), ...(r2.arqueos || [])];
    state.propuestas = [...(r1.propuestas || []), ...(r2.propuestas || [])];

    if (!state.arqueos.length) {
      // No se guardó nada (todo 0/ vacío). Aviso y limpieza.
      clearScreen(false);
      setMsg('⚠️ No hay arqueos cargados/asistencias para esta fecha.', 'warn');
      return;
    }

    renderTotales(state.arqueos, state.propuestas);
    renderPropuestasAgrupadas(state.propuestas, state.arqueos);
    setMsg('Arqueos cargados. Podés editar montos y confirmar.', 'ok');
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message}`, 'bad');
  } finally {
    btnCalcular && (btnCalcular.disabled = false);
  }
}

async function doCargar() {
  const fecha = elFecha?.value;
  if (!fecha) return setMsg('Elegí una fecha.', 'warn');

  btnCargar && (btnCargar.disabled = true);
  try {
    // Limpia tablas antes de cargar, así si no hay data queda limpio.
    clearTablesOnly();

    const resp = await fetch(`/api/arqueos?fecha=${encodeURIComponent(fecha)}`);
    const data = await safeJson(resp);
    if (!data.ok) throw new Error(data.error || 'Error');

    const arqueos = data.arqueos || [];
    const asignaciones = data.asignaciones || [];

    if (!arqueos.length) {
      clearScreen(false);
      clearInputsOnly();
      setMsg('⚠️ No hay arqueos cargados/asistencias para esta fecha.', 'warn');
      return;
    }

    // Mapear asignaciones -> propuestas (para reutilizar render)
    const propuestas = asignaciones.map((x) => ({
      arqueo_id: x.arqueo_id,
      sector: x.sector,
      turno: x.turno,
      legajo: x.legajo,
      nombre: x.nombre,
      puesto: x.puesto,
      minutos: x.minutos,
      monto_propuesto: x.monto_propuesto,
      monto_final: x.monto_final,
    }));

    state.arqueos = arqueos;
    state.propuestas = propuestas;

    setInputsFromArqueos(arqueos);
    renderTotales(arqueos, propuestas);
    renderPropuestasAgrupadas(propuestas, arqueos);
    setMsg('Arqueos cargados. Podés editar y volver a confirmar.', 'ok');
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message}`, 'bad');
  } finally {
    btnCargar && (btnCargar.disabled = false);
  }
}

async function doConfirmar() {
  if (!state.propuestas?.length) return;

  const finales = collectFinalesFromTable();

  // Agrupar por arqueo_id para llamar al endpoint correcto
  const byArq = new Map();
  for (const p of state.propuestas) {
    const k = `${p.arqueo_id}`;
    if (!byArq.has(k)) byArq.set(k, []);
    const kk = `${p.arqueo_id}__${p.legajo}`;
    byArq.get(k).push({
      legajo: p.legajo,
      monto_final: n(finales.get(kk) ?? p.monto_final),
    });
  }

  btnConfirmar && (btnConfirmar.disabled = true);
  try {
    for (const [arqueo_id, asignaciones] of byArq.entries()) {
      const resp = await fetch('/api/arqueos/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arqueo_id: Number(arqueo_id), asignaciones }),
      });
      const data = await safeJson(resp);
      if (!data.ok) throw new Error(data.error || `Error confirmando arqueo ${arqueo_id}`);
    }

    setMsg('Asignaciones confirmadas. Pantalla limpia para el próximo día.', 'ok');
    clearScreen(true);
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message}`, 'bad');
    btnConfirmar && (btnConfirmar.disabled = false);
  }
}

async function doExport() {
  if (!exportArea) return;
  try {
    const canvas = await html2canvas(exportArea, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const fecha = elFecha?.value || 'arqueos';
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `arqueos_${fecha}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.error(e);
    setMsg('No se pudo exportar. Probá recargar la página.', 'bad');
  }
}

// Init
if (elFecha) elFecha.value = isoYesterday();
btnCalcular?.addEventListener('click', doCalcular);
btnCargar?.addEventListener('click', doCargar);
btnConfirmar?.addEventListener('click', doConfirmar);
btnExport?.addEventListener('click', doExport);

setMsg('Listo.');