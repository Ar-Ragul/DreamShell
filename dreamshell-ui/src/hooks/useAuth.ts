// src/hooks/useAuth.ts
import { useEffect, useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

/* ========================= Types ========================= */
export type User = {
  id: string;
  email: string;
  verified: boolean;
  created_at: string;
} | null;

/* ========================= Hook ========================= */
export function useAuth() {
  const [user, setUser] = useState<User>(null);
  const [checking, setChecking] = useState(true);

  // Check current session using the stored JWT
  const refresh = useCallback(async () => {
    try {
      const r = await authFetch(`${API_BASE}/auth/me`);
      if (r.ok) {
        const u = await r.json();
        setUser(u ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = () => {
    clearToken();
    setUser(null);
  };

  /** Call this right after a successful login/signup */
  const storeLogin = (token: string, persist: boolean) => {
    setToken(token, persist);
    refresh(); // re-fetch /auth/me to populate user
  };

  return { user, checking, refresh, logout, storeLogin };
}

/* =========================
   Auth utilities (single source of truth)
========================= */
const TOKEN_KEY = "dreamshell_jwt";
const SCOPE_KEY = "dreamshell_token_scope"; // "local" | "session"

export function getToken(): string | null {
  const scope = localStorage.getItem(SCOPE_KEY);
  if (scope === "session") return sessionStorage.getItem(TOKEN_KEY);
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, persist: boolean) {
  // clear any previous token in both places
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);

  if (persist) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SCOPE_KEY, "local");
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(SCOPE_KEY, "session");
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SCOPE_KEY);
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
