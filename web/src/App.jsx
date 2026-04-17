import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute";
import Login from "./pages/auth/Login";
import Dashboard from "./pages/superadmin/Dashboard";
import PricingManagement from "./pages/superadmin/PricingManagement";
import Companies from "./pages/superadmin/Companies";
import Users from "./pages/superadmin/Users";
import Subscriptions from "./pages/superadmin/Subscriptions";
import Coupons from "./pages/superadmin/Coupons";
import CompanyOverrides from "./pages/superadmin/CompanyOverrides";
import Revenue from "./pages/superadmin/Revenue";
import Logs from "./pages/superadmin/Logs";
import Settings from "./pages/superadmin/Settings";
import SupportTickets from "./pages/superadmin/SupportTickets";
import { useAuth } from "./context/AuthContext";
import "./App.css";

function HomeRedirect() {
    const { isAuthenticated } = useAuth();
    return (
        <Navigate
            to={isAuthenticated ? "/superadmin/dashboard" : "/login"}
            replace
        />
    );
}

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
                <Route path="/superadmin/dashboard" element={<Dashboard />} />
                <Route
                    path="/superadmin/pricing"
                    element={<PricingManagement />}
                />
                <Route path="/superadmin/companies" element={<Companies />} />
                <Route path="/superadmin/users" element={<Users />} />
                <Route
                    path="/superadmin/subscriptions"
                    element={<Subscriptions />}
                />
                <Route path="/superadmin/coupons" element={<Coupons />} />
                <Route
                    path="/superadmin/overrides"
                    element={<CompanyOverrides />}
                />
                <Route path="/superadmin/revenue" element={<Revenue />} />
                <Route path="/superadmin/logs" element={<Logs />} />
                <Route path="/superadmin/support" element={<SupportTickets />} />
                <Route path="/superadmin/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<HomeRedirect />} />
        </Routes>
    );
}
