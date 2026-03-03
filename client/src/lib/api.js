const API_BASE = import.meta.env.VITE_API_BASE || "";

function getToken() {
  return localStorage.getItem("km325_token") || localStorage.getItem("token") || "";
}

function withParams(url, params) {
  if (!params) return url;
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.append(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
}

async function request(method, url, body, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const finalUrl = withParams(url, opts.params);

  const res = await fetch(`${API_BASE}${finalUrl}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

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
  get: (url, opts) => request("GET", url, undefined, opts),
  del: (url, opts) => request("DELETE", url, undefined, opts),
  post: (url, body, opts) => request("POST", url, body, opts),
  patch: (url, body, opts) => request("PATCH", url, body, opts),
  put: (url, body, opts) => request("PUT", url, body, opts),
};

export default api;

export async function apiJson(url, opts = {}) {
  const method = opts.method || "GET";
  const body = opts.body ? JSON.parse(opts.body) : undefined;

  if (method === "GET") return api.get(url);
  if (method === "POST") return api.post(url, body);
  if (method === "PATCH") return api.patch(url, body);
  if (method === "PUT") return api.put(url, body);
  if (method === "DELETE") return api.del(url);

  return api.get(url);
}