import React, { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../lib/api.js'

const ROLES = ['ADMIN', 'SUPERVISOR', 'OPERADOR', 'LECTURA']

export default function Usuarios() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState({ username: '', password: '', rol: 'OPERADOR' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setError('')
    setLoading(true)
    try {
      const data = await apiJson('/api/usuarios')
      setRows(data)
    } catch (e) {
      setError(e?.message || 'No se pudo cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.id || 0) - (a.id || 0)), [rows])

  async function createUser(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiJson('/api/usuarios', { method: 'POST', body: JSON.stringify(form) })
      setForm({ username: '', password: '', rol: 'OPERADOR' })
      await load()
    } catch (e2) {
      setError(e2?.message || 'No se pudo crear usuario')
    } finally {
      setSaving(false)
    }
  }

  async function patchUser(id, patch) {
    await apiJson(`/api/usuarios/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    await load()
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Usuarios</h1>
      <p className="muted">Alta, edición y desactivación (solo ADMIN).</p>

      <div className="row">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Crear usuario</h3>
          <form onSubmit={createUser}>
            <div className="field">
              <label className="muted">Usuario</label>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="field">
              <label className="muted">Contraseña</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="field">
              <label className="muted">Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <button className="btn primary" disabled={saving} type="submit">{saving ? 'Creando…' : 'Crear'}</button>
          </form>
        </div>

        <div className="card" style={{ flex: 2 }}>
          <h3 style={{ marginTop: 0 }}>Listado</h3>
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {loading ? (
            <div className="muted">Cargando…</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th style={{ width: 320 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>
                      <select value={u.rol} onChange={(e) => patchUser(u.id, { rol: e.target.value })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>{u.activo ? <span className="badge">Activo</span> : <span className="badge">Inactivo</span>}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          onClick={() => {
                            const p = window.prompt('Nueva contraseña (mínimo 4 caracteres):')
                            if (!p) return
                            patchUser(u.id, { password: p })
                          }}
                        >
                          Reset pass
                        </button>
                        <button
                          className={u.activo ? 'btn danger' : 'btn primary'}
                          onClick={() => patchUser(u.id, { activo: !u.activo })}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
