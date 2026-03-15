import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Coupons.css";

const INITIAL_FORM = {
  code: "",
  discountType: "",
  discountValue: "",
  targetPlanId: "__ALL__",
  companyScopeType: "global",
  targetCompanyIds: [],
  expiryDate: "",
  globalUsageLimit: "1",
  perCompanyUsageLimit: "1",
  isActive: true,
};

function formatAmount(value) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatCouponValue(coupon) {
  return coupon.discountType === "percentage"
    ? `${coupon.discountValue}%`
    : formatAmount(coupon.discountValue);
}

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [editingId, setEditingId] = useState("");

  const load = async () => {
    try {
      const [couponData, planData, companyData] = await Promise.all([
        api.getCoupons(),
        api.getPlans(),
        api.getSuperadminCompanies(),
      ]);
      setCoupons(Array.isArray(couponData) ? couponData : []);
      setPlans(Array.isArray(planData) ? planData : []);
      setCompanies(Array.isArray(companyData) ? companyData : []);
      setError("");
    } catch (e) {
      setError(e.message || "Failed to load coupons");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId("");
    setForm(INITIAL_FORM);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();

    try {
      const isAllPlans = form.targetPlanId === "__ALL__";
      const isGlobalCompanyScope = form.companyScopeType === "global";

      if (!isGlobalCompanyScope && form.targetCompanyIds.length === 0) {
        setError("Choose at least one company for a company-specific coupon");
        return;
      }

      const perCompanyLimit = Number(form.perCompanyUsageLimit || 1);
      const computedGlobalLimit = isGlobalCompanyScope
        ? Number(form.globalUsageLimit || 1)
        : Math.max(1, perCompanyLimit * Math.max(1, form.targetCompanyIds.length));

      const payload = {
        code: form.code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue || 0),
        applicablePlans: isAllPlans ? [] : [form.targetPlanId],
        appliesToAllCompanies: isGlobalCompanyScope,
        applicableCompanies: isGlobalCompanyScope ? [] : form.targetCompanyIds,
        expiryDate: form.expiryDate,
        globalUsageLimit: computedGlobalLimit,
        perCompanyUsageLimit: perCompanyLimit,
        isActive: form.isActive,
      };

      if (editingId) {
        await api.updateCoupon(editingId, payload);
      } else {
        await api.createCoupon(payload);
      }

      resetForm();
      await load();
    } catch (e) {
      setError(e.message || `Failed to ${editingId ? "update" : "create"} coupon`);
    }
  };

  const startEdit = (coupon) => {
    setEditingId(coupon._id);
    setForm({
      code: coupon.code || "",
      discountType: coupon.discountType || "",
      discountValue: String(coupon.discountValue ?? ""),
      targetPlanId: coupon.applicablePlans?.length
        ? coupon.applicablePlans?.[0]?._id || coupon.applicablePlans?.[0] || "__ALL__"
        : "__ALL__",
      companyScopeType: coupon.appliesToAllCompanies ? "global" : "company",
      targetCompanyIds: (coupon.applicableCompanies || []).map((company) =>
        typeof company === "string" ? company : company._id,
      ),
      expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate).toISOString().split("T")[0] : "",
      globalUsageLimit: String(coupon.globalUsageLimit ?? coupon.usageLimit ?? 1),
      perCompanyUsageLimit: String(coupon.perCompanyUsageLimit ?? 1),
      isActive: Boolean(coupon.isActive),
    });
    setError("");
  };

  const toggleActive = async (coupon) => {
    try {
      await api.updateCoupon(coupon._id, { isActive: !coupon.isActive });
      await load();
    } catch (e) {
      setError(e.message || "Failed to update coupon status");
    }
  };

  const removeCoupon = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;

    try {
      await api.deleteCoupon(coupon._id);
      if (editingId === coupon._id) resetForm();
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete coupon");
    }
  };

  const metrics = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter((coupon) => coupon.isActive).length;
    const global = coupons.filter((coupon) => coupon.appliesToAllCompanies).length;
    const planSpecific = coupons.filter((coupon) => (coupon.applicablePlans || []).length > 0).length;

    return {
      total,
      active,
      companyScoped: total - global,
      planSpecific,
    };
  }, [coupons]);

  const rows = useMemo(
    () =>
      coupons.map((coupon) => {
        const globalLimit = Number(coupon.globalUsageLimit ?? coupon.usageLimit ?? 1);
        const companyMap = coupon.companyUsageMap || {};
        const companyUsageSummary = Object.entries(companyMap)
          .slice(0, 2)
          .map(([companyId, count]) => {
            const companyName =
              companies.find((entry) => String(entry._id) === String(companyId))?.name || companyId.slice(-5);
            return `${companyName}:${count}`;
          })
          .join(", ");

        return {
          id: coupon._id,
          raw: coupon,
          code: coupon.code,
          value: formatCouponValue(coupon),
          plan: coupon.applicablePlans?.length
            ? coupon.applicablePlans.map((plan) => (plan.name ? plan.name : plan)).join(", ")
            : "All plans",
          scope: coupon.appliesToAllCompanies
            ? "All companies"
            : coupon.applicableCompanies?.length
              ? coupon.applicableCompanies.map((company) => (company.name ? company.name : company)).join(", ")
              : "Selected companies",
          usage: `${coupon.usedCount || 0}/${globalLimit}${companyUsageSummary ? ` (${companyUsageSummary})` : ""}`,
          expiry: coupon.expiryDate ? new Date(coupon.expiryDate).toLocaleDateString() : "-",
          status: coupon.isActive ? "Active" : "Inactive",
        };
      }),
    [companies, coupons],
  );

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) => {
      return (
        String(row.code || "").toLowerCase().includes(q) ||
        String(row.value || "").toLowerCase().includes(q) ||
        String(row.plan || "").toLowerCase().includes(q) ||
        String(row.scope || "").toLowerCase().includes(q)
      );
    });
  }, [rows, searchQuery]);

  const columns = [
    { key: "code", label: "Code" },
    { key: "value", label: "Value" },
    { key: "plan", label: "Plan Scope" },
    { key: "scope", label: "Company Scope" },
    { key: "usage", label: "Usage" },
    { key: "expiry", label: "Expiry" },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <span className={`cp-status-badge ${value === "Active" ? "is-active" : "is-inactive"}`}>{value}</span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_value, row) => (
        <div className="cp-actions">
          <button type="button" className="cp-action-btn" onClick={() => startEdit(row.raw)}>
            Edit
          </button>
          <button type="button" className="cp-action-btn" onClick={() => toggleActive(row.raw)}>
            {row.raw.isActive ? "Disable" : "Enable"}
          </button>
          <button type="button" className="cp-action-btn danger" onClick={() => removeCoupon(row.raw)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const selectedPlan = plans.find((plan) => plan._id === form.targetPlanId);
  const selectedCompanyNames = companies
    .filter((company) => form.targetCompanyIds.includes(company._id))
    .map((company) => company.name);
  const calculatedGlobalLimit =
    form.companyScopeType === "global"
      ? Number(form.globalUsageLimit || 1)
      : Math.max(1, Number(form.perCompanyUsageLimit || 1) * Math.max(1, form.targetCompanyIds.length));

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Coupons" />
        <main className="page-content coupons-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="cp-hero-card">
            <div>
              <h2>Discount Rules & Campaign Controls</h2>
              <p>Configure coupon value, plan targeting, company access, and redemption limits from one place.</p>
            </div>
            <div className="cp-metrics">
              <article className="cp-metric">
                <span>Total Coupons</span>
                <strong>{metrics.total}</strong>
              </article>
              <article className="cp-metric">
                <span>Active</span>
                <strong>{metrics.active}</strong>
              </article>
              <article className="cp-metric">
                <span>Company Scoped</span>
                <strong>{metrics.companyScoped}</strong>
              </article>
              <article className="cp-metric">
                <span>Plan Specific</span>
                <strong>{metrics.planSpecific}</strong>
              </article>
            </div>
          </section>

          <section className="cp-toolbar-card">
            <div className="cp-search">
              <input
                type="search"
                placeholder="Search code, plan, or company scope"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="cp-toolbar-actions">
              <button type="button" className="cp-btn cp-btn-muted" onClick={load}>
                Refresh
              </button>
              <button type="button" className="cp-btn cp-btn-muted" onClick={resetForm}>
                {editingId ? "Cancel Edit" : "Clear Form"}
              </button>
            </div>
          </section>

          <section className="cp-layout">
            <section className="cp-form-card">
              <div className="cp-card-head">
                <h3>{editingId ? "Edit Coupon" : "Create Coupon"}</h3>
                <p>{editingId ? "Adjust an existing discount rule." : "Build a new coupon with plan and company targeting."}</p>
              </div>

              <form className="cp-form-grid" onSubmit={submit}>
                <label className="cp-field">
                  <span>Coupon Code</span>
                  <input
                    placeholder="WELCOME20"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    required
                  />
                </label>

                <label className="cp-field">
                  <span>Discount Type</span>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                    required
                  >
                    <option value="">Select type</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </label>

                <label className="cp-field">
                  <span>Discount Value</span>
                  <input
                    type="number"
                    placeholder="20"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                    min="0"
                    required
                  />
                </label>

                <label className="cp-field">
                  <span>Expiry Date</span>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    required
                  />
                </label>

                <label className="cp-field">
                  <span>Applicable Plan</span>
                  <select
                    value={form.targetPlanId}
                    onChange={(e) => setForm({ ...form, targetPlanId: e.target.value })}
                  >
                    <option value="__ALL__">All Pricing Plans</option>
                    {plans.map((plan) => (
                      <option key={plan._id} value={plan._id}>
                        {plan.name} ({plan.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="cp-field">
                  <span>Company Scope</span>
                  <select
                    value={form.companyScopeType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        companyScopeType: e.target.value,
                        targetCompanyIds: e.target.value === "global" ? [] : form.targetCompanyIds,
                      })
                    }
                  >
                    <option value="global">All Companies</option>
                    <option value="company">Specific Companies</option>
                  </select>
                </label>

                {form.companyScopeType === "company" ? (
                  <label className="cp-field cp-field-full">
                    <span>Select Companies</span>
                    <select
                      multiple
                      value={form.targetCompanyIds}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          targetCompanyIds: Array.from(e.target.selectedOptions).map((option) => option.value),
                        })
                      }
                    >
                      {companies.map((company) => (
                        <option key={company._id} value={company._id}>
                          {company.name} ({company.code || "No Code"})
                        </option>
                      ))}
                    </select>
                    <small>Hold Ctrl/Cmd to select multiple companies.</small>
                  </label>
                ) : null}

                <label className="cp-field">
                  <span>Per Company Limit</span>
                  <input
                    type="number"
                    min="1"
                    value={form.perCompanyUsageLimit}
                    onChange={(e) => setForm({ ...form, perCompanyUsageLimit: e.target.value })}
                    required
                  />
                </label>

                <label className="cp-field">
                  <span>{form.companyScopeType === "global" ? "Global Usage Limit" : "Calculated Global Limit"}</span>
                  {form.companyScopeType === "global" ? (
                    <input
                      type="number"
                      min="1"
                      value={form.globalUsageLimit}
                      onChange={(e) => setForm({ ...form, globalUsageLimit: e.target.value })}
                      required
                    />
                  ) : (
                    <input type="text" value={String(calculatedGlobalLimit)} readOnly className="cp-readonly" />
                  )}
                </label>

                <label className="cp-toggle">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  <span>Coupon is active</span>
                </label>

                <div className="cp-form-actions cp-field-full">
                  {editingId ? (
                    <button type="button" className="cp-btn cp-btn-muted" onClick={resetForm}>
                      Cancel
                    </button>
                  ) : null}
                  <button type="submit" className="cp-btn cp-btn-primary">
                    {editingId ? "Update Coupon" : "Save Coupon"}
                  </button>
                </div>
              </form>
            </section>

            <aside className="cp-insight-card">
              <div className="cp-card-head">
                <h3>Rule Preview</h3>
                <p>Quick summary of the coupon configuration you are editing.</p>
              </div>

              <div className="cp-preview-stack">
                <article className="cp-preview-item">
                  <span>Value</span>
                  <strong>
                    {form.discountType
                      ? form.discountType === "percentage"
                        ? `${form.discountValue || 0}% OFF`
                        : `${formatAmount(form.discountValue)} OFF`
                      : "Select discount type"}
                  </strong>
                </article>
                <article className="cp-preview-item">
                  <span>Plan Coverage</span>
                  <strong>{selectedPlan ? `${selectedPlan.name} (${selectedPlan.code})` : "All pricing plans"}</strong>
                </article>
                <article className="cp-preview-item">
                  <span>Company Reach</span>
                  <strong>
                    {form.companyScopeType === "global"
                      ? "All companies"
                      : selectedCompanyNames.length
                        ? selectedCompanyNames.join(", ")
                        : "Choose target companies"}
                  </strong>
                </article>
                <article className="cp-preview-item">
                  <span>Usage Limit</span>
                  <strong>{calculatedGlobalLimit} total redemptions</strong>
                </article>
                <article className="cp-preview-item">
                  <span>Status</span>
                  <strong>{form.isActive ? "Active on save" : "Inactive on save"}</strong>
                </article>
              </div>
            </aside>
          </section>

          <section className="cp-table-card">
            <div className="cp-card-head">
              <h3>Coupon List</h3>
              <p>{filteredRows.length} coupon rules match the current search.</p>
            </div>
            <DataTable columns={columns} rows={filteredRows} />
          </section>
        </main>
      </div>
    </div>
  );
}
