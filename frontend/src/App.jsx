import React, { useState, useEffect } from 'react';
import DeanPortal from './components/DeanPortal';
import WardenPortal from './components/WardenPortal';
import ClubPortal from './components/ClubPortal';
import StudentPortal from './components/StudentPortal';
import StaffPortal from './components/StaffPortal';

const API_URL = import.meta.env.VITE_API_URL || 'https://hms-enterprise-mqvx.onrender.com';

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverProgress, setServerProgress] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hms_user');
      if (saved) setUser(JSON.parse(saved));
    } catch {}
    setAuthReady(true);
  }, []);

  useEffect(() => {
    let t;
    if (loading) {
      setServerProgress(14);
      t = setInterval(() => setServerProgress((p) => (p >= 92 ? p : p + 13)), 320);
    } else setServerProgress(0);
    return () => clearInterval(t);
  }, [loading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userIdInput.trim(), password: passwordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerProgress(100);
        setTimeout(() => {
          setUser(data.user);
          try { localStorage.setItem('hms_user', JSON.stringify(data.user)); } catch {}
          setLoading(false);
        }, 200);
      } else {
        setLoading(false);
        setLoginError(data.detail || 'Invalid Username / Roll No or Password');
      }
    } catch {
      setLoading(false);
      setLoginError('Cannot reach server. Please wait 15 seconds while Render wakes up the server.');
    }
  };

  const handleLogout = () => {
    try { localStorage.removeItem('hms_user'); } catch {}
    setUser(null);
    setUserIdInput('');
    setPasswordInput('');
    setLoginError(null);
  };

  if (!authReady) return null;

  return (
    <div className="hms-root">
      <style>{GLOBAL_SILICON_VALLEY_CSS}</style>
      {!user ? (
        <div className="hms-login-wrapper">
          <div className="hms-login-card anim-scale-in">
            <div className="hms-logo-pill">SVNIT SURAT • HMS</div>
            <h1 className="hms-login-title">Hostel Management System</h1>
            <p className="hms-login-sub">Sardar Vallabhbhai National Institute of Technology</p>

            {loginError && <div className="hms-error-alert">{loginError}</div>}

            {loading ? (
              <div className="hms-waking-box">
                <div className="hms-row-between" style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>Connecting to secure SVNIT server...</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#a78bfa' }}>{serverProgress}%</span>
                </div>
                <div className="hms-progress-track">
                  <div className="hms-progress-fill" style={{ width: `${serverProgress}%` }} />
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="hms-stack">
                <input
                  type="text"
                  className="hms-input"
                  placeholder="Username / Roll No (e.g. DEAN, CW_GAJJAR, ACM, U26CE011)"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  required
                />
                <div className="hms-pass-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="hms-input"
                    style={{ paddingRight: '46px' }}
                    placeholder="Password (or DOB DDMMYYYY)"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="hms-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <button type="submit" className="hms-btn-primary">Sign In →</button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="hms-topbar">
            <div className="hms-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="hms-brand-box">SVNIT</div>
                <div>
                  <div className="hms-brand-title">SVNIT Hostel & Campus Portal</div>
                  <div className="hms-brand-sub">{user.full_name} • {user.authority_title || user.role}</div>
                </div>
              </div>
              <button className="hms-signout-btn" onClick={handleLogout}>Sign Out</button>
            </div>
          </header>
          <main className="hms-main anim-fade-up">
            {user.role === 'Dean' && <DeanPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Warden' && <WardenPortal user={user} apiUrl={API_URL} />}
            {user.role === 'ClubOrganizer' && <ClubPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Student' && <StudentPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Staff' && <StaffPortal user={user} apiUrl={API_URL} />}
          </main>
        </>
      )}
    </div>
  );
}

const RESPONSIVE_CSS = `
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  body { 
    margin: 0; 
    background: #04070d; 
    color: #f1f5f9; 
    font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
    letter-spacing: -0.01em;
  }
  .hms-root { min-height: 100vh; display: flex; flex-direction: column; background: #04070d; }
  .hms-topbar { position: sticky; top: 0; z-index: 150; background: rgba(8, 13, 26, 0.88); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .hms-topbar-inner { max-width: 1280px; margin: 0 auto; height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
  .hms-brand-box { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(124, 58, 237, 0.3); }
  .hms-brand-title { font-size: 16px; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
  .hms-brand-sub { font-size: 12px; color: #94a3b8; font-weight: 500; }
  .hms-signout-btn { background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 999px; padding: 7px 16px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; }
  .hms-signout-btn:hover { background: rgba(239, 68, 68, 0.2); }
  .hms-main { flex: 1; width: 100%; max-width: 1280px; margin: 0 auto; padding: 24px 20px 100px 20px; }
  .hms-container { width: 100%; }
  .hms-login-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #04070d 70%); }
  .hms-login-card { width: 100%; max-width: 420px; background: #0b1329; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 40px 32px; text-align: center; box-shadow: 0 30px 60px rgba(0,0,0,0.7); }
  .hms-logo-pill { display: inline-block; background: rgba(124, 58, 237, 0.15); color: #c084fc; border: 1px solid rgba(124, 58, 237, 0.35); padding: 6px 16px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 16px; }
  .hms-login-title { margin: 0 0 6px 0; font-size: 24px; font-weight: 800; color: #f8fafc; letter-spacing: -0.03em; }
  .hms-login-sub { margin: 0 0 28px 0; font-size: 13px; color: #94a3b8; font-weight: 400; line-height: 1.5; }
  .hms-error-alert { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .hms-waking-box { background: #070b19; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 22px 18px; margin: 10px 0; }
  .hms-progress-track { width: 100%; height: 6px; background: #1e293b; border-radius: 999px; overflow: hidden; margin-top: 8px; }
  .hms-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #7c3aed); border-radius: 999px; transition: width 0.35s ease; }
  .hms-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
  .hms-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .hms-card { background: #0b1329; border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
  .hms-empty-card { background: #0b1329; border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 48px 20px; text-align: center; color: #94a3b8; font-weight: 500; }
  .hms-item-card { background: #0b1329; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 18px; display: flex; align-items: flex-start; gap: 16px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
  .hms-item-card:hover { border-color: rgba(124, 58, 237, 0.5); transform: translateY(-3px); box-shadow: 0 12px 30px rgba(0,0,0,0.4); }
  .hms-avatar-circle { width: 48px; height: 48px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .hms-profile-avatar { width: 80px; height: 80px; border-radius: 24px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; font-size: 28px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto; box-shadow: 0 10px 25px rgba(124, 58, 237, 0.4); }
  .hms-item-title { font-size: 15px; font-weight: 700; color: #f8fafc; letter-spacing: -0.01em; }
  .hms-item-sub { font-size: 13px; color: #94a3b8; margin-top: 3px; line-height: 1.45; font-weight: 400; }
  .hms-muted { font-size: 13px; color: #94a3b8; line-height: 1.5; font-weight: 400; }
  .hms-muted-xs { font-size: 11px; color: #64748b; font-weight: 500; }
  .hms-section-label { font-size: 11px; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 14px; }
  .hms-label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .hms-pill-badge { display: inline-block; background: rgba(124, 58, 237, 0.12); color: #c084fc; border: 1px solid rgba(124, 58, 237, 0.3); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .hms-status-pill { font-size: 11px; font-weight: 700; border: 1px solid; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .hms-badge-inline { background: #7c3aed; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; margin-left: 6px; }
  .hms-stack { display: flex; flex-direction: column; gap: 14px; }
  .hms-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .hms-row-item { background: #070b19; border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; }
  .hms-input { width: 100%; background: #070b19; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 13px 16px; color: #f8fafc; font-size: 14px; font-weight: 500; outline: none; transition: 0.2s; }
  .hms-input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.2); }
  .hms-pass-wrap { position: relative; width: 100%; }
  .hms-eye-btn { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 16px; opacity: 0.7; transition: 0.2s; }
  .hms-eye-btn:hover { opacity: 1; }
  .hms-btn-primary { width: 100%; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; border: none; border-radius: 14px; padding: 14px 20px; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; cursor: pointer; box-shadow: 0 10px 25px rgba(124, 58, 237, 0.35); transition: 0.2s; }
  .hms-btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }
  .hms-btn-primary-sm { background: #7c3aed; color: #fff; border: none; border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-btn-danger { width: 100%; background: #dc2626; color: #fff; border: none; border-radius: 14px; padding: 14px 20px; font-size: 14px; font-weight: 700; cursor: pointer; transition: 0.2s; }
  .hms-btn-danger:hover { opacity: 0.9; }
  .hms-btn-ghost-sm { background: rgba(255,255,255,0.04); color: #c084fc; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.2s; }
  .hms-btn-ghost-sm:hover { background: rgba(255,255,255,0.08); }
  .hms-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .hms-search-box { flex: 1; min-width: 260px; display: flex; align-items: center; gap: 10px; background: #0b1329; border: 1px solid rgba(255,255,255,0.06); border-radius: 999px; padding: 10px 18px; }
  .hms-search-box input { background: transparent; border: none; outline: none; color: #f8fafc; font-size: 14px; font-weight: 500; width: 100%; }
  .hms-toast { background: #0b1329; border-left: 4px solid #7c3aed; border: 1px solid rgba(255,255,255,0.08); padding: 14px 18px; border-radius: 12px; color: #f8fafc; font-size: 13px; font-weight: 600; margin-bottom: 20px; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.5); animation: slideIn 0.3s ease; }
  .hms-modal-backdrop { position: fixed; inset: 0; background: rgba(2, 4, 8, 0.82); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 300; }
  .hms-modal-box { background: #0b1329; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 28px; width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto; box-shadow: 0 25px 60px rgba(0,0,0,0.8); }
  .hms-close-btn { background: rgba(255,255,255,0.05); color: #cbd5e1; border: none; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-weight: 700; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
  .hms-close-btn:hover { background: rgba(255,255,255,0.1); }
  .hms-detail-box { background: #070b19; border: 1px solid rgba(255,255,255,0.05); border-radius: 14px; padding: 16px; font-size: 13px; color: #cbd5e1; margin-top: 12px; font-weight: 400; line-height: 1.5; }
  .hms-event-img { width: 100%; height: 200px; object-fit: cover; border-radius: 14px; margin-bottom: 14px; }
  .hms-desktop-tabs { display: flex; gap: 8px; background: #0b1329; padding: 8px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 24px; overflow-x: auto; }
  .hms-dtab { background: transparent; color: #94a3b8; border: none; padding: 11px 18px; border-radius: 12px; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: 0.2s; }
  .hms-dtab.active { background: #7c3aed; color: #fff; box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4); }
  .hms-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 72px; background: rgba(8, 13, 26, 0.95); backdrop-filter: blur(12px); border-top: 1px solid rgba(255,255,255,0.06); justify-content: space-around; align-items: center; z-index: 200; }
  .hms-bnav-item { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex: 1; }
  .hms-bnav-item span:first-child { font-size: 18px; }
  .hms-bnav-item.active { color: #c084fc; }
  .hms-fab-mobile { display: none; position: fixed; right: 20px; bottom: 88px; width: 56px; height: 56px; border-radius: 18px; background: #7c3aed; color: #fff; border: none; font-size: 28px; font-weight: 800; cursor: pointer; z-index: 190; box-shadow: 0 8px 25px rgba(124, 58, 237, 0.5); }
  @media (max-width: 768px) {
    .hms-desktop-tabs { display: none; }
    .hms-bottom-nav { display: flex; }
    .hms-fab-mobile { display: flex; align-items: center; justify-content: center; }
    .hms-grid-2, .hms-grid-3 { grid-template-columns: 1fr; }
  }
`;