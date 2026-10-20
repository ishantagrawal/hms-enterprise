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
        if (data.user.role !== "PlatformOwner") {
          fetchComplaints(data.user);
        }
      } else {
        setError(data.detail || "Invalid Position ID or Password");
      }
    } catch {
      setError("Server waking up or unreachable. Wait 20 seconds and try again.");
    }
    setLoading(false);
  };

  const fetchComplaints = async (currUser) => {
    if (!currUser || currUser.role === "PlatformOwner") return;
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
    if (user && user.role !== "PlatformOwner") {
      const interval = setInterval(() => fetchComplaints(user), 8000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const fillQuickLogin = (id, pass) => {
    setUserId(id);
    setPassword(pass);
    setError(null);
  };

  if (!user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <div style={styles.brandBadge}>HMS ENTERPRISE • POSITION PORTAL</div>
          <h2 style={styles.title}>Campus Grievance & Hostel ERP</h2>
          <p style={styles.subtitle}>Role-Based Institutional Login (Position-Wise)</p>

          {error && <div style={styles.errorBox}>{error}</div>}

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="text"
              placeholder="Position ID (e.g. DEAN_SW, CW_GAJJAR, U26CE011)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.loginBtn}>
              {loading ? "Signing In..." : "Sign In to Position Portal →"}
            </button>
          </form>

          <div style={styles.demoBox}>
            <div style={{ color: "#38bdf8", fontWeight: "700", marginBottom: "8px" }}>
              ⚡ 1-Click Position Test Logins:
            </div>
            <div style={styles.chipGrid}>
              <button type="button" onClick={() => fillQuickLogin("FOUNDER", "IshantFounder@2026!")} style={styles.chip}>🌍 SaaS Founder</button>
              <button type="button" onClick={() => fillQuickLogin("DEAN_SW", "SvnitDean@2026!")} style={styles.chip}>🏛️ Dean SW Portal</button>
              <button type="button" onClick={() => fillQuickLogin("CW_GAJJAR", "123")} style={styles.chip}>🏢 Gajjar CW</button>
              <button type="button" onClick={() => fillQuickLogin("W_GAJJAR", "123")} style={styles.chip}>🏢 Gajjar Warden</button>
              <button type="button" onClick={() => fillQuickLogin("CW_BHABHA", "123")} style={styles.chip}>🏢 Bhabha CW</button>
              <button type="button" onClick={() => fillQuickLogin("STAFF_ELEC", "123")} style={styles.chip}>⚡ Electrical Staff</button>
              <button type="button" onClick={() => fillQuickLogin("STAFF_CCC", "123")} style={styles.chip}>🌐 CCC Wi-Fi Staff</button>
              <button type="button" onClick={() => fillQuickLogin("U26CE011", "123")} style={styles.chip}>🎓 Student (U26CE011)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#090d16", minHeight: "100vh", color: "#f8fafc", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Header user={user} tenant={tenant} onLogout={() => setUser(null)} />
      {user.role === "PlatformOwner" && <FounderView user={user} apiUrl={API_URL} />}
      {user.role === "Student" && <StudentView user={user} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />}
      {user.role === "DepartmentStaff" && <StaffView user={user} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />}
      {(user.role === "Dean" || user.role === "Warden") && (
        <WardenView user={user} tenant={tenant} complaints={complaints} apiUrl={API_URL} onRefresh={() => fetchComplaints(user)} />
      )}
    </div>
  );
}

const styles = {
  loginContainer: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#030712", padding: "16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  loginCard: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "430px", boxShadow: "0 20px 30px rgba(0,0,0,0.6)" },
  brandBadge: { background: "rgba(37, 99, 235, 0.2)", border: "1px solid #3b82f6", color: "#60a5fa", display: "inline-block", padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "800", letterSpacing: "0.8px" },
  title: { color: "#f8fafc", margin: "12px 0 4px 0", fontSize: "22px", fontWeight: "800" },
  subtitle: { color: "#94a3b8", fontSize: "13px", marginBottom: "18px" },
  errorBox: { background: "rgba(239, 68, 68, 0.12)", border: "1px solid #ef4444", color: "#f87171", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px", fontWeight: "600" },
  input: { width: "100%", background: "#030712", border: "1px solid #334155", borderRadius: "10px", padding: "12px 14px", color: "#fff", fontSize: "14px", boxSizing: "border-box" },
  loginBtn: { width: "100%", background: "#2563eb", color: "#fff", border: "none", borderRadius: "10px", padding: "13px", fontWeight: "700", cursor: "pointer", fontSize: "15px" },
  demoBox: { marginTop: "20px", background: "#030712", border: "1px solid #1e293b", borderRadius: "12px", padding: "14px", fontSize: "12px" },
  chipGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" },
  chip: { background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", padding: "7px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", cursor: "pointer", textAlign: "left" }
};