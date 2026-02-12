const AUTH_TOKEN_KEY = 'km325_token'
const AUTH_USER_KEY = 'km325_user'

export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user || {}))
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}
