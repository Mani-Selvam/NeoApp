import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Companies.css";

function statusTone(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("active")) return "is-active";
  if (status.includes("suspend")) return "is-warning";
  return "is-muted";
}

export default function Companies() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [effective, setEffective] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const load = async () => {
    try {
      setError("");
      const res = await api.getSuperadminCompanies();
      setRows(
        res.map((c) => ({
          id: c._id,
          name: c.name,
          ownerEmail: c.ownerEmail || "-",
          plan: c.plan || "-",
          staffCount: c.staffCount || 0,
          createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "-",
          status: c.status || "Unknown",
        })),
      );
    } catch (e) {
      setError(e.message || "Failed to load companies");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const suspendCompany = async (id) => {
    await api.updateCompanyStatus(id, "Suspended");
    await load();
  };

  const activateCompany = async (id) => {
    await api.updateCompanyStatus(id, "Active");
    await load();
  };

  const viewEffectivePlan = async (id) => {
    try {
      const res = await api.getCompanyEffectivePlan(id);
      setEffective(res);
    } catch (e) {
      setError(e.message || "Failed to resolve effective plan");
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && String(row.status).toLowerCase() !== status) return false;
      if (!q) return true;
      return (
        String(row.name || "").toLowerCase().includes(q) ||
        String(row.ownerEmail || "").toLowerCase().includes(q) ||
        String(row.plan || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, status]);

  const columns = [
    {
      key: "name",
      label: "Company",
      render: (value, row) => (
        <div className="companies-company-cell">
          <span className="companies-avatar">{String(value || "-").charAt(0).toUpperCase()}</span>
          <div>
            <strong>{value}</strong>
            <p>{row.ownerEmail}</p>
          </div>
        </div>
      ),
    },
    { key: "plan", label: "Plan" },
    { key: "staffCount", label: "Staff" },
    { key: "createdAt", label: "Created" },
    {
      key: "status",
      label: "Status",
      render: (value) => <span className={`status-badge ${statusTone(value)}`}>{value}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (_value, row) => (
        <div className="table-actions">
          <button type="button" className="icon-btn" onClick={() => viewEffectivePlan(row.id)}>
            View
          </button>
          {String(row.status).toLowerCase() === "active" ? (
            <button type="button" className="icon-btn" onClick={() => suspendCompany(row.id)}>
              Suspend
            </button>
          ) : (
            <button type="button" className="icon-btn" onClick={() => activateCompany(row.id)}>
              Activate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Companies" />
        <main className="page-content companies-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card companies-toolbar">
            <input
              type="search"
              placeholder="Search by company, owner, or plan"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <button type="button" onClick={load}>
              Refresh
            </button>
          </section>

          <DataTable columns={columns} rows={filteredRows} />

          {effective ? (
            <section className="settings-card companies-effective">
              <h3>Effective Plan Preview</h3>
              <div>
                <p>
                  Plan <strong>{effective.plan?.name || "-"}</strong>
                </p>
                <p>
                  Final Price <strong>${effective.plan?.finalPrice ?? "-"}</strong>
                </p>
                <p>
                  Max Staff <strong>{effective.plan?.maxStaff ?? "-"}</strong>
                </p>
                <p>
                  Expiry
                  <strong>
                    {effective.subscription?.endDate
                      ? new Date(effective.subscription.endDate).toLocaleDateString()
                      : "-"}
                  </strong>
                </p>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
