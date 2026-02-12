const API_BASE = import.meta.env.VITE_API_BASE || "";

function getToken() {
  return (
    localStorage.getItem("km325_token") ||
    localStorage.getItem("km325_token") || // por si lo guardaste con otro nombre antes
    localStorage.getItem("km325_token") ||
    ""
  );
}


async function request(method, url, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // si el backend devuelve html por error, igual lo capturamos
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const api = {
  get: (url) => request("GET", url),
  post: (url, body) => request("POST", url, body),
  patch: (url, body) => request("PATCH", url, body),
  put: (url, body) => request("PUT", url, body),
  del: (url) => request("DELETE", url),
};

export default api;
// Compatibilidad con imports viejos
export async function apiJson(url, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : undefined;

  // usamos el api moderno por debajo
  if (method === "GET") return api.get(url);
  if (method === "POST") return api.post(url, body);
  if (method === "PATCH") return api.patch(url, body);
  if (method === "PUT") return api.put(url, body);
  if (method === "DELETE") return api.del(url);

  // fallback
  return api.get(url);
}

