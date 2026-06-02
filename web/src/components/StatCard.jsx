const ICONS = {
  revenue:
    "M12 2v20M17 6H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6",
  monthly:
    "M3 12h18M12 3v18M5 5l14 14",
  subscriptions:
    "M4 5h16v14H4zM4 9h16M8 13h2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 1 1 0 8",
  companies:
    "M3 19h18M5 17V7l7-4 7 4v10M9 9h6M9 13h6",
  enquiries:
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  default:
    "M12 2v20M2 12h20",
};

function pickIcon(title) {
  const t = String(title || "").toLowerCase();
  if (t.includes("monthly")) return ICONS.monthly;
  if (t.includes("revenue")) return ICONS.revenue;
  if (t.includes("subscription")) return ICONS.subscriptions;
  if (t.includes("user")) return ICONS.users;
  if (t.includes("compan")) return ICONS.companies;
  if (t.includes("enquir")) return ICONS.enquiries;
  return ICONS.default;
}

export default function StatCard({ title, value, subtitle }) {
  const iconPath = pickIcon(title);

  return (
    <article className="stat-card">
      <div className="stat-card-head">
        <p className="stat-title">{title}</p>
        <span className="stat-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d={iconPath} />
          </svg>
        </span>
      </div>
      <h3 className="stat-value">{value}</h3>
      {subtitle ? <p className="stat-subtitle">{subtitle}</p> : null}
    </article>
  );
}
