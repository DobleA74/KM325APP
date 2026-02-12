/* Liquidación mensual
   - Resumen: GET /api/liquidacion?mes=YYYY-MM
   - Recalcular tardanzas: POST /api/liquidacion/tardanzas/recalcular { mes }
   - Detalle arqueos por empleado: GET /api/arqueos/empleado?legajo=..&mes=..
   - Recibo: /liquidacion/recibo?mes=..&legajo=..
*/

const $ = (id) => document.getElementById(id);

const elMes = $('mes');
const elMsg = $('msg');
const elBody = $('tbody');
const elFoot = $('tfoot-totales');
const elFilter = $('filter-apellido');

const btnCargar = $('btn-cargar');
const btnRecalcular = $('btn-recalcular');

const aTard = $('btn-tardanzas');
const aEsc = $('btn-escalas');
const aPrint = $('btn-print');

let _items = [];

function setMsg(text, kind = '') {
  if (!elMsg) return;
  elMsg.textContent = text;
  elMsg.className = kind ? `notice ${kind}` : 'notice';
}

function fmtMoney(v) {
  const num = Number(v || 0);
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function defaultMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function getMes() {
  const fromQuery = new URLSearchParams(window.location.search).get('mes');
  const m = (elMes?.value || fromQuery || '').trim();
  return m || defaultMonth();
}

function setLinks(mes) {
  const q = `?mes=${encodeURIComponent(mes)}`;
  if (aTard) aTard.href = `/liquidacion/tardanzas${q}`;
  if (aEsc) aEsc.href = `/liquidacion/escalas${q}`;
  if (aPrint) aPrint.href = `/liquidacion/print${q}`;
}

async function safeJson(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Respuesta no JSON (${resp.status}). ${text.slice(0, 120)}`);
  }
  return await resp.json();
}

function sortPorApellido(items) {
  return [...(items || [])].sort((a, b) => {
    const ka = String(a?.nombre || '').split(',')[0].trim().toLowerCase();
    const kb = String(b?.nombre || '').split(',')[0].trim().toLowerCase();
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return String(a?.nombre || '').localeCompare(String(b?.nombre || ''), 'es');
  });
}

function render(items) {
  if (!elBody) return;
  elBody.innerHTML = '';

  if (!items || !items.length) {
    elBody.innerHTML = `<tr><td colspan="14" class="small">Sin datos para ese mes.</td></tr>`;
    return;
  }

  const mes = getMes();

  for (const it of items) {
    const diasTrab = Number(it.dias_trabajados || 0);
    const francos = Number(it.dias_franco || 0);
    const diasTotal = diasTrab + francos; // ✅ regla: días incluye francos

    const pres = it.pierde_presentismo ? 'No' : 'Sí';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Legajo">${it.legajo || ''}</td>
      <td data-label="Nombre">${it.nombre || ''}</td>
      <td data-label="Días">${diasTotal}</td>
      <td data-label="Francos">${francos}</td>
      <td data-label="Noches">${it.noches_turnos ?? 0}</td>
      <td data-label="Feriados">${it.feriados_trabajados ?? 0}</td>
      <td data-label="Tardanzas">${it.tardanzas ?? 0}</td>
      <td data-label="Presentismo">${pres}</td>
      <td data-label="$ Nocturnidad" style="text-align:right">$ ${fmtMoney(it.adicional_nocturnidad)}</td>
      <td data-label="$ Prem. Asistencia" style="text-align:right">$ ${fmtMoney(it.premio_asistencia)}</td>
      <td data-label="$ Manejo fondos" style="text-align:right">$ ${fmtMoney(it.premio_manejo_fondos)}</td>
      <td data-label="$ Ajuste arqueo" style="text-align:right">
        <button class="btn-arqueos" data-legajo="${it.legajo}" style="padding:4px 10px;border-radius:10px; cursor:pointer;">
          $ ${fmtMoney(it.ajuste_manejo_fondos)}
        </button>
      </td>
      <td data-label="$ Adelantos" style="text-align:right">$ ${fmtMoney(it.adelantos)}</td>
      <td data-label="Recibo">
        <a class="btn" href="/liquidacion/recibo?mes=${encodeURIComponent(mes)}&legajo=${encodeURIComponent(it.legajo)}" target="_blank">PDF</a>
      </td>
    `;
    elBody.appendChild(tr);
  }
}

