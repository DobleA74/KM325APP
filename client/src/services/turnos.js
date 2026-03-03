import api from '../lib/api';

export async function getCalendarioMes({ desde, hasta }) {
  const data = await api.get("/api/calendario/resuelto-mes", {
    params: { desde, hasta },
  });
  return Array.isArray(data) ? data : [];
}

export async function getPuestos() {
  const data = await api.get("/api/puestos");
  return Array.isArray(data) ? data : [];
}