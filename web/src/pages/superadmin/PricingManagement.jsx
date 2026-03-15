import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/PricingManagement.css";

const PLAN_PRESETS = {
  free: {
    code: "FREE",
    name: "Free",
    basePrice: "0",
    trialDays: "14",
    maxAdmins: "1",
    maxStaff: "1",
    features: ["Basic CRM", "Lead Capture"],
  },
  basic: {
    code: "BASIC",
    name: "Basic",
    basePrice: "84",
    trialDays: "7",
    maxAdmins: "1",
    maxStaff: "2",
    features: ["Basic CRM", "Lead Capture", "Follow-ups"],
  },
  pro: {
    code: "PRO",
    name: "Pro",
    basePrice: "199",
    trialDays: "7",
    maxAdmins: "2",
    maxStaff: "10",
    features: ["Basic CRM", "Lead Capture", "Follow-ups", "Call Logs", "Reports"],
  },
  enterprise: {
    code: "ENTERPRISE",
    name: "Enterprise",
    basePrice: "499",
    trialDays: "14",
    maxAdmins: "5",
    maxStaff: "100",
    features: ["Basic CRM", "Lead Capture", "Follow-ups", "Call Logs", "Reports", "Priority Support"],
  },
};

const FEATURE_OPTIONS = [
  "Basic CRM",
  "Lead Capture",
  "Follow-ups",
  "Call Logs",
  "Reports",
  "Priority Support",
  "WhatsApp Integration",
  "API Access",
];

const emptyForm = {
  code: "",
  name: "",
  basePrice: "",
  trialDays: "",
  maxAdmins: "",
  maxStaff: "",
  features: "",
  isActive: true,
};

const toPayload = (form) => ({
  ...form,
  basePrice: Number(form.basePrice || 0),
  trialDays: Number(form.trialDays || 0),
  maxAdmins: Number(form.maxAdmins || 0),
  maxStaff: Number(form.maxStaff || 0),
  features: (form.features || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
});

const formatCurrency = (value, currency) => {
  const amount = Number(value || 0);
  const safeCurrency = currency === "USD" ? "USD" : "INR";
  const locale = safeCurrency === "INR" ? "en-IN" : "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: safeCurrency,
      maximumFractionDigits: safeCurrency === "USD" ? 2 : 0,
    }).format(amount);
  } catch (_e) {
    const symbol = safeCurrency === "INR" ? "₹" : "$";
    return `${symbol}${amount.toLocaleString()}`;
  }
};

