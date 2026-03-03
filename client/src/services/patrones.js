import api from '../lib/api.js'

export async function listPatrones() {
  // legacy devuelve array directo
  const res = await api.get('/api/patrones')
  return Array.isArray(res) ? res : res?.patrones || []
}
