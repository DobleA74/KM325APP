import React, { useState } from 'react'
import { apiJson } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

export default function Perfil() {
  const { user, refresh } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function onChangePassword(e) {
    e.preventDefault()
    setMsg('')
    setErr('')
    if (!newPassword || newPassword.length < 4) return setErr('La nueva contraseña es muy corta')
    if (newPassword !== newPassword2) return setErr('Las contraseñas no coinciden')
    setLoading(true)
    try {
      await apiJson('/api/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setNewPassword2('')
      setMsg('Contraseña actualizada')
      await refresh()
    } catch (e2) {
      setErr(e2?.message || 'No se pudo cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Mi perfil</h1>
      <div className="row">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Datos básicos</h3>
          <div className="muted" style={{ lineHeight: 1.8 }}>
            <div><b>Usuario:</b> {user?.username}</div>
            <div><b>Rol:</b> {user?.rol}</div>
            <div><b>ID:</b> {user?.id}</div>
          </div>
        </div>
        <div className="card" id="config">
          <h3 style={{ marginTop: 0 }}>Configuración</h3>
          <p className="muted" style={{ marginTop: 0 }}>Cambiar contraseña</p>
          <form onSubmit={onChangePassword}>
            <div className="field">
              <label className="muted">Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="field">
              <label className="muted">Nueva contraseña</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <div className="field">
              <label className="muted">Repetir nueva contraseña</label>
              <input type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
            </div>
            {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
            {msg && <div style={{ color: 'var(--primary)' }}>{msg}</div>}
            <button className="btn primary" disabled={loading} type="submit">
              {loading ? 'Guardando…' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
