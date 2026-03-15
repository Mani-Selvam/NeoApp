import { useEffect, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import { api } from "../../services/api";
import "../../styles/superadmin/Settings.css";

const tabs = ["general", "security", "billing", "integrations"];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");
  const [workspaceName, setWorkspaceName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState("Asia/Kolkata");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [usdInrRate, setUsdInrRate] = useState("");
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState("");
  const [ratesSaved, setRatesSaved] = useState(false);
  const [securityPolicy, setSecurityPolicy] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [securitySaved, setSecuritySaved] = useState(false);
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaHasSecret, setTwoFaHasSecret] = useState(false);
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState("");
  const [twoFaSecret, setTwoFaSecret] = useState("");
  const [twoFaOtpAuthUrl, setTwoFaOtpAuthUrl] = useState("");
  const [twoFaOtp, setTwoFaOtp] = useState("");
  const [enforce2fa, setEnforce2fa] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState("30");
  const [restrictByIp, setRestrictByIp] = useState(false);
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [passwordMinLength, setPasswordMinLength] = useState("8");
  const [passwordRotationDays, setPasswordRotationDays] = useState("90");
  const [rzpKeyId, setRzpKeyId] = useState("");
  const [rzpKeySecret, setRzpKeySecret] = useState("");
  const [rzpWebhookSecret, setRzpWebhookSecret] = useState("");
  const [rzpInfo, setRzpInfo] = useState(null);
  const [rzpLoading, setRzpLoading] = useState(false);
  const [rzpError, setRzpError] = useState("");
  const [rzpSaved, setRzpSaved] = useState(false);

  useEffect(() => {
    if (activeTab !== "general") return;
    let mounted = true;
    const loadWorkspace = async () => {
      try {
        setWorkspaceSaved(false);
        setWorkspaceError("");
        setWorkspaceLoading(true);
        const res = await api.getWorkspaceSettings();
        const ws = res?.workspace || {};
        if (!mounted) return;
        setWorkspaceName(String(ws?.name || "NeoApp Platform"));
        setSupportEmail(String(ws?.supportEmail || "support@neoapp.com"));
        setDefaultTimezone(String(ws?.defaultTimezone || "Asia/Kolkata"));
      } catch (e) {
        if (mounted) setWorkspaceError(e.message || "Failed to load workspace settings");
      } finally {
        if (mounted) setWorkspaceLoading(false);
      }
    };
    loadWorkspace();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "security") return;
    let mounted = true;
    const loadSecurity = async () => {
      try {
        setSecuritySaved(false);
        setSecurityError("");
        setSecurityLoading(true);
        const res = await api.getSecurityPolicy();
        const policy = res?.policy || null;
        if (!mounted) return;
        setSecurityPolicy(policy);
        setEnforce2fa(Boolean(policy?.enforceSuperadmin2fa));
        setSessionTimeoutMinutes(String(policy?.superadminSessionTimeoutMinutes ?? 30));
        setRestrictByIp(Boolean(policy?.restrictSuperadminLoginsByIp));
        setIpAllowlist(String(policy?.superadminIpAllowlist ?? ""));
        setPasswordMinLength(String(policy?.passwordMinLength ?? 8));
        setPasswordRotationDays(String(policy?.passwordRotationDays ?? 90));

        setTwoFaError("");
        setTwoFaLoading(true);
        const status = await api.getSuperadmin2faStatus();
        if (!mounted) return;
        setTwoFaEnabled(Boolean(status?.twoFactorEnabled));
        setTwoFaHasSecret(Boolean(status?.hasSecret));
        if (status?.repaired) {
          setTwoFaError("2FA was reset because the secret was missing. Generate a new secret and enable again.");
          setTwoFaSecret("");
          setTwoFaOtpAuthUrl("");
          setTwoFaOtp("");
        }
      } catch (e) {
        if (mounted) setSecurityError(e.message || "Failed to load security policy");
      } finally {
        if (mounted) {
          setSecurityLoading(false);
          setTwoFaLoading(false);
        }
      }
    };
    loadSecurity();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "billing") return;
    let mounted = true;
    const loadRates = async () => {
      try {
        setRatesSaved(false);
        setRatesError("");
        setRatesLoading(true);
        const res = await api.getExchangeRates();
        const rate = res?.rates?.USD_INR ?? res?.USD_INR ?? "";
        if (mounted) setUsdInrRate(rate === "" ? "" : String(rate));
      } catch (e) {
        if (mounted) setRatesError(e.message || "Failed to load exchange rates");
      } finally {
        if (mounted) setRatesLoading(false);
      }
    };
    loadRates();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "integrations") return;
    let mounted = true;
    const loadRazorpay = async () => {
      try {
        setRzpSaved(false);
        setRzpError("");
        setRzpLoading(true);
        const res = await api.getRazorpaySettings();
        const rzp = res?.razorpay || null;
        if (!mounted) return;
        setRzpInfo(rzp);
        setRzpKeyId(rzp?.keyId || "");
        setRzpKeySecret("");
        setRzpWebhookSecret("");
      } catch (e) {
        if (mounted) setRzpError(e.message || "Failed to load Razorpay settings");
      } finally {
        if (mounted) setRzpLoading(false);
      }
    };
    loadRazorpay();
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const saveRates = async () => {
    try {
      setRatesSaved(false);
      setRatesError("");
      const next = Number(usdInrRate || 0);
      if (!Number.isFinite(next) || next <= 0) {
        throw new Error("USD→INR rate must be a positive number");
      }
      setRatesLoading(true);
      await api.updateExchangeRates({ USD_INR: next });
      setRatesSaved(true);
    } catch (e) {
      setRatesError(e.message || "Failed to save exchange rates");
    } finally {
      setRatesLoading(false);
    }
  };

  const saveSecurityPolicy = async () => {
    try {
      setSecuritySaved(false);
      setSecurityError("");
      setSecurityLoading(true);
      const payload = {
        enforceSuperadmin2fa: Boolean(enforce2fa),
        superadminSessionTimeoutMinutes: Number(sessionTimeoutMinutes),
        restrictSuperadminLoginsByIp: Boolean(restrictByIp),
        superadminIpAllowlist: String(ipAllowlist || ""),
        passwordMinLength: Number(passwordMinLength),
        passwordRotationDays: Number(passwordRotationDays),
      };
      const res = await api.updateSecurityPolicy(payload);
      const next = res?.policy || null;
      setSecurityPolicy(next);
      setSecuritySaved(true);
    } catch (e) {
      setSecurityError(e.message || "Failed to save security policy");
    } finally {
      setSecurityLoading(false);
    }
  };

  const setup2fa = async () => {
    try {
      setTwoFaError("");
      setTwoFaLoading(true);
      const res = await api.setupSuperadmin2fa();
      setTwoFaSecret(res?.secretBase32 || "");
      setTwoFaOtpAuthUrl(res?.otpauthUrl || "");
      setTwoFaHasSecret(Boolean(res?.secretBase32));
    } catch (e) {
      setTwoFaError(e.message || "Failed to setup 2FA");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const enable2fa = async () => {
    try {
      setTwoFaError("");
      setTwoFaLoading(true);
      const res = await api.enableSuperadmin2fa({ otp: twoFaOtp.trim() });
      setTwoFaEnabled(Boolean(res?.twoFactorEnabled));
      setTwoFaHasSecret(true);
      setTwoFaOtp("");
    } catch (e) {
      setTwoFaError(e.message || "Failed to enable 2FA");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const disable2fa = async () => {
    try {
      setTwoFaError("");
      setTwoFaLoading(true);
      const res = await api.disableSuperadmin2fa({ otp: twoFaOtp.trim() });
      setTwoFaEnabled(Boolean(res?.twoFactorEnabled));
      setTwoFaHasSecret(false);
      setTwoFaSecret("");
      setTwoFaOtpAuthUrl("");
      setTwoFaOtp("");
    } catch (e) {
      setTwoFaError(e.message || "Failed to disable 2FA");
    } finally {
      setTwoFaLoading(false);
    }
  };

  const saveRazorpay = async () => {
    try {
      setRzpSaved(false);
      setRzpError("");
      if (!rzpKeyId.trim()) {
        throw new Error("RAZORPAY_KEY_ID is required");
      }
      setRzpLoading(true);
      const res = await api.updateRazorpaySettings({
        keyId: rzpKeyId.trim(),
        keySecret: rzpKeySecret.trim(),
        webhookSecret: rzpWebhookSecret.trim(),
        syncEnv: true,
      });
      setRzpInfo(res?.razorpay || null);
      setRzpKeySecret("");
      setRzpWebhookSecret("");
      setRzpSaved(true);
    } catch (e) {
      setRzpError(e.message || "Failed to save Razorpay settings");
    } finally {
      setRzpLoading(false);
    }
  };

  const saveWorkspace = async () => {
    try {
      setWorkspaceSaved(false);
      setWorkspaceError("");
      if (!workspaceName.trim()) throw new Error("Workspace name is required");
      setWorkspaceLoading(true);
      const res = await api.updateWorkspaceSettings({
        name: workspaceName.trim(),
        supportEmail: supportEmail.trim(),
        defaultTimezone: defaultTimezone.trim(),
      });
      const ws = res?.workspace || null;
      if (ws) {
        setWorkspaceName(String(ws.name || ""));
        setSupportEmail(String(ws.supportEmail || ""));
        setDefaultTimezone(String(ws.defaultTimezone || ""));
      }
      setWorkspaceSaved(true);
    } catch (e) {
      setWorkspaceError(e.message || "Failed to save workspace settings");
    } finally {
      setWorkspaceLoading(false);
    }
  };

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Settings" />
        <main className="page-content settings-page">
          <section className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`settings-tab ${activeTab === tab ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </section>

          {activeTab === "general" ? (
            <section className="settings-grid">
              <article className="settings-card settings-panel">
                <h3>Workspace Details</h3>
                <div className="settings-fields">
                  <label>
                    Workspace Name
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      disabled={workspaceLoading}
                    />
                  </label>
                  <label>
                    Support Email
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      disabled={workspaceLoading}
                    />
                  </label>
                  <label>
                    Default Timezone
                    <select
                      value={defaultTimezone}
                      onChange={(e) => setDefaultTimezone(e.target.value)}
                      disabled={workspaceLoading}
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <button type="button" onClick={saveWorkspace} disabled={workspaceLoading}>
                    {workspaceLoading ? "Saving..." : "Save Workspace"}
                  </button>
                  {workspaceSaved ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Saved</span> : null}
                </div>
                {workspaceError ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{workspaceError}</div> : null}
              </article>

              <article className="settings-card settings-panel">
                <h3>Operational Preferences</h3>
                <div className="settings-toggles">
                  <label><input type="checkbox" defaultChecked /> Enable usage analytics</label>
                  <label><input type="checkbox" defaultChecked /> Enable onboarding emails</label>
                  <label><input type="checkbox" /> Auto archive inactive companies</label>
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === "security" ? (
            <section className="settings-grid">
              <article className="settings-card settings-panel">
                <h3>Authentication</h3>
                <div className="settings-toggles">
                  <label>
                    <input
                      type="checkbox"
                      checked={enforce2fa}
                      onChange={(e) => setEnforce2fa(e.target.checked)}
                      disabled={securityLoading}
                    />{" "}
                    Enforce 2FA for super admins
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={restrictByIp}
                      onChange={(e) => setRestrictByIp(e.target.checked)}
                      disabled={securityLoading}
                    />{" "}
                    Restrict logins by IP allowlist
                  </label>
                </div>
                <div className="settings-fields" style={{ marginTop: 14 }}>
                  <label>
                    Session timeout (minutes)
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      value={sessionTimeoutMinutes}
                      onChange={(e) => setSessionTimeoutMinutes(e.target.value)}
                      disabled={securityLoading}
                    />
                  </label>
                  <label>
                    Superadmin IP allowlist (comma separated)
                    <input
                      type="text"
                      placeholder="203.0.113.10, 10.0.0.0/24"
                      value={ipAllowlist}
                      onChange={(e) => setIpAllowlist(e.target.value)}
                      disabled={securityLoading || !restrictByIp}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <button type="button" onClick={saveSecurityPolicy} disabled={securityLoading}>
                    {securityLoading ? "Saving..." : "Save Security Policy"}
                  </button>
                  {securitySaved ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Saved</span> : null}
                  {securityPolicy ? (
                    <span style={{ color: "var(--text-soft)", fontWeight: 700, fontSize: 12 }}>
                      Active
                    </span>
                  ) : null}
                </div>
                {securityError ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{securityError}</div> : null}
              </article>

              <article className="settings-card settings-panel">
                <h3>Password Policy</h3>
                <div className="settings-fields">
                  <label>
                    Minimum Length
                    <input
                      type="number"
                      min="8"
                      max="128"
                      value={passwordMinLength}
                      onChange={(e) => setPasswordMinLength(e.target.value)}
                      disabled={securityLoading}
                    />
                  </label>
                  <label>
                    Rotation (days)
                    <input
                      type="number"
                      min="0"
                      max="3650"
                      value={passwordRotationDays}
                      onChange={(e) => setPasswordRotationDays(e.target.value)}
                      disabled={securityLoading}
                    />
                  </label>
                </div>
              </article>

	              <article className="settings-card settings-panel">
	                <h3>2FA (This Account)</h3>
	                <p style={{ marginTop: 6, color: "var(--text-soft)", fontSize: 12 }}>
	                  Status: <strong>{twoFaEnabled ? "Enabled" : "Disabled"}</strong>
	                </p>
	                <p style={{ marginTop: 4, color: "var(--text-soft)", fontSize: 12 }}>
	                  Secret: <strong>{twoFaHasSecret ? "Set" : "Not set"}</strong>
	                </p>
	                <div className="settings-fields" style={{ marginTop: 12 }}>
	                  <label>
	                    OTP Code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={twoFaOtp}
                      onChange={(e) => setTwoFaOtp(e.target.value)}
                      disabled={twoFaLoading}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button type="button" onClick={setup2fa} disabled={twoFaLoading}>
                      {twoFaLoading ? "Working..." : "Generate 2FA Secret"}
                    </button>
                    <button type="button" onClick={enable2fa} disabled={twoFaLoading || !twoFaOtp.trim()}>
                      Enable 2FA
                    </button>
                    <button type="button" onClick={disable2fa} disabled={twoFaLoading || !twoFaEnabled || !twoFaOtp.trim()}>
                      Disable 2FA
                    </button>
                  </div>
                  {twoFaSecret ? (
                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-soft)" }}>
                      Secret (Base32): <code>{twoFaSecret}</code>
                    </div>
                  ) : null}
	                  {twoFaOtpAuthUrl ? (
	                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-soft)" }}>
	                      otpauth URL: <code style={{ wordBreak: "break-all" }}>{twoFaOtpAuthUrl}</code>
	                    </div>
	                  ) : null}
	                  {twoFaHasSecret && !twoFaEnabled && !twoFaSecret ? (
	                    <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-soft)" }}>
	                      Secret is already stored (hidden). Use your Authenticator app code and click{" "}
	                      <strong>Enable 2FA</strong>, or click <strong>Generate 2FA Secret</strong> to reset.
	                    </div>
	                  ) : null}
	                  {twoFaError ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{twoFaError}</div> : null}
	                </div>
                <p style={{ marginTop: 10, color: "var(--text-soft)", fontSize: 12 }}>
                  Enable 2FA on this account first, then turn on <strong>Enforce 2FA</strong> above to require it at login.
                </p>
              </article>
            </section>
          ) : null}

	          {activeTab === "billing" ? (
	            <section className="settings-grid">
	              <article className="settings-card settings-panel">
	                <h3>Exchange Rates</h3>
	                <div className="settings-fields">
	                  <label>
	                    USD→INR
	                    <input
	                      type="number"
	                      min="1"
	                      step="0.01"
	                      placeholder="83"
	                      value={usdInrRate}
	                      onChange={(e) => setUsdInrRate(e.target.value)}
	                      disabled={ratesLoading}
	                    />
	                  </label>
	                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
	                    <button type="button" onClick={saveRates} disabled={ratesLoading}>
	                      {ratesLoading ? "Saving..." : "Save Exchange Rate"}
	                    </button>
	                    {ratesSaved ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Saved</span> : null}
	                  </div>
	                  {ratesError ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{ratesError}</div> : null}
	                </div>
	              </article>

	              <article className="settings-card settings-panel">
	                <h3>Billing Rules</h3>
	                <div className="settings-fields">
                  <label>
                    Invoice Prefix
                    <input type="text" defaultValue="NEO-INV" />
                  </label>
                  <label>
                    Tax Percentage
                    <input type="number" defaultValue="18" />
                  </label>
                </div>
              </article>

              <article className="settings-card settings-panel">
                <h3>Billing Automation</h3>
                <div className="settings-toggles">
                  <label><input type="checkbox" defaultChecked /> Auto-generate invoices</label>
                  <label><input type="checkbox" defaultChecked /> Retry failed payments</label>
                  <label><input type="checkbox" /> Send monthly billing summary</label>
                </div>
              </article>
            </section>
	          ) : null}

          {activeTab === "integrations" ? (
            <section className="settings-grid">
              <article className="settings-card settings-panel">
                <h3>Connected Apps</h3>
                <ul className="settings-integrations">
                  <li><span>Razorpay</span><button type="button">Connected</button></li>
                  <li><span>Twilio</span><button type="button">Configure</button></li>
                  <li><span>Slack Alerts</span><button type="button">Configure</button></li>
                </ul>
              </article>

              <article className="settings-card settings-panel">
                <h3>Razorpay Configuration</h3>
                <p style={{ marginTop: 6, color: "var(--text-soft)", fontSize: 12 }}>
                  Stored in Settings (DB) and also synced to server <code>.env</code>. Leave secrets empty to keep existing.
                </p>
                <div className="settings-fields" style={{ marginTop: 12 }}>
                  <label>
                    RAZORPAY_KEY_ID
                    <input
                      type="text"
                      placeholder="rzp_test_..."
                      value={rzpKeyId}
                      onChange={(e) => setRzpKeyId(e.target.value)}
                      disabled={rzpLoading}
                    />
                  </label>
                  <label>
                    RAZORPAY_KEY_SECRET
                    <input
                      type="password"
                      placeholder={rzpInfo?.keySecretMasked ? rzpInfo.keySecretMasked : "********"}
                      value={rzpKeySecret}
                      onChange={(e) => setRzpKeySecret(e.target.value)}
                      disabled={rzpLoading}
                    />
                  </label>
                  <label>
                    RAZORPAY_WEBHOOK_SECRET
                    <input
                      type="password"
                      placeholder={rzpInfo?.webhookSecretMasked ? rzpInfo.webhookSecretMasked : "********"}
                      value={rzpWebhookSecret}
                      onChange={(e) => setRzpWebhookSecret(e.target.value)}
                      disabled={rzpLoading}
                    />
                  </label>

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button type="button" onClick={saveRazorpay} disabled={rzpLoading}>
                      {rzpLoading ? "Saving..." : "Save Razorpay Keys"}
                    </button>
                    {rzpSaved ? <span style={{ color: "#16a34a", fontWeight: 700 }}>Saved</span> : null}
                    {rzpInfo?.source ? (
                      <span style={{ color: "var(--text-soft)", fontWeight: 700, fontSize: 12 }}>
                        Source: {rzpInfo.source}
                      </span>
                    ) : null}
                  </div>
                  {rzpError ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{rzpError}</div> : null}
                </div>
              </article>

              <article className="settings-card settings-panel">
                <h3>Webhooks</h3>
                <div className="settings-fields">
                  <label>
                    Endpoint URL
                    <input type="url" placeholder="https://example.com/webhook" />
                  </label>
                  <label>
                    Secret Key
                    <input type="password" placeholder="********" />
                  </label>
                </div>
              </article>
            </section>
          ) : null}

	          <div className="settings-actions">
	            <button type="button">Save Changes</button>
	          </div>
	        </main>
	      </div>
	    </div>
  );
}
