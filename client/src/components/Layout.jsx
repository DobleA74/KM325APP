import React, { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

function canSee(user, item) {
  if (!item.roles || item.roles.length === 0) return true
  return item.roles.includes(user?.rol)
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  const nav = useMemo(
    () => [
      { to: '/', label: 'Dashboard' },
      { to: '/empleados', label: 'Empleados', roles: ['ADMIN'] },
      { to: '/arqueos', label: 'Arqueos', roles: ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'LECTURA'] },
      { to: '/perfil', label: 'Mi perfil' },
      { to: '/usuarios', label: 'Usuarios', roles: ['ADMIN'] },
    ],
    [],
  )

  // cerrar menú al navegar
  React.useEffect(() => setOpen(false), [location.pathname])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--primary)' }} />
          <div>
            <b>KM325</b>
            <div className="muted" style={{ fontSize: 12 }}>Gestión integral</div>
          </div>
        </div>
        <nav className="nav">
          {nav.filter((i) => canSee(user, i)).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {i.label}
            </NavLink>
          ))}
          <a href="/" style={{ marginTop: 10 }} className="muted">
            ↩ Volver a Legacy
          </a>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <span className="muted" style={{ fontSize: 13 }}>Panel</span>
          </div>
          <div className="menu">
            <button className="btn" onClick={() => setOpen((v) => !v)}>
              <span title="Usuario">👁️</span>
              <span>{user?.username || 'Usuario'}</span>
              <span className="muted" style={{ fontSize: 12 }}>({user?.rol})</span>
            </button>
            {open && (
              <div className="menuPanel">
                <a href="#/" onClick={(e) => e.preventDefault()} style={{ cursor: 'default', opacity: 0.75 }}>
                  {user?.username}
                </a>
                <a href="/app/perfil">Mi perfil</a>
                <a href="/app/perfil#config">Configuración</a>
                <button onClick={logout} style={{ borderTop: '1px solid var(--border)' }}>
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
  )
}
