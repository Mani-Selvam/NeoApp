import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import StatCard from "../../components/StatCard";
import ChartCard from "../../components/ChartCard";
import { api } from "../../services/api";
import "../../styles/superadmin/Revenue.css";

export default function Revenue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getSuperadminRevenue();
        setData(res);
      } catch (e) {
        setError(e.message || "Failed to load revenue");
      }
    };
    load();
  }, []);

  const paymentBreakdown = useMemo(() => {
    if (!data) return [];
    const active = Number(data.activeSubscriptions || 0);
    const cancelled = Number(data.cancelledSubscriptions || 0);
    const total = Math.max(1, active + cancelled);
    return [
      { label: "Active", value: Math.round((active / total) * 100) },
      { label: "Cancelled", value: Math.round((cancelled / total) * 100) },
    ];
  }, [data]);

  return (
    <div className="admin-shell">
      <Sidebar />
      <div className="admin-main">
        <Header title="Revenue" />
        <main className="page-content revenue-page">
          {error ? <div className="error-box">{error}</div> : null}
          {data ? (
            <>
              <section className="revenue-hero">
                <h2>Revenue Intelligence</h2>
                <p>Track monthly growth, annual run-rate, and subscription health.</p>
              </section>

              <div className="stat-grid revenue-stat-grid">
                <StatCard title="Monthly Revenue" value={`$${Number(data.monthlyRevenue || 0).toLocaleString()}`} />
                <StatCard title="Yearly Revenue" value={`$${Number(data.yearlyRevenue || 0).toLocaleString()}`} />
                <StatCard title="Active Subscriptions" value={data.activeSubscriptions} />
                <StatCard title="Cancelled Subscriptions" value={data.cancelledSubscriptions} />
              </div>

              <div className="revenue-layout">
                <section className="revenue-main-grid">
                  <ChartCard title="Revenue Trend (12 Months)" series={data.revenueChart || []} />
                  <ChartCard title="Payment Breakdown (%)" series={paymentBreakdown} />
                </section>

                <aside className="revenue-side-grid">
                  <section className="settings-card revenue-widget">
                    <h3>Revenue Snapshot</h3>
                    <div>
                      <p>
                        Monthly Target <strong>$250,000</strong>
                      </p>
                      <p>
                        Achievement
                        <strong>
                          {Math.min(100, Math.round((Number(data.monthlyRevenue || 0) / 250000) * 100))}%
                        </strong>
                      </p>
                      <p>
                        Annual Run Rate <strong>${(Number(data.monthlyRevenue || 0) * 12).toLocaleString()}</strong>
                      </p>
                    </div>
                  </section>

                  <section className="settings-card revenue-widget">
                    <h3>Payment Channels</h3>
                    <ul>
                      <li>
                        <span>Cards</span>
                        <strong>62%</strong>
                      </li>
                      <li>
                        <span>UPI / Bank Transfer</span>
                        <strong>28%</strong>
                      </li>
                      <li>
                        <span>Coupons + Adjustments</span>
                        <strong>10%</strong>
                      </li>
                    </ul>
                  </section>
                </aside>
              </div>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
