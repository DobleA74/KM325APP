console.log('✅ horarios-por-puesto.js cargado');

const $ = (id) => document.getElementById(id);

const btnToggle = $('adv_toggle');
const panel = $('adv_panel');

const selPuesto = $('hp_puesto');
const selPatron = $('hp_patron');
const patronInicio = $('hp_patron_inicio');
const mIni = $('hp_m_ini');
const mFin = $('hp_m_fin');
const tIni = $('hp_t_ini');
const tFin = $('hp_t_fin');
const nIni = $('hp_n_ini');
const nFin = $('hp_n_fin');

const btnGuardar = $('hp_guardar');
const btnBorrar = $('hp_borrar');
const msg = $('hp_msg');

const tbody = $('hp_body');

let cfgMap = new Map(); // puesto -> {manana,tarde,noche,patron_id,patron_inicio,patron_nombre}
let patrones = []; // {id,nombre,ciclo_dias}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function splitRange(range) {
  const s = String(range || '').trim();
  const m = s.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  return m ? { ini: m[1], fin: m[2] } : { ini: '', fin: '' };
}

function clearInputs() {
  mIni.value = '';
  mFin.value = '';
  tIni.value = '';
  tFin.value = '';
  nIni.value = '';
  nFin.value = '';
  if (selPatron) selPatron.value = '';
  if (patronInicio) patronInicio.value = '';
}

function setFromCfg(puesto) {
  const row = cfgMap.get(puesto);
  if (!row) {
    clearInputs();
    msg.textContent = 'Sin configuración para este puesto.';
    return;
  }

  const rm = splitRange(row.manana);
  const rt = splitRange(row.tarde);
  const rn = splitRange(row.noche);

  mIni.value = rm.ini;
  mFin.value = rm.fin;
  tIni.value = rt.ini;
  tFin.value = rt.fin;
  nIni.value = rn.ini;
  nFin.value = rn.fin;

  if (selPatron) selPatron.value = row.patron_id ? String(row.patron_id) : '';
  if (patronInicio) patronInicio.value = row.patron_inicio ? String(row.patron_inicio) : '';

  msg.textContent = `Editando configuración: ${puesto}`;
}

function renderTabla() {
  const items = Array.from(cfgMap.values()).sort((a, b) => String(a.puesto).localeCompare(String(b.puesto)));
  tbody.innerHTML = items
    .map(
      (r) => `
      <tr>
        <td data-label="Puesto">${escapeHtml(r.puesto)}</td>
        <td data-label="Patrón">${escapeHtml(r.patron_nombre || '')}${r.patron_inicio ? `<div class="muted" style="font-size:12px;">Desde: ${escapeHtml(r.patron_inicio)}</div>` : ''}</td>
        <td data-label="Mañana">${escapeHtml(r.manana || '')}</td>
        <td data-label="Tarde">${escapeHtml(r.tarde || '')}</td>
        <td data-label="Noche">${escapeHtml(r.noche || '')}</td>
      </tr>
    `
    )
    .join('');
}

function renderPatronesSelect() {
  if (!selPatron) return;
  const opts = [`<option value="">(sin patrón)</option>`]
    .concat(patrones.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (ciclo ${p.ciclo_dias}d)</option>`));
  selPatron.innerHTML = opts.join('');
}

async function cargarConfigs() {
  const res = await fetch('/api/puestos');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudieron cargar configuraciones');

  cfgMap = new Map((data.items || []).map((it) => [String(it.puesto), it]));
  renderTabla();
}

async function cargarPatrones() {
  // Backend expone /api/patrones y devuelve un array [{id,nombre,ciclo_dias}, ...]
  const res = await fetch('/api/patrones');
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error((data && data.error) || 'No se pudieron cargar patrones');
  patrones = Array.isArray(data) ? data : [];
  renderPatronesSelect();
}

async function cargarCatalogo() {
  const res = await fetch('/api/puestos/catalogo');
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudieron cargar puestos');

  const puestos = (data.items || []).map((x) => String(x)).filter(Boolean);
  selPuesto.innerHTML = puestos.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');

  if (puestos.length) {
    selPuesto.value = puestos[0];
    setFromCfg(puestos[0]);
  } else {
    selPuesto.innerHTML = '<option value="">(No hay puestos en empleados)</option>';
    clearInputs();
    msg.textContent = 'No se encontraron puestos. Cargalos primero en ABM Empleados.';
  }
}

btnToggle?.addEventListener('click', async () => {
  const show = panel.style.display === 'none';
  panel.style.display = show ? 'block' : 'none';
  btnToggle.textContent = show ? 'Ocultar' : 'Mostrar';

  // Lazy load al abrir
  if (show && !panel.dataset.loaded) {
    try {
      msg.textContent = 'Cargando...';
      await Promise.all([cargarConfigs(), cargarCatalogo(), cargarPatrones()]);
      panel.dataset.loaded = '1';
      msg.textContent = 'Listo.';
    } catch (e) {
      console.error(e);
      msg.textContent = String(e?.message || e);
    }
  }
});

selPuesto?.addEventListener('change', () => {
  const p = String(selPuesto.value || '');
  if (!p) return;
  setFromCfg(p);
});

btnGuardar?.addEventListener('click', async () => {
  const p = String(selPuesto.value || '').trim();
  if (!p) return alert('Seleccioná un puesto');

  const body = {
    puesto: p,
    manana_start: mIni.value || null,
    manana_end: mFin.value || null,
    tarde_start: tIni.value || null,
    tarde_end: tFin.value || null,
    noche_start: nIni.value || null,
    noche_end: nFin.value || null,
    patron_id: selPatron ? (selPatron.value || null) : null,
    patron_inicio: patronInicio ? (patronInicio.value || null) : null,
  };

  const res = await fetch('/api/puestos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || 'No se pudo guardar');

  msg.textContent = `Guardado: ${p}`;
  await cargarConfigs();
  setFromCfg(p);
});

btnBorrar?.addEventListener('click', async () => {
  const p = String(selPuesto.value || '').trim();
  if (!p) return;
  if (!confirm(`Borrar configuración de horarios para "${p}"? (El puesto sigue existiendo en ABM Empleados)`)) return;

  const res = await fetch(`/api/puestos/${encodeURIComponent(p)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) return alert(data.error || 'No se pudo borrar');

  msg.textContent = `Configuración borrada: ${p}`;
  await cargarConfigs();
  setFromCfg(p);
});

// Estado inicial (panel oculto por defecto)
if (panel) panel.style.display = 'none';
if (btnToggle) btnToggle.textContent = 'Mostrar';
