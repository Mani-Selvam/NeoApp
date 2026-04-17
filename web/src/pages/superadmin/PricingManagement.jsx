import { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/DataTable";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import { api } from "../../services/api";
import "../../styles/superadmin/PricingManagement.css";

const FIXED_PLANS = [
  {
    code: "FREE",
    name: "Free CRM",
    description: "Core CRM access for smaller teams.",
    features: [
      "Lead Sources",
      "Products",
      "Admin / Staff",
      "Targets",
      "Help & Support",
      "Enquiries",
      "Follow-ups",
      "Reports",
    ],
  },
  {
    code: "BASIC",
    name: "Basic CRM",
    description: "Free CRM plus calling and team collaboration.",
    features: [
      "Lead Sources",
      "Products",
      "Admin / Staff",
      "Targets",
      "Help & Support",
      "Enquiries",
      "Follow-ups",
      "Reports",
      "Calls",
      "Team Chat",
    ],
  },
  {
    code: "PRO",
    name: "Pro CRM",
    description: "Basic CRM plus WhatsApp and email.",
    features: [
      "Lead Sources",
      "Products",
      "Admin / Staff",
      "Targets",
      "Help & Support",
      "Enquiries",
      "Follow-ups",
      "Reports",
      "Calls",
      "Team Chat",
      "WhatsApp",
      "Email",
    ],
  },
];

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (_error) {
    return `$${amount.toFixed(2)}`;
  }
};

const toPayload = (form) => ({
  basePrice: Number(form.basePrice || 0),
  trialDays: Number(form.trialDays || 0),
  maxAdmins: Number(form.maxAdmins || 0),
  maxStaff: Number(form.maxStaff || 0),
  extraAdminPrice: Number(form.extraAdminPrice || 0),
  extraStaffPrice: Number(form.extraStaffPrice || 0),
  isActive: Boolean(form.isActive),
});

const buildInitialForm = (plan) => ({
  code: plan.code || "",
  name: plan.name || "",
  basePrice: String(plan.basePrice ?? ""),
  trialDays: String(plan.trialDays ?? ""),
  maxAdmins: String(plan.maxAdmins ?? ""),
  maxStaff: String(plan.maxStaff ?? ""),
  extraAdminPrice: String(plan.extraAdminPrice ?? ""),
  extraStaffPrice: String(plan.extraStaffPrice ?? ""),
  isActive: Boolean(plan.isActive),
});

