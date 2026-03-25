import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = { email, password };
      if (otp.trim()) payload.otp = otp.trim();
      const res = await api.superadminLogin(payload);
      login(res.token, res.user, res.sessionTimeoutMinutes);
      const redirectPath = location.state?.from?.pathname || "/superadmin/dashboard";
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-orb login-orb-one" aria-hidden="true" />
      <div className="login-orb login-orb-two" aria-hidden="true" />
      <div className="login-shell">
        <section className="login-showcase">
          <p className="login-kicker">NeoApp Workspace</p>
          <h1>Control your operations from one secure command center.</h1>
          <p>
            Access pricing, subscriptions, companies, and users with a mobile-first superadmin dashboard.
          </p>
          <div className="login-showcase-stats">
            <article>
              <span>Live Metrics</span>
              <strong>24/7</strong>
            </article>
            <article>
              <span>Security</span>
              <strong>Role Based</strong>
            </article>
            <article>
              <span>Performance</span>
              <strong>Fast UI</strong>
            </article>
          </div>
        </section>

        <form className="login-form" onSubmit={onSubmit}>
          <h2>NeoApp Super Admin</h2>
          <p>Login with your email and password</p>

          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="admin@neoapp.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <label className="login-field">
            <span>2FA OTP (if enabled)</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
