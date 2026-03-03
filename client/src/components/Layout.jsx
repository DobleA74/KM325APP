import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";

function canSee(user, item) {
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.includes(user?.rol);
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("km325_sidebar") === "collapsed");
  const location = useLocation();

  const nav = useMemo(
    () => [
      { to: "/", label: "Dashboard", icon: "📊" },
      { to: "/empleados", label: "Empleados", roles: ["ADMIN"], icon: "🧑‍🤝‍🧑" },
      { to: "/puestos", label: "Puestos", roles: ["ADMIN"], icon: "🧩" },
      { to: "/arqueos", label: "Arqueos", roles: ["ADMIN", "SUPERVISOR", "OPERADOR", "LECTURA"], icon: "💰" },
      { to: "/turnos", label: "Turnos", roles: ["ADMIN", "RRHH"], icon: "🗓️" },
      { to: "/perfil", label: "Mi perfil", icon: "👤" },
      { to: "/usuarios", label: "Usuarios", roles: ["ADMIN"], icon: "🔐" },
    ],
    []
  );

  React.useEffect(() => setOpen(false), [location.pathname]);

  function toggleSidebar() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("km325_sidebar", next ? "collapsed" : "open");
      return next;
    });
  }

  return (
    <div className="layout">
      <aside
      className={`sidebar ${collapsed ? "is-collapsed" : ""}`}
        style={{
          width: collapsed ? 74 : 240,
          transition: "width .15s ease",
        }}
      >
        <div className="brand" style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, background: "var(--primary)" }} />
            {!collapsed && (
              <div>
                <b>KM325</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Gestión integral
                </div>
              </div>
            )}
          </div>

          <button
            className="btn-ui btn-ui--ghost"
            onClick={toggleSidebar}
            title={collapsed ? "Expandir" : "Colapsar"}
            style={{ padding: "6px 10px" }}
          >
            {collapsed ? "➡️" : "⬅️"}
          </button>
        </div>

        <nav className="nav" style={{ marginTop: 8 }}>
          {nav
            .filter((i) => canSee(user, i))
            .map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === "/"}
                className={({ isActive }) => (isActive ? "active" : "")}
                title={collapsed ? i.label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <span style={{ fontSize: 18 }}>{i.icon}</span>
                {!collapsed && <span>{i.label}</span>}
              </NavLink>
            ))}

          <a
            href="/"
            style={{
              marginTop: 10,
              justifyContent: collapsed ? "center" : "flex-start",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
            className="muted"
            title={collapsed ? "Volver a Legacy" : undefined}
          >
            <span style={{ fontSize: 18 }}>↩️</span>
            {!collapsed && <span>Volver a Legacy</span>}
          </a>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <span className="muted" style={{ fontSize: 13 }}>
              Panel
            </span>
          </div>
          <div className="menu">
            <button className="btn" onClick={() => setOpen((v) => !v)}>
              <span title="Usuario">👁️</span>
              <span>{user?.username || "Usuario"}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                ({user?.rol})
              </span>
            </button>
            {open && (
              <div className="menuPanel">
                <a href="#/" onClick={(e) => e.preventDefault()} style={{ cursor: "default", opacity: 0.75 }}>
                  {user?.username}
                </a>
                <a href="/app/perfil">Mi perfil</a>
                <a href="/app/perfil#config">Configuración</a>
                <button onClick={logout} style={{ borderTop: "1px solid var(--border)" }}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}