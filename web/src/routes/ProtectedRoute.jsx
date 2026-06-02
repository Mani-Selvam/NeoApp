import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      logout();
    }
  }, [isAuthenticated, logout]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if ((user?.role || "").toLowerCase() !== "superadmin") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
