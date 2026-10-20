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

const GLOBAL_SILICON_VALLEY_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #050811; color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; -webkit-font-smoothing: antialiased; }
  .hms-root { min-height: 100vh; display: flex; flex-direction: column; background: radial-gradient(circle at 50% 0%, #111827 0%, #050811 65%); }

  /* Animations */
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .anim-fade-up { animation: fadeInUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .anim-scale-in { animation: scaleIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

  /* Topbar */
  .hms-topbar { position: sticky; top: 0; z-index: 150; background: rgba(9, 13, 24, 0.85); backdrop-filter: blur(16px); border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .hms-topbar-inner { max-width: 1260px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
  .hms-brand-box { width: 44px; height: 44px; border-radius: 13px; background: linear-gradient(135deg, #8b5cf6, #3b82f6); color: #fff; font-weight: 900; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(139, 92, 246, 0.35); }
  .hms-brand-title { font-size: 16px; font-weight: 800; color: #f8fafc; letter-spacing: -0.2px; }
  .hms-brand-sub { font-size: 12px; color: #94a3b8; }
  .hms-signout-btn { background: rgba(239, 68, 68, 0.14); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; }
  .hms-signout-btn:hover { background: rgba(239, 68, 68, 0.28); transform: translateY(-1px); }

  .hms-main { flex: 1; width: 100%; max-width: 1260px; margin: 0 auto; padding: 22px 16px 100px 16px; }
  .hms-container { width: 100%; }

  /* Login Card */
  .hms-login-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .hms-login-card { width: 100%; max-width: 430px; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 26px; padding: 38px 28px; text-align: center; box-shadow: 0 25px 65px rgba(0, 0, 0, 0.7); }
  .hms-logo-pill { display: inline-block; background: rgba(139, 92, 246, 0.18); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); padding: 6px 16px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 14px; }
  .hms-login-title { margin: 0 0 6px 0; font-size: 23px; font-weight: 800; color: #f8fafc; }
  .hms-login-sub { margin: 0 0 26px 0; font-size: 13px; color: #94a3b8; }
  .hms-error-alert { background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .hms-waking-box { background: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 22px 18px; margin: 10px 0; }
  .hms-progress-track { width: 100%; height: 8px; background: #1e293b; border-radius: 999px; overflow: hidden; }
  .hms-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 999px; transition: width 0.3s ease; }

  /* Responsive Grids & Cards */
  .hms-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
  .hms-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 16px; }
  .hms-grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
  .hms-grid-calendar-layout { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; align-items: start; }
  .hms-card { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25); }
  .hms-stat-card { background: linear-gradient(145deg, rgba(30, 41, 59, 0.65), rgba(15, 23, 42, 0.9)); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 18px; }
  .hms-empty-card { background: rgba(15, 23, 42, 0.6); border: 1px dashed #334155; border-radius: 18px; padding: 40px 20px; text-align: center; color: #94a3b8; }
  .hms-item-card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 16px; padding: 16px; display: flex; align-items: flex-start; gap: 14px; cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
  .hms-item-card:hover { border-color: #8b5cf6; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(139, 92, 246, 0.15); }
  .hms-avatar-circle { width: 48px; height: 48px; border-radius: 14px; background: rgba(30, 41, 59, 0.9); display: flex; align-items: center; justify-content: center; font-size: 21px; flex-shrink: 0; overflow: hidden; }
  .hms-profile-avatar { width: 82px; height: 82px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #3b82f6); color: #fff; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto; overflow: hidden; border: 3px solid #1e293b; }

  /* Instagram-style Club Cover & Header */
  .hms-ig-banner { width: 100%; height: 190px; border-radius: 16px; background-size: cover; background-position: center; position: relative; margin-bottom: 42px; border: 1px solid rgba(255,255,255,0.1); }
  .hms-ig-avatar { width: 78px; height: 78px; border-radius: 20px; background: linear-gradient(135deg, #8b5cf6, #3b82f6); border: 4px solid #0f172a; position: absolute; bottom: -34px; left: 22px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; color: #fff; overflow: hidden; }
  .hms-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .hms-gallery-item { background: #090d16; border: 1px solid #1e293b; border-radius: 14px; overflow: hidden; }
  .hms-gallery-item img, .hms-gallery-item video { width: 100%; height: 150px; object-fit: cover; display: block; }

  /* WhatsApp-style 3-Stage Ticket Timeline */
  .hms-timeline-box { background: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; margin: 12px 0; display: flex; flex-direction: column; gap: 10px; }
  .hms-tl-step { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .hms-tl-dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; flex-shrink: 0; }

  /* Text & Pills */
  .hms-item-title { font-size: 15px; font-weight: 700; color: #f8fafc; }
  .hms-item-sub { font-size: 13px; color: #94a3b8; margin-top: 3px; line-height: 1.45; }
  .hms-muted { font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .hms-muted-xs { font-size: 11px; color: #64748b; }
  .hms-section-label { font-size: 12px; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 12px; }
  .hms-label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
  .hms-pill-badge { display: inline-block; background: rgba(139, 92, 246, 0.16); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .hms-status-pill { font-size: 11px; font-weight: 700; border: 1px solid; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .hms-badge-inline { background: #8b5cf6; color: #fff; font-size: 10px; padding: 2px 7px; border-radius: 999px; margin-left: 6px; }

  /* Inputs & Buttons */
  .hms-stack { display: flex; flex-direction: column; gap: 12px; }
  .hms-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hms-row-item { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
  .hms-input { width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 14px; outline: none; transition: 0.2s; }
  .hms-input:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.18); }
  .hms-pass-wrap { position: relative; width: 100%; }
  .hms-eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 17px; }
  .hms-btn-primary { width: 100%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.2s; }
  .hms-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(139, 92, 246, 0.35); }
  .hms-btn-primary-sm { background: #8b5cf6; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .hms-btn-danger { width: 100%; background: #ef4444; color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .hms-btn-ghost-sm { background: #1e293b; color: #c084fc; border: 1px solid #334155; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .hms-file-label { display: inline-flex; align-items: center; gap: 8px; background: #1e293b; color: #e2e8f0; border: 1px dashed #64748b; padding: 10px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; cursor: pointer; width: 100%; justify-content: center; }

  /* Search & Navigation */
  .hms-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .hms-search-box { flex: 1; min-width: 240px; display: flex; align-items: center; gap: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 999px; padding: 10px 16px; }
  .hms-search-box input { background: transparent; border: none; outline: none; color: #f8fafc; font-size: 14px; width: 100%; }
  .hms-subtab-group { display: flex; gap: 8px; background: #090d16; padding: 6px; border-radius: 12px; border: 1px solid #1e293b; flex-wrap: wrap; margin-bottom: 16px; }
  .hms-subtab { background: transparent; color: #94a3b8; border: none; padding: 9px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .hms-subtab.active { background: #8b5cf6; color: #fff; }

  /* Calendar */
  .hms-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #1e293b; border: 1px solid #1e293b; border-radius: 14px; overflow: hidden; }
  .hms-cal-head { background: #0f172a; text-align: center; padding: 10px 0; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
  .hms-cal-day { background: #090d16; min-height: 82px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
  .hms-cal-day.empty { opacity: 0.35; }
  .hms-cal-num { font-size: 11px; font-weight: 700; color: #64748b; }
  .hms-cal-pill { font-size: 10px; font-weight: 700; color: #fff; padding: 3px 6px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Modals & Toasts */
  .hms-toast { background: #1e293b; border-left: 4px solid #8b5cf6; padding: 14px 18px; border-radius: 12px; color: #f8fafc; font-size: 13px; font-weight: 700; margin-bottom: 16px; cursor: pointer; box-shadow: 0 12px 30px rgba(0,0,0,0.45); }
  .hms-modal-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 300; }
  .hms-modal-box { background: #0f172a; border: 1px solid #334155; border-radius: 22px; padding: 24px; width: 100%; max-width: 580px; max-height: 90vh; overflow-y: auto; }
  .hms-close-btn { background: #1e293b; color: #cbd5e1; border: none; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-weight: 800; }
  .hms-detail-box { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 14px; font-size: 13px; color: #cbd5e1; margin-top: 10px; }
  .hms-event-img { width: 100%; height: 200px; object-fit: cover; border-radius: 14px; margin-bottom: 12px; }
  .hms-link-btn { display: block; text-align: center; background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid #8b5cf6; padding: 12px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 13px; margin-top: 12px; }

  /* Responsive Tabs */
  .hms-desktop-tabs { display: flex; gap: 8px; background: rgba(15, 23, 42, 0.9); padding: 8px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); margin-bottom: 22px; overflow-x: auto; }
  .hms-dtab { background: transparent; color: #94a3b8; border: none; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; transition: 0.2s; }
  .hms-dtab.active { background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; box-shadow: 0 4px 14px rgba(139, 92, 246, 0.35); }
  .hms-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 72px; background: rgba(11, 17, 32, 0.96); backdrop-filter: blur(16px); border-top: 1px solid #1e293b; justify-content: space-around; align-items: center; z-index: 200; }
  .hms-bnav-item { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex: 1; }
  .hms-bnav-item span:first-child { font-size: 19px; }
  .hms-bnav-item.active { color: #c084fc; }
  .hms-fab-mobile { display: none; position: fixed; right: 20px; bottom: 88px; width: 56px; height: 56px; border-radius: 18px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; border: none; font-size: 28px; font-weight: 800; cursor: pointer; z-index: 190; box-shadow: 0 10px 25px rgba(139, 92, 246, 0.5); }

  @media (max-width: 768px) {
    .hms-desktop-tabs { display: none; }
    .hms-bottom-nav { display: flex; }
    .hms-fab-mobile { display: flex; align-items: center; justify-content: center; }
    .hms-grid-calendar-layout, .hms-grid-2, .hms-grid-3 { grid-template-columns: 1fr; }
  }
`;