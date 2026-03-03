import api from "../lib/api"; 
// Si tu api está en src/api.js en vez de src/lib/api.js, cambiá a:  import api from "../api";

export async function upsertExcepcion(payload) {
  return api.post("/api/calendario/excepciones", payload);
}

export async function deleteExcepcion(id) {
  return api.del(`/api/calendario/excepciones/${id}`);
}