import { createContext, useContext, useState, useCallback, useEffect } from "react";
import axios from "axios";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: boolean;
  isEditor: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, token: null,
  login: () => {}, logout: () => {},
  isAdmin: false, isEditor: false,
});

const TOKEN_KEY = "dv_token";
const USER_KEY  = "dv_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const user  = localStorage.getItem(USER_KEY);
      if (token && user) return { token, user: JSON.parse(user) };
    } catch {}
    return { token: null, user: null };
  });

  // Keep axios default header in sync
  useEffect(() => {
    if (state.token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${state.token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [state.token]);

  const login = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    setState({ token, user });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete axios.defaults.headers.common["Authorization"];
    setState({ token: null, user: null });
  }, []);

  const isAdmin  = state.user?.role === "admin";
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
