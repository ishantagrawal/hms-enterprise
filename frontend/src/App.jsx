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

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hms_user');
      if (saved) setUser(JSON.parse(saved));
    } catch {}
    setAuthReady(true);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    let t;
    if (loading) {
      setServerProgress(15);
      t = setInterval(() => setServerProgress((p) => (p >= 92 ? p : p + 14)), 350);
    } else setServerProgress(0);
    return () => clearInterval(t);
  }, [loading]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstallHelp(true);
    }
  };

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
          try {
            localStorage.setItem('hms_user', JSON.stringify(data.user));
          } catch {}
          setLoading(false);
        }, 180);
      } else {
        setLoading(false);
        setLoginError(data.detail || 'Invalid Roll No / ID or Password');
      }
    } catch {
      setLoading(false);
      setLoginError('Connecting to SVNIT Server... Please try again in a few seconds.');
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('hms_user');
    } catch {}
    setUser(null);
    setUserIdInput('');
    setPasswordInput('');
  };

  if (!authReady) return null;

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SV';

  return (
    <div className="ptm-root">
      <style>{PAYTM_APPLE_CSS}</style>

      {showInstallHelp ? (
        <div className="ptm-page-wrap">
          <div className="ptm-drill-header">
            <button className="ptm-back-btn" onClick={() => setShowInstallHelp(false)}>←</button>
            <h1 className="ptm-page-title">Install SVNIT HMS App</h1>
          </div>
          <div className="ptm-card">
            <div className="ptm-section-title">How to Download & Install on Your Phone</div>
            <div className="ptm-list">
              <div className="ptm-list-row">
                <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#0369A1' }}>🤖</div>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">Android (Chrome Browser)</div>
                  <div className="ptm-list-sub">Tap the 3-dots menu (⋮) at the top-right of Chrome and select "Install App" or "Add to Home Screen".</div>
                </div>
              </div>
              <div className="ptm-list-row">
                <div className="ptm-avatar-pastel" style={{ background: '#F3E8FF', color: '#6D28D9' }}>🍎</div>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">iPhone / iPad (Safari Browser)</div>
                  <div className="ptm-list-sub">Tap the Share icon at the bottom of Safari and tap "Add to Home Screen".</div>
                </div>
              </div>
              <div className="ptm-list-row">
                <div className="ptm-avatar-pastel" style={{ background: '#DCFCE7', color: '#15803D' }}>💻</div>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">Laptop / Desktop (Chrome / Edge)</div>
                  <div className="ptm-list-sub">Click the install icon on the right side of the browser address bar.</div>
                </div>
              </div>
            </div>
            <button className="ptm-btn-primary" style={{ marginTop: '18px' }} onClick={() => setShowInstallHelp(false)}>
              Got It, Return to Portal
            </button>
          </div>
        </div>
      ) : !user ? (
        <div className="ptm-login-screen">
          <div className="ptm-login-box">
            <div className="ptm-login-top-row">
              <span className="ptm-brand-pill">SVNIT SURAT</span>
              <button type="button" className="ptm-install-chip" onClick={handleInstallClick}>
                📲 Install App
              </button>
            </div>
            <h1 className="ptm-login-heading">Campus & Hostel Portal</h1>
            <p className="ptm-login-sub">Sign in with your Roll Number & Date of Birth (DDMMYYYY) or Official ID</p>

            {loginError && <div className="ptm-alert-error">{loginError}</div>}

            {loading ? (
              <div className="ptm-loader-card">
                <div className="ptm-row-between" style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600, color: '#374151', fontSize: '13px' }}>Connecting to server...</span>
                  <span style={{ fontWeight: 800, color: '#002970', fontSize: '13px' }}>{serverProgress}%</span>
                </div>
                <div className="ptm-progress-bar">
                  <div className="ptm-progress-fill" style={{ width: `${serverProgress}%` }} />
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Roll Number / Official ID</label>
                  <input
                    type="text"
                    className="ptm-input"
                    placeholder="e.g. U26CE011, DEAN, CW_GAJJAR"
                    value={userIdInput}
                    onChange={(e) => setUserIdInput(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="ptm-label">Password or DOB (DDMMYYYY)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="ptm-input"
                      style={{ paddingRight: '44px' }}
                      placeholder="Enter DOB (e.g. 10072007) or Password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer'
                      }}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary" style={{ marginTop: '6px' }}>
                  Sign In Securely →
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="ptm-header">
            <div className="ptm-header-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="ptm-user-avatar">{initials}</div>
                <div>
                  <div className="ptm-header-title">
                    SVNIT <span style={{ color: '#00BAF2' }}>HMS</span>
                  </div>
                  <div className="ptm-header-sub">
                    {user.full_name} • {user.hostel_block !== 'All' ? user.hostel_block : user.authority_title}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="ptm-install-chip" onClick={handleInstallClick}>
                  📲 Install App
                </button>
                <button className="ptm-logout-btn" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
            </div>
          </header>

          <main className="ptm-main-container">
            {user.role === 'Dean' && <DeanPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Student' && <StudentPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Warden' && <WardenPortal user={user} apiUrl={API_URL} />}
            {user.role === 'ClubOrganizer' && <ClubPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Staff' && <StaffPortal user={user} apiUrl={API_URL} />}
          </main>
        </>
      )}
    </div>
  );
}

