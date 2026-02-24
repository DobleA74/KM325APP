import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import {
  deleteEmpleado,
  legacyEmpleadosUrl,
  listEmpleados,
} from "../services/empleados";

function prettySector(s) {
  return s === "playa" ? "Playa" : s === "shop" ? "Shop" : s || "";
}

export default function EmpleadosList() {
  const { user } = useAuth();
  const isAdmin = user?.rol === "ADMIN";
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const hay = [r.legajo, r.nombre, r.sector, r.categoria, r.puesto]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

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
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Empleados</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Migración incremental: listado + alta/edición con ficha completa.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <a className="btn" href={legacyEmpleadosUrl()}>
            Abrir legacy
          </a>
          {isAdmin ? (
            <button className="btn primary" onClick={() => nav("/empleados/nuevo")}>Nuevo</button>
          ) : (
            <span className="badge">Solo lectura</span>
          )}
        </div>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="card" style={{ flex: 2, minWidth: 280 }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Legajo, nombre, sector, categoría…"
            />
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <div className="muted" style={{ fontSize: 13 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{filtered.length}</div>
        </div>
      </div>

      {error ? (
        <div className="card" style={{ marginTop: 12, borderColor: "rgba(239,68,68,0.35)" }}>
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
              <td colSpan={6} className="muted">Cargando…</td>
            </tr>
          ) : filtered.length ? (
            filtered.map((r) => (
              <tr key={r.legajo}>
                <td>{r.legajo}</td>
                <td>{r.nombre}</td>
                <td>{prettySector(r.sector)}</td>
                <td>{r.puesto || ""}</td>
                <td>{r.categoria || ""}</td>
                <td>{Number(r.activo) ? "Sí" : "No"}</td>
                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link className="btn" to={`/empleados/${encodeURIComponent(r.legajo)}`}>
                    {isAdmin ? "Editar" : "Ver"}
                  </Link>
                  {isAdmin ? (
                    <button className="btn danger" onClick={() => onDelete(r.legajo)}>
                      Eliminar
                    </button>
                  ) : null}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="muted">Sin resultados</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
