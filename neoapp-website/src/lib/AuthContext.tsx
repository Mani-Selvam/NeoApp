import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { io } from "socket.io-client";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  company_id: string;
  mobile?: string;
  logo?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

let fetchPatched = false;
function setupFetchInterceptor() {
  if (fetchPatched) return;
  fetchPatched = true;
  
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      try {
        const clone = response.clone();
        const data = await clone.json();
        if (data?.code === "SESSION_REVOKED") {
          window.dispatchEvent(new CustomEvent("session_revoked"));
        }
      } catch (e) {
        // ignore json parse error
      }
    }
    return response;
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("neoapp_token");
    const storedUser = localStorage.getItem("neoapp_user");
    
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user from local storage");
      }
    }
  }, []);

  useEffect(() => {
    setupFetchInterceptor();

    const handleSessionRevoked = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem("neoapp_token");
      localStorage.removeItem("neoapp_user");
      
      toast({
        title: "Session Expired",
        description: "You have been logged out because your account was logged in from another device.",
        variant: "destructive",
      });
      
      // Navigate to home if on a protected route
      if (window.location.pathname.startsWith('/dashboard')) {
        window.location.href = "/";
      }
    };

    window.addEventListener("session_revoked", handleSessionRevoked);
    return () => {
      window.removeEventListener("session_revoked", handleSessionRevoked);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
    
    const socket = io(API_BASE, {
      auth: {
        token: `Bearer ${token}`
      }
    });

    socket.on("FORCE_LOGOUT", () => {
      window.dispatchEvent(new CustomEvent("session_revoked"));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem("neoapp_token", newToken);
    localStorage.setItem("neoapp_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("neoapp_token");
    localStorage.removeItem("neoapp_user");
  };

  const updateUser = (updatedFields: Partial<User>) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      const newUser = { ...prevUser, ...updatedFields };
      localStorage.setItem("neoapp_user", JSON.stringify(newUser));
      return newUser;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUser,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