const PAYTM_APPLE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap');

  * {
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    -webkit-font-smoothing: antialiased;
  }

  body {
    margin: 0;
    background: #F5F7FA;
    color: #111827;
    font-size: 14px;
    line-height: 1.5;
  }

  h1, h2, h3, h4, .ptm-page-title, .ptm-section-title {
    font-family: 'Plus Jakarta Sans', 'Inter', sans-serif !important;
    letter-spacing: -0.02em;
    color: #111827;
  }

  .ptm-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #F5F7FA;
  }

  /* HEADER (Paytm Top Bar Style) */
  .ptm-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #FFFFFF;
    border-bottom: 1px solid #E5E7EB;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
  }
  .ptm-header-inner {
    max-width: 1280px;
    margin: 0 auto;
    height: 64px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ptm-user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #E8EAF6;
    color: #002970;
    font-weight: 800;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ptm-header-title {
    font-size: 17px;
    font-weight: 800;
    color: #002970;
    line-height: 1.2;
  }
  .ptm-header-sub {
    font-size: 12px;
    color: #6B7280;
    font-weight: 500;
  }
  .ptm-install-chip {
    background: #E0F2FE;
    color: #002970;
    border: 1px solid #BAE6FD;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .ptm-logout-btn {
    background: #FEE2E2;
    color: #B91C1C;
    border: none;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  /* LOGIN SCREEN */
  .ptm-login-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: linear-gradient(180deg, #E8F4FD 0%, #F5F7FA 100%);
  }
  .ptm-login-box {
    width: 100%;
    max-width: 420px;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 24px;
    padding: 32px 26px;
    box-shadow: 0 12px 32px rgba(0, 41, 112, 0.08);
  }
  .ptm-login-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .ptm-brand-pill {
    background: #002970;
    color: #FFFFFF;
    padding: 5px 14px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .ptm-login-heading {
    margin: 0 0 6px 0;
    font-size: 24px;
    font-weight: 800;
    color: #111827;
  }
  .ptm-login-sub {
    margin: 0 0 22px 0;
    font-size: 13px;
    color: #6B7280;
  }
  .ptm-alert-error {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    color: #DC2626;
    padding: 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
  }
  .ptm-loader-card {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    padding: 18px;
  }
  .ptm-progress-bar {
    width: 100%;
    height: 8px;
    background: #E2E8F0;
    border-radius: 999px;
    overflow: hidden;
  }
  .ptm-progress-fill {
    height: 100%;
    background: #002970;
    transition: width 0.3s ease;
  }

  /* ADAPTIVE DESKTOP VS MOBILE SHELL */
  .ptm-main-container {
    flex: 1;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 18px 16px 96px 16px;
  }
  .ptm-shell-layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 22px;
    align-items: start;
  }
  .ptm-sidebar-desktop {
    background: #FFFFFF;
    border: 1px solid #EAEEF4;
    border-radius: 20px;
    padding: 14px;
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0, 41, 112, 0.03);
  }
  .ptm-side-btn {
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 12px;
    padding: 12px 14px;
    text-align: left;
    font-size: 14px;
    font-weight: 600;
    color: #4B5563;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: 0.15s;
  }
  .ptm-side-btn:hover {
    background: #F3F4F6;
    color: #111827;
  }
  .ptm-side-btn.active {
    background: #002970;
    color: #FFFFFF;
    font-weight: 700;
  }

  /* PAYTM DRILL-DOWN PAGE HEADER (← Back & Large Title) */
  .ptm-page-wrap {
    max-width: 880px;
    margin: 0 auto;
    width: 100%;
  }
  .ptm-drill-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .ptm-back-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    color: #111827;
    font-size: 20px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .ptm-page-title {
    margin: 4px 0 0 0;
    font-size: 26px;
    font-weight: 800;
    color: #111827;
  }
  .ptm-page-sub {
    margin: 0;
    font-size: 13px;
    color: #6B7280;
  }

  /* WHITE CARDS & SURFACES */
  .ptm-card {
    background: #FFFFFF;
    border: 1px solid #EAEEF4;
    border-radius: 20px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 2px 10px rgba(0, 41, 112, 0.03);
  }
  .ptm-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .ptm-section-title {
    font-size: 17px;
    font-weight: 800;
    color: #111827;
    margin: 0 0 14px 0;
  }

  /* PAYTM 4-COLUMN CIRCULAR ICON GRID */
  .ptm-icon-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    text-align: center;
  }
  .ptm-icon-tile {
    background: transparent;
    border: none;
    padding: 8px 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border-radius: 14px;
    transition: transform 0.15s, background 0.15s;
  }
  .ptm-icon-tile:hover {
    background: #F8FAFC;
    transform: translateY(-2px);
  }
  .ptm-icon-circle {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #002970;
    color: #FFFFFF;
    font-size: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 4px 10px rgba(0, 41, 112, 0.15);
  }
  .ptm-icon-circle.light {
    background: #E8F4FD;
    color: #002970;
    box-shadow: none;
    border: 1px solid #BAE6FD;
  }
  .ptm-tile-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #EF4444;
    color: #FFFFFF;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 999px;
    border: 2px solid #FFFFFF;
  }
  .ptm-icon-label {
    font-size: 12px;
    font-weight: 600;
    color: #1F2937;
    line-height: 1.25;
  }

  /* PAYTM SUMMARY MINI-CARDS (Like Bank of India / UPI Lite) */
  .ptm-mini-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }
  .ptm-mini-card {
    background: #FFFFFF;
    border: 1px solid #EAEEF4;
    border-radius: 18px;
    padding: 16px;
    cursor: pointer;
    transition: 0.15s;
    box-shadow: 0 2px 8px rgba(0, 41, 112, 0.03);
  }
  .ptm-mini-card:hover {
    border-color: #00BAF2;
  }
  .ptm-mini-btn {
    margin-top: 10px;
    width: 100%;
    background: #F1F5F9;
    color: #111827;
    border: none;
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  /* PAYTM LIST ROWS (Like Payment History / Recharges) */
  .ptm-list {
    display: flex;
    flex-direction: column;
  }
  .ptm-list-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 4px;
    border-bottom: 1px solid #F1F5F9;
    cursor: pointer;
    transition: background 0.12s;
  }
  .ptm-list-row:last-child {
    border-bottom: none;
  }
  .ptm-list-row:hover {
    background: #F8FAFC;
  }
  .ptm-avatar-pastel {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: #FEF3C7;
    color: #B45309;
    font-weight: 800;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ptm-list-main {
    flex: 1;
    min-width: 0;
  }
  .ptm-list-title {
    font-size: 15px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2px;
  }
  .ptm-list-sub {
    font-size: 13px;
    color: #6B7280;
    line-height: 1.4;
  }
  .ptm-tag-pill {
    display: inline-block;
    margin-top: 6px;
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    color: #374151;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .ptm-status-badge {
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* FORMS & INPUTS */
  .ptm-form-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ptm-grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }
  .ptm-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 6px;
  }
  .ptm-input {
    width: 100%;
    background: #FFFFFF;
    border: 1.5px solid #D1D5DB;
    border-radius: 14px;
    padding: 12px 14px;
    font-size: 14px;
    color: #111827;
    outline: none;
    transition: border-color 0.15s;
  }
  .ptm-input:focus {
    border-color: #002970;
    box-shadow: 0 0 0 3px rgba(0, 41, 112, 0.08);
  }
  .ptm-search-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #FFFFFF;
    border: 1.5px solid #D1D5DB;
    border-radius: 999px;
    padding: 10px 18px;
    margin-bottom: 16px;
  }
  .ptm-search-pill input {
    border: none;
    outline: none;
    width: 100%;
    font-size: 14px;
    color: #111827;
    background: transparent;
  }

  /* BUTTONS */
  .ptm-btn-primary {
    width: 100%;
    background: #002970;
    color: #FFFFFF;
    border: none;
    border-radius: 14px;
    padding: 13px 18px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .ptm-btn-primary:hover {
    opacity: 0.92;
  }
  .ptm-btn-secondary {
    background: #E8F4FD;
    color: #002970;
    border: 1px solid #BAE6FD;
    border-radius: 12px;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .ptm-btn-danger {
    width: 100%;
    background: #FEE2E2;
    color: #DC2626;
    border: 1px solid #FECACA;
    border-radius: 14px;
    padding: 13px 18px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  /* FIXED UNIFORM CALENDAR GRID (Rows never stretch!) */
  .ptm-cal-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .ptm-cal-weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #6B7280;
    padding: 6px 0;
    text-transform: uppercase;
  }
  .ptm-cal-cell {
    height: 68px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    overflow: hidden;
    transition: 0.12s;
  }
  .ptm-cal-cell:hover {
    border-color: #00BAF2;
  }
  .ptm-cal-cell.selected {
    background: #E8F4FD;
    border: 2px solid #002970;
  }
  .ptm-cal-cell.empty {
    background: transparent;
    border: none;
    cursor: default;
  }
  .ptm-cal-daynum {
    font-size: 13px;
    font-weight: 700;
    color: #1F2937;
  }
  .ptm-cal-event-chip {
    font-size: 10px;
    font-weight: 700;
    background: #002970;
    color: #FFFFFF;
    padding: 2px 5px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .ptm-row-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .ptm-toast {
    background: #002970;
    color: #FFFFFF;
    padding: 12px 18px;
    border-radius: 14px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 41, 112, 0.2);
  }

  /* MOBILE BOTTOM BAR */
  .ptm-bottom-nav {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 68px;
    background: #FFFFFF;
    border-top: 1px solid #E5E7EB;
    justify-content: space-around;
    align-items: center;
    z-index: 150;
    box-shadow: 0 -2px 10px rgba(0,0,0,0.04);
  }
  .ptm-bnav-btn {
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
    color: #6B7280;
    cursor: pointer;
    flex: 1;
  }
  .ptm-bnav-btn.active {
    color: #002970;
    font-weight: 800;
  }

  @media (max-width: 900px) {
    .ptm-shell-layout {
      grid-template-columns: 1fr;
    }
    .ptm-sidebar-desktop {
      display: none;
    }
    .ptm-bottom-nav {
      display: flex;
    }
    .ptm-cal-cell {
      height: 58px;
      padding: 4px;
    }
  }
`;