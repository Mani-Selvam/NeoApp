import { createContext, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);
const SESSION_EXPIRY_KEY = "sessionExpiresAt";

const readSessionExpiry = () => {
  const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
  const ts = Number(raw || 0);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [sessionExpiresAt, setSessionExpiresAt] = useState(() => readSessionExpiry());

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    setToken("");
    setUser(null);
    setSessionExpiresAt(0);
  };

  const login = (nextToken, nextUser, sessionTimeoutMinutes = 30) => {
    const timeout = Number(sessionTimeoutMinutes || 30);
    const safeTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 30;
    const expiry = Date.now() + safeTimeout * 60 * 1000;

    localStorage.setItem("token", nextToken);
    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiry));
    setToken(nextToken);
    setUser(nextUser);
    setSessionExpiresAt(expiry);
  };

  useEffect(() => {
    if (!token || !sessionExpiresAt) return;

    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      logout();
      return;
    }

    const timer = window.setTimeout(() => {
      logout();
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [token, sessionExpiresAt]);

  const isSessionExpired =
    Boolean(token) && Boolean(sessionExpiresAt) && sessionExpiresAt <= Date.now();

  const value = useMemo(
    () => ({
      token,
      user,
      sessionExpiresAt,
      isAuthenticated: Boolean(token) && !isSessionExpired,
      login,
      logout,
    }),
    [token, user, sessionExpiresAt, isSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
