import React, { useState, useEffect } from "react";
import { api } from "../../services/api";
import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";

const AIVoicePayments = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPayments = async () => {
        try {
            setLoading(true);
            const data = await api.getAIVoicePayments();
            if (data.success) {
                setPayments(data.payments);
            }
        } catch (error) {
            console.error("Failed to fetch payments", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPayments();
    }, []);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(val || 0);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this payment record? This action cannot be undone.")) return;
        try {
            const data = await api.deleteAIVoicePayment(id);
            if (data.success) {
                fetchPayments();
            } else {
                alert("Failed to delete record");
            }
        } catch (error) {
            console.error("Failed to delete payment", error);
        }
    };

    return (
        <div className="admin-shell">
            <Sidebar />
            <div className="admin-main">
                <Header title="AI Voice Payments" />
                <main className="page-content">
                    <div className="pm-container pm-animate-fade-in pm-glass-panel" style={{ padding: '2rem' }}>
                        <div className="pm-header">
                            <div>
                                <h1 className="pm-title" style={{ fontSize: '1.5rem', fontWeight: 600 }}>🎙️ AI Voice Top-up Payments</h1>
                                <p className="pm-subtitle" style={{ color: '#6B7280' }}>Track all company purchases for extra AI Voice Assistant requests.</p>
                            </div>
                            <button className="pm-btn pm-btn-primary" onClick={fetchPayments}>
                                Refresh Data
                            </button>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: "center", padding: "2rem" }}>Loading transactions...</div>
                        ) : payments.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "2rem", color: '#6b7280' }}>
                                No AI Voice top-up purchases found.
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Date</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Company</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Purchaser</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Amount Paid</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Requests Added</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Status</th>
                                            <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Notified</th>
                                            {import.meta.env.DEV && (
                                                <th style={{ padding: "0.75rem", fontWeight: 600, color: '#374151' }}>Actions</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map((p) => (
                                            <tr key={p._id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                                <td style={{ padding: "0.75rem", color: '#4b5563' }}>
                                                    {new Date(p.createdAt).toLocaleDateString()} {new Date(p.createdAt).toLocaleTimeString()}
                                                </td>
                                                <td style={{ padding: "0.75rem", fontWeight: 500, color: '#111827' }}>
                                                    {p.companyId?.name} <span style={{ color: '#9ca3af', fontSize: '0.85em' }}>({p.companyId?.code})</span>
                                                </td>
                                                <td style={{ padding: "0.75rem", color: '#4b5563' }}>
                                                    {p.userId?.name} <br/> <span style={{ fontSize: '0.85em', color: '#6b7280' }}>{p.userId?.email}</span>
                                                </td>
                                                <td style={{ padding: "0.75rem", fontWeight: 600, color: '#059669' }}>
                                                    {formatCurrency(p.amountPaid)}
                                                </td>
                                                <td style={{ padding: "0.75rem", color: '#4b5563' }}>
                                                    +{p.requestsAdded.toLocaleString()} reqs
                                                </td>
                                                <td style={{ padding: "0.75rem" }}>
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '9999px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        backgroundColor: p.status === 'Completed' ? '#D1FAE5' : '#FEE2E2',
                                                        color: p.status === 'Completed' ? '#065F46' : '#991B1B'
                                                    }}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                                <td style={{ padding: "0.75rem", fontSize: '0.85rem' }}>
                                                    <div>Email: {p.receiptEmailSent ? "✅" : "❌"}</div>
                                                    <div>WA: {p.whatsappSent ? "✅" : "❌"}</div>
                                                </td>
                                                {import.meta.env.DEV && (
                                                    <td style={{ padding: "0.75rem" }}>
                                                        <button 
                                                            onClick={() => handleDelete(p._id)}
                                                            style={{
                                                                color: "#EF4444",
                                                                background: "none",
                                                                border: "none",
                                                                cursor: "pointer",
                                                                textDecoration: "underline"
                                                            }}
                                                        >
                                                            Delete (Test)
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AIVoicePayments;
