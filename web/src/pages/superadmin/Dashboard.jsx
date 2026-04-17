import { useEffect, useMemo, useState } from "react";
import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import StatCard from "../../components/StatCard";
import ChartCard from "../../components/ChartCard";
import { api } from "../../services/api";
import "../../styles/superadmin/Dashboard.css";

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const load = async () => {
            try {
                const res = await api.getSuperadminDashboard();
                setData(res);
            } catch (e) {
                setError(e.message || "Failed to load dashboard");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const recentRevenueActivity = useMemo(() => {
        const trend = data?.charts?.revenueTrend || [];
        return trend
            .slice(-4)
            .reverse()
            .map((item) => ({
                label: item.label,
                detail: `Revenue recorded: $${Number(item.value || 0).toLocaleString()}`,
            }));
    }, [data?.charts?.revenueTrend]);

    const quickStats = useMemo(() => {
        if (!data) return [];
        const arpu = data.totalUsers
            ? Number(data.totalRevenue || 0) / data.totalUsers
            : 0;
        const subscriptionRate = data.totalCompanies
            ? Math.round(
                  (Number(data.activeSubscriptions || 0) /
                      data.totalCompanies) *
                      100,
              )
            : 0;
        const enquiryPerCompany = data.totalCompanies
            ? (Number(data.totalEnquiries || 0) / data.totalCompanies).toFixed(
                  1,
              )
            : "0.0";

        return [
            { label: "ARPU", value: `$${arpu.toFixed(1)}` },
            { label: "Subscription Coverage", value: `${subscriptionRate}%` },
            { label: "Enquiries / Company", value: enquiryPerCompany },
            {
                label: "Calls Logged",
                value: Number(data.totalCallsLogged || 0).toLocaleString(),
            },
        ];
    }, [data]);

    const lineSeries = useMemo(() => {
        const trend = data?.charts?.revenueTrend || [];
        if (!trend.length) return [];
        return trend.map((item) => ({
            label: item.label,
            value: Number(item.value || 0),
        }));
    }, [data?.charts?.revenueTrend]);

    const momentum = useMemo(() => {
        const latest = lineSeries[lineSeries.length - 1]?.value || 0;
        const previous = lineSeries[lineSeries.length - 2]?.value || 0;
        const change =
            previous > 0
                ? ((latest - previous) / previous) * 100
                : latest > 0
                  ? 100
                  : 0;
        return { latest, change };
    }, [lineSeries]);

    const momentumRows = useMemo(
        () =>
            lineSeries
                .map((item, index) => {
                    const prev = lineSeries[index - 1]?.value ?? item.value;
                    const delta = item.value - prev;
                    return {
                        ...item,
                        delta,
                        tone:
                            delta > 0
                                ? "up"
                                : delta < 0
                                  ? "down"
                                  : "flat",
                    };
                })
                .slice(-6)
                .reverse(),
        [lineSeries],
    );

    const performanceCards = useMemo(() => {
        if (!data) return [];
        const totalCompanies = Number(data.totalCompanies || 0);
        const totalUsers = Number(data.totalUsers || 0);
        const activeSubscriptions = Number(data.activeSubscriptions || 0);
        const totalEnquiries = Number(data.totalEnquiries || 0);

        const coverage = totalCompanies
            ? Math.round((activeSubscriptions / totalCompanies) * 100)
            : 0;
        const engagement = totalUsers
            ? Math.min(100, Math.round((totalEnquiries / totalUsers) * 100))
            : 0;
        const utilization = totalCompanies
            ? Math.min(100, Math.round((totalUsers / totalCompanies) * 20))
            : 0;

        return [
            {
                label: "Subscription Coverage",
                value: `${coverage}%`,
                progress: coverage,
            },
            {
                label: "Enquiry Engagement",
                value: `${engagement}%`,
                progress: engagement,
            },
            {
                label: "Workspace Utilization",
                value: `${utilization}%`,
                progress: utilization,
            },
        ];
    }, [data]);

    return (
        <div className="admin-shell">
            <Sidebar />
            <div className="admin-main">
                <Header title="Dashboard" />
                <main className="page-content dashboard-page">
                    {loading ? (
                        <p className="dashboard-loading">
                            Loading dashboard insights...
                        </p>
                    ) : null}
                    {error ? <div className="error-box">{error}</div> : null}

                    {data ? (
                        <>
                            <div className="stat-grid dashboard-stat-grid">
                                <StatCard
                                    title="Total Revenue"
                                    value={`$${Number(data.totalRevenue || 0).toLocaleString()}`}
                                />
                                <StatCard
                                    title="Monthly Revenue"
                                    value={`$${Number(data.monthlyRevenue || 0).toLocaleString()}`}
                                />
                                <StatCard
                                    title="Active Subscriptions"
                                    value={data.activeSubscriptions}
                                />
                                <StatCard
                                    title="Total Users"
                                    value={data.totalUsers}
                                />
                                <StatCard
                                    title="Total Companies"
                                    value={data.totalCompanies}
                                />
                                <StatCard
                                    title="Total Enquiries"
                                    value={data.totalEnquiries}
                                />
                            </div>

                            <div className="dashboard-layout">
                                <section className="dashboard-main-grid">
                                    <ChartCard
                                        title="Revenue Trend"
                                        series={data.charts?.revenueTrend || []}
                                        variant="mountain"
                                    />
                                    <ChartCard
                                        title="User Growth"
                                        series={data.charts?.userGrowth || []}
                                        variant="pie"
                                    />
                                    <ChartCard
                                        title="Company Growth"
                                        series={
                                            data.charts?.companyGrowth || []
                                        }
                                        variant="revenue"
                                    />

                                    <section className="settings-card dashboard-widget dashboard-momentum-card">
                                        <div className="dashboard-momentum-head">
                                            <div>
                                                <h3>Revenue Momentum</h3>
                                                <p>
                                                    Premium trend panel for
                                                    monthly direction.
                                                </p>
                                            </div>
                                            <div className="dashboard-momentum-pill">
                                                Trend Focus
                                            </div>
                                        </div>
                                        {lineSeries.length ? (
                                            <div className="dashboard-momentum-body">
                                                <div className="dashboard-momentum-metric">
                                                    <span>Latest Month</span>
                                                    <strong>
                                                        $
                                                        {Number(
                                                            momentum.latest || 0,
                                                        ).toLocaleString()}
                                                    </strong>
                                                    <p
                                                        className={
                                                            momentum.change >= 0
                                                                ? "is-positive"
                                                                : "is-negative"
                                                        }>
                                                        {momentum.change >= 0
                                                            ? "+"
                                                            : ""}
                                                        {momentum.change.toFixed(
                                                            1,
                                                        )}
                                                        % vs previous
                                                    </p>
                                                </div>
                                                <div className="dashboard-momentum-list">
                                                    {momentumRows.map((row) => (
                                                        <article
                                                            key={row.label}
                                                            className="dashboard-momentum-row">
                                                            <div>
                                                                <strong>
                                                                    {row.label}
                                                                </strong>
                                                                <p>
                                                                    $
                                                                    {Number(
                                                                        row.value ||
                                                                            0,
                                                                    ).toLocaleString()}
                                                                </p>
                                                            </div>
                                                            <span
                                                                className={`dashboard-momentum-chip is-${row.tone}`}>
                                                                {row.delta > 0
                                                                    ? `+${row.delta.toFixed(2)}`
                                                                    : row.delta.toFixed(
                                                                          2,
                                                                      )}
                                                            </span>
                                                        </article>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="dashboard-empty">
                                                No revenue trend yet.
                                            </p>
                                        )}
                                    </section>
                                </section>

                                <aside className="dashboard-side-grid">
                                    <section className="settings-card dashboard-widget">
                                        <h3>Recent Activity</h3>
                                        <div className="dashboard-activity-list">
                                            {recentRevenueActivity.length ? (
                                                recentRevenueActivity.map(
                                                    (item) => (
                                                        <article
                                                            key={item.label}
                                                            className="dashboard-activity-item">
                                                            <strong>
                                                                {item.label}
                                                            </strong>
                                                            <p>{item.detail}</p>
                                                        </article>
                                                    ),
                                                )
                                            ) : (
                                                <p className="dashboard-empty">
                                                    No recent activity yet.
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    <section className="settings-card dashboard-widget">
                                        <h3>Quick Stats</h3>
                                        <div className="dashboard-quick-stats">
                                            {quickStats.map((item) => (
                                                <div key={item.label}>
                                                    <span>{item.label}</span>
                                                    <strong>
                                                        {item.value}
                                                    </strong>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="settings-card dashboard-widget dashboard-progress-card">
                                        <h3>Performance Signals</h3>
                                        <div className="dashboard-progress-list">
                                            {performanceCards.map((item) => (
                                                <article key={item.label}>
                                                    <div>
                                                        <span>
                                                            {item.label}
                                                        </span>
                                                        <strong>
                                                            {item.value}
                                                        </strong>
                                                    </div>
                                                    <div className="dashboard-progress-track">
                                                        <span
                                                            style={{
                                                                width: `${Math.max(8, item.progress)}%`,
                                                            }}
                                                        />
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
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
