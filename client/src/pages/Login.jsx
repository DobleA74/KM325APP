import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      nav('/', { replace: true })
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '8vh auto', padding: 18 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>KM325</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Login (versión React). Si preferís, podés usar el <a href="/login.html">login clásico</a>.
        </p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="muted">Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label className="muted">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div style={{ color: 'var(--danger)', marginTop: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn primary" type="submit" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
            <a className="btn" href="/">Ir a Legacy</a>
          </div>
        </form>
      </div>
    </div>
  )
}
