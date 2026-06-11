import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Users.css";

function statusClass(value) {
  const status = String(value || "").toLowerCase();
  if (status === "new") return "is-active";
  if (status === "contacted") return "is-info";
  if (status === "converted") return "is-success";
  if (status === "closed") return "is-muted";
  return "is-muted";
}

export default function WebsiteLeads() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    try {
      setError("");
      const res = await api.getSuperadminWebsiteLeads();
      setRows(
        res.map((lead) => ({
          id: lead._id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          city: lead.city || "-",
          status: lead.status || "New",
          whatsappSent: lead.whatsappSent ? "Yes" : "No",
          createdAt: new Date(lead.createdAt).toLocaleString(),
        }))
      );
    } catch (e) {
      setError(e.message || "Failed to load website leads");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && String(row.status || "").toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        String(row.name || "").toLowerCase().includes(q) ||
        String(row.phone || "").toLowerCase().includes(q) ||
        String(row.email || "").toLowerCase().includes(q) ||
        String(row.company || "").toLowerCase().includes(q) ||
        String(row.city || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const columns = [
    {
      key: "name",
      label: "Lead",
      render: (value, row) => (
        <div className="users-name-cell">
          <span className="users-avatar">{String(value || "-").charAt(0).toUpperCase()}</span>
          <div>
            <strong>{value}</strong>
            <p style={{ margin: 0 }}>{row.phone}</p>
            {row.email && <p style={{ margin: 0, fontSize: "0.85em", color: "gray" }}>{row.email}</p>}
          </div>
        </div>
      ),
    },
    { key: "company", label: "Company" },
    { key: "city", label: "City" },
    {
      key: "status",
      label: "Status",
      render: (value) => <span className={`status-badge ${statusClass(value)}`}>{value}</span>,
    },
    {
      key: "whatsappSent",
      label: "WhatsApp Sent",
      render: (value) => (
        <span className={`status-badge ${value === "Yes" ? "is-success" : "is-warning"}`}>
          {value}
        </span>
      ),
    },
    { key: "createdAt", label: "Date" },
    {
      key: "actions",
      label: "Actions",
      render: (_value, row) => {
        const cleanPhone = row.phone ? row.phone.replace(/[^0-9]/g, "") : "";
        const waLink = `https://api.whatsapp.com/send/?phone=${cleanPhone}&text=Hello ${encodeURIComponent(row.name)}&type=phone_number&app_absent=0`;
        const mailLink = row.email ? `https://mail.google.com/mail/?view=cm&fs=1&to=${row.email}` : "#";

        return (
          <div style={{ display: "flex", gap: "8px" }}>
            {row.phone && (
              <a
                href={`tel:${row.phone}`}
                title="Call"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "#e0f2fe",
                  color: "#0284c7",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
              </a>
            )}
            {row.phone && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                title="WhatsApp"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "#dcfce7",
                  color: "#16a34a",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
              </a>
            )}
            {row.email && (
              <a
                href={mailLink}
                target="_blank"
                rel="noreferrer"
                title="Email via Gmail"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "#f3e8ff",
                  color: "#9333ea",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </a>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Website Leads" />
        <main className="page-content users-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card users-toolbar">
            <input
              type="search"
              placeholder="Search name, phone, company, city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="converted">Converted</option>
              <option value="closed">Closed</option>
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
