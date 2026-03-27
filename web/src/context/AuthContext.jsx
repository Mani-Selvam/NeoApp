import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

const AuthContext = createContext(null);
const SESSION_EXPIRY_KEY = "sessionExpiresAt";

const readSessionExpiry = () => {
  const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
  const ts = Number(raw || 0);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [sessionExpiresAt, setSessionExpiresAt] = useState(() => readSessionExpiry());

  const clearSessionState = useCallback(() => {
    localStorage.removeItem("user");
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    setUser(null);
    setSessionExpiresAt(0);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.superadminLogout();
    } catch (_error) {
      // clear local session state even if the cookie is already gone
    } finally {
      clearSessionState();
    }
  }, [clearSessionState]);

  const login = useCallback((nextUser, sessionTimeoutMinutes = 30) => {
    const timeout = Number(sessionTimeoutMinutes || 30);
    const safeTimeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 30;
    const expiry = Date.now() + safeTimeout * 60 * 1000;

    localStorage.setItem("user", JSON.stringify(nextUser));
    localStorage.setItem(SESSION_EXPIRY_KEY, String(expiry));
    setUser(nextUser);
    setSessionExpiresAt(expiry);
  }, []);

  useEffect(() => {
    if (!user || !sessionExpiresAt) return;

    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      clearSessionState();
      return;
    }

    const timer = window.setTimeout(() => {
      clearSessionState();
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [user, sessionExpiresAt, clearSessionState]);

  const isSessionExpired =
    Boolean(user) && Boolean(sessionExpiresAt) && sessionExpiresAt <= Date.now();

  const value = useMemo(
    () => ({
      user,
      sessionExpiresAt,
      isAuthenticated: Boolean(user) && !isSessionExpired,
      login,
      logout,
    }),
    [user, sessionExpiresAt, isSessionExpired, login, logout],
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
