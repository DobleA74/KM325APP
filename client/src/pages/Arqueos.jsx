import { useEffect, useMemo, useRef, useState } from "react";
import api from "../lib/api";

const CONFIRMAR_MIGRADO = true; // ✅ ya lo activamos

const TURNOS_PLAYA = ["mañana", "tarde", "noche"];
const TURNOS_SHOP = ["mañana", "tarde"];
const TURNOS_TODOS = ["mañana", "tarde", "noche"];

function toISODate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function formatMoneyCell(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoneyToNumber(v) {
  if (v === "" || v === null || v === undefined) return 0;

  let s = String(v).trim();

  // dejar solo dígitos, signos y separadores básicos
  s = s.replace(/[^\d.,-]/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma) {
    // es-AR: 1.234,56 -> 1234.56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasDot) {
    // en: 1234.56
    // si hay múltiples puntos, asumimos miles + último decimal
    const parts = s.split(".");
    if (parts.length > 2) {
      const dec = parts.pop();
      s = parts.join("") + "." + dec;
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function FieldEdit({ label, value, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ opacity: 0.8, marginBottom: 6 }}>{label}</div>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0"
        style={{ width: "100%" }}
      />
    </label>
  );
}

export default function Arqueos() {
  const [fecha, setFecha] = useState(toISODate(new Date()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [items, setItems] = useState([]);
  const [propuestas, setPropuestas] = useState([]);
  const [error, setError] = useState("");

  const reqIdRef = useRef(0);

  function prettySector(s) {
    return s === "playa" ? "Playa" : s === "shop" ? "Shop" : s;
  }
  function prettyTurno(t) {
    return t === "mañana" ? "Mañana" : t === "tarde" ? "Tarde" : t === "noche" ? "Noche" : t;
  }

  const [form, setForm] = useState({
    Playa: { mañana: "", tarde: "", noche: "", observaciones: "" },
    Shop: { mañana: "", tarde: "", observaciones: "" },
  });

  // ---- SORT (click en encabezados) ----
  const [sort, setSort] = useState({ key: "sector", dir: "asc" });

  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
  }

  function sortIndicator(key) {
    if (sort.key !== key) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }

  function propuestaKey(p) {
    return `${p.arqueo_id}-${p.legajo}-${p.sector}-${p.turno}`;
  }

  // ✅ Permite escribir , y .: guardamos string mientras tipea, y parseamos al salir (blur)
  function updatePropuestaFinalInputByKey(key, rawValue) {
    setPropuestas((prev) =>
      prev.map((p) =>
        propuestaKey(p) === key
          ? { ...p, monto_final_input: rawValue } // string temporal
          : p
      )
    );
  }

  function commitPropuestaFinalByKey(key) {
    setPropuestas((prev) =>
      prev.map((p) => {
        if (propuestaKey(p) !== key) return p;
        const raw = p.monto_final_input ?? "";
        const parsed = parseMoneyToNumber(raw);
        return { ...p, monto_final: parsed, monto_final_input: undefined };
      })
    );
  }

  const propuestasOrdenadas = useMemo(() => {
    const sectorRank = { playa: 0, shop: 1 };
    const turnoRank = { mañana: 0, tarde: 1, noche: 2 };

    const getNumFinal = (p) => {
      // si está editando, calculamos usando el input raw
      if (p.monto_final_input !== undefined) return parseMoneyToNumber(p.monto_final_input);
      return Number(p.monto_final ?? p.monto_propuesto ?? 0);
    };

    const getValue = (p) => {
      switch (sort.key) {
        case "sector":
          return sectorRank[p.sector] ?? 99;
        case "turno":
          return turnoRank[p.turno] ?? 99;
        case "legajo":
          return String(p.legajo || "");
        case "nombre":
          return String(p.nombre || "");
        case "minutos":
          return Number(p.minutos || 0);
        case "propuesto":
          return Number(p.monto_propuesto || 0);
        case "final":
          return getNumFinal(p);
        default:
          return "";
      }
    };

    const dirMul = sort.dir === "asc" ? 1 : -1;

    return [...propuestas].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);

      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dirMul;
      return String(va).localeCompare(String(vb), "es") * dirMul;
    });
  }, [propuestas, sort]);

  // ---- Payload para Guardar y Calcular ----
  function buildTurnosPayload(sectorApi) {
    const isPlaya = sectorApi === "playa";
    const src = isPlaya ? form.Playa : form.Shop;

    const turnos = (isPlaya ? TURNOS_PLAYA : TURNOS_SHOP).map((turno) => ({
      turno,
      monto_diferencia: parseMoneyToNumber(src[turno]),
      observaciones: String(src.observaciones || "").trim(),
    }));

    const hasAnyMonto = turnos.some((t) => Math.abs(t.monto_diferencia) > 0);
    const hasObs = !!turnos[0]?.observaciones;

    return { turnos, hasAnyMonto, hasObs };
  }

  async function guardarYCalcularSector(sectorApi) {
    const { turnos, hasAnyMonto, hasObs } = buildTurnosPayload(sectorApi);
    if (!hasAnyMonto && !hasObs) return { ok: true, arqueos: [], propuestas: [] };

    const payload = { fecha, sector: sectorApi, turnos };
    const res = await api.post("/api/arqueos/guardar-y-calcular", payload);
    if (!res?.ok) throw new Error(res?.error || "Error");
    return res;
  }

  async function guardarYCalcular() {
    if (saving || loading) return;
    try {
      setError("");
      setSaving(true);

      const r1 = await guardarYCalcularSector("playa");
      const r2 = await guardarYCalcularSector("shop");

      const arqueos = [...(r1.arqueos || []), ...(r2.arqueos || [])];
      const props = [...(r1.propuestas || []), ...(r2.propuestas || [])];

      // limpiamos posibles inputs temporales
      const propsClean = props.map((p) => ({ ...p, monto_final_input: undefined }));

      setItems(arqueos);
      setPropuestas(propsClean);

      if (!arqueos.length) setError("⚠️ No se guardó nada (todo 0 / vacío).");
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error guardando arqueos");
    } finally {
      setSaving(false);
    }
  }

  async function load() {
    if (loading) return;
    try {
      setError("");
      setLoading(true);
      const reqId = ++reqIdRef.current;

      const res = await api.get(`/api/arqueos?fecha=${fecha}`);
      if (reqId !== reqIdRef.current) return;
      if (!res?.ok) throw new Error("Respuesta inválida del servidor");

      const arqueos = Array.isArray(res.arqueos) ? res.arqueos : [];
      setItems(arqueos);

      const next = {
        Playa: { mañana: "", tarde: "", noche: "", observaciones: "" },
        Shop: { mañana: "", tarde: "", observaciones: "" },
      };

      for (const it of arqueos) {
        if (!next[it.sector]) continue;
        if (it.turno && it.turno !== "obs") {
          next[it.sector][it.turno] =
            it.monto_diferencia === null || it.monto_diferencia === undefined
              ? ""
              : String(it.monto_diferencia);
        }
        if (it.observaciones) next[it.sector].observaciones = it.observaciones;
      }

      setForm(next);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error cargando arqueos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Agrupado por turno (control) ----
  const agrupadoPorTurno = useMemo(() => {
    return TURNOS_TODOS.map((t) => {
      const playa = parseMoneyToNumber(form.Playa[t]);
      const shop = parseMoneyToNumber(form.Shop[t]);
      return { turno: t, playa, shop, total: playa + shop };
    });
  }, [form]);

  // ✅ Control por sector/turno (objetivo vs asignado)
  const controlPorTurno = useMemo(() => {
    const key = (sector, turno) => `${sector}__${turno}`;

    const objetivos = new Map();
    for (const it of items) {
      if (!it?.sector || !it?.turno) continue;
      if (it.turno === "obs") continue;
      objetivos.set(key(it.sector, it.turno), Number(it.monto_diferencia || 0));
    }

    const asignados = new Map();
    for (const p of propuestas) {
      const k = key(p.sector, p.turno);
      const v =
        p.monto_final_input !== undefined
          ? parseMoneyToNumber(p.monto_final_input)
          : Number(p.monto_final ?? p.monto_propuesto ?? 0);

      asignados.set(k, (asignados.get(k) || 0) + v);
    }

    const keys = new Set([...objetivos.keys(), ...asignados.keys()]);
    const rows = [...keys].map((k) => {
      const [sector, turno] = k.split("__");
      const objetivo = objetivos.get(k) ?? 0;
      const asignado = asignados.get(k) ?? 0;
      const diff = asignado - objetivo;
      return { sector, turno, objetivo, asignado, diff };
    });

    const sectorRank = { playa: 0, shop: 1 };
    const turnoRank = { mañana: 0, tarde: 1, noche: 2 };
    rows.sort((a, b) => {
      const sA = sectorRank[a.sector] ?? 99;
      const sB = sectorRank[b.sector] ?? 99;
      if (sA !== sB) return sA - sB;
      const tA = turnoRank[a.turno] ?? 99;
      const tB = turnoRank[b.turno] ?? 99;
      return tA - tB;
    });

    return rows;
  }, [items, propuestas]);

  const hayDescuadre = useMemo(() => {
    const tol = 0.01;
    return controlPorTurno.some((r) => Math.abs(r.diff) > tol);
  }, [controlPorTurno]);

  // ✅ Confirmar: enviamos asignaciones finales
  async function confirmar() {
    if (confirming || saving || loading) return;
    if (!propuestas?.length) return;

    // opcional: evitar confirmar si descuadra
    if (hayDescuadre) {
      setError("⚠️ No podés confirmar: hay turnos descuadrados.");
      return;
    }

    try {
      setError("");
      setConfirming(true);

      // armamos propuestas con monto_final NUMÉRICO (si hay input en edición, lo parseamos)
      const payloadPropuestas = propuestas.map((p) => ({
        arqueo_id: p.arqueo_id,
        sector: p.sector,
        turno: p.turno,
        legajo: p.legajo,
        monto_final:
          p.monto_final_input !== undefined
            ? parseMoneyToNumber(p.monto_final_input)
            : Number(p.monto_final ?? p.monto_propuesto ?? 0),
      }));

      // 👇 si tu backend espera otro nombre, cambialo acá
      const payloadConfirmar = {
        fecha,
        propuestas: payloadPropuestas,
      };

      const res = await api.post("/api/arqueos/confirmar", payloadConfirmar);
      if (!res?.ok) throw new Error(res?.error || "Error");

      setError(res?.message || `✅ Confirmado. Guardadas: ${res?.guardadas ?? "-"}`);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error confirmando");
    } finally {
      setConfirming(false);
    }
  }

  // ---- Layout responsive sin tocar CSS global ----
  const grid2cols = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
    marginTop: 16,
  };

  const turnosPlayaGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12,
  };

  const turnosShopGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  };

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsNarrow(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const gridResponsive = isNarrow ? { ...grid2cols, gridTemplateColumns: "1fr" } : grid2cols;
  const playaResponsive = isNarrow ? { ...turnosPlayaGrid, gridTemplateColumns: "1fr" } : turnosPlayaGrid;
  const shopResponsive = isNarrow ? { ...turnosShopGrid, gridTemplateColumns: "1fr" } : turnosShopGrid;

  return (
    <div>
      <h1>Arqueos</h1>

      <div
        className="card"
        style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={{ width: 160 }}
          />
        </label>

        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Cargando..." : "Cargar"}
        </button>

        <button className="btn" onClick={guardarYCalcular} disabled={loading || saving}>
          {saving ? "Guardando..." : "Guardar y calcular"}
        </button>

        <a className="btn btn-secondary" href="http://localhost:3001/arqueos" target="_blank" rel="noreferrer">
          Abrir versión legacy
        </a>

        {propuestas.length > 0 && (
          <button
            className="btn"
            onClick={CONFIRMAR_MIGRADO ? confirmar : undefined}
            disabled={!CONFIRMAR_MIGRADO || loading || saving || confirming || hayDescuadre}
            title={
              hayDescuadre
                ? "No se puede confirmar si hay turnos descuadrados"
                : !CONFIRMAR_MIGRADO
                  ? "Confirmar todavía usa lógica legacy (pendiente de migración)"
                  : ""
            }
          >
            {confirming ? "Confirmando..." : "Confirmar"}
          </button>
        )}

        {error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
      </div>

      <div style={gridResponsive}>
        {/* PLAYA */}
        <div className="card">
          <h3>Playa</h3>

          <div style={playaResponsive}>
            {TURNOS_PLAYA.map((t) => (
              <FieldEdit
                key={t}
                label={t === "mañana" ? "Mañana (05-13)" : t === "tarde" ? "Tarde (13-21)" : "Noche (21-05)"}
                value={form.Playa[t]}
                onChange={(v) => setForm((f) => ({ ...f, Playa: { ...f.Playa, [t]: v } }))}
              />
            ))}

            <div style={{ gridColumn: isNarrow ? "auto" : "1 / -1" }}>
              <label style={{ display: "block", marginTop: 0 }}>
                <div style={{ opacity: 0.8, marginBottom: 6 }}>Observaciones</div>
                <input
                  value={form.Playa.observaciones}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, Playa: { ...f.Playa, observaciones: e.target.value } }))
                  }
                  style={{ width: "100%" }}
                />
              </label>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            (Ahora ya podés editar. El próximo paso es “Guardar y calcular”)
          </div>
        </div>

        {/* SHOP */}
        <div className="card">
          <h3>Shop</h3>

          <div style={shopResponsive}>
            {TURNOS_SHOP.map((t) => (
              <FieldEdit
                key={t}
                label={t === "mañana" ? "Mañana (06-14)" : "Tarde (14-22)"}
                value={form.Shop[t]}
                onChange={(v) => setForm((f) => ({ ...f, Shop: { ...f.Shop, [t]: v } }))}
              />
            ))}

            <div style={{ gridColumn: isNarrow ? "auto" : "1 / -1" }}>
              <label style={{ display: "block" }}>
                <div style={{ opacity: 0.8, marginBottom: 6 }}>Observaciones</div>
                <input
                  value={form.Shop.observaciones}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, Shop: { ...f.Shop, observaciones: e.target.value } }))
                  }
                  style={{ width: "100%" }}
                />
              </label>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            (Ahora ya podés editar. El próximo paso es “Guardar y calcular”)
          </div>
        </div>
      </div>

      {/* Agrupado por turno */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Agrupado por turno (control)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.85 }}>
              <th>Turno</th>
              <th>Playa</th>
              <th>Shop</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {agrupadoPorTurno.map((r) => (
              <tr key={r.turno}>
                <td>{r.turno}</td>
                <td>{formatMoneyCell(r.playa)}</td>
                <td>{formatMoneyCell(r.shop)}</td>
                <td>{formatMoneyCell(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Propuestas */}
      {propuestas.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Propuestas (editable)</h3>

          {controlPorTurno.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  marginBottom: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: hayDescuadre ? "rgba(255, 107, 107, 0.10)" : "rgba(124, 252, 152, 0.08)",
                }}
              >
                {hayDescuadre ? (
                  <strong style={{ color: "#ff6b6b" }}>
                    ⚠️ Hay turnos descuadrados: la suma de “$ Final” no coincide con el monto del turno.
                  </strong>
                ) : (
                  <strong style={{ color: "#7CFC98" }}>
                    ✅ Todo cuadra: la distribución coincide con el monto de cada turno.
                  </strong>
                )}
              </div>

              {controlPorTurno.map((r) => {
                const tol = 0.01;
                const ok = Math.abs(r.diff) <= tol;
                return (
                  <div
                    key={`${r.sector}-${r.turno}`}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      marginBottom: 8,
                      border: "1px solid rgba(255,255,255,0.08)",
                      opacity: ok ? 0.95 : 1,
                    }}
                  >
                    <strong>
                      {prettySector(r.sector)} · {prettyTurno(r.turno)}
                    </strong>

                    <span style={{ marginLeft: 10, opacity: 0.85 }}>
                      Objetivo: {formatMoneyCell(r.objetivo)} | Asignado: {formatMoneyCell(r.asignado)}
                    </span>

                    {ok ? (
                      <span style={{ marginLeft: 10, color: "#7CFC98" }}>✅ Cuadra</span>
                    ) : (
                      <span style={{ marginLeft: 10, color: "#ff6b6b" }}>
                        {r.diff > 0
                          ? `⚠️ Te pasaste por ${formatMoneyCell(r.diff)}`
                          : `⚠️ Falta asignar ${formatMoneyCell(Math.abs(r.diff))}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("sector")}>
                    Sector{sortIndicator("sector")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("turno")}>
                    Turno{sortIndicator("turno")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("legajo")}>
                    Legajo{sortIndicator("legajo")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("nombre")}>
                    Nombre{sortIndicator("nombre")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("minutos")}>
                    Minutos{sortIndicator("minutos")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("propuesto")}>
                    $ Propuesto{sortIndicator("propuesto")}
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => toggleSort("final")}>
                    $ Final{sortIndicator("final")}
                  </th>
                </tr>
              </thead>

              <tbody>
                {propuestasOrdenadas.map((p) => {
                  const k = propuestaKey(p);
                  const valueShown =
                    p.monto_final_input !== undefined
                      ? p.monto_final_input
                      : (p.monto_final === null || p.monto_final === undefined)
                        ? ""
                        : String(p.monto_final);

                  return (
                    <tr key={k}>
                      <td>{p.sector}</td>
                      <td>{p.turno}</td>
                      <td>{p.legajo}</td>
                      <td>{p.nombre}</td>
                      <td>{p.minutos}</td>
                      <td>{Number(p.monto_propuesto || 0).toFixed(2)}</td>
                      <td style={{ minWidth: 160 }}>
                        <input
                          value={valueShown}
                          onChange={(e) => updatePropuestaFinalInputByKey(k, e.target.value)}
                          onBlur={() => commitPropuestaFinalByKey(k)}
                          inputMode="decimal"
                          placeholder="0"
                          style={{ width: "100%" }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="muted" style={{ marginTop: 8 }}>
            (Edición local: todavía no guarda ni confirma si no apretás “Confirmar”.)
          </div>
        </div>
      )}

      {/* Debug */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Registros (debug)</h3>
        <div className="muted" style={{ marginBottom: 8 }}>
          Propuestas: {propuestas.length}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.85 }}>
              <th>Sector</th>
              <th>Turno</th>
              <th>Monto diferencia</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.sector}</td>
                <td>{it.turno}</td>
                <td>{formatMoneyCell(it.monto_diferencia)}</td>
                <td style={{ opacity: 0.8 }}>{it.creado_en}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ opacity: 0.7 }}>
                  No hay arqueos para esa fecha.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
