import React, { useState, useEffect } from 'react';
import DeanPortal from './components/DeanPortal';
import WardenPortal from './components/WardenPortal';
import ClubPortal from './components/clubPortal';
import StudentPortal from './components/StudentPortal';
import StaffPortal from './components/StaffPortal';
import FounderPortal from './components/FounderPortal';

window.GLOBAL_SILICON_VALLEY_CSS = '';

const API_URL = import.meta.env.VITE_API_URL || 'https://hms-enterprise-mqvx.onrender.com';

// Built-in Founder Ad Manager Component (Login ID: FOUNDER | Pass: ishant123)
function FounderAdPortal({ apiUrl }) {
  const [ads, setAds] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    sponsor_tag: 'SVNIT CAMPUS PARTNER',
    title: '',
    subtitle: '',
    badge_text: 'LIMITED TIME OFFER',
    cta_text: 'Apply Now →',
    target_url: '',
    image_url: '',
    bg_gradient: 'linear-gradient(135deg, #002970 0%, #0284C7 100%)',
    days_valid: 15
  });

  const loadAds = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/ads`);
      if (res.ok) setAds(await res.json());
    } catch {}
  };

  useEffect(() => { loadAds(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/ads/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setForm({ ...form, title: '', subtitle: '', target_url: '', image_url: '' });
      loadAds();
    }
  };

  const handleDelete = async (id) => {
    await fetch(`${apiUrl}/api/ads/delete?ad_id=${id}`, { method: 'POST' });
    loadAds();
  };

  return (
    <div className="ptm-page-wrap">
      {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}
      <div className="ptm-drill-header">
        <span className="ptm-tag-pill">FOUNDER SPONSORSHIP STUDIO</span>
        <h1 className="ptm-page-title">Paytm-Style Campus Ad Manager</h1>
        <p className="ptm-page-sub">Publish 15-day promotional banners directly to all Student & Warden Home screens.</p>
      </div>

      <div className="ptm-card">
        <div className="ptm-section-title">Create New Promotional Ad Banner</div>
        <form onSubmit={handleCreate} className="ptm-form-stack">
          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Top Brand / Sponsor Tag</label>
              <input type="text" className="ptm-input" placeholder="e.g. UNACADEMY • CAMPUS SPONSOR" value={form.sponsor_tag} onChange={(e) => setForm({ ...form, sponsor_tag: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Duration (Auto-Expires After Days)</label>
              <input type="number" className="ptm-input" value={form.days_valid} onChange={(e) => setForm({ ...form, days_valid: Number(e.target.value) })} required />
            </div>
          </div>
          <div>
            <label className="ptm-label">Main Headline (Paytm IPO Style)</label>
            <input type="text" className="ptm-input" placeholder="e.g. GATE & CAT 2027 Batch is Open!" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Subtitle / Offer Date</label>
              <input type="text" className="ptm-input" placeholder="e.g. Flat 40% Off for SVNIT Students" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Right Highlight Text (Optional)</label>
              <input type="text" className="ptm-input" placeholder="e.g. Special ₹999 Pass" value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} />
            </div>
          </div>
          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Click Destination Link (Website / WhatsApp / Form)</label>
              <input type="url" className="ptm-input" placeholder="https://..." value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Button Label</label>
              <input type="text" className="ptm-input" placeholder="Apply Now →" value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="ptm-label">Banner Theme Color</label>
            <select className="ptm-input" value={form.bg_gradient} onChange={(e) => setForm({ ...form, bg_gradient: e.target.value })}>
              <option value="linear-gradient(135deg, #002970 0%, #0284C7 100%)">Paytm Royal Blue (Default)</option>
              <option value="linear-gradient(135deg, #0F172A 0%, #1E40AF 100%)">Midnight Tech Navy</option>
              <option value="linear-gradient(135deg, #065F46 0%, #059669 100%)">Emerald Cashback Green</option>
              <option value="linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)">Sunset Fest Orange</option>
            </select>
          </div>
          <button type="submit" className="ptm-btn-primary">🚀 Publish Live Sponsor Banner</button>
        </form>
      </div>

      <div className="ptm-card">
        <div className="ptm-section-title">Active Live Banners ({ads.length})</div>
        {ads.length === 0 ? (
          <div className="ptm-list-sub">No active ads running right now.</div>
        ) : (
          <div className="ptm-list">
            {ads.map((ad) => (
              <div key={ad.ad_id} className="ptm-list-row">
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{ad.title} ({ad.sponsor_tag})</div>
                  <div className="ptm-list-sub">{ad.subtitle} • Expires: {ad.expires_at}</div>
                </div>
                <button className="ptm-btn-danger" style={{ width: 'auto', padding: '7px 14px' }} onClick={() => handleDelete(ad.ad_id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverProgress, setServerProgress] = useState(0);

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

  const isFounder = user?.role === 'Founder' || user?.user_id === 'FOUNDER';
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SV';

  return (
    <div className="ptm-root">
      <style>{PAYTM_APPLE_CSS}</style>

      {showInstallHelp ? (
        <div className="ptm-main-container">
          <div className="ptm-page-wrap">
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setShowInstallHelp(false)}>←</button>
              <h1 className="ptm-page-title">Install SVNIT HMS App</h1>
            </div>
            <div className="ptm-card">
              <div className="ptm-section-title">Download on Your Phone</div>
              <div className="ptm-list">
                <div className="ptm-list-row">
                  <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#0369A1' }}>🤖</div>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">Android (Chrome)</div>
                    <div className="ptm-list-sub">Tap the 3-dots menu (⋮) at the top-right and select "Install App" or "Add to Home Screen".</div>
                  </div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-avatar-pastel" style={{ background: '#F3E8FF', color: '#6D28D9' }}>🍎</div>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">iPhone (Safari)</div>
                    <div className="ptm-list-sub">Tap the Share button at the bottom of Safari and tap "Add to Home Screen".</div>
                  </div>
                </div>
              </div>
              <button className="ptm-btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowInstallHelp(false)}>
                Got It, Return to Portal
              </button>
            </div>
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
              <div className="ptm-header-left">
                <div className="ptm-user-avatar">{initials}</div>
                <div className="ptm-header-text">
                  <div className="ptm-header-title">
                    SVNIT <span style={{ color: '#00BAF2' }}>HMS</span>
                  </div>
                  <div className="ptm-header-sub">
                    {user.full_name}
                  </div>
                </div>
              </div>
              <div className="ptm-header-actions">
                <button className="ptm-install-chip" onClick={handleInstallClick}>
                  📲 <span className="ptm-hide-xs">Install</span>
                </button>
                {!isFounder && (
                  <button className="ptm-logout-btn" onClick={handleLogout}>
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="ptm-main-container">
            {isFounder && <FounderPortal apiUrl={API_URL} onLogout={handleLogout} />}
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

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    overflow-x: hidden;
    background: #F5F7FA;
    color: #111827;
    font-size: 14px;
    line-height: 1.45;
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

  /* FIXED MOBILE-SAFE HEADER (Never clips or overflows!) */
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
    min-height: 60px;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .ptm-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }
  .ptm-user-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #E8EAF6;
    color: #002970;
    font-weight: 800;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .ptm-header-text {
    min-width: 0;
    flex: 1;
  }
  .ptm-header-title {
    font-size: 16px;
    font-weight: 800;
    color: #002970;
    line-height: 1.2;
    white-space: nowrap;
  }
  .ptm-header-sub {
    font-size: 12px;
    color: #6B7280;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ptm-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .ptm-install-chip {
    background: #E0F2FE;
    color: #002970;
    border: 1px solid #BAE6FD;
    padding: 6px 11px;
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
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  /* PAYTM IPO-STYLE PROMO AD BANNER CAROUSEL */
  .ptm-promo-banner {
    border-radius: 18px;
    padding: 18px;
    color: #FFFFFF;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    box-shadow: 0 6px 18px rgba(0, 41, 112, 0.14);
    position: relative;
    overflow: hidden;
  }
  .ptm-promo-tag {
    display: inline-block;
    background: rgba(255, 255, 255, 0.18);
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
  }
  .ptm-promo-title {
    font-size: 18px;
    font-weight: 800;
    color: #FFFFFF !important;
    margin: 0 0 4px 0;
    line-height: 1.2;
  }
  .ptm-promo-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.88);
    margin: 0;
  }
  .ptm-promo-right {
    text-align: right;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .ptm-promo-cta {
    background: #00E5FF;
    color: #002970;
    border: none;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    text-decoration: none;
    white-space: nowrap;
  }

  /* LOGIN SCREEN */
  .ptm-login-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: linear-gradient(180deg, #E8F4FD 0%, #F5F7FA 100%);
  }
  .ptm-login-box {
    width: 100%;
    max-width: 420px;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 22px;
    padding: 28px 22px;
    box-shadow: 0 12px 32px rgba(0, 41, 112, 0.08);
  }
  .ptm-login-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .ptm-brand-pill {
    background: #002970;
    color: #FFFFFF;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
  }
  .ptm-login-heading {
    margin: 0 0 6px 0;
    font-size: 22px;
    font-weight: 800;
    color: #111827;
  }
  .ptm-login-sub {
    margin: 0 0 20px 0;
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
    padding: 14px 12px 92px 12px;
  }
  .ptm-shell-layout {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 20px;
    align-items: start;
  }
  .ptm-sidebar-desktop {
    background: #FFFFFF;
    border: 1px solid #EAEEF4;
    border-radius: 18px;
    padding: 12px;
    position: sticky;
    top: 76px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 2px 8px rgba(0, 41, 112, 0.03);
  }
  .ptm-side-btn {
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 12px;
    padding: 11px 14px;
    text-align: left;
    font-size: 13.5px;
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

  /* PAYTM DRILL-DOWN PAGE HEADER (Strictly Left-Aligned!) */
  .ptm-page-wrap {
    max-width: 880px;
    margin: 0 auto;
    width: 100%;
    text-align: left;
  }
  .ptm-drill-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
    gap: 6px;
    margin-bottom: 14px;
  }
  .ptm-back-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 1px solid #D1D5DB;
    color: #111827;
    font-size: 18px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .ptm-page-title {
    margin: 2px 0 0 0;
    font-size: 22px;
    font-weight: 800;
    color: #111827;
    text-align: left;
    line-height: 1.25;
  }
  .ptm-page-sub {
    margin: 0;
    font-size: 13px;
    color: #6B7280;
    text-align: left;
  }

  /* WHITE CARDS & SURFACES */
  .ptm-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 18px;
    padding: 16px;
    margin-bottom: 14px;
    box-shadow: 0 1px 4px rgba(0, 41, 112, 0.03);
    text-align: left;
  }
  .ptm-section-title {
    font-size: 16px;
    font-weight: 800;
    color: #111827;
    margin: 0 0 12px 0;
    text-align: left;
  }

  /* PAYTM 4-COLUMN CIRCULAR ICON GRID */
  .ptm-icon-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    text-align: center;
  }
  .ptm-icon-tile {
    background: transparent;
    border: none;
    padding: 6px 2px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    border-radius: 12px;
  }
  .ptm-icon-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #002970;
    color: #FFFFFF;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 3px 8px rgba(0, 41, 112, 0.14);
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
    font-size: 11.5px;
    font-weight: 600;
    color: #1F2937;
    line-height: 1.25;
  }

  /* PAYTM SUMMARY MINI-CARDS */
  .ptm-mini-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .ptm-mini-card {
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 16px;
    padding: 14px;
    cursor: pointer;
    text-align: left;
    box-shadow: 0 1px 4px rgba(0, 41, 112, 0.03);
  }
  .ptm-mini-btn {
    margin-top: 8px;
    width: 100%;
    background: #F1F5F9;
    color: #111827;
    border: none;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* PAYTM LIST ROWS */
  .ptm-list {
    display: flex;
    flex-direction: column;
  }
  .ptm-list-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 4px;
    border-bottom: 1px solid #F1F5F9;
    cursor: pointer;
    text-align: left;
  }
  .ptm-list-row:last-child {
    border-bottom: none;
  }
  .ptm-avatar-pastel {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: #FEF3C7;
    color: #B45309;
    font-weight: 800;
    font-size: 15px;
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
    font-size: 14.5px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2px;
  }
  .ptm-list-sub {
    font-size: 12.5px;
    color: #6B7280;
    line-height: 1.4;
    word-break: break-word;
  }
  .ptm-tag-pill {
    display: inline-block;
    margin-top: 4px;
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    color: #374151;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .ptm-status-badge {
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* FORMS & INPUTS */
  .ptm-form-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }
  .ptm-grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  .ptm-label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    margin-bottom: 5px;
  }
  .ptm-input {
    width: 100%;
    background: #FFFFFF;
    border: 1.5px solid #D1D5DB;
    border-radius: 12px;
    padding: 11px 13px;
    font-size: 14px;
    color: #111827;
    outline: none;
  }
  .ptm-input:focus {
    border-color: #002970;
  }
  .ptm-search-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #FFFFFF;
    border: 1.5px solid #D1D5DB;
    border-radius: 999px;
    padding: 10px 16px;
    margin-bottom: 14px;
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
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .ptm-btn-secondary {
    background: #E8F4FD;
    color: #002970;
    border: 1px solid #BAE6FD;
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .ptm-btn-danger {
    width: 100%;
    background: #FEE2E2;
    color: #DC2626;
    border: 1px solid #FECACA;
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  /* UNIFORM CALENDAR GRID */
  .ptm-cal-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 5px;
  }
  .ptm-cal-weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #6B7280;
    padding: 4px 0;
  }
  .ptm-cal-cell {
    height: 62px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: pointer;
    overflow: hidden;
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
    font-size: 12px;
    font-weight: 700;
    color: #1F2937;
  }
  .ptm-cal-event-chip {
    font-size: 9.5px;
    font-weight: 700;
    background: #002970;
    color: #FFFFFF;
    padding: 2px 4px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ptm-row-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  .ptm-toast {
    background: #002970;
    color: #FFFFFF;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 14px;
    cursor: pointer;
  }

  /* MOBILE BOTTOM BAR */
  .ptm-bottom-nav {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 64px;
    background: #FFFFFF;
    border-top: 1px solid #E5E7EB;
    justify-content: space-around;
    align-items: center;
    z-index: 150;
  }
  .ptm-bnav-btn {
    background: none;
    border: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
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
  }
  @media (max-width: 420px) {
    .ptm-hide-xs {
      display: none;
    }
    .ptm-cal-cell {
      height: 54px;
    }
  }
`;