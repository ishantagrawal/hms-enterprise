import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import StudentView from "./components/StudentView";
import StaffView from "./components/StaffView";
import WardenView from "./components/WardenView";
import FounderView from "./components/FounderView";

const API_URL = "https://hms-enterprise-mqvx.onrender.com";
export default function App() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [complaints, setComplaints] = useState([]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setTenant(data.tenant);
        fetchComplaints(data.user);
      } else {
        setError(data.detail || "Invalid Credentials");
      }
    } catch {
      setError("Cannot connect to server.");
    }
    setLoading(false);
  };

  const fetchComplaints = async (currUser) => {
    try {
      const query = new URLSearchParams({
        institute_id: currUser.institute_id,
        role: currUser.role,
        user_id: currUser.user_id,
        department: currUser.department || "",
        hostel_block: currUser.hostel_block || "",
      });
      const res = await fetch(`${API_URL}/api/complaints?${query}`);
      const data = await res.json();
      if (res.ok) setComplaints(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user) {
      const interval = setInterval(() => fetchComplaints(user), 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.brandBadge}>HMS ENTERPRISE</div>
          <h2 style={{ color: "#fff", margin: "10px 0 5px 0", fontSize: "22px" }}>Campus Portal</h2>
          <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "20px" }}>Multi-Tenant Grievance Management</p>

          {error && <div style={styles.errorBox}>{error}</div>}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <input
              type="text"
              placeholder="User ID (e.g. U26CE011 or DEAN01)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password (default: 123)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.loginBtn}>
              {loading ? "Authenticating..." : "Sign In to Dashboard"}
            </button>
          </form>

          <div style={styles.demoBox}>
            <strong style={{ color: "#38bdf8" }}>Quick Test Logins (Pass: 123):</strong><br />
            • Student: <code>U26CE011</code><br />
            • Warden: <code>W01</code><br />
            • Electrician: <code>STAFF_ELEC</code><br />
            • Dean: <code>DEAN01</code> (Pass: <code>SvnitDean@2026!</code>)<br />
            • Founder: <code>FOUNDER</code> (Pass: <code>IshantFounder@2026!</code>)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#090d16", minHeight: "100vh", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <Header user={user} tenant={tenant} onLogout={() => setUser(null)} />
      {user.role === "PlatformOwner" && <FounderView user={user} apiUrl={API_URL} />}
      {user.role === "Student" && <StudentView user={user} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />}
      {user.role === "DepartmentStaff" && <StaffView user={user} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />}
      {user.role === "Warden" && <WardenView user={user} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />}
    </div>
  );
}

const styles = {
  loginContainer: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#030712", padding: "16px" },
  loginCard: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: "20px", padding: "32px", width: "100%", maxWidth: "400px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)" },
  brandBadge: { background: "#2563eb", color: "#fff", display: "inline-block", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "800", letterSpacing: "1px" },
  errorBox: { background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", color: "#f87171", padding: "10px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" },
  input: { width: "100%", background: "#030712", border: "1px solid #334155", borderRadius: "10px", padding: "12px", color: "#fff", fontSize: "14px", boxSizing: "border-box" },
  loginBtn: { width: "100%", background: "#2563eb", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontWeight: "700", cursor: 'pointer', fontSize: '15px' },
  demoBox: { marginTop: "20px", background: "#030712", border: "1px solid #1e293b", borderRadius: "10px", padding: "12px", fontSize: "12px", color: "#94a3b8", lineHeight: "1.6" }
};