import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/CompanyOverrides.css";

const INITIAL_FORM = {
  companyId: "",
  pricingOption: "",
  customPrice: "",
  customMaxStaff: "",
  customTrialDays: "",
  customExpiry: "",
  isActive: true,
  notes: "",
};

export default function CompanyOverrides() {
  const [overrides, setOverrides] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try {
      const [overrideData, companyData, planData] = await Promise.all([
        api.getOverrides(),
        api.getSuperadminCompanies(),
        api.getPlans(),
      ]);
      setOverrides(overrideData);
      setCompanies(companyData);
      setPlans(planData.filter((x) => x.isActive));
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load overrides");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(INITIAL_FORM);
    setEditingId("");
    setShowForm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        companyId: form.companyId,
        targetPlanId: form.pricingOption || null,
        customPrice: form.customPrice === "" ? null : Number(form.customPrice),
        customMaxStaff: form.customMaxStaff === "" ? null : Number(form.customMaxStaff),
        customTrialDays: form.customTrialDays === "" ? null : Number(form.customTrialDays),
        customExpiry: form.customExpiry || null,
        isActive: Boolean(form.isActive),
        notes: form.notes || "",
      };

      await api.upsertOverride(payload);
      resetForm();
      await load();
    } catch (e) {
      setError(e.message || "Failed to save override");
    }
  };

  const applyPricingOption = (planId) => {
    if (!planId) {
      setForm((prev) => ({ ...prev, pricingOption: "" }));
      return;
    }

    const selectedPlan = plans.find((p) => p._id === planId);
    if (!selectedPlan) return;

    setForm((prev) => ({
      ...prev,
      pricingOption: planId,
      customPrice: selectedPlan.basePrice == null ? "" : String(selectedPlan.basePrice),
      customMaxStaff: selectedPlan.maxStaff == null ? "" : String(selectedPlan.maxStaff),
      customTrialDays: selectedPlan.trialDays == null ? "" : String(selectedPlan.trialDays),
    }));
  };

  const startEdit = (override) => {
    setEditingId(override._id);
    setShowForm(true);
    setForm({
      companyId: override.companyId?._id || override.companyId || "",
      pricingOption: override.targetPlanId?._id || override.targetPlanId || "",
      customPrice: override.customPrice == null ? "" : String(override.customPrice),
      customMaxStaff: override.customMaxStaff == null ? "" : String(override.customMaxStaff),
      customTrialDays: override.customTrialDays == null ? "" : String(override.customTrialDays),
      customExpiry: override.customExpiry ? new Date(override.customExpiry).toISOString().split("T")[0] : "",
      isActive: override.isActive !== false,
      notes: override.notes || "",
    });
  };

  const toggleActive = async (override) => {
    try {
      await api.upsertOverride({
        companyId: override.companyId?._id || override.companyId,
        targetPlanId: override.targetPlanId?._id || override.targetPlanId || null,
        customPrice: override.customPrice ?? null,
        customMaxStaff: override.customMaxStaff ?? null,
        customTrialDays: override.customTrialDays ?? null,
        customExpiry: override.customExpiry ?? null,
        notes: override.notes || "",
        isActive: !(override.isActive !== false),
      });
      await load();
    } catch (e) {
      setError(e.message || "Failed to update override status");
    }
  };

  const removeOverride = async (override) => {
    if (!globalThis.confirm?.(`Delete override for ${override.companyId?.name || "this company"}?`)) return;
    try {
      await api.deleteOverride(override._id);
      if (editingId === override._id) resetForm();
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete override");
    }
  };

  const rows = useMemo(
    () =>
      overrides
        .map((override) => ({
          id: override._id,
          raw: override,
          company: override.companyId?.name || "-",
          targetPlan: override.targetPlanId?.name || "All Plans",
          customPrice: override.customPrice == null ? "-" : `$${override.customPrice}`,
          customMaxStaff: override.customMaxStaff == null ? "-" : override.customMaxStaff,
          customTrialDays: override.customTrialDays == null ? "-" : override.customTrialDays,
          customExpiry: override.customExpiry ? new Date(override.customExpiry).toLocaleDateString() : "-",
          status: override.isActive !== false ? "Active" : "Inactive",
          notes: override.notes || "-",
        }))
        .filter((item) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return (
            String(item.company || "").toLowerCase().includes(q) ||
            String(item.targetPlan || "").toLowerCase().includes(q) ||
            String(item.notes || "").toLowerCase().includes(q)
          );
        }),
    [overrides, search],
  );

  const columns = [
    { key: "company", label: "Company" },
    { key: "targetPlan", label: "Override Plan" },
    { key: "customPrice", label: "Custom Price" },
    { key: "customMaxStaff", label: "Max Staff" },
    { key: "customTrialDays", label: "Trial Days" },
    { key: "customExpiry", label: "Expiry" },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <span className={`status-badge ${String(value).toLowerCase() === "active" ? "is-active" : "is-warning"}`}>
          {value}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_value, row) => (
        <div className="table-actions">
          <button type="button" className="icon-btn" onClick={() => startEdit(row.raw)}>Edit</button>
          <button type="button" className="icon-btn" onClick={() => toggleActive(row.raw)}>
            {row.raw.isActive !== false ? "Disable" : "Enable"}
          </button>
          <button type="button" className="icon-btn danger" onClick={() => removeOverride(row.raw)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Company Overrides" />
        <main className="page-content company-overrides-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card company-overrides-toolbar">
            <input
              type="search"
              placeholder="Search company, plan, notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="company-overrides-toolbar-actions">
              <button type="button" onClick={load}>Refresh</button>
              <button
                type="button"
                className="company-overrides-add-btn"
                onClick={() => {
                  setEditingId("");
                  setForm(INITIAL_FORM);
                  setShowForm((prev) => !prev);
                }}
              >
                {showForm && !editingId ? "Close Form" : "Add New Override"}
              </button>
            </div>
          </section>

          {showForm ? (
            <form className="settings-card form-grid" onSubmit={submit}>
              <h3>{editingId ? "Edit Override" : "Create / Update Override"}</h3>
              <select
                aria-label="Company"
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                required
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company._id} value={company._id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Pricing option"
                value={form.pricingOption}
                onChange={(e) => applyPricingOption(e.target.value)}
              >
                <option value="">Select pricing option (optional)</option>
                {plans.map((plan) => (
                  <option key={plan._id} value={plan._id}>
                    {plan.name} ({plan.code}) - ${Number(plan.basePrice || 0)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                placeholder="Custom Price"
                value={form.customPrice}
                onChange={(e) => setForm({ ...form, customPrice: e.target.value })}
              />
              <input
                type="number"
                placeholder="Custom Max Staff"
                value={form.customMaxStaff}
                onChange={(e) => setForm({ ...form, customMaxStaff: e.target.value })}
              />
              <input
                type="number"
                placeholder="Custom Trial Days"
                value={form.customTrialDays}
                onChange={(e) => setForm({ ...form, customTrialDays: e.target.value })}
              />
              <input
                type="date"
                title="Override Expiry Date"
                value={form.customExpiry}
                onChange={(e) => setForm({ ...form, customExpiry: e.target.value })}
              />
              <label className="toggle-input" htmlFor="override-active-toggle">
                <input
                  id="override-active-toggle"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
              <input
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <button type="submit">{editingId ? "Update Override" : "Save Override"}</button>
              <button type="button" onClick={resetForm}>
                Cancel
              </button>
            </form>
          ) : null}

          <DataTable columns={columns} rows={rows} />
        </main>
      </div>
    </div>
  );
}
