function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthRange(yyyy_mm) {
  const [y, m] = yyyy_mm.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { first, last };
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0..Sun=6
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildWeeks(first, last) {
  const weeks = [];
  let cur = startOfWeekMonday(first);
  const end = new Date(last);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const w = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(cur);
      dd.setDate(cur.getDate() + i);
      w.push(dd);
    }
    weeks.push(w);
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// Filas tipo Excel (dinámicas desde puesto_horarios)
// Cada fila se "matchea" por: sector + puesto + turno(M/T/N) + horario(HH:MM-HH:MM)
const BASE_ROWS_PLAYA = [
  {
    labelPrefix: "MAÑANA",
    sector: "PLAYA",
    puesto: "Playero/a",
    turno: "M",
    defaultRange: "05:00-13:00",
  },
  {
    labelPrefix: "MAÑANA",
    sector: "PLAYA",
    puesto: "Auxiliar de playa",
    turno: "M",
    defaultRange: "06:00-14:00",
  },
  {
    labelPrefix: "TARDE",
    sector: "PLAYA",
    puesto: "Playero/a",
    turno: "T",
    defaultRange: "13:00-21:00",
  },
  {
    labelPrefix: "TARDE",
    sector: "PLAYA",
    puesto: "Auxiliar de playa",
    turno: "T",
    defaultRange: "14:00-22:00",
  },
  {
    labelPrefix: "NOCHE",
    sector: "PLAYA",
    puesto: "Playero/a",
    turno: "N",
    defaultRange: "21:00-05:00",
  },
  {
    labelPrefix: "REFUERZO",
    sector: "PLAYA",
    puesto: "Refuerzo de playa",
    turno: "M",
    defaultRange: "09:00-13:00",
  },
  {
    labelPrefix: "REFUERZO",
    sector: "PLAYA",
    puesto: "Refuerzo de playa",
    turno: "T",
    defaultRange: "17:00-21:00",
  },
];

const BASE_ROWS_SHOP = [
  {
    labelPrefix: "MAÑANA",
    sector: "MINI",
    puesto: "Cajero/a",
    turno: "M",
    defaultRange: "06:00-14:00",
  },
  {
    labelPrefix: "TARDE",
    sector: "MINI",
    puesto: "Cajero/a",
    turno: "T",
    defaultRange: "14:00-22:00",
  },
  {
    labelPrefix: "AUX SHOP",
    sector: "MINI",
    puesto: "Auxiliar de shop",
    turno: "M",
    defaultRange: "06:00-14:00",
    onlyMonFri: true,
  },
];

let puestoHorarioMap = new Map(); // puesto -> {manana,tarde,noche}

async function cargarPuestosHorarios() {
  try {
    const res = await fetch("/api/puestos");
    const data = await res.json();
    if (res.ok && data.ok) {
      puestoHorarioMap = new Map(
        (data.items || []).map((it) => [String(it.puesto), it]),
      );
    }
  } catch (e) {
    console.warn("No se pudo cargar /api/puestos", e);
  }
}


function fillPuestoSelect(){
  const sel = document.getElementById("ex_puesto");
  if(!sel) return;
  const current = sel.value || "";
  const puestos = Array.from(puestoHorarioMap.keys()).sort((a,b)=>a.localeCompare(b));
  sel.innerHTML = '<option value="">(sin cambio)</option>' + puestos.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  sel.value = current;
}
function rangeForRow(row) {
  const it = puestoHorarioMap.get(String(row.puesto));
  if (!it) return row.defaultRange;

  if (row.turno === "M") return it.manana || row.defaultRange;
  if (row.turno === "T") return it.tarde || row.defaultRange;
  if (row.turno === "N") return it.noche || row.defaultRange;
  return row.defaultRange;
}

function buildRows(base) {
  return base.map((r) => {
    const range = rangeForRow(r);
    const nice = range ? range.replace("-", " a ") : "";
    return {
      ...r,
      horaKey: range,
      label: `${r.labelPrefix}${nice ? " (" + nice + ")" : ""}`,
    };
  });
}

// Espera que tu API devuelva por cada día: {fecha, sector, puesto, turno, horario, legajo, nombre}
function keyFor(item) {
  // Normalizamos por sector/puesto/turno/horario
  return `${item.sector}||${item.puesto}||${item.turno}||${item.horario}`;
}

function renderBlock(title, rows, weeks, byDateKey, sectorFilter) {
  let html = `<div style="margin:18px 0 8px; font-weight:700; font-size:16px;">${title}</div>`;

  weeks.forEach((week, wi) => {
    html += `<div style="border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; margin-bottom:14px;">`;
    // header
    html += `<div style="display:grid; grid-template-columns:220px repeat(7, 1fr); background:#f3f4f6; font-weight:600;">`;
    html += `<div style="padding:10px 12px;">TURNO</div>`;
    const daysName = [
      "LUNES",
      "MARTES",
      "MIERCOLES",
      "JUEVES",
      "VIERNES",
      "SABADO",
      "DOMINGO",
    ];
    week.forEach((d, i) => {
      html += `<div style="padding:10px 12px; text-align:center;">${daysName[i]}<div style="font-weight:700;">${d.getDate()}</div></div>`;
    });
    html += `</div>`;

    // rows
    rows.forEach((r) => {
      html += `<div style="display:grid; grid-template-columns:220px repeat(7, 1fr); border-top:1px solid #e5e7eb;">`;
      html += `<div style="padding:10px 12px; font-weight:600; background:#fff;">${r.label}</div>`;

      week.forEach((d, i) => {
        const dateStr = ymd(d);

        // Si filtro sector, y esta tabla no corresponde, la celda igual se renderiza pero vacía (ya filtramos arriba)
        // regla Aux shop onlyMonFri:
        if (r.onlyMonFri && i >= 5) {
          html += `<div style="min-height:42px; padding:8px 10px; background:#fff;"></div>`;
          return;
        }

        const list = byDateKey.get(dateStr) || [];
        const names = [];

        for (const it of list) {
          if (sectorFilter !== "TODOS" && it.sector !== sectorFilter) continue;
          if (it.sector !== r.sector) continue;
          if (it.puesto !== r.puesto) continue;
          if (it.turno !== r.turno) continue;
          // horario exacto (si tu API devuelve distinto, lo ajustamos acá)
          if ((it.horario || "") !== r.horaKey) continue;
          names.push(it.nombre || it.apellido_nombre || it.name || "");
        }

        const chips = [];
        for (const it of list) {
          if (sectorFilter !== "TODOS" && it.sector !== sectorFilter) continue;
          if (it.sector !== r.sector) continue;
          if (it.puesto !== r.puesto) continue;
          if (it.turno !== r.turno) continue;
          if ((it.horario || "") !== r.horaKey) continue;

          const nombre = (
            it.nombre ||
            it.apellido_nombre ||
            it.name ||
            ""
          ).trim();
          const leg = (it.legajo || "").toString();
          if (!nombre || !leg) continue;

          // cada nombre es clickeable para editar excepción del día
          chips.push(
            `<button class="chip" type="button"
              data-legajo="${leg}"
              data-nombre="${escapeHtml(nombre)}"
              data-fecha="${dateStr}"
              data-sector="${it.sector}"
              data-puesto="${it.puesto}"
              data-turno="${it.turno}"
              data-horario="${it.horario || ""}">
              ${escapeHtml(nombre)}
            </button>`,
          );
        }
        const rowRange = r.horaKey || ""; // el horario de la fila actual
        const turnoDb = mapTurnoLetterToDb(r.turno); // M/T/N -> MANIANA/TARDE/NOCHE (para el modal)

        const warnKey = `${dateStr}|${r.sector}|${r.puesto}|${turnoDb}`;
        const warn =
          avisosPend && avisosPend.has(warnKey)
            ? `<span class="covwarn" title="Turno crítico sin cobertura" data-warn="${warnKey}">⚠️</span>`
            : ``;

        const plus = `<button class="kmplus" type="button" title="Agregar excepción"
  data-fecha="${dateStr}"
  data-sector="${r.sector}"
  data-puesto="${escapeHtml(r.puesto)}"
  data-turno="${turnoDb}"
  data-horario="${escapeHtml(rowRange)}">+</button>`;

        html += `<div class="calcell kmcell" style="min-height:42px; padding:6px 8px; background:#fff; text-align:center; white-space:normal; position:relative;">
  ${warn}${plus}${chips.join("")}
</div>`;
      });

      html += `</div>`;
    });

    html += `</div>`;
  });

  return html;
}

async function fetchAvisos(desde, hasta, sector) {
  const qs = new URLSearchParams({ desde, hasta });
  if (sector) qs.set("sector", sector);
  const r = await fetch(`/api/calendario/avisos?${qs.toString()}`);
  if (!r.ok) return [];
  return r.json();
}

async function fetchResuelto(desde, hasta) {
  // Endpoint a crear/ajustar: devuelve asignaciones para TODOS los empleados
  // Si ya tenés un endpoint por empleado, te doy abajo la alternativa.
  const r = await fetch(
    `/api/calendario/resuelto-mes?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
  );
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function main() {
  const mesEl = document.getElementById("mes");
  const secEl = document.getElementById("sector");
  const btn = document.getElementById("btnCargar");
  const estado = document.getElementById("estado");
  const grid = document.getElementById("grid");

  // default: mes actual
  const now = new Date();
  mesEl.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

  btn.addEventListener("click", async () => {
    try {
      estado.textContent = "Cargando…";
      grid.innerHTML = "";

      const { first, last } = monthRange(mesEl.value);
      const desde = ymd(first);
      const hasta = ymd(last);
      const sectorFilter = secEl.value;

      await cargarPuestosHorarios();
      fillPuestoSelect();
      const data = await fetchResuelto(desde, hasta);
      const avisos = await fetchAvisos(desde, hasta, sectorFilter);
      avisosPend = new Map();
      for (const a of avisos || []) {
        const key = `${a.fecha}|${a.sector}|${a.puesto}|${a.turno}`;
        avisosPend.set(key, a);
      }

      // Agrupar por fecha
      const byDateKey = new Map();
      for (const it of data) {
        const k = it.fecha;
        if (!byDateKey.has(k)) byDateKey.set(k, []);
        byDateKey.get(k).push(it);
      }

      const weeks = buildWeeks(first, last);

      let html = "";
      if (sectorFilter === "TODOS" || sectorFilter === "PLAYA") {
        html += renderBlock(
          "PLAYA",
          buildRows(BASE_ROWS_PLAYA),
          weeks,
          byDateKey,
          sectorFilter,
        );
      }
      if (sectorFilter === "TODOS" || sectorFilter === "MINI") {
        // Si no hay nada programado para SHOP/MINI en el período, mostramos un mensaje claro
        const hasMini =
          Array.isArray(data) &&
          data.some((it) => String(it.sector || "").toUpperCase() === "MINI");
        if (!hasMini) {
          html += `
            <div style="margin:18px 0 8px; font-weight:700; font-size:16px;">SHOP / MINI</div>
            <div style="padding:12px 14px; border:1px dashed #d1d5db; border-radius:12px; color:#6b7280;">
              No hay turnos cargados en este período para SHOP / MINI.
            </div>
          `;
        } else {
          html += renderBlock(
            "SHOP / MINI",
            buildRows(BASE_ROWS_SHOP),
            weeks,
            byDateKey,
            sectorFilter,
          );
        }
      }

      grid.innerHTML = html;
      bindPlusButtons(); // <-- necesario para que funcione el "+"
      estado.textContent = `OK · ${desde} a ${hasta}`;
    } catch (e) {
      console.error(e);
      estado.textContent = "Error: " + (e.message || e);
    }
  });
}

//document.addEventListener("DOMContentLoaded", main);

/* ===============================
   MODAL EXCEPCIÓN DESDE GRILLA
================================ */
const MODAL = () => document.getElementById("modalExGrid");
const $ = (id) => document.getElementById(id);

function showModal() {
  MODAL().classList.add("open");
}
function hideModal() {
  MODAL().classList.remove("open");
}

// Map M/T/N -> MANIANA/TARDE/NOCHE
function mapTurnoLetterToDb(t) {
  const x = String(t || "").toUpperCase();
  if (x === "M") return "MANIANA";
  if (x === "T") return "TARDE";
  if (x === "N") return "NOCHE";
  return "";
}

let currentExId = null;
let currentCtx = null;
let avisosPend = new Map();

// ===============================
// EMPLEADOS: dropdown (datalist)
// ===============================
let empleadosCache = null; // [{legajo,nombre,sector,puesto,...}]
function normStr(s){ return String(s||"").trim(); }

async function ensureEmpleadosLoaded(){
  if (empleadosCache) return empleadosCache;
  try{
    const r = await fetch("/api/empleados");
    if(!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    empleadosCache = Array.isArray(rows) ? rows : [];
    const dl = document.getElementById("ex_emp_list");
    if (dl){
      dl.innerHTML = "";
      for(const e of empleadosCache){
        const leg = normStr(e.legajo);
        const nom = normStr(e.nombre);
        if(!leg || !nom) continue;
        const opt = document.createElement("option");
        opt.value = `${leg} - ${nom}`;
        dl.appendChild(opt);
      }
    }
  }catch(err){
    console.warn("No se pudo cargar empleados", err);
    empleadosCache = [];
  }
  return empleadosCache;
}

function findEmpleadoByLegajo(legajo){
  const L = normStr(legajo);
  if(!L || !empleadosCache) return null;
  return empleadosCache.find(e => String(e.legajo) === L) || null;
}

function parseLegajoFromEmpInput(v){
  const s = normStr(v);
  // acepta "9 - Apellido, Nombre" o "9-..."
  const m = s.match(/^(\d+)\s*[-–]\s*(.+)$/);
  if(m) return m[1];
  // si puso solo número
  if(/^\d+$/.test(s)) return s;
  return "";
}


async function loadExForDay(legajo, fecha) {
  const r = await fetch(
    `/api/calendario/resuelto?legajo=${encodeURIComponent(legajo)}&desde=${encodeURIComponent(fecha)}&hasta=${encodeURIComponent(fecha)}`,
  );
  if (!r.ok) return null;
  const j = await r.json();
  const d = j && j.dias && j.dias[0] ? j.dias[0] : null;
  return d && d.excepcion ? d.excepcion : null;
}

function setFormEnabled() {
  const tipo = String($("ex_tipo").value || "").toUpperCase();
  const isAusencia = [
    "VACACIONES",
    "LICENCIA",
    "ENFERMEDAD",
    "PERMISO",
  ].includes(tipo);
  const isFranco = tipo === "FRANCO_EXTRA";

  // Para ausencias, no tiene sentido elegir turno (se marca AUSENCIA)
  $("ex_turno").disabled = isAusencia;
  if (isAusencia) $("ex_turno").value = "";

  // Para franco extra, sugerimos FRANCO
  if (isFranco && !$("ex_turno").value) $("ex_turno").value = "FRANCO";
}

async function openExModal(payload) {
  currentCtx = {
    sector: payload.sector || "",
    puesto_base: payload.puesto || "",
    turno_base: payload.turno_db || "",
    fecha: payload.fecha || "",
  };
  currentExId = null;
  $("ex_legajo").value = payload.legajo || "";
  $("ex_emp").value = payload.legajo && payload.nombre ? `${payload.legajo} - ${payload.nombre}` : (payload.nombre || "");
  $("ex_fecha").value = payload.fecha || "";
  $("ex_tipo").value = "CAMBIO";
  $("ex_puesto").value = payload.puesto || "";
  $("ex_turno").value = payload.turno_db || "";
  $("ex_motivo").value = "";

  $("exGridSub").textContent =
    `${payload.sector || ""} · ${payload.puesto || ""} · ${payload.horario || ""}`.trim();

  // Si ya existe excepción, la cargamos para editar
  const existing = (payload.legajo) ? await loadExForDay(payload.legajo, payload.fecha) : null;
  if (existing && existing.id) {
    currentExId = existing.id;
    $("ex_tipo").value = String(existing.tipo || "CAMBIO").toUpperCase();
    $("ex_puesto").value = existing.puesto_override || payload.puesto || "";
    $("ex_turno").value = existing.turno_override || "";
    $("ex_motivo").value = existing.motivo || "";
    $("exGridDelete").style.display = "inline-flex";
  } else {
    $("exGridDelete").style.display = "none";
  }

  setFormEnabled();
  showModal();
}

async function saveException() {
  const legajo = $("ex_legajo").value;
  if(!String(legajo||'').trim()){ alert('Ingresá un legajo.'); $('ex_legajo').focus(); return; }

  const fecha = $("ex_fecha").value;
  const tipo = $("ex_tipo").value;
  const puesto_override = $("ex_puesto").value.trim() || null;
  const turno_override = $("ex_turno").value || null;
  const motivo = $("ex_motivo").value.trim() || null;

  const body = {
    legajo,
    fecha,
    tipo,
    puesto_override,
    turno_override,
    motivo,
    ctx: currentCtx || {},
  };

  const r = await fetch("/api/calendario/excepciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(await r.text());

  hideModal();

  // Si se guardó una AUSENCIA en un puesto crítico, mostramos aviso y opción de asignar reemplazo
  try {
    const t = String(tipo || "").toUpperCase();
    const CRIT = ["CAJERO/A", "PLAYERO/A"];
    const AUS = ["ENFERMEDAD", "LICENCIA", "VACACIONES", "PERMISO"];
    if (
      AUS.includes(t) &&
      currentCtx &&
      CRIT.includes(String(currentCtx.puesto_base || "").toUpperCase())
    ) {
      const go = confirm(
        `Aviso: ${currentCtx.puesto_base} (${currentCtx.turno_base}) quedó sin cobertura.\n\n¿Querés asignar un reemplazo ahora?`,
      );
      if (go) {
        // Abrir el modal en modo reemplazo (CAMBIO) apuntando al puesto crítico
        openExModal({
          legajo: "",
          nombre: "",
          fecha: currentCtx.fecha || fecha,
          sector: currentCtx.sector,
          puesto: currentCtx.puesto_base,
          turno_db: currentCtx.turno_base,
          horario: "",
        }).then(() => {
          $("ex_tipo").value = "CAMBIO";
          $("ex_puesto").value = currentCtx.puesto_base;
          $("ex_turno").value = currentCtx.turno_base;
          setFormEnabled();
          $("ex_legajo").focus();
        });
      }
    }
  } catch (e) {}

  // refrescar grilla
  document.getElementById("btnCargar").click();
}

async function deleteException() {
  if (!currentExId) return;
  const r = await fetch(`/api/calendario/excepciones/${currentExId}`, {
    method: "DELETE",
  });
  if (!r.ok) throw new Error(await r.text());
  hideModal();
  document.getElementById("btnCargar").click();
}

function bindPlusButtons() {
  document.querySelectorAll(".kmplus").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const fecha = btn.getAttribute("data-fecha");
      const sector = btn.getAttribute("data-sector");
      const puesto = btn.getAttribute("data-puesto");
      const turno_db = btn.getAttribute("data-turno");
      const horario = btn.getAttribute("data-horario") || "";
      openExModal({
        legajo: "",
        nombre: "",
        fecha,
        sector,
        puesto,
        turno_db,
        horario,
      });
    });
  });
}

function bindGridModal() {
  const close = $("exGridClose");
  const save = $("exGridSave");
  const del = $("exGridDelete");
  const tipo = $("ex_tipo");

  if (close) close.addEventListener("click", hideModal);
  if (save)
    save.addEventListener("click", async () => {
      try {
        await saveException();
      } catch (e) {
        alert(e.message || e);
      }
    });
  if (del)
    del.addEventListener("click", async () => {
      if (!confirm("¿Eliminar la excepción de este día?")) return;
      try {
        await deleteException();
      } catch (e) {
        alert(e.message || e);
      }
    });
  if (tipo) tipo.addEventListener("change", setFormEnabled);

  // Empleado dropdown (datalist) + legajo sync
  const empIn = $("ex_emp");
  const legIn = $("ex_legajo");
  // cargar datalist al abrir la página
  ensureEmpleadosLoaded();

  if (empIn) empIn.addEventListener("change", async () => {
    await ensureEmpleadosLoaded();
    const leg = parseLegajoFromEmpInput(empIn.value);
    if (legIn) legIn.value = leg;
  });

  if (legIn) legIn.addEventListener("input", async () => {
    await ensureEmpleadosLoaded();
    const e = findEmpleadoByLegajo(legIn.value);
    if (e && empIn) empIn.value = `${e.legajo} - ${e.nombre}`;
  });


  // Cerrar tocando el fondo
  const m = MODAL();
  if (m) {
    m.addEventListener("click", (ev) => {
      if (ev.target === m) hideModal();
    });
  }

  // Delegación de eventos: click en chip
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest(".chip");
    if (!btn) return;

    const legajo = btn.getAttribute("data-legajo");
    const nombre = btn.getAttribute("data-nombre");
    const fecha = btn.getAttribute("data-fecha");
    const sector = btn.getAttribute("data-sector");
    const puesto = btn.getAttribute("data-puesto");
    const turno = btn.getAttribute("data-turno"); // M/T/N
    const horario = btn.getAttribute("data-horario");

    openExModal({
      legajo,
      nombre,
      fecha,
      sector,
      puesto,
      horario,
      turno_db: mapTurnoLetterToDb(turno),
    });
  });
}

// Inicialización
// - main() arma la grilla y engancha el botón "Cargar"
// - bindGridModal() habilita el click sobre los nombres (chips) para crear/editar excepciones

document.addEventListener("DOMContentLoaded", () => {
  try {
    main();
    bindGridModal();
  } catch (e) {
    console.error(e);
  }
});
