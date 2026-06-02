import { useEffect, useMemo, useRef, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/SupportTickets.css";

function statusTone(value) {
  const status = String(value || "").toLowerCase();
  if (status.includes("open")) return "is-warning";
  if (status.includes("respond")) return "is-active";
  if (status.includes("close")) return "is-muted";
  return "is-muted";
}

export default function SupportTickets() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [activeTicket, setActiveTicket] = useState(null);
  const [reply, setReply] = useState("");
  const [activateCompany, setActivateCompany] = useState(false);
  const [closeTicket, setCloseTicket] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef(null);
  const requestIdRef = useRef(0);

  const load = async (overrides = {}) => {
    const requestId = (requestIdRef.current += 1);
    try {
      setError("");
      setLoading(true);
      const nextStatus = overrides.status !== undefined ? overrides.status : status;
      const nextSearch = overrides.search !== undefined ? overrides.search : search;
      const res = await api.getSupportTickets({ status: nextStatus, q: String(nextSearch || "").trim() });
      if (requestId !== requestIdRef.current) return;
      setRows(
        (res.tickets || []).map((t) => ({
          id: t._id,
          createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString() : "-",
          respondedAt: t.respondedAt ? new Date(t.respondedAt).toLocaleString() : "-",
          name: t.name || "-",
          email: t.email || "-",
          mobile: t.mobile || "-",
          companyName: t.companyId?.name || "-",
          companyStatus: t.companyId?.status || t.companyStatusAtSubmit || "-",
          status: t.status || "Open",
          message: t.message || "-",
          responseMessage: t.responseMessage || "",
          raw: t,
        })),
      );
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      if (e?.status === 404) {
        setError(
          "Support tickets API not found on this server. Deploy the latest backend or change web/.env VITE_API_URL to your local server.",
        );
        return;
      }
      setError(e.message || "Failed to load tickets");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    load({ status, search });
  }, [status]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      load({ status, search });
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [search]);

  const filteredRows = useMemo(() => rows, [rows]);

  const openReply = (row) => {
    setActiveTicket(row.raw);
    setReply(row.raw?.responseMessage || "");
    setActivateCompany(String(row.companyStatus).toLowerCase() === "suspended");
    setCloseTicket(false);
  };

  const submitReply = async () => {
    if (!activeTicket) return;
    const msg = reply.trim();
    if (!msg) return;
    try {
      setSaving(true);
      await api.respondSupportTicket(activeTicket._id, {
        responseMessage: msg,
        activateCompany,
        close: closeTicket,
      });
      setActiveTicket(null);
      setReply("");
      await load();
    } catch (e) {
      setError(e.message || "Failed to respond");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "createdAt", label: "Created" },
    {
      key: "name",
      label: "User",
      render: (_v, row) => (
        <div className="support-user">
          <strong>{row.name}</strong>
          <span>{row.email}</span>
          <span>{row.mobile}</span>
        </div>
      ),
    },
    {
      key: "companyName",
      label: "Company",
      render: (_v, row) => (
        <div className="support-company">
          <strong>{row.companyName}</strong>
          <span className={`status-badge ${statusTone(row.companyStatus)}`}>{row.companyStatus}</span>
        </div>
      ),
    },
    {
      key: "status",
      label: "Ticket",
      render: (value) => <span className={`status-badge ${statusTone(value)}`}>{value}</span>,
    },
    {
      key: "message",
      label: "Message",
      render: (value) => <span className="support-message">{value}</span>,
    },
    {
      key: "responseMessage",
      label: "Reply",
      render: (value, row) =>
        value ? (
          <span className="support-message">{value}</span>
        ) : row.status.toLowerCase().includes("respond") || row.status.toLowerCase().includes("close") ? (
          <span className="support-message">-</span>
        ) : (
          <span className="support-message" style={{ color: "rgba(15, 23, 42, 0.55)" }}>
            No reply yet
          </span>
        ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_v, row) => (
        <div className="table-actions">
          <button type="button" className="icon-btn" onClick={() => openReply(row)}>
            {row.raw?.responseMessage ? "View / Reply" : "Reply"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Help & Support" />
        <main className="page-content support-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card support-toolbar">
            <div className="support-search">
              <svg className="support-search-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                type="search"
                placeholder="Search name, email, company, message..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  load({ status, search: e.currentTarget.value });
                }}
                disabled={loading}
              />
              {search ? (
                <button
                  type="button"
                  className="support-search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  disabled={loading}
                >
                  ×
                </button>
              ) : null}
            </div>

            <div className="support-filter">
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading}>
                <option value="">All Status</option>
                <option value="Open">Open</option>
                <option value="Responded">Responded</option>
                <option value="Closed">Closed</option>
              </select>
              <svg className="support-filter-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="m6 9 6 6 6-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <button type="button" className="support-refresh-btn" onClick={() => load({ status, search })} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </button>
          </section>

          <DataTable columns={columns} rows={filteredRows} emptyMessage="No support tickets" />

          {activeTicket ? (
            <section className="settings-card support-reply">
              <div className="support-reply-head">
                <h3>Ticket</h3>
                <button type="button" className="icon-btn" onClick={() => setActiveTicket(null)}>
                  Close
                </button>
              </div>
              <p className="support-reply-meta">
                To <strong>{activeTicket.email || "-"}</strong> (Ticket:{" "}
                <strong>{activeTicket.status}</strong>)
              </p>

              <div className="support-thread">
                <div className="support-thread-item">
                  <div className="support-thread-label">Message</div>
                  <div className="support-thread-body">{activeTicket.message || "-"}</div>
                </div>
                {activeTicket.responseMessage ? (
                  <div className="support-thread-item">
                    <div className="support-thread-label">Previous reply</div>
                    <div className="support-thread-body">{activeTicket.responseMessage}</div>
                  </div>
                ) : null}
              </div>
              <textarea
                rows={5}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write your reply (this will be saved and shown in the app)..."
              />
              <label className="support-check">
                <input
                  type="checkbox"
                  checked={activateCompany}
                  onChange={(e) => setActivateCompany(e.target.checked)}
                />
                Activate company (if linked)
              </label>
              <label className="support-check">
                <input type="checkbox" checked={closeTicket} onChange={(e) => setCloseTicket(e.target.checked)} />
                Mark ticket as Closed
              </label>
              <div className="support-reply-actions">
                <button type="button" disabled={saving || !reply.trim()} onClick={submitReply}>
                  {saving ? "Sending..." : "Send Email Reply"}
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
