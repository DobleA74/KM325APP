import api from "../lib/api";

export const LEGACY_ORIGIN = import.meta.env.DEV ? "http://localhost:3001" : "";

export function legacyEmpleadosUrl() {
  return `${LEGACY_ORIGIN}/abm-empleados.html`;
}

export async function getPuestosCatalogo() {
  const r = await api.get("/api/puestos/catalogo");
  // backend devuelve {ok, items}
  return r?.items || [];
}


export async function listEmpleados() {
  return api.get("/api/empleados");
}

export async function getEmpleado(legajo) {
  return api.get(`/api/empleados/${encodeURIComponent(legajo)}`);
}

// Crea el registro base (compatibilidad legacy). Campos extra se mandan por patch.
export async function createEmpleadoBase(payload) {
  return api.post("/api/empleados", payload);
}

export async function patchEmpleado(legajo, payload) {
  return api.patch(`/api/empleados/${encodeURIComponent(legajo)}`, payload);
}

export async function replaceFamiliares(legajo, familiares) {
  return api.put(`/api/empleados/${encodeURIComponent(legajo)}/familiares`, familiares);
}

export async function deleteEmpleado(legajo) {
  return api.del(`/api/empleados/${encodeURIComponent(legajo)}`);
}

export function emptyEmpleado() {
  return {
    legajo: "",
    nombre: "",
    sector: "playa",
    categoria: "",
    puesto: "",
    activo: 1,

    // Datos personales
    domicilio: "",
    localidad: "",
    cuil: "",
    dni: "",
    estudios: "",
    estado_civil: "",
    fecha_nacimiento: "",
    telefono_fijo: "",
    telefono_celular: "",
    email: "",
    nacionalidad: "",
    gremio: "",
    basico: "",
    es_jubilado: 0,

    // Datos laborales
    fecha_ingreso: "",
    lugar_trabajo: "",
    obra_social: "",
    cbu: "",
    banco: "",
    talle_pantalon: "",
    talle_camisa: "",
    numero_botines: "",

    // Familiares
    familiares: [],
  };
}

export function normalizeBasicoToNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else {
    const parts = s.split(".");
    if (parts.length > 2) {
      const dec = parts.pop();
      s = parts.join("") + "." + dec;
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
