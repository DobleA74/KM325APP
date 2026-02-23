import React from 'react'
import { useAuth } from '../lib/auth.jsx'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <p className="muted">Bienvenido/a <b>{user?.username}</b>. Esta es la nueva capa React, conviviendo con el sistema legacy.</p>

      <div className="row">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Migración incremental</h3>
          <p className="muted">Empezamos por Auth + Layout + Configuración/Usuarios. Las pantallas operativas se irán moviendo una por una.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href="/empleados">Empleados</a>
            <a className="btn" href="/arqueos">Arqueos</a>
            <a className="btn primary" href="/perfil">Mi perfil</a>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Acceso rápido</h3>
          <p className="muted">Mientras tanto, podés seguir usando las pantallas actuales:</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href="/arqueos.html">Arqueos legacy</a>
            <a className="btn" href="/abm-empleados.html">Empleados legacy</a>
          </div>
        </div>
      </div>
    </div>
  )
}
