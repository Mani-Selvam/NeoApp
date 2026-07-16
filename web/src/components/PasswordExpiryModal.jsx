import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

export default function PasswordExpiryModal() {
    const { logout, updateUser } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.setProperty("overflow", "hidden", "important");
        return () => {
            document.body.style.setProperty("overflow", originalStyle);
        };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (!currentPassword) {
            setError("Current password is required.");
            return;
        }
        if (!newPassword || newPassword.length < 8) {
            setError("New password must be at least 8 characters long.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }
        if (newPassword === currentPassword) {
            setError("New password cannot be the same as your current password.");
            return;
        }

        setLoading(true);

        try {
            await api.changeSuperadminPassword({ currentPassword, newPassword });
            setSuccess("Password updated successfully!");
            setTimeout(() => {
                // Clear flag in AuthContext which hides the modal
                updateUser({ passwordExpired: false });
            }, 1500);
        } catch (err) {
            setError(err.message || "Failed to update password. Please check your credentials.");
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );

    const EyeOffIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17 }}>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    );

    return (
        <div className="expiry-modal-overlay">
            <div className="expiry-modal-box">
                <div className="expiry-modal-icon" aria-hidden="true">🔑</div>

                <h2>Password Rotation Required</h2>
                <p className="expiry-modal-desc">
                    Your password has expired under the 90-day rotation security policy.
                    Please set a new password to continue accessing your dashboard.
                </p>

                <form onSubmit={handleSubmit} className="expiry-modal-form">
                    <label className="expiry-modal-field">
                        <span>Current Password</span>
                        <div className="expiry-modal-input-wrapper">
                            <input
                                type={showCurrent ? "text" : "password"}
                                placeholder="Enter current password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                disabled={loading || success}
                                required
                            />
                            <button
                                type="button"
                                className="expiry-modal-toggle-btn"
                                onClick={() => setShowCurrent(!showCurrent)}
                                tabIndex="-1"
                                aria-label={showCurrent ? "Hide current password" : "Show current password"}
                            >
                                {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </label>

                    <label className="expiry-modal-field">
                        <span>New Password</span>
                        <div className="expiry-modal-input-wrapper">
                            <input
                                type={showNew ? "text" : "password"}
                                placeholder="Min 8 characters"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={loading || success}
                                required
                            />
                            <button
                                type="button"
                                className="expiry-modal-toggle-btn"
                                onClick={() => setShowNew(!showNew)}
                                tabIndex="-1"
                                aria-label={showNew ? "Hide new password" : "Show new password"}
                            >
                                {showNew ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </label>

                    <label className="expiry-modal-field">
                        <span>Confirm New Password</span>
                        <div className="expiry-modal-input-wrapper">
                            <input
                                type={showConfirm ? "text" : "password"}
                                placeholder="Confirm new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={loading || success}
                                required
                            />
                            <button
                                type="button"
                                className="expiry-modal-toggle-btn"
                                onClick={() => setShowConfirm(!showConfirm)}
                                tabIndex="-1"
                                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                            >
                                {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </label>

                    {error && <div className="expiry-modal-error">{error}</div>}
                    {success && <div className="expiry-modal-success">{success}</div>}

                    <div className="expiry-modal-actions">
                        <button
                            type="submit"
                            className="expiry-modal-submit-btn"
                            disabled={loading || success}
                        >
                            {loading ? "Updating..." : "Update Password"}
                        </button>
                        <button
                            type="button"
                            className="expiry-modal-logout-btn"
                            onClick={logout}
                            disabled={loading}
                        >
                            Logout
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
