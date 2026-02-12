import React from 'react'

export default function Placeholder({ title, legacyHref }) {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted">
        Esta pantalla todavía está en legacy. Mientras migramos, podés abrirla en una pestaña nueva.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="btn primary" href={legacyHref} target="_blank" rel="noreferrer">Abrir legacy</a>
        <a className="btn" href="/">Volver al inicio legacy</a>
      </div>
    </div>
  )
}
