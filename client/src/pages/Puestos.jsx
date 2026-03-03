import React, { useEffect, useMemo, useState } from 'react'
import { deletePuesto, listPuestos, upsertPuesto } from '../services/puestos.js'
import { listPatrones } from '../services/patrones.js'

const SECTORES = ['PLAYA', 'SHOP', 'ADMINISTRACIÓN']

function emptyForm() {
  return {
    puesto: '',
    sector: 'PLAYA',
    activo: 1,
    manana_start: '',
    manana_end: '',
    tarde_start: '',
    tarde_end: '',
    noche_start: '',
    noche_end: '',
    patron_id: '',
    patron_inicio: '',
    patron_texto: '',
  }
}

export default function Puestos() {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [sector, setSector] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)

  const [items, setItems] = useState([])
  const [patrones, setPatrones] = useState([])

  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const [p, pa] = await Promise.all([
        listPuestos({ sector, include_inactive: includeInactive ? 1 : '' }),
        listPatrones(),
      ])
      setItems(p)
      setPatrones(pa)
      return p
    } catch (e) {
      setErr(e?.message || 'Error cargando')
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector, includeInactive])

  const patronOptions = useMemo(() => {
    return [{ id: '', nombre: '— Sin patrón —' }, ...patrones]
  }, [patrones])

  function pick(row) {
    setSelected(row?.puesto || null)
    setForm({
      ...emptyForm(),
      ...row,
      // backend devuelve patron_id null; en select preferimos ''
      patron_id: row?.patron_id ?? '',
      patron_inicio: row?.patron_inicio ?? '',
      patron_texto: row?.patron_texto ?? '',
      sector: row?.sector ?? 'PLAYA',
      activo: row?.activo ?? 1,
      // para editar: mostramos HH:MM si viene en minutos? (backend devuelve minutos)
      manana_start: row?.manana_start == null ? '' : minToHHMM(row.manana_start),
      manana_end: row?.manana_end == null ? '' : minToHHMM(row.manana_end),
      tarde_start: row?.tarde_start == null ? '' : minToHHMM(row.tarde_start),
      tarde_end: row?.tarde_end == null ? '' : minToHHMM(row.tarde_end),
      noche_start: row?.noche_start == null ? '' : minToHHMM(row.noche_start),
      noche_end: row?.noche_end == null ? '' : minToHHMM(row.noche_end),
    })
  }

  function minToHHMM(m) {
    const mm = Number(m)
    if (!Number.isFinite(mm)) return ''
    const h = Math.floor(mm / 60)
    const mi = Math.abs(mm % 60)
    const hh = String(h).padStart(2, '0')
    const m2 = String(mi).padStart(2, '0')
    return `${hh}:${m2}`
  }

  function startNew() {
    setSelected(null)
    setForm(emptyForm())
  }

  async function onSave(e) {
    e.preventDefault()
    setSaving(true)
    setErr('')
    try {
      const payload = {
        ...form,
        puesto: String(form.puesto || '').trim(),
        sector: form.sector || null,
        activo: form.activo ? 1 : 0,
        patron_id: form.patron_id === '' ? null : Number(form.patron_id),
        patron_inicio: form.patron_inicio || null,
        patron_texto: form.patron_texto || null,
      }
      await upsertPuesto(payload)
      const refreshed = await load()
      // re-seleccionar por puesto
      const after = payload.puesto
      const row = (refreshed || []).find((x) => x.puesto === after)
      setSelected(after)
      if (row) pick(row)
    } catch (e2) {
      setErr(e2?.message || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    const p = String(form.puesto || '').trim()
    if (!p) return
    if (!window.confirm(`¿Eliminar el puesto “${p}”?`)) return
    setSaving(true)
    setErr('')
    try {
      await deletePuesto(p)
      startNew()
      await load()
    } catch (e) {
      setErr(e?.message || 'Error eliminando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="row">
      <div className="card" style={{ flex: 1.2, minWidth: 340 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Puestos</h2>
            <div className="muted" style={{ fontSize: 13 }}>
              ABM de puestos + horarios + patrón por puesto
            </div>
          </div>
          <button className="btn primary" onClick={startNew}>+ Nuevo</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Sector</label>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="">Todos</option>
              {SECTORES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label className="muted">Estado</label>
            <select value={includeInactive ? 'all' : 'active'} onChange={(e) => setIncludeInactive(e.target.value === 'all')}>
              <option value="active">Solo activos</option>
              <option value="all">Incluir inactivos</option>
            </select>
          </div>
        </div>

        {err ? (
          <div className="card" style={{ marginTop: 12, borderColor: 'rgba(239,68,68,0.35)' }}>
            <b style={{ color: 'var(--danger)' }}>Error:</b> {err}
          </div>
        ) : null}

        <table className="table">
          <thead>
            <tr>
              <th>Puesto</th>
              <th>Sector</th>
              <th>Horarios</th>
              <th>Patrón</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="muted">Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="muted">Sin datos</td></tr>
            ) : (
              items.map((r) => (
                <tr
                  key={r.puesto}
                  style={{ cursor: 'pointer', opacity: r.activo ? 1 : 0.65 }}
                  onClick={() => pick(r)}
                >
                  <td>
                    <b style={{ color: selected === r.puesto ? 'var(--primary)' : undefined }}>{r.puesto}</b>
                  </td>
                  <td><span className="badge">{r.sector || '—'}</span></td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {r.manana ? `M ${r.manana}` : 'M —'}{' · '}
                    {r.tarde ? `T ${r.tarde}` : 'T —'}{' · '}
                    {r.noche ? `N ${r.noche}` : 'N —'}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>
                    {r.patron_nombre ? r.patron_nombre : (r.patron_texto ? r.patron_texto : '—')}
                    {r.patron_inicio ? <span className="muted"> ({r.patron_inicio})</span> : null}
                  </td>
                  <td>{r.activo ? <span className="badge">Activo</span> : <span className="badge">Inactivo</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ flex: 0.8, minWidth: 320 }}>
        <h3 style={{ marginTop: 0, marginBottom: 6 }}>{selected ? 'Editar puesto' : 'Nuevo puesto'}</h3>
        <div className="muted" style={{ fontSize: 13 }}>
          Guardá horarios como HH:MM. La noche puede cruzar medianoche.
        </div>

        <form onSubmit={onSave}>
          <div className="field">
            <label className="muted">Puesto</label>
            <input
              value={form.puesto}
              onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))}
              placeholder="Ej: Auxiliar de playa"
              disabled={!!selected}
            />
          </div>

          <div className="field">
            <label className="muted">Sector</label>
            <select value={form.sector || ''} onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}>
              {SECTORES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="muted">Estado</label>
            <select value={form.activo ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.value === '1' ? 1 : 0 }))}>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <div className="card" style={{ padding: 12, flex: 1, minWidth: 220 }}>
              <b>Horarios</b>
              <div className="field"><label className="muted">Mañana (inicio)</label>
                <input value={form.manana_start} onChange={(e) => setForm((f) => ({ ...f, manana_start: e.target.value }))} placeholder="05:00" />
              </div>
              <div className="field"><label className="muted">Mañana (fin)</label>
                <input value={form.manana_end} onChange={(e) => setForm((f) => ({ ...f, manana_end: e.target.value }))} placeholder="13:00" />
              </div>

              <div className="field"><label className="muted">Tarde (inicio)</label>
                <input value={form.tarde_start} onChange={(e) => setForm((f) => ({ ...f, tarde_start: e.target.value }))} placeholder="13:00" />
              </div>
              <div className="field"><label className="muted">Tarde (fin)</label>
                <input value={form.tarde_end} onChange={(e) => setForm((f) => ({ ...f, tarde_end: e.target.value }))} placeholder="21:00" />
              </div>

              <div className="field"><label className="muted">Noche (inicio)</label>
                <input value={form.noche_start} onChange={(e) => setForm((f) => ({ ...f, noche_start: e.target.value }))} placeholder="21:00" />
              </div>
              <div className="field"><label className="muted">Noche (fin)</label>
                <input value={form.noche_end} onChange={(e) => setForm((f) => ({ ...f, noche_end: e.target.value }))} placeholder="05:00" />
              </div>
            </div>

            <div className="card" style={{ padding: 12, flex: 1, minWidth: 220 }}>
              <b>Patrón</b>
              <div className="field">
                <label className="muted">Patrón asignado</label>
                <select
                  value={String(form.patron_id ?? '')}
                  onChange={(e) => setForm((f) => ({ ...f, patron_id: e.target.value }))}
                >
                  {patronOptions.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="muted">Inicio del patrón</label>
                <input
                  value={form.patron_inicio || ''}
                  onChange={(e) => setForm((f) => ({ ...f, patron_inicio: e.target.value }))}
                  placeholder="YYYY-MM-DD"
                />
                <div className="muted" style={{ fontSize: 12 }}>
                  Si dejás vacío, el cálculo puede tomar fecha por defecto.
                </div>
              </div>

              <div className="field">
                <label className="muted">Nota / texto libre</label>
                <input
                  value={form.patron_texto || ''}
                  onChange={(e) => setForm((f) => ({ ...f, patron_texto: e.target.value }))}
                  placeholder="Ej: 5x1 + 2 franco"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {selected ? (
              <button className="btn danger" type="button" onClick={onDelete} disabled={saving}>
                Eliminar
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  )
}
