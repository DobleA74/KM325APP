import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";

import { useAuth } from "../lib/auth.jsx";
import {
  deleteEmpleado,
  legacyEmpleadosUrl,
  listEmpleados,
} from "../services/empleados";

const SECTORES = [
  { value: "", label: "Todos" },
  { value: "playa", label: "Playa" },
  { value: "shop", label: "Shop" },
];

function sectorUiToApi(s) {
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v === "playa") return "PLAYA";
  if (v === "shop") return "SHOP";
  const u = String(s || "")
    .trim()
    .toUpperCase();
  if (u === "PLAYA" || u === "SHOP") return u;
  // por si alguien pasa MINI acá (no debería, pero por las dudas)
  if (u === "MINI") return "SHOP";
  return "";
}

function sectorAnyToUi(s) {
  const u = String(s || "")
    .trim()
    .toUpperCase();
  if (u === "PLAYA") return "playa";
  if (u === "SHOP") return "shop";
  if (u === "MINI") return "shop"; // ✅ CLAVE: MINI = SHOP
  const v = String(s || "")
    .trim()
    .toLowerCase();
  if (v === "playa" || v === "shop") return v;
  return "";
}

function prettySector(s) {
  const u = String(s || "")
    .trim()
    .toUpperCase();
  if (u === "PLAYA") return "Playa";
  if (u === "SHOP" || u === "MINI") return "Shop"; // ✅ CLAVE
  const ui = sectorAnyToUi(s);
  return ui === "playa" ? "Playa" : ui === "shop" ? "Shop" : s || "";
}

export default function EmpleadosList() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "ADMIN";
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // filtros
  const [q, setQ] = useState("");
  const [sector, setSector] = useState(""); // "" | "playa" | "shop"
  const [puesto, setPuesto] = useState(""); // string

  // data
  const [rows, setRows] = useState([]);

  // puestos catalogo por sector
  const [puestosItems, setPuestosItems] = useState([]);
  const [puestosLoading, setPuestosLoading] = useState(false);
  const [puestosError, setPuestosError] = useState("");

  async function load() {
    if (loading) return;
    try {
      setError("");
      setLoading(true);
      const data = await listEmpleados();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Error cargando empleados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cargar puestos cuando cambia sector (si hay sector)
  useEffect(() => {
    const apiSector = sectorUiToApi(sector);
    setPuesto("");
    if (!apiSector) {
      setPuestosItems([]);
      setPuestosError("");
      setPuestosLoading(false);
      setPuesto("");
      return;
    }

    let cancelled = false;
    setPuestosLoading(true);
    setPuestosError("");

    api
      .get(`/api/puestos?sector=${encodeURIComponent(apiSector)}`)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setPuestosItems(items.filter((x) => Number(x.activo) === 1));
      })
      .catch((e) => {
        if (cancelled) return;
        setPuestosItems([]);
        setPuestosError(e?.message || "Error cargando puestos");
      })
      .finally(() => {
        if (cancelled) return;
        setPuestosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sector]);
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();

    return rows.filter((r) => {
      // filtro sector
      if (sector) {
        const rSectorUi = sectorAnyToUi(r.sector);
        if (rSectorUi !== sector) return false;
      }

      // filtro puesto
      if (puesto) {
        const puestoRow = String(r.puesto || r.categoria || "")
          .trim()
          .toLowerCase();
        const puestoSel = String(puesto || "")
          .trim()
          .toLowerCase();
        if (puestoRow !== puestoSel) return false;
      }

      // filtro texto
      if (!text) return true;
      const hay = [r.legajo, r.nombre, r.sector, r.puesto, r.categoria]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(text);
    });
  }, [rows, q, sector, puesto]);

  async function onDelete(legajo) {
    if (!isAdmin) return;
    const ok = window.confirm(`Eliminar empleado ${legajo}?`);
    if (!ok) return;
    try {
      setError("");
      await deleteEmpleado(legajo);
      await load();
    } catch (e) {
      console.error(e);
      setError(e?.message || "No se pudo eliminar");
    }
  }

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Empleados</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Listado + filtros por sector/puesto (catálogo oficial).
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a className="btn" href={legacyEmpleadosUrl()}>
            Abrir legacy
          </a>
          {isAdmin ? (
            <button
              className="btn primary"
              onClick={() => nav("/empleados/nuevo")}
            >
              Nuevo
            </button>
          ) : (
            <span className="badge">Solo lectura</span>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="card" style={{ flex: 2, minWidth: 280 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Legajo, nombre, sector, puesto…"
            />
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              {SECTORES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Puesto</label>
            <select
              value={puesto}
              onChange={(e) => setPuesto(e.target.value)}
              disabled={!sector || puestosLoading}
            >
              <option value="">
                {!sector
                  ? "Elegí sector primero"
                  : puestosLoading
                    ? "Cargando..."
                    : "Todos"}
              </option>
              {puestosItems.map((p) => (
                <option key={p.puesto} value={p.puesto}>
                  {p.puesto}
                </option>
              ))}
            </select>
            {puestosError ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {puestosError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 200 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Total
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div>
        </div>
      </div>

      {error ? (
        <div
          className="card"
          style={{ marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}
        >
          {error}
        </div>
      ) : null}

      <table className="table">
        <thead>
          <tr>
            <th>Legajo</th>
            <th>Nombre</th>
            <th>Sector</th>
            <th>Puesto</th>
            <th>Categoría</th>
            <th>Activo</th>
            <th style={{ width: 240 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="muted">
                Cargando…
              </td>
            </tr>
          ) : filtered.length ? (
            filtered.map((r) => (
              <tr key={r.legajo}>
                <td>{r.legajo}</td>
                <td>{r.nombre}</td>
                <td>{prettySector(r.sector)}</td>
                <td>
                  <b>{(r.puesto || r.categoria || "").trim()}</b>
                </td>
                <td>{r.categoria || ""}</td>
                <td>{Number(r.activo) ? "Sí" : "No"}</td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link
                    className="btn"
                    to={`/empleados/${encodeURIComponent(r.legajo)}`}
                  >
                    {isAdmin ? "Editar" : "Ver"}
                  </Link>
                  {isAdmin ? (
                    <button
                      className="btn danger"
                      onClick={() => onDelete(r.legajo)}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="muted">
                Sin resultados
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