export default function PricingManagement() {
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const formatPrice = (value) => formatCurrency(value, "USD");

  const load = async () => {
    try {
      setError("");
      const res = await api.getPlans();
      setPlans(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e.message || "Failed to load plans");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const applyPreset = (value) => {
    setPreset(value);
    if (!value || !PLAN_PRESETS[value]) return;

    const next = PLAN_PRESETS[value];
    setForm((prev) => ({
      ...prev,
      code: next.code,
      name: next.name,
      basePrice: next.basePrice,
      trialDays: next.trialDays,
      maxAdmins: next.maxAdmins,
      maxStaff: next.maxStaff,
      features: next.features.join(", "),
    }));
  };

  const toggleFeature = (feature) => {
    const current = (form.features || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const exists = current.includes(feature);
    const next = exists ? current.filter((f) => f !== feature) : [...current, feature];
    setForm({ ...form, features: next.join(", ") });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updatePlan(editingId, toPayload(form));
      } else {
        await api.createPlan(toPayload(form));
      }

      setForm(emptyForm);
      setPreset("");
      setEditingId(null);
      setShowForm(false);
      await load();
    } catch (e) {
      setError(e.message || "Failed to save plan");
    }
  };

  const startEdit = (plan) => {
    setEditingId(plan._id);
    setPreset("");
    setShowForm(true);
    setForm({
      code: plan.code || "",
      name: plan.name || "",
      basePrice: String(plan.basePrice ?? ""),
      trialDays: String(plan.trialDays ?? ""),
      maxAdmins: String(plan.maxAdmins ?? ""),
      maxStaff: String(plan.maxStaff ?? ""),
      features: (plan.features || []).join(", "),
      isActive: Boolean(plan.isActive),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setPreset("");
    setForm(emptyForm);
    setShowForm(false);
  };

  const toggleActive = async (plan) => {
    try {
      await api.updatePlan(plan._id, { isActive: !plan.isActive });
      await load();
    } catch (e) {
      setError(e.message || "Failed to update plan status");
    }
  };

  const deletePlan = async (plan) => {
    if (!globalThis.confirm?.(`Delete plan ${plan.name}?`)) return;
    try {
      await api.deletePlan(plan._id);
      if (editingId === plan._id) cancelEdit();
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete plan");
    }
  };

  const metrics = useMemo(() => {
    const total = plans.length;
    const active = plans.filter((p) => p.isActive).length;
    const totalPrice = plans.reduce((sum, p) => sum + Number(p.basePrice || 0), 0);
    const averagePrice = total ? totalPrice / total : 0;
    return {
      total,
      active,
      inactive: total - active,
      averagePrice,
    };
  }, [plans]);

  const featureChips = useMemo(
    () =>
      (form.features || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    [form.features],
  );

  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Plan Name" },
    { key: "basePriceLabel", label: "Base Price" },
    { key: "limitsLabel", label: "Limits" },
    { key: "trialDaysLabel", label: "Trial" },
    { key: "featuresLabel", label: "Features" },
    {
      key: "isActiveLabel",
      label: "Status",
      render: (value) => (
        <span className={`pm-status-badge ${value === "Active" ? "is-active" : "is-inactive"}`}>
          {value}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_v, row) => (
        <div className="pm-actions">
          <button type="button" className="pm-action-btn" onClick={() => startEdit(row)}>
            Edit
          </button>
          <button type="button" className="pm-action-btn" onClick={() => toggleActive(row)}>
            {row.isActive ? "Disable" : "Enable"}
          </button>
          <button type="button" className="pm-action-btn danger" onClick={() => deletePlan(row)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

	  const rows = plans.map((p) => ({
	    ...p,
	    basePriceLabel: formatPrice(p.basePrice),
	    limitsLabel: `${Number(p.maxAdmins || 0)} admins / ${Number(p.maxStaff || 0)} staff`,
	    trialDaysLabel: `${Number(p.trialDays || 0)} days`,
	    featuresLabel: (p.features || []).slice(0, 3).join(", ") || "-",
	    isActiveLabel: p.isActive ? "Active" : "Inactive",
	  }));

	  return (
	    <div className="admin-shell">
	      <Sidebar />
	      <div className="admin-main">
	        <Header title="Pricing Management" />
	        <main className="page-content pricing-management-page">
	          {error ? <div className="error-box">{error}</div> : null}

	          <section className="pm-hero-card">
	            <div className="pm-hero-copy">
	              <div>
	                <h2>Plan Configuration</h2>
	                <p>Design pricing tiers with clear limits, feature bundles, and activation controls.</p>
	              </div>
	              <div className="pm-hero-actions">
	                <button
	                  type="button"
	                  className="pm-btn pm-btn-primary"
	                  onClick={() => {
	                    setEditingId(null);
	                    setPreset("");
	                    setForm(emptyForm);
	                    setShowForm((prev) => !prev);
	                  }}
	                >
	                  {showForm && !editingId ? "Close Form" : "Add New Plan"}
	                </button>
	              </div>
	            </div>
	            <div className="pm-metrics">
	              <article className="pm-metric">
	                <span>Total Plans</span>
	                <strong>{metrics.total}</strong>
              </article>
              <article className="pm-metric">
                <span>Active</span>
                <strong>{metrics.active}</strong>
              </article>
	              <article className="pm-metric">
	                <span>Avg Price</span>
	                <strong>{formatPrice(metrics.averagePrice)}</strong>
	              </article>
	            </div>
	          </section>

          {showForm ? (
            <section className="pm-form-card">
              <div className="pm-card-head">
                <h3>{editingId ? "Edit Plan" : "Create Plan"}</h3>
                <p>{editingId ? "Update an existing tier." : "Add a new pricing tier for companies."}</p>
              </div>

              <form className="pm-form-grid" onSubmit={submit}>
                {!editingId ? (
                  <label className="pm-field pm-field-full">
                    <span>Preset Template</span>
                    <select aria-label="Plan preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
                      <option value="">Choose plan type</option>
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </label>
                ) : null}

                <label className="pm-field">
                  <span>Plan Code</span>
                  <input
                    placeholder="BASIC"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    required
                  />
                </label>

	                <label className="pm-field">
	                  <span>Plan Name</span>
	                  <input
	                    placeholder="Basic"
	                    value={form.name}
	                    onChange={(e) => setForm({ ...form, name: e.target.value })}
	                    required
	                  />
	                </label>


		                <label className="pm-field">
		                  <span>Base Price (USD)</span>
		                  <input
                    type="number"
                    placeholder="199"
                    value={form.basePrice}
                    onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                    required
                  />
                </label>

                <label className="pm-field">
                  <span>Trial Days</span>
                  <input
                    type="number"
                    placeholder="7"
                    value={form.trialDays}
                    onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                  />
                </label>

                <label className="pm-field">
                  <span>Max Admins</span>
                  <input
                    type="number"
                    placeholder="2"
                    value={form.maxAdmins}
                    onChange={(e) => setForm({ ...form, maxAdmins: e.target.value })}
                  />
                </label>

                <label className="pm-field">
                  <span>Max Staff</span>
                  <input
                    type="number"
                    placeholder="10"
                    value={form.maxStaff}
                    onChange={(e) => setForm({ ...form, maxStaff: e.target.value })}
                  />
                </label>

                <label className="pm-field pm-field-full">
                  <span>Features (comma separated)</span>
                  <input
                    placeholder="Basic CRM, Follow-ups"
                    value={form.features}
                    onChange={(e) => setForm({ ...form, features: e.target.value })}
                  />
                </label>

                <label className="pm-field pm-field-full">
                  <span>Quick Add Feature</span>
                  <select
                    aria-label="Quick add feature"
                    onChange={(e) => {
                      if (e.target.value) toggleFeature(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Select a feature</option>
                    {FEATURE_OPTIONS.map((feature) => (
                      <option key={feature} value={feature}>
                        {feature}
                      </option>
                    ))}
                  </select>
                </label>

                {featureChips.length ? (
                  <div className="pm-feature-chips pm-field-full">
                    {featureChips.map((feature) => (
                      <span key={feature} className="pm-chip">
                        {feature}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="pm-form-actions pm-field-full">
                  <button type="button" className="pm-btn pm-btn-muted" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button type="submit" className="pm-btn pm-btn-primary">
                    {editingId ? "Update Plan" : "Save Plan"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="pm-table-card">
            <div className="pm-card-head">
              <h3>Plan List</h3>
              <p>{rows.length} plans configured</p>
            </div>
            <DataTable columns={columns} rows={rows} />
          </section>
        </main>
      </div>
    </div>
  );
}