function renderFooter(items) {
  if (!elFoot) return;
  if (!items || !items.length) {
    elFoot.innerHTML = '';
    return;
  }

  const sums = {
    dias: 0,
    francos: 0,
    noches: 0,
    feriados: 0,
    noct: 0,
    asis: 0,
    mf: 0,
    arq: 0,
    adel: 0,
  };

  for (const it of items) {
    const diasTrab = Number(it.dias_trabajados || 0);
    const francos = Number(it.dias_franco || 0);
    sums.dias += diasTrab + francos; // ✅ total días incluye francos
    sums.francos += francos;
    sums.noches += Number(it.noches_turnos || 0);
    sums.feriados += Number(it.feriados_trabajados || 0);
    sums.noct += Number(it.adicional_nocturnidad || 0);
    sums.asis += Number(it.premio_asistencia || 0);
    sums.mf += Number(it.premio_manejo_fondos || 0);
    sums.arq += Number(it.ajuste_manejo_fondos || 0);
    sums.adel += Number(it.adelantos || 0);
  }

  // 14 columnas exactas (igual que el <thead>)
  elFoot.innerHTML = `
    <td style="font-weight:900">Totales</td>
    <td></td>
    <td style="font-weight:900">${sums.dias}</td>
    <td style="font-weight:900">${sums.francos}</td>
    <td style="font-weight:900">${sums.noches}</td>
    <td style="font-weight:900">${sums.feriados}</td>
    <td></td>
    <td></td>
    <td class="money">$ ${fmtMoney(sums.noct)}</td>
    <td class="money">$ ${fmtMoney(sums.asis)}</td>
    <td class="money">$ ${fmtMoney(sums.mf)}</td>
    <td class="money">$ ${fmtMoney(sums.arq)}</td>
    <td class="money">$ ${fmtMoney(sums.adel)}</td>
    <td></td>
  `;
}

function applyFilters() {
  const q = String(elFilter?.value || '').trim().toLowerCase();
  let items = sortPorApellido(_items);

  if (q) items = items.filter((it) => String(it?.nombre || '').toLowerCase().includes(q));

  render(items);
  renderFooter(items);
  setMsg(`OK · ${getMes()} · empleados: ${items.length}${q ? ` · filtro: "${q}"` : ''}`, 'ok');
}

/* =====================
   Modal detalle arqueos
   ===================== */

function ensureModal() {
  let modal = document.getElementById('modal-arqueos');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'modal-arqueos';
  modal.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.45);
    display:none; align-items:center; justify-content:center;
    padding:18px; z-index:9999;
  `;

  modal.innerHTML = `
    <div style="width:min(900px, 100%); background:#fff; border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.25); overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid #eee;">
        <div>
          <div style="font-weight:800; font-size:16px;" id="modal-arq-title">Detalle de arqueos</div>
          <div style="font-size:12px; color:#64748b;" id="modal-arq-sub"></div>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="modal-arq-close" style="border:0; background:#f1f5f9; padding:8px 12px; border-radius:10px; cursor:pointer;">Cerrar</button>
        </div>
      </div>
      <div style="padding:14px 16px; max-height:70vh; overflow:auto;">
        <div id="modal-arq-body" style="font-size:14px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#modal-arq-close').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  return modal;
}

