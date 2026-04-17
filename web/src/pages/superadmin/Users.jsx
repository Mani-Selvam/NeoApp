import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Users.css";

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (status === "inactive") return "is-warning";
  if (status === "active") return "is-active";
  return "is-muted";
}

export default function Users() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    try {
      setError("");
      const res = await api.getSuperadminUsers();
      setRows(
        res.map((u) => ({
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          company: u.companyName || "-",
          companyStatus: u.companyStatus || "",
          status: u.companyStatus && String(u.companyStatus) !== "Active" ? "Inactive" : u.status || "Unknown",
          lastLogin: u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "-",
        })),
      );
    } catch (e) {
      setError(e.message || "Failed to load users");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const disableUser = async (id) => {
    await api.updateUserStatus(id, "Inactive");
    await load();
  };

  const enableUser = async (id) => {
    await api.updateUserStatus(id, "Active");
    await load();
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter !== "all" && String(row.role || "").toLowerCase() !== roleFilter) return false;
      if (statusFilter !== "all" && String(row.status || "").toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.name || "").toLowerCase().includes(q) ||
        String(row.email || "").toLowerCase().includes(q) ||
        String(row.company || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, roleFilter, statusFilter]);

  const columns = [
    {
      key: "name",
      label: "User",
      render: (value, row) => (
        <div className="users-name-cell">
          <span className="users-avatar">{String(value || "-").charAt(0).toUpperCase()}</span>
          <div>
            <strong>{value}</strong>
            <p>{row.email}</p>
          </div>
        </div>
      ),
    },
    { key: "role", label: "Role" },
    {
      key: "company",
      label: "Company",
      render: (value, row) =>
        row.companyStatus && String(row.companyStatus) !== "Active" ? (
          <div className="users-company-cell">
            <span>{value}</span>
            <span className="status-badge is-warning">{row.companyStatus}</span>
          </div>
        ) : (
          value
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (value) => <span className={`status-badge ${statusClass(value)}`}>{value}</span>,
    },
    { key: "lastLogin", label: "Last Login" },
    {
      key: "actions",
      label: "Actions",
      render: (_value, row) => (
        <div className="table-actions">
          {row.companyStatus && String(row.companyStatus) !== "Active" ? (
            <span className="status-badge is-muted">Company {row.companyStatus}</span>
          ) : String(row.status).toLowerCase() === "inactive" ? (
            <button type="button" className="icon-btn" onClick={() => enableUser(row.id)}>
              Enable
            </button>
          ) : (
            <button type="button" className="icon-btn" onClick={() => disableUser(row.id)}>
              Disable
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
        <Header title="Users" />
        <main className="page-content users-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card users-toolbar">
            <input
              type="search"
              placeholder="Search users, email, company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="button" onClick={load}>
              Refresh
            </button>
          </section>

          <DataTable columns={columns} rows={filteredRows} />
        </main>
      </div>
    </div>
  );
}
