import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import DataTable from "../../components/DataTable";
import { api } from "../../services/api";
import "../../styles/superadmin/Logs.css";

function getSeverity(log) {
  const category = String(log.category || "").toLowerCase();
  const action = String(log.action || "").toLowerCase();
  if (category.includes("error") || action.includes("error") || action.includes("fail")) return "critical";
  if (action.includes("delete")) return "high";
  if (action.includes("update") || action.includes("reset")) return "medium";
  return "low";
}

export default function Logs() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getSuperadminLogs();
        setRows(
          res.map((l, idx) => ({
            id: l._id || idx,
            createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString() : "-",
            category: l.category || "-",
            action: l.action || "-",
            user: l.userId?.email || l.userId?.name || "system",
            ip: l.ip || "-",
            severity: getSeverity(l),
          })),
        );
      } catch (e) {
        setError(e.message || "Failed to load logs");
      }
    };
    load();
  }, []);

  const categories = useMemo(
    () => ["all", ...new Set(rows.map((row) => String(row.category || "-").toLowerCase()))],
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (severity !== "all" && row.severity !== severity) return false;
      if (category !== "all" && String(row.category || "").toLowerCase() !== category) return false;
      if (!q) return true;
      return (
        String(row.action || "").toLowerCase().includes(q) ||
        String(row.user || "").toLowerCase().includes(q) ||
        String(row.ip || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, severity, category]);

  const columns = [
    { key: "createdAt", label: "Time" },
    {
      key: "severity",
      label: "Severity",
      render: (value) => <span className={`logs-severity logs-${value}`}>{value}</span>,
    },
    { key: "category", label: "Category" },
    { key: "action", label: "Action" },
    { key: "user", label: "Actor" },
    { key: "ip", label: "IP" },
  ];

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="System Logs" />
        <main className="page-content logs-page">
          {error ? <div className="error-box">{error}</div> : null}

          <section className="settings-card logs-toolbar">
            <input
              type="search"
              placeholder="Search action, actor, ip"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="all">All Severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Categories" : item}
                </option>
              ))}
            </select>
          </section>

          <DataTable columns={columns} rows={filteredRows} />
        </main>
      </div>
    </div>
  );
}
