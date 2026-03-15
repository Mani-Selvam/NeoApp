import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Subscriptions.css";

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("active")) return "is-active";
  if (status.includes("trial")) return "is-info";
  if (status.includes("cancel")) return "is-danger";
  if (status.includes("expire")) return "is-warning";
  return "is-muted";
}

function companyStatusClass(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("active")) return "is-active";
  if (status.includes("suspend")) return "is-warning";
  if (status.includes("cancel")) return "is-muted";
  return "is-muted";
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function formatAmount(value) {
  const num = Number(value || 0);
  return `$${num.toLocaleString()}`;
}

export default function Subscriptions() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const subs = await api.getSuperadminSubscriptions();

      setRows(
        (Array.isArray(subs) ? subs : []).map((s) => ({
          id: s._id,
          raw: s,
          company: s.companyId?.name || "-",
          companyStatus: s.companyId?.status || "",
          plan: s.planId?.name || "-",
          status: s.status || "Unknown",
          startDate: formatDate(s.startDate),
          endDate: formatDate(s.endDate),
          amount: Number(s.finalPrice || 0),
          coupon: s.couponId?.code || "-",
        })),
      );
    } catch (e) {
      setError(e.message || "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && String(row.status).toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.company || "").toLowerCase().includes(q) ||
        String(row.plan || "").toLowerCase().includes(q) ||
        String(row.coupon || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const planCards = useMemo(() => {
    const grouped = new Map();
    rows.forEach((row) => {
      const key = row.plan;
      if (!grouped.has(key)) grouped.set(key, { count: 0, revenue: 0, active: 0 });
      const existing = grouped.get(key);
      existing.count += 1;
      existing.revenue += Number(row.amount || 0);
      if (String(row.status).toLowerCase() === "active") existing.active += 1;
    });

    return Array.from(grouped.entries()).map(([name, stat]) => ({ name, ...stat }));
  }, [rows]);

  const deleteSubscription = async (subscriptionId) => {
    const ok = window.confirm("Delete this subscription?");
    if (!ok) return;
    try {
      await api.deleteSubscription(subscriptionId);
      await load();
    } catch (e) {
      setError(e.message || "Failed to delete subscription");
    }
  };

  const columns = [
    {
      key: "company",
      label: "Company",
      render: (value, row) =>
        row.companyStatus && String(row.companyStatus) !== "Active" ? (
          <div className="subscriptions-company-cell">
            <span>{value}</span>
            <span className={`status-badge ${companyStatusClass(row.companyStatus)}`}>{row.companyStatus}</span>
          </div>
        ) : (
          value
        ),
    },
    { key: "plan", label: "Plan" },
    {
      key: "status",
      label: "Status",
      render: (value) => <span className={`status-badge ${statusClass(value)}`}>{value}</span>,
    },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "Expiry" },
    {
      key: "amount",
      label: "Billing",
      render: (value) => formatAmount(value),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_v, row) => (
        <div className="table-actions">
          <button type="button" className="icon-btn" onClick={() => deleteSubscription(row.id)}>
            Delete
          </button>
        </div>
      ),
    },
  ];

  const activeCount = rows.filter((row) => String(row.status).toLowerCase() === "active").length;

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Subscriptions" />
        <main className="page-content subscriptions-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card subscriptions-toolbar">
            <input
              type="search"
              placeholder="Search company, plan, coupon"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button type="button" onClick={load}>Refresh</button>
          </section>

          <section className="subscriptions-cards">
            <article className="subscriptions-kpi">
              <span>Total Subscriptions</span>
              <strong>{rows.length}</strong>
            </article>
            <article className="subscriptions-kpi">
              <span>Active</span>
              <strong>{activeCount}</strong>
            </article>
            <article className="subscriptions-kpi">
              <span>Monthly Billing</span>
              <strong>{formatAmount(rows.reduce((sum, row) => sum + row.amount, 0))}</strong>
            </article>
          </section>

          <section className="subscriptions-plan-grid">
            {planCards.map((card) => (
              <article key={card.name} className="subscriptions-plan-card">
                <h3>{card.name}</h3>
                <p>{card.count} subscriptions</p>
                <div>
                  <span>Active: {card.active}</span>
                  <strong>{formatAmount(card.revenue)}</strong>
                </div>
              </article>
            ))}
          </section>

          {loading ? <p className="subscriptions-loading">Loading subscriptions...</p> : null}
          <DataTable columns={columns} rows={filteredRows} />
        </main>
      </div>
    </div>
  );
}
