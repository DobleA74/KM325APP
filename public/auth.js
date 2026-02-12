console.log("✅ auth.js cargado");

const AUTH_TOKEN_KEY = "km325_token";
const AUTH_USER_KEY = "km325_user";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || {}));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function ensureAuth() {
  const token = getToken();
  if (!token) {
    // evita loop si ya estás en login
    if (!location.pathname.endsWith("/login.html")) {
      location.replace("/login.html");
    }
    return false;
  }
  return true;
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    location.replace("/login.html");
    throw new Error("No autenticado");
  }

  return res;
}

// Exponer por si lo usás en otros scripts
window.ensureAuth = ensureAuth;
window.authFetch = authFetch;
window.setSession = setSession;
window.clearSession = clearSession;
