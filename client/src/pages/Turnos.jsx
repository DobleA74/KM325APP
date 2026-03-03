import { useEffect, useMemo, useState } from "react";
import { getCalendarioMes, getPuestos } from "../services/turnos";
import { upsertExcepcion } from "../services/excepciones";
import api from "../lib/api";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function firstDayOfMonth(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function lastDayOfMonth(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m, 0);
}
function daysInMonth(yyyyMm) {
  return lastDayOfMonth(yyyyMm).getDate();
}

const CRITICAL_PUESTOS = new Set(["Playero/a", "Cajero/a"]);

const EXC_CODES = {
  FRANCO: "F",
  MANIANA: "M",
  TARDE: "T",
  NOCHE: "N",
  ENFERMEDAD: "E",
  AUSENTE_SIN_AVISO: "I",
  AUSENTE_CON_AVISO: "A",
  ACCIDENTADO: "AC",
  VACACIONES: "V",
  CAMBIO: "C",
  LICENCIA: "L",
  PERMISO: "P",
};

const EXC_LABELS = {
  F: "FRANCO",
  M: "MAÑANA",
  T: "TARDE",
  N: "NOCHE",
  E: "ENFERMEDAD",
  I: "AUSENTE SIN AVISO",
  A: "AUSENTE CON AVISO",
  AC: "ACCIDENTADO",
  V: "VACACIONES",
  C: "CAMBIO",
  L: "LICENCIA",
  P: "PERMISO",
};

const ABSENCE_TYPES = new Set([
  "ENFERMEDAD",
  "AUSENTE_SIN_AVISO",
  "AUSENTE_CON_AVISO",
  "ACCIDENTADO",
  "VACACIONES",
  "LICENCIA",
  "PERMISO",
]);

function getWeekdayShortES(dateObj) {
  const d = dateObj.getDay();
  return ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"][d];
}

function turnoBg(code) {
  if (code === "M") return "rgba(34,197,94,.14)";
  if (code === "T") return "rgba(251,191,36,.14)";
  if (code === "N") return "rgba(168,85,247,.14)";
  if (code === "E" || code === "I" || code === "A" || code === "AC")
    return "rgba(239,68,68,.14)";
  if (code === "V") return "rgba(59,130,246,.14)";
  if (code === "C") return "rgba(255,255,255,.10)";
  return "transparent";
}

function turnoFg(code) {
  if (code === "M") return "rgba(34,197,94,1)";
  if (code === "T") return "rgba(251,191,36,1)";
  if (code === "N") return "rgba(168,85,247,1)";
  if (code === "E" || code === "I" || code === "A" || code === "AC")
    return "rgba(239,68,68,1)";
  if (code === "V") return "rgba(59,130,246,1)";
  if (code === "C") return "rgba(255,255,255,.95)";
  return "rgba(255,255,255,.35)";
}

export default function Turnos() {
  const now = new Date();

  const [mes, setMes] = useState(
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`,
  );
  const [sector, setSector] = useState("TODOS");
  const [puesto, setPuesto] = useState("TODOS");

  const [puestos, setPuestos] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // empleados para selector de cobertura
  const [empleadosAll, setEmpleadosAll] = useState([]);
  const [empSearch, setEmpSearch] = useState("");

  // overrides locales para que se vea el guardado
  const [overrides, setOverrides] = useState(new Map());

  // modal excepción
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const desde = useMemo(() => ymd(firstDayOfMonth(mes)), [mes]);
  const hasta = useMemo(() => ymd(lastDayOfMonth(mes)), [mes]);
  const dim = useMemo(() => daysInMonth(mes), [mes]);

  const [yearStr, monthStr] = useMemo(() => mes.split("-"), [mes]);
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);

  const weekdays = useMemo(() => {
    const arr = [];
    for (let d = 1; d <= dim; d++)
      arr.push(getWeekdayShortES(new Date(yearNum, monthNum - 1, d)));
    return arr;
  }, [dim, yearNum, monthNum]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getPuestos();
        setPuestos(Array.isArray(data) ? data : []);
      } catch {
        setPuestos([]);
      }
    })();
  }, []);

  // Traer empleados para selector (cobertura)
  useEffect(() => {
    (async () => {
      try {
        const data = await api.get("/api/empleados");
        // esperamos array de { legajo, nombre, sector, puesto } (aunque vengan otros campos)
        setEmpleadosAll(Array.isArray(data) ? data : []);
      } catch {
        setEmpleadosAll([]);
      }
    })();
  }, []);

  async function refreshMes() {
    const data = await getCalendarioMes({ desde, hasta });
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await refreshMes();
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (sector !== "TODOS" && it.sector !== sector) return false;
      if (puesto !== "TODOS" && it.puesto !== puesto) return false;
      return true;
    });
  }, [items, sector, puesto]);

  const empleados = useMemo(() => {
    const map = new Map();
    for (const it of filtered) {
      if (!map.has(it.legajo)) {
        map.set(it.legajo, {
          legajo: it.legajo,
          nombre: it.nombre || "Sin nombre",
          sector: it.sector,
          puesto: it.puesto,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.nombre || "").localeCompare(b.nombre || ""),
    );
  }, [filtered]);

  const cellMap = useMemo(() => {
    const m = new Map();
    for (const it of filtered) {
      if (!it.fecha) continue;
      const day = Number(it.fecha.slice(8, 10));
      m.set(`${it.legajo}|${day}`, {
        turno: it.turno,
        horario: it.horario || "",
        sector: it.sector,
        puesto: it.puesto,
      });
    }
    return m;
  }, [filtered]);

  const puestosCatalogo = useMemo(() => {
    const s = new Set(filtered.map((x) => x.puesto).filter(Boolean));
    if (s.size) return Array.from(s).sort();
    const s2 = new Set(puestos.map((p) => p.puesto).filter(Boolean));
    return Array.from(s2).sort();
  }, [filtered, puestos]);

  const empleadosOptions = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    const arr = Array.isArray(empleadosAll) ? empleadosAll : [];
    const filteredEmp = q
      ? arr.filter((e) => {
          const name = String(
            e.nombre || e.apellido_nombre || e.name || "",
          ).toLowerCase();
          const leg = String(e.legajo || "").toLowerCase();
          const sec = String(e.sector || "").toLowerCase();
          const pue = String(e.puesto || "").toLowerCase();
          return (
            name.includes(q) ||
            leg.includes(q) ||
            sec.includes(q) ||
            pue.includes(q)
          );
        })
      : arr;

    // limit para que no sea eterno
    return filteredEmp.slice(0, 80);
  }, [empleadosAll, empSearch]);

  function exportCSV() {
    const headers = ["Legajo", "Nombre", "Sector", "Puesto"];
    for (let d = 1; d <= dim; d++) headers.push(`${d} (${weekdays[d - 1]})`);

    const rows = empleados.map((emp) => {
      const line = [emp.legajo, emp.nombre, emp.sector, emp.puesto];
      for (let d = 1; d <= dim; d++) {
        const key = `${emp.legajo}|${d}`;
        const ov = overrides.get(key);
        const base = cellMap.get(key);
        const code = ov?.code || base?.turno || "F";
        line.push(code);
      }
      return line;
    });

    const csv = [headers, ...rows]
      .map((r) =>
        r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `turnos_${mes}_${sector}_${puesto}.csv`.replaceAll(" ", "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  function openModalFor(emp, day) {
    const key = `${emp.legajo}|${day}`;
    const baseCell = cellMap.get(key);
    const [yy, mm] = mes.split("-");
    const fecha = `${yy}-${mm}-${pad2(day)}`;

    setFormError("");
    setEmpSearch("");

    setModal({
      legajo: emp.legajo,
      nombre: emp.nombre,
      fecha,
      day,
      sectorBase: emp.sector,
      puestoBase: emp.puesto,
      turnoBase: baseCell?.turno || null,
      horarioBase: baseCell?.horario || "",
    });
  }

  async function handleSaveExcepcion(e) {
    e.preventDefault();
    setFormError("");
    if (!modal) return;

    const fd = new FormData(e.currentTarget);

    const tipo = String(fd.get("tipo") || "");
    const turno_override = String(fd.get("turno_override") || "") || null;
    const puesto_override = String(fd.get("puesto_override") || "") || null;
    const motivo = String(fd.get("motivo") || "") || null;

    const cover_legajo = String(fd.get("cover_legajo") || "") || null;
    const cover_nombre = String(fd.get("cover_nombre") || "") || null;

    const isCritical = CRITICAL_PUESTOS.has(modal.puestoBase);

    if (!tipo) {
      setFormError("Seleccioná un tipo.");
      return;
    }

    if (tipo === "CAMBIO") {
      if (!turno_override && !puesto_override) {
        setFormError(
          "Para CAMBIO, elegí al menos un Turno destino o Puesto destino.",
        );
        return;
      }
    }

    // 🔥 LEGACY: si es ausencia y el puesto es crítico -> obligar cobertura
    const isAbsence = ABSENCE_TYPES.has(tipo);
    if (isAbsence && isCritical) {
      if (!cover_legajo) {
        setFormError("Este puesto es crítico. Tenés que indicar quién cubre.");
        return;
      }
      if (String(cover_legajo) === String(modal.legajo)) {
        setFormError("El reemplazante no puede ser la misma persona.");
        return;
      }
    }

    // Confirmación como legacy
    if (isAbsence && isCritical) {
      const ok = window.confirm(
        `⚠ Puesto crítico (${modal.puestoBase}).\n\n` +
          `Vas a marcar ${tipo} y asignar cobertura.\n` +
          `Se va a generar automáticamente un CAMBIO para el reemplazante.\n\n` +
          `¿Confirmás guardar?`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // 1) Guardar la excepción del ausente
      await upsertExcepcion({
        legajo: modal.legajo,
        fecha: modal.fecha,
        tipo,
        turno_override,
        puesto_override,
        motivo,
        ctx: {
          sector: modal.sectorBase,
          puesto_base: modal.puestoBase,
          turno_base: modal.turnoBase,
          cover_legajo,
          cover_nombre,
        },
      });

      // 2) Si es ausencia crítica y hay cobertura: crear CAMBIO en reemplazante hacia el puesto/turno del ausente
      if (isAbsence && isCritical && cover_legajo) {
        await upsertExcepcion({
          legajo: cover_legajo,
          fecha: modal.fecha,
          tipo: "CAMBIO",
          turno_override: modal.turnoBase || turno_override || null,
          puesto_override: modal.puestoBase,
          motivo: `Cubre a ${modal.nombre}${motivo ? ` · ${motivo}` : ""}`,
          ctx: {
            cover_for_legajo: modal.legajo,
            cover_for_nombre: modal.nombre,
            sector_destino: modal.sectorBase,
            puesto_destino: modal.puestoBase,
            turno_destino: modal.turnoBase,
          },
        });
      }

      // Pintar visualmente (ausente)
      const codeAusente = tipo === "CAMBIO" ? "C" : EXC_CODES[tipo] || "C";
      const labelAusente = EXC_LABELS[codeAusente] || tipo;

      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(`${modal.legajo}|${modal.day}`, {
          code: codeAusente,
          label: labelAusente,
          meta: {
            tipo,
            turno_override,
            puesto_override,
            motivo,
            cover_legajo,
            cover_nombre,
          },
        });

        // Pintar visualmente (reemplazante) si aplica
        if (isAbsence && isCritical && cover_legajo) {
          next.set(`${cover_legajo}|${modal.day}`, {
            code: "C",
            label: "CAMBIO",
            meta: {
              tipo: "CAMBIO",
              turno_override: modal.turnoBase || null,
              puesto_override: modal.puestoBase,
              motivo: `Cubre a ${modal.nombre}`,
            },
          });
        }

        return next;
      });

      await refreshMes();
      window.alert("✅ Guardado");
      setModal(null);
    } catch (err) {
      window.alert(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 4 }}>Turnos</h2>
      <div style={{ opacity: 0.7, marginBottom: 10 }}>
        Calendario mensual automático + Excepciones
      </div>

      {/* Leyenda */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 14,
          opacity: 0.85,
        }}
      >
        {[
          ["F", "FRANCO"],
          ["M", "MAÑANA"],
          ["T", "TARDE"],
          ["N", "NOCHE"],
          ["E", "ENFERMEDAD"],
          ["I", "AUSENTE SIN AVISO"],
          ["A", "AUSENTE CON AVISO"],
          ["AC", "ACCIDENTADO"],
          ["V", "VACACIONES"],
          ["C", "CAMBIO"],
        ].map(([k, txt]) => (
          <div
            key={k}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.10)",
              background: "rgba(255,255,255,.04)",
              fontSize: 12,
            }}
          >
            <span
              style={{
                fontWeight: 900,
                color: turnoFg(k),
                background: turnoBg(k),
                padding: "2px 8px",
                borderRadius: 8,
              }}
            >
              {k}
            </span>
            <span>{txt}</span>
          </div>
        ))}
      </div>

      {/* Filtros + acciones */}
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}
      >
        <label>
          Mes
          <br />
          <input
            className="input-ui"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          />
        </label>

        <label>
          Sector
          <br />
          <select
            className="input-ui"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
          >
            <option value="TODOS">Todos</option>
            <option value="PLAYA">PLAYA</option>
            <option value="MINI">MINI</option>
          </select>
        </label>

        <label>
          Puesto
          <br />
          <select value={puesto} onChange={(e) => setPuesto(e.target.value)}>
            <option value="TODOS">Todos</option>
            {puestosCatalogo.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <button
          className="btn-ui"
          onClick={exportCSV}
          disabled={loading || empleados.length === 0}
        >
          Exportar CSV
        </button>

        <div style={{ marginLeft: "auto", alignSelf: "end", opacity: 0.7 }}>
          {loading
            ? "Cargando..."
            : `${empleados.length} empleados / ${filtered.length} turnos`}
        </div>
      </div>

      {/* Tabla */}
      <div
        style={{
          overflow: "auto",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 12,
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: 10,
                  position: "sticky",
                  left: 0,
                  background: "#0b1220",
                  zIndex: 3,
                }}
              >
                Empleado
              </th>
              {Array.from({ length: dim }).map((_, i) => (
                <th
                  key={i}
                  style={{
                    padding: 6,
                    textAlign: "center",
                    background: "#0b1220",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "0 10px 10px",
                  position: "sticky",
                  left: 0,
                  background: "#0b1220",
                  zIndex: 3,
                  opacity: 0.7,
                  fontSize: 12,
                }}
              >
                &nbsp;
              </th>
              {Array.from({ length: dim }).map((_, i) => (
                <th
                  key={i}
                  style={{
                    padding: "0 6px 10px",
                    textAlign: "center",
                    background: "#0b1220",
                    position: "sticky",
                    top: 34,
                    zIndex: 2,
                    opacity: 0.7,
                    fontSize: 12,
                  }}
                >
                  {weekdays[i]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {empleados.map((emp) => (
              <tr key={emp.legajo}>
                <td
                  style={{
                    padding: 10,
                    position: "sticky",
                    left: 0,
                    background: "#0b1220",
                    fontWeight: 700,
                    zIndex: 1,
                  }}
                >
                  {emp.nombre}
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {emp.legajo} · {emp.sector} · {emp.puesto}
                    {CRITICAL_PUESTOS.has(emp.puesto) && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: "rgba(239,68,68,1)",
                        }}
                      >
                        (crítico)
                      </span>
                    )}
                  </div>
                </td>

                {Array.from({ length: dim }).map((_, i) => {
                  const day = i + 1;
                  const key = `${emp.legajo}|${day}`;
                  const base = cellMap.get(key);
                  const ov = overrides.get(key);
                  const code = ov?.code || base?.turno || "F";

                  return (
                    <td
                      key={day}
                      title={`${code} · ${EXC_LABELS[code] || ""}${base?.horario ? `\n${base.horario}` : ""}`}
                      onClick={() => openModalFor(emp, day)}
                      style={{
                        padding: 6,
                        textAlign: "center",
                        fontWeight: 900,
                        opacity: code === "F" ? 0.35 : 1,
                        background: turnoBg(code),
                        color: turnoFg(code),
                        borderRadius: 8,
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      {code}
                    </td>
                  );
                })}
              </tr>
            ))}

            {!empleados.length && !loading && (
              <tr>
                <td colSpan={dim + 1} style={{ padding: 16 }}>
                  No hay datos para este mes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {modal && (
        <div
          onClick={() => !saving && setModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 620,
              maxWidth: "100%",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              padding: 16,
              background: "#0b1220",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Excepción</div>
                <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>
                  {modal.nombre} · {modal.legajo} · {modal.fecha}
                </div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  Base: {modal.sectorBase} · {modal.puestoBase} ·{" "}
                  {modal.turnoBase || "F"}{" "}
                  {modal.horarioBase ? `· ${modal.horarioBase}` : ""}
                  {CRITICAL_PUESTOS.has(modal.puestoBase) && (
                    <span style={{ marginLeft: 8, color: "rgba(239,68,68,1)" }}>
                      (crítico)
                    </span>
                  )}
                </div>
              </div>
              <button className="btn-ui btn-ui--ghost" disabled={saving} onClick={() => setModal(null)}>
                Cerrar
              </button>
            </div>

            {formError && (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 10,
                  background: "rgba(239,68,68,.10)",
                  border: "1px solid rgba(239,68,68,.25)",
                  color: "rgba(239,68,68,1)",
                  fontWeight: 700,
                }}
              >
                {formError}
              </div>
            )}

            <form
              style={{ marginTop: 14, display: "grid", gap: 10 }}
              onSubmit={handleSaveExcepcion}
            >
              <label>
                Tipo
                <select
                  name="tipo"
                  defaultValue="CAMBIO"
                  style={{ width: "100%" }}
                  onChange={() => setFormError("")}
                >
                  <option value="CAMBIO">CAMBIO (reemplazo)</option>
                  <option value="ENFERMEDAD">ENFERMEDAD (E)</option>
                  <option value="AUSENTE_SIN_AVISO">
                    AUSENTE SIN AVISO (I)
                  </option>
                  <option value="AUSENTE_CON_AVISO">
                    AUSENTE CON AVISO (A)
                  </option>
                  <option value="ACCIDENTADO">ACCIDENTADO (AC)</option>
                  <option value="VACACIONES">VACACIONES (V)</option>
                  <option value="LICENCIA">LICENCIA (L)</option>
                  <option value="PERMISO">PERMISO (P)</option>
                </select>
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <label>
                  Puesto destino (solo CAMBIO)
                  <select
                    name="puesto_override"
                    style={{ width: "100%" }}
                    defaultValue=""
                  >
                    <option value="">—</option>
                    {puestosCatalogo.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Turno destino (solo CAMBIO)
                  <select
                    name="turno_override"
                    style={{ width: "100%" }}
                    defaultValue=""
                  >
                    <option value="">—</option>
                    <option value="M">M</option>
                    <option value="T">T</option>
                    <option value="N">N</option>
                  </select>
                </label>
              </div>

              {/* Cobertura obligatoria para críticos en ausencias */}
              {CRITICAL_PUESTOS.has(modal.puestoBase) && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.10)",
                    background: "rgba(255,255,255,.04)",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Cobertura (obligatoria si es ausencia)
                  </div>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    Buscar empleado
                    <input
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      placeholder="Nombre / legajo / sector / puesto"
                      style={{ width: "100%" }}
                    />
                  </label>

                  <label style={{ display: "block" }}>
                    Cubre (legajo)
                    <select
                      name="cover_legajo"
                      style={{ width: "100%" }}
                      defaultValue=""
                    >
                      <option value="">— Seleccionar reemplazante —</option>
                      {empleadosOptions.map((e) => {
                        const leg = e.legajo ?? e.leg ?? "";
                        const nom =
                          e.nombre ?? e.apellido_nombre ?? e.name ?? "";
                        const sec = e.sector ?? "";
                        const pue = e.puesto ?? "";
                        if (!leg) return null;
                        return (
                          <option key={String(leg)} value={String(leg)}>
                            {nom} ({leg}) — {sec} / {pue}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  {/* enviamos nombre también para ctx */}
                  <input
                    type="hidden"
                    name="cover_nombre"
                    value={(() => {
                      // esto se completa en backend con legajo, pero mandamos algo útil
                      return "";
                    })()}
                    readOnly
                  />

                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    Si guardás una ausencia acá, se generará automáticamente un{" "}
                    <b>CAMBIO</b> al reemplazante hacia
                    <b> {modal.puestoBase}</b> ({modal.turnoBase || "F"}).
                  </div>
                </div>
              )}

              <label>
                Motivo (opcional)
                <input
                  name="motivo"
                  placeholder="Ej: médico / reemplazo / ..."
                  style={{ width: "100%" }}
                />
              </label>

              <button
                disabled={saving}
                type="submit"
                style={{ height: 36, fontWeight: 900 }}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
