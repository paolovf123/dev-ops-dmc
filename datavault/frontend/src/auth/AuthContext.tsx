import { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";
import api from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
}

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  hydrated: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isEditor: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  hydrated: false,
  login: () => {},
  logout: async () => {},
  isAdmin: false,
  isEditor: false,
});

// Envía la cookie httpOnly también en peticiones que usan `axios` global (no solo `api`)
axios.defaults.withCredentials = true;

const USER_KEY = "dv_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const cached = sessionStorage.getItem(USER_KEY);
      if (cached) return { user: JSON.parse(cached), hydrated: false };
    } catch {}
    return { user: null, hydrated: false };
  });

  // Al montar, valida la sesión vía /auth/me (la cookie va sola si existe)
  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthUser>("/auth/me")
      .then((r) => {
        if (cancelled) return;
        sessionStorage.setItem(USER_KEY, JSON.stringify(r.data));
        setState({ user: r.data, hydrated: true });
      })
      .catch(() => {
        if (cancelled) return;
        sessionStorage.removeItem(USER_KEY);
        setState({ user: null, hydrated: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((user: AuthUser) => {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    if (user.role === "admin") localStorage.removeItem("dv_workspace_id");
    setState({ user, hydrated: true });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem("dv_workspace_id");
    setState({ user: null, hydrated: true });
  }, []);

  const isAdmin = state.user?.role === "admin";
  const isEditor = state.user?.role === "admin" || state.user?.role === "editor";

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isAdmin, isEditor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
