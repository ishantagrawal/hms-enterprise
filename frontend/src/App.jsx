import React, { useState, useEffect, useCallback } from 'react';
import StudentView from './components/StudentView';
import WardenView from './components/WardenView';
import ClubView from './components/ClubView';
import StaffView from './components/StaffView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('unicore_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [complaints, setComplaints] = useState([]);

  const fetchComplaints = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        role: user.role,
        user_id: user.user_id,
        hostel_block: user.hostel_block || 'All',
        department: user.department || ''
      });
      const res = await fetch(`${API_URL}/api/complaints?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComplaints(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load complaints:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userIdInput.trim(),
          password: passwordInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        localStorage.setItem('unicore_user', JSON.stringify(data.user));
      } else {
        setLoginError(data.detail || 'Invalid Position ID or Password');
      }
    } catch {
      setLoginError('Cannot reach backend server. Ensure FastAPI is running.');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('unicore_user');
    setUser(null);
    setUserIdInput('');
    setPasswordInput('');
    setLoginError(null);
  };

  const fillDemoLogin = (id, pwd = '123') => {
    setUserIdInput(id);
    setPasswordInput(pwd);
    setLoginError(null);
  };

  if (!user) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.logoBadge}>UNICORE</div>
          <h1 style={styles.loginTitle}>SVNIT Campus ERP & HMS</h1>
          <p style={styles.loginSub}>Role-Based Institutional Login (Position-Wise)</p>

          {loginError && <div style={styles.errorBox}>{loginError}</div>}

          <form onSubmit={handleLogin} style={styles.form}>
            <input
              type="text"
              placeholder="Position ID / Roll No (e.g., DEAN, U26CE011, CHRD)"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              required
              style={styles.input}
            />
            <input
              type="password"
              placeholder="Password (default: 123)"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              style={styles.input}
            />
            <button type="submit" disabled={loading} style={styles.loginBtn}>
              {loading ? 'Signing In...' : 'Sign In to Position Portal →'}
            </button>
          </form>

          <div style={styles.quickAccessBox}>
            <div style={styles.quickTitle}>⚡ One-Tap Demo Credentials (Password: 123)</div>
            <div style={styles.chipGrid}>
              <button type="button" onClick={() => fillDemoLogin('DEAN')} style={styles.demoChip}>🎓 Dean (DEAN)</button>
              <button type="button" onClick={() => fillDemoLogin('U26CE011')} style={styles.demoChip}>🧑‍🎓 Student (U26CE011)</button>
              <button type="button" onClick={() => fillDemoLogin('CHRD')} style={styles.demoChip}>🎭 Club (CHRD)</button>
              <button type="button" onClick={() => fillDemoLogin('ACM')} style={styles.demoChip}>💻 Club (ACM)</button>
              <button type="button" onClick={() => fillDemoLogin('GDSC')} style={styles.demoChip}>🚀 Club (GDSC)</button>
              <button type="button" onClick={() => fillDemoLogin('CW_GAJJAR')} style={styles.demoChip}>🏢 Warden (CW_GAJJAR)</button>
              <button type="button" onClick={() => fillDemoLogin('STAFF_ELEC')} style={styles.demoChip}>⚡ Staff (STAFF_ELEC)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          <div style={styles.appAvatar}>HMS</div>
          <div>
            <div style={styles.headerTitle}>SVNIT UniCore ERP</div>
            <div style={styles.headerSub}>
              {user.role === 'Student'
                ? `${user.hostel_block} • Rm ${user.room}`
                : `${user.authority_title || user.role}`}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={styles.signOutBtn}>Sign Out</button>
      </header>

      <main>
        {user.role === 'Student' && (
          <StudentView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
        {(user.role === 'Dean' || user.role === 'Warden') && (
          <WardenView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
        {user.role === 'ClubOrganizer' && (
          <ClubView
            user={user}
            apiUrl={API_URL}
          />
        )}
        {user.role === 'Staff' && (
          <StaffView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
      </main>
    </div>
  );
}

const styles = {
  appShell: { minHeight: '100vh', background: '#060911', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' },
  topHeader: {
    position: 'sticky', top: 0, zIndex: 150, height: '66px',
    background: '#0b1120', borderBottom: '1px solid #1e293b',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', maxWidth: '680px', margin: '0 auto'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  appAvatar: {
    width: '42px', height: '42px', borderRadius: '12px',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff', fontWeight: '800', fontSize: '13px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: '16px', fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: '12px', color: '#94a3b8' },
  signOutBtn: {
    background: 'rgba(239, 68, 68, 0.12)', color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '999px',
    padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
  },
  loginPage: {
    minHeight: '100vh', background: '#060911', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '16px',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  loginCard: {
    width: '100%', maxWidth: '430px', background: '#0f172a',
    border: '1px solid #1e293b', borderRadius: '22px', padding: '28px 22px',
    textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
  },
  logoBadge: {
    display: 'inline-block', background: 'rgba(139, 92, 246, 0.18)',
    color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.4)',
    padding: '5px 14px', borderRadius: '999px', fontSize: '11px',
    fontWeight: '800', letterSpacing: '1px', marginBottom: '10px'
  },
  loginTitle: { margin: '0 0 6px 0', color: '#f8fafc', fontSize: '22px', fontWeight: '800' },
  loginSub: { margin: '0 0 20px 0', color: '#94a3b8', fontSize: '13px' },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#f87171', padding: '12px', borderRadius: '12px',
    fontSize: '13px', fontWeight: '600', marginBottom: '16px'
  },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: {
    width: '100%', background: '#090d16', border: '1px solid #334155',
    borderRadius: '12px', padding: '13px 14px', color: '#f8fafc',
    fontSize: '14px', boxSizing: 'border-box', outline: 'none'
  },
  loginBtn: {
    width: '100%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff', border: 'none', borderRadius: '12px', padding: '14px',
    fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '4px'
  },
  quickAccessBox: {
    marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #1e293b', textAlign: 'left'
  },
  quickTitle: { fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' },
  chipGrid: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  demoChip: {
    background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
    borderRadius: '8px', padding: '6px 10px', fontSize: '11px',
    fontWeight: '600', cursor: 'pointer'
  }
};