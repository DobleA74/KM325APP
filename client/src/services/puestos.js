import api from '../lib/api.js'

export async function listPuestos(params = {}) {
  const res = await api.get('/api/puestos', { params })
  return res?.items || []
}

export async function upsertPuesto(payload) {
  const res = await api.post('/api/puestos', payload)
  return res
}

export async function deletePuesto(puesto) {
  const p = String(puesto || '').trim()
  if (!p) throw new Error('Puesto inválido')
  const res = await api.del(`/api/puestos/${encodeURIComponent(p)}`)
  return res
}
