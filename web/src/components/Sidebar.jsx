import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const ICONS = {
  dashboard: "M3 11.5 12 4l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  companies: "M3 19h18M5 17V7l7-4 7 4v10M9 9h6M9 13h6",
  overrides: "M20 7 9 18l-5-5",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 1 1 0 8",
  subscriptions: "M4 5h16v14H4zM4 9h16M8 13h2",
  coupons: "M20 12a2 2 0 0 1-2 2h-2v3a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V3a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3h2a2 2 0 0 1 2 2z",
  pricing: "M12 1v22M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6",
  revenue: "M3 17l5-5 4 4 7-8M21 10V4h-6",
  logs: "M5 3h10l4 4v14H5zM9 13h6M9 17h6M9 9h1",
  support: "M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10zm-1-6h2v2h-2zm0-10h2v8h-2z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .35 1.9l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .15A1.7 1.7 0 0 0 13 21v.08a2 2 0 0 1-4 0V21a1.7 1.7 0 0 0-1-1.45 1.7 1.7 0 0 0-1-.15 1.7 1.7 0 0 0-1.9.35l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 2.6 15a1.7 1.7 0 0 0-.15-1A1.7 1.7 0 0 0 1 13H.92a2 2 0 0 1 0-4H1a1.7 1.7 0 0 0 1.45-1 1.7 1.7 0 0 0 .15-1 1.7 1.7 0 0 0-.35-1.9L2.2 5.05a2 2 0 0 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 7 2.6a1.7 1.7 0 0 0 1-.15A1.7 1.7 0 0 0 9 1V.92a2 2 0 0 1 4 0V1a1.7 1.7 0 0 0 1 1.45 1.7 1.7 0 0 0 1 .15 1.7 1.7 0 0 0 1.9-.35l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 7a1.7 1.7 0 0 0 .15 1A1.7 1.7 0 0 0 21 9h.08a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.45 1 1.7 1.7 0 0 0-.15 1z",
};

const sections = [
  {
    title: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", to: "/superadmin/dashboard" }],
  },
  {
    title: "Workspace",
    items: [
      { id: "companies", label: "Companies", to: "/superadmin/companies" },
      { id: "overrides", label: "Company Overrides", to: "/superadmin/overrides" },
      { id: "users", label: "Users", to: "/superadmin/users" },
      { id: "subscriptions", label: "Subscriptions", to: "/superadmin/subscriptions" },
      { id: "coupons", label: "Coupons", to: "/superadmin/coupons" },
      { id: "pricing", label: "Pricing Management", to: "/superadmin/pricing" },
    ],
  },
  {
    title: "System",
    items: [
      { id: "revenue", label: "Revenue", to: "/superadmin/revenue" },
      { id: "support", label: "Help", to: "/superadmin/support" },
      { id: "logs", label: "Logs", to: "/superadmin/logs" },
      { id: "settings", label: "Settings", to: "/superadmin/settings" },
    ],
  },
];

function SidebarIcon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function Sidebar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onToggle = () => setIsMenuOpen((prev) => !prev);
    const onClose = () => setIsMenuOpen(false);
    window.addEventListener("neoapp:sidebar-toggle", onToggle);
    window.addEventListener("neoapp:sidebar-close", onClose);
    return () => {
      window.removeEventListener("neoapp:sidebar-toggle", onToggle);
      window.removeEventListener("neoapp:sidebar-close", onClose);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        className={`sidebar-overlay ${isMenuOpen ? "is-open" : ""}`}
        aria-hidden={!isMenuOpen}
        tabIndex={isMenuOpen ? 0 : -1}
        onClick={() => setIsMenuOpen(false)}
      />
      <aside className={`sidebar ${isMenuOpen ? "is-open" : ""}`}>
      <div className="sidebar-topbar">
        <div className="sidebar-brand">
          <div className="brand-dot" />
          <div>
            <h2 className="sidebar-title">NeoApp</h2>
            <p>Super Admin</p>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-menu-btn"
          aria-label="Toggle menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div className={`sidebar-menu ${isMenuOpen ? "is-open" : ""}`}>
        {sections.map((section) => (
          <nav key={section.title} className="sidebar-group">
            <p className="sidebar-group-title">{section.title}</p>
            <div className="sidebar-nav">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
                  }
                >
                  <SidebarIcon name={item.id} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>
        ))}
      </div>
      </aside>
    </>
  );
}
