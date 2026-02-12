import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "./api.js";

const AuthCtx = createContext(null);

const TOKEN_KEY = "km325_token";

export function hasRole(user, roles) {
  if (!roles || roles.length === 0) return true;
  if (!user?.role) return false;
  return roles.includes(user.role);
}

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);

  async function refreshMe() {
    try {
      const me = await api.get("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    refreshMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(username, password) {
    const res = await api.post("/api/auth/login", { username, password });
    // res puede venir como { token } o { accessToken } según backend
    const token = res?.token || res?.accessToken;
    if (!token) throw new Error("Login ok pero no llegó token");
    localStorage.setItem(TOKEN_KEY, token);
    await refreshMe();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  const value = useMemo(() => ({ ready, user, login, logout, refreshMe }), [ready, user]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