function groupByFecha(items) {
  const map = new Map();
  for (const it of items || []) {
    const f = String(it.fecha || '');
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(it);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

function orderTurno(t) {
  const x = String(t || '').toLowerCase();
  if (x.includes('mañ')) return 1;
  if (x.includes('tar')) return 2;
  if (x.includes('noc')) return 3;
  return 9;
}

async function abrirDetalleArqueos(legajo) {
  const mes = getMes();
  const modal = ensureModal();

  modal.querySelector('#modal-arq-title').textContent = 'Detalle de arqueos';
  modal.querySelector('#modal-arq-sub').textContent = `Legajo ${legajo} · ${mes}`;
  modal.querySelector('#modal-arq-body').innerHTML = `<div class="small">Cargando...</div>`;
  modal.style.display = 'flex';

  try {
    const resp = await fetch(`/api/arqueos/empleado?legajo=${encodeURIComponent(legajo)}&mes=${encodeURIComponent(mes)}`);
    const data = await safeJson(resp);
    if (!data.ok) throw new Error(data.error || 'Error');

    const items = data.items || [];
    if (!items.length) {
      modal.querySelector('#modal-arq-body').innerHTML = `<div class="small">Sin arqueos para este empleado en el mes.</div>`;
      return;
    }

    const porFecha = groupByFecha(items);
    let html = '';

    for (const [fecha, arr] of porFecha) {
      const sorted = [...arr].sort((a, b) => {
        const s = String(a.sector || '').localeCompare(String(b.sector || ''), 'es');
        if (s !== 0) return s;
        return orderTurno(a.turno) - orderTurno(b.turno);
      });

      html += `
        <div style="padding:10px 12px; border:1px solid #e5e7eb; border-radius:14px; margin-bottom:10px;">
          <div style="font-weight:900;">${fecha}</div>
          <div style="margin-top:8px;">
            <table style="width:100%; border-collapse:collapse; font-size:13px;">
              <thead>
                <tr style="text-align:left; color:#64748b;">
                  <th style="padding:6px 4px;">Sector</th>
                  <th style="padding:6px 4px;">Turno</th>
                  <th style="padding:6px 4px; text-align:right;">$ Turno</th>
                  <th style="padding:6px 4px; text-align:right;">$ Empleado</th>
                </tr>
              </thead>
              <tbody>
                ${sorted
                  .map(
                    (x) => `
                  <tr>
                    <td style="padding:6px 4px; border-top:1px solid #f1f5f9;">${x.sector || ''}</td>
                    <td style="padding:6px 4px; border-top:1px solid #f1f5f9;">${x.turno || ''}</td>
                    <td style="padding:6px 4px; border-top:1px solid #f1f5f9; text-align:right;">$ ${fmtMoney(x.monto_diferencia)}</td>
                    <td style="padding:6px 4px; border-top:1px solid #f1f5f9; text-align:right; font-weight:900;">$ ${fmtMoney(x.monto_final)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    modal.querySelector('#modal-arq-body').innerHTML = html;
  } catch (e) {
    console.error(e);
    modal.querySelector('#modal-arq-body').innerHTML = `<div class="small" style="color:#b91c1c;">No se pudo cargar el detalle: ${String(e.message || e)}</div>`;
  }
}

/* =====================
   API actions
   ===================== */

async function cargar() {
  const mes = getMes();
  if (elMes) elMes.value = mes;
  setLinks(mes);

  setMsg('Cargando...', '');
  if (elBody) elBody.innerHTML = `<tr><td colspan="14" class="small">Cargando...</td></tr>`;
  if (elFoot) elFoot.innerHTML = '';

  try {
    const resp = await fetch(`/api/liquidacion?mes=${encodeURIComponent(mes)}`);
    const data = await safeJson(resp);
    if (!data.ok) throw new Error(data.error || 'Error');

    _items = data.items || [];
    applyFilters();
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, 'danger');
    if (elBody) elBody.innerHTML = `<tr><td colspan="14" class="small">Error cargando.</td></tr>`;
  }
}

async function recalcular() {
  const mes = getMes();
  setMsg('Recalculando tardanzas...', '');

  try {
    const resp = await fetch('/api/liquidacion/tardanzas/recalcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes }),
    });

    const data = await safeJson(resp);
    if (!data.ok) throw new Error(data.error || 'Error');

    setMsg(`Recalculadas: ${data.recalculadas || 0}`, 'ok');
    await cargar();
  } catch (e) {
    console.error(e);
    setMsg(`Error: ${e.message || e}`, 'danger');
  }
}

/* =====================
   Eventos
   ===================== */

btnCargar?.addEventListener('click', cargar);
btnRecalcular?.addEventListener('click', recalcular);

elFilter?.addEventListener('input', applyFilters);

elBody?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.btn-arqueos');
  if (!btn) return;
  abrirDetalleArqueos(btn.dataset.legajo);
});

// init
if (elMes) elMes.value = getMes();
setLinks(getMes());