export default function PricingManagement() {
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [form, setForm] = useState(null);

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

  const planMap = useMemo(
    () => new Map(plans.map((plan) => [String(plan.code || "").toUpperCase(), plan])),
    [plans],
  );

  const viewPlans = useMemo(
    () =>
      FIXED_PLANS.map((preset) => {
        const current = planMap.get(preset.code) || {};
        return {
          ...preset,
          ...current,
          code: preset.code,
          name: preset.name,
          features: preset.features,
        };
      }),
    [planMap],
  );

  const metrics = useMemo(() => {
    const total = viewPlans.length;
    const active = viewPlans.filter((plan) => plan.isActive).length;
    const averagePrice = total
      ? viewPlans.reduce((sum, plan) => sum + Number(plan.basePrice || 0), 0) / total
      : 0;
    return { total, active, averagePrice };
  }, [viewPlans]);

  const startEdit = (plan) => {
    setEditingCode(plan.code);
    setForm(buildInitialForm(plan));
  };

  const cancelEdit = () => {
    setEditingCode("");
    setForm(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const current = planMap.get(editingCode);
    if (!current?._id || !form) return;

    try {
      await api.updatePlan(current._id, toPayload(form));
      cancelEdit();
      await load();
    } catch (e) {
      setError(e.message || "Failed to save plan");
    }
  };

  const toggleActive = async (plan) => {
    const current = planMap.get(plan.code);
    if (!current?._id) return;
    try {
      await api.updatePlan(current._id, { isActive: !plan.isActive });
      await load();
    } catch (e) {
      setError(e.message || "Failed to update plan status");
    }
  };

  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Plan Name" },
    { key: "basePriceLabel", label: "Base Price" },
    { key: "addonPriceLabel", label: "Add-on Pricing" },
    { key: "limitsLabel", label: "Limits" },
    { key: "trialDaysLabel", label: "Trial" },
    { key: "featuresLabel", label: "Included Features" },
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
      render: (_value, row) => (
        <div className="pm-actions">
          <button type="button" className="pm-action-btn" onClick={() => startEdit(row)}>
            Edit
          </button>
          <button type="button" className="pm-action-btn" onClick={() => toggleActive(row)}>
            {row.isActive ? "Disable" : "Enable"}
          </button>
        </div>
      ),
    },
  ];

  const rows = viewPlans.map((plan) => ({
    ...plan,
    basePriceLabel: formatCurrency(plan.basePrice),
    addonPriceLabel: `Admin ${formatCurrency(plan.extraAdminPrice)} / Staff ${formatCurrency(plan.extraStaffPrice)}`,
    limitsLabel: `${Number(plan.maxAdmins || 0)} admins / ${Number(plan.maxStaff || 0)} staff`,
    trialDaysLabel: `${Number(plan.trialDays || 0)} days`,
    featuresLabel: plan.features.join(", "),
    isActiveLabel: plan.isActive ? "Active" : "Inactive",
  }));

  const editingPlan = viewPlans.find((plan) => plan.code === editingCode);

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
                <h2>Fixed Tier Pricing</h2>
                <p>Manage the three live CRM tiers from one place. Pricing, seats, trial days, and active status stay editable while features remain locked to the plan.</p>
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
                <strong>{formatCurrency(metrics.averagePrice)}</strong>
              </article>
            </div>
          </section>

          {editingPlan && form ? (
            <section className="pm-form-card">
              <div className="pm-card-head">
                <h3>Edit {editingPlan.name}</h3>
                <p>The included features below are enforced automatically and cannot be changed here.</p>
              </div>

              <div className="pm-edit-banner">
                <div>
                  <strong>{editingPlan.code}</strong>
                  <span>{editingPlan.description}</span>
                </div>
                <div className="pm-preset-stats">
                  <span>{Number(editingPlan.maxStaff || 0)} Staff</span>
                  <span>{Number(editingPlan.maxAdmins || 0)} Admin</span>
                  <span>{Number(editingPlan.trialDays || 0)} Trial Days</span>
                </div>
              </div>

              <form className="pm-form-grid" onSubmit={submit}>
                <label className="pm-field">
                  <span>Plan Code</span>
                  <input value={form.code} disabled />
                </label>

                <label className="pm-field">
                  <span>Plan Name</span>
                  <input value={form.name} disabled />
                </label>

                <label className="pm-field">
                  <span>Base Price (USD)</span>
                  <input
                    type="number"
                    value={form.basePrice}
                    onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
                    required
                  />
                </label>

                <div className="pm-field pm-field-full">
                  <span>Plan Limits</span>
                  <div className="pm-limit-grid">
                    <label className="pm-field pm-limit-card">
                      <span>Max Staff</span>
                      <input
                        type="number"
                        value={form.maxStaff}
                        onChange={(e) => setForm({ ...form, maxStaff: e.target.value })}
                      />
                    </label>
                    <label className="pm-field pm-limit-card">
                      <span>Max Admins</span>
                      <input
                        type="number"
                        value={form.maxAdmins}
                        onChange={(e) => setForm({ ...form, maxAdmins: e.target.value })}
                      />
                    </label>
                    <label className="pm-field pm-limit-card">
                      <span>Trial Days</span>
                      <input
                        type="number"
                        value={form.trialDays}
                        onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                      />
                    </label>
                  </div>
                </div>

                <label className="pm-field">
                  <span>Extra Admin Price (USD)</span>
                  <input
                    type="number"
                    value={form.extraAdminPrice}
                    onChange={(e) => setForm({ ...form, extraAdminPrice: e.target.value })}
                  />
                </label>

                <label className="pm-field">
                  <span>Extra Staff Price (USD)</span>
                  <input
                    type="number"
                    value={form.extraStaffPrice}
                    onChange={(e) => setForm({ ...form, extraStaffPrice: e.target.value })}
                  />
                </label>

                <label className="pm-field pm-field-full">
                  <span>Included Features</span>
                  <div className="pm-feature-chips">
                    {editingPlan.features.map((feature) => (
                      <span key={`edit-${feature}`} className="pm-chip">
                        {feature}
                      </span>
                    ))}
                  </div>
                </label>

                <label className="pm-field pm-field-full">
                  <span>Status</span>
                  <select
                    value={form.isActive ? "active" : "inactive"}
                    onChange={(e) => setForm({ ...form, isActive: e.target.value === "active" })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>

                <div className="pm-form-actions pm-field-full">
                  <button type="button" className="pm-btn pm-btn-muted" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button type="submit" className="pm-btn pm-btn-primary">
                    Update Plan
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="pm-table-card">
            <div className="pm-card-head">
              <h3>Plan List</h3>
              <p>Select any row to edit pricing and limits without changing the enforced feature bundle.</p>
            </div>
            <DataTable columns={columns} rows={rows} />
          </section>
        </main>
      </div>
    </div>
  );
}
