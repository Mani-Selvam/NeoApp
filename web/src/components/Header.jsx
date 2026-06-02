import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const iconPaths = {
  menu: "M4 6h16M4 12h16M4 18h16",
  search: "m21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  chevron: "m6 9 6 6 6-6",
};

export default function Header({ title }) {
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const initials = useMemo(() => {
    const value = user?.name || "Admin User";
    return value
      .split(" ")
      .slice(0, 2)
      .map((x) => x.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

  return (
    <header className="top-header">
      <div className="header-left">
        <button
          type="button"
          className="header-menu-btn"
          aria-label="Toggle menu"
          onClick={() => window.dispatchEvent(new CustomEvent("neoapp:sidebar-toggle"))}
        >
          <Icon path={iconPaths.menu} />
        </button>

        <div className="header-title-wrap">
        <h1>{title}</h1>
        <p>Superadmin Console</p>
      </div>
      </div>

      <div className="header-right">
        <button type="button" className="icon-only-btn" aria-label="Notifications">
          <Icon path={iconPaths.bell} />
          <span className="notification-dot" />
        </button>

        <div className="profile-menu-wrap">
          <button
            type="button"
            className="profile-trigger"
            onClick={() => setIsProfileOpen((x) => !x)}
          >
            <span className="profile-avatar">{initials}</span>
            <span className="profile-name">{user?.name || "Admin"}</span>
            <Icon path={iconPaths.chevron} />
          </button>

          {isProfileOpen ? (
            <div className="profile-menu">
              <button type="button" onClick={logout}>Logout</button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
