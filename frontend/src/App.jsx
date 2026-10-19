import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import StudentView from './components/StudentView';
import StaffView from './components/StaffView';
import WardenView from './components/WardenView';

const API_URL = import.meta.env.VITE_API_URL || "https://hms-backend-live.onrender.com";

export default function App() {
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [complaints, setComplaints] = useState([]);

  const fetchComplaints = async (activeSession = session) => {
    if (!activeSession) return;
    const { user } = activeSession;
    const url = `${API_URL}/api/complaints?institute_id=${user.institute_id}&role=${user.role}&user_id=${user.user_id}&department=${encodeURIComponent(user.department)}&hostel_block=${encodeURIComponent(user.hostel_block)}`;
    const res = await fetch(url);
    const data = await res.json();
    setComplaints(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    if (session) {
      fetchComplaints(session);
      const timer = setInterval(() => fetchComplaints(session), 4000);
      return () => clearInterval(timer);
    }
  }, [session]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(data);
      } else {
        setError(data.detail || 'Invalid credentials');
      }
    } catch {
      setError('Backend server is not running! Start FastAPI on port 8000.');
    }
  };

  if (!session) {
    return (
      <div style={styles.loginBg}>
        <div style={styles.loginCard}>
          <div style={styles.hmsLogo}>HMS</div>
          <h1 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '24px' }}>HMS Enterprise</h1>
          <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '13px' }}>
            Multi-Tenant Campus Grievance & Operations Engine
          </p>
          {error && <div style={styles.err}>{error}</div>}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input type="text" placeholder="Scholar ID / Staff ID (e.g. U26CE011)" value={userId} onChange={(e) => setUserId(e.target.value)} required style={styles.input} />
            <input type="password" placeholder="Password (Demo: 123)" value={password} onChange={(e) => setPassword(e.target.value)} required style={styles.input} />
            <button type="submit" style={styles.loginBtn}>Sign In to Campus Workspace</button>
          </form>
          <div style={styles.demoBox}>
            <strong>SVNIT Pilot Logins (Password for all: <code>123</code>):</strong><br />
            • Student: <code>U26CE011</code> | Hostel Warden: <code>W01</code><br />
            • <strong>Campus Admins:</strong> Chief Warden: <code>CW01</code> | Assoc. Dean: <code>AD01</code> | Dean SW: <code>DEAN01</code><br />
            • CCC Internet Wing: <code>STAFF_CCC</code><br />
            • Electrical Wing: <code>STAFF_ELEC</code><br />
            • Water & Plumbing: <code>STAFF_WATER</code><br />
            • Furniture & Civil: <code>STAFF_FURN</code><br />
            • Mess Committee: <code>STAFF_MESS</code>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#060911', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Header user={session.user} tenant={session.tenant} onLogout={() => setSession(null)} />
      {session.user.role === 'Student' && <StudentView user={session.user} complaints={complaints} onRefresh={() => fetchComplaints()} apiUrl={API_URL} />}
      {session.user.role === 'DepartmentStaff' && <StaffView user={session.user} complaints={complaints} onRefresh={() => fetchComplaints()} apiUrl={API_URL} />}
      {session.user.role === 'Warden' && <WardenView user={session.user} complaints={complaints} onRefresh={() => fetchComplaints()} apiUrl={API_URL} />}
    </div>
  );
}

const styles = {
  loginBg: { minHeight: '100vh', background: '#060911', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif' },
  loginCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '24px', padding: '40px', width: '90%', maxWidth: '410px', textAlign: 'center' },
  hmsLogo: { width: '60px', height: '60px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontWeight: '800', fontSize: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' },
  input: { background: '#090d16', border: '1px solid #334155', padding: '13px 16px', borderRadius: '12px', color: '#fff', fontSize: '14px' },
  loginBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' },
  err: { background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '10px', borderRadius: '10px', fontSize: '13px', marginBottom: '14px' },
  demoBox: { marginTop: '20px', padding: '12px', background: '#090d16', borderRadius: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'left', lineHeight: '1.7' }
};