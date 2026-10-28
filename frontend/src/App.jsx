import React, { useState, useEffect, useCallback } from 'react';
import DeanPortal from './components/DeanPortal';
import WardenPortal from './components/WardenPortal';
import ClubPortal from './components/ClubPortal';
import StudentPortal from './components/StudentPortal';
import StaffPortal from './components/StaffPortal';
import FounderPortal from './components/FounderPortal';
import { apiFetch, API_URL } from './api';

window.GLOBAL_SILICON_VALLEY_CSS = '';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '312566505039-bvh0tfh4gao8bi6jqs65fkgni7pbn5bn.apps.googleusercontent.com';

const DEFAULT_SVNIT_HOSTELS = [
  'Atal Bihari Vajpayee Bhawan',
  'Bhabha Bhawan',
  'Gajjar Bhawan',
  'Mother Teresa Bhawan',
  'Nehru Bhawan',
  'Raman Bhawan',
  'Sarabhai Bhawan',
  'Swami Vivekananda Bhawan',
  'Tagore Bhawan'
];

const QUICK_AUTHORITY_ACCOUNTS = [
  { group: 'Institute Administration', id: 'DEAN', label: 'DEAN — Dean Student Welfare' },
  { group: 'Institute Administration', id: 'FOUNDER', label: 'FOUNDER — Platform & Sponsor Admin' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_GAJJAR', label: 'CW_GAJJAR — Gajjar Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_BHABHA', label: 'CW_BHABHA — Bhabha Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_SVB', label: 'CW_SVB — Swami Vivekananda Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_ABVB', label: 'CW_ABVB — Atal Bihari Vajpayee Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_MTB', label: 'CW_MTB — Mother Teresa Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_NEHRU', label: 'CW_NEHRU — Nehru Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_TAGORE', label: 'CW_TAGORE — Tagore Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_SARABHAI', label: 'CW_SARABHAI — Sarabhai Bhawan Warden' },
  { group: 'Hostel Chief Wardens (9 Bhawans)', id: 'CW_RAMAN', label: 'CW_RAMAN — Raman Bhawan Warden' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'ACM', label: 'ACM — ACM Student Chapter SVNIT' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'DRISHTI', label: 'DRISHTI — Robotics & Innovation Club' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'GDSC', label: 'GDSC — Google Developer Student Club' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'CHRD', label: 'CHRD — Cultural, Music, Dance & Arts' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'LAC', label: 'LAC — Literary & Debating Club' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'SCOSH', label: 'SCOSH — Science & Humanities Society' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'SAE', label: 'SAE — SAE Collegiate Motorsports Club' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'CES', label: 'CES — Civil Engineering Society (Kaizen)' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'EES', label: 'EES — Electrical Engineering Society' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'ISF', label: 'ISF — IETE Students Forum (ECE)' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'CHES', label: 'CHES — Chemical Engineering Society (AIChE)' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'CEV', label: 'CEV — Cutting Edge Visionaries' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'RENESA', label: 'RENESA — Official Campus Media & Magazine' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'MALANG', label: 'MALANG — Dramatics & Street Play Club' },
  { group: 'Official SVNIT Clubs & Chapters', id: 'NSS', label: 'NSS — National Service Scheme SVNIT' },
  { group: 'Central Maintenance Wings', id: 'ELECTRICITY', label: 'ELECTRICITY — Central Electrical Maintenance' },
  { group: 'Central Maintenance Wings', id: 'CCC_LAN', label: 'CCC_LAN — Central Internet / LAN Wing' },
  { group: 'Central Maintenance Wings', id: 'WATER_PLUMBING', label: 'WATER_PLUMBING — Central Water & Plumbing' },
  { group: 'Central Maintenance Wings', id: 'CARPENTRY', label: 'CARPENTRY — Central Carpentry Wing' }
];

function ProfileRow({ label, value }) {
  return (
    <div className="ptm-list-row">
      <div className="ptm-list-main">
        <div className="ptm-list-title">{label}</div>
        <div className="ptm-list-sub">{value || '—'}</div>
      </div>
    </div>
  );
}

function profileDraftFromUser(user) {
  return {
    hostel_block: user?.hostel_block || '',
    wing: user?.wing || '',
    room: user?.room || '',
    phone: user?.phone || ''
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginMode, setLoginMode] = useState('student'); // 'student' | 'authority'
  const [loginId, setLoginId] = useState('DEAN');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Connecting to SVNIT server...');
  const [hostels, setHostels] = useState(DEFAULT_SVNIT_HOSTELS);
  const [profileDraft, setProfileDraft] = useState({ hostel_block: '', wing: '', room: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  // Pre-warm the Render backend immediately when the app loads
  useEffect(() => {
    fetch(`${API_URL}/`).catch(() => {});
    fetch(`${API_URL}/api/hostels`)
      .then((res) => (res.ok ? res.json() : null))
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setHostels(list);
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogleCredential = useCallback(async (credential) => {
    setLoginError(null);
    setLoadingText('Verifying your SVNIT Google account...');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Google sign-in failed.');
      }
      localStorage.setItem('hms_google_credential', data.token || credential);
      localStorage.setItem('hms_user', JSON.stringify(data.user));
      setProfileDraft(profileDraftFromUser(data.user));
      setUser(data.user);
    } catch (error) {
      setLoginError(error.message || 'Could not verify your SVNIT Google account.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoadingText('Signing in to authority portal...');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: loginId.trim().toUpperCase(), password: loginPass })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Invalid User ID or Password.');
      }
      localStorage.setItem('hms_google_credential', data.token);
      localStorage.setItem('hms_user', JSON.stringify(data.user));
      setProfileDraft(profileDraftFromUser(data.user));
      setUser(data.user);
      setLoginPass('');
    } catch (error) {
      setLoginError(error.message || 'Could not sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      const credential = localStorage.getItem('hms_google_credential');
      const cachedUser = localStorage.getItem('hms_user');
      if (credential && cachedUser) {
        try {
          const parsed = JSON.parse(cachedUser);
          setProfileDraft(profileDraftFromUser(parsed));
          setUser(parsed);
        } catch {
          localStorage.removeItem('hms_user');
        }
        // Validate in background so UI opens immediately
        apiFetch(`${API_URL}/api/auth/me`)
          .then(async (res) => {
            if (!res.ok) throw new Error('Session expired');
            const data = await res.json();
            localStorage.setItem('hms_user', JSON.stringify(data.user));
            setProfileDraft(profileDraftFromUser(data.user));
            setUser(data.user);
          })
          .catch(() => {
            localStorage.removeItem('hms_google_credential');
            localStorage.removeItem('hms_user');
            setUser(null);
          });
      }
      setAuthReady(true);
    };
    restoreSession();

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const handleGoogleScriptError = () => {
      setLoginError('Google Sign-In could not load. Check your internet connection and refresh.');
    };
    const handleAuthExpired = () => {
      setUser(null);
      setShowProfile(false);
      setLoginError('Your session expired. Please sign in again.');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('google-identity-error', handleGoogleScriptError);
    window.addEventListener('hms-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('google-identity-error', handleGoogleScriptError);
      window.removeEventListener('hms-auth-expired', handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (!authReady || user || loading || loginMode !== 'student') return undefined;
    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: ({ credential }) => handleGoogleCredential(credential)
      });
      const container = document.getElementById('google-signin-button');
      if (container) {
        container.replaceChildren();
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          width: 300
        });
      }
      return true;
    };
    const script = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (!renderGoogleButton()) {
      script?.addEventListener('load', renderGoogleButton, { once: true });
      return () => script?.removeEventListener('load', renderGoogleButton);
    }
    return undefined;
  }, [authReady, user, loading, loginMode, handleGoogleCredential]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      setShowInstallHelp(true);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError('');
    try {
      const res = await apiFetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileDraft)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || 'Could not save your profile.');
      }
      localStorage.setItem('hms_user', JSON.stringify(data.user));
      setProfileDraft(profileDraftFromUser(data.user));
      setUser(data.user);
    } catch (error) {
      setProfileError(error.message || 'Could not save your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hms_user');
    localStorage.removeItem('hms_google_credential');
    setUser(null);
    setShowProfile(false);
  };

  if (!authReady) {
    return (
      <div className="ptm-root">
        <style>{PAYTM_APPLE_CSS}</style>
        <div className="ptm-login-screen">
          <div className="ptm-wheel-box">
            <div className="ptm-spinner-wheel" />
            <div style={{ fontWeight: 700, color: '#002970', marginTop: '12px' }}>Loading svnitcampus...</div>
          </div>
        </div>
      </div>
    );
  }

  const isFounder = user?.role === 'Founder' || user?.user_id === 'FOUNDER';
  const studentProfileIncomplete = user?.role === 'Student' && (!user.hostel_block || !user.wing || !user.room || !user.phone);
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
              <h1 className="ptm-page-title">Install svnitcampus App</h1>
            </div>
            <div className="ptm-card">
              <div className="ptm-section-title">Download on Your Phone</div>
              <div className="ptm-list">
                <div className="ptm-list-row">
                  <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#0369A1' }}>🤖</div>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">Android (Chrome / Brave)</div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img
                  src="https://upload.wikimedia.org/wikipedia/en/1/1b/NIT_Surat_Logo.svg"
                  alt="SVNIT"
                  style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <span className="ptm-brand-pill">SVNIT SURAT</span>
              </div>
              <button type="button" className="ptm-install-chip" onClick={handleInstallClick}>
                📲 Install App
              </button>
            </div>

            <h1 className="ptm-login-heading">svnitcampus Portal</h1>
            <p className="ptm-login-sub">Official Campus, Club & Hostel Management System</p>

            {/* Login Mode Tabs */}
            <div className="ptm-login-tabs">
              <button
                type="button"
                className={`ptm-login-tab ${loginMode === 'student' ? 'active' : ''}`}
                onClick={() => { setLoginMode('student'); setLoginError(null); }}
                disabled={loading}
              >
                🎓 Student Login
              </button>
              <button
                type="button"
                className={`ptm-login-tab ${loginMode === 'authority' ? 'active' : ''}`}
                onClick={() => { setLoginMode('authority'); setLoginError(null); }}
                disabled={loading}
              >
                🔐 Admin / Club / Staff
              </button>
            </div>

            {loginError && <div className="ptm-alert-error">{loginError}</div>}

            {/* Rotating Buffering Wheel Loader (Prevents any button overlap!) */}
            {loading && (
              <div className="ptm-wheel-box">
                <div className="ptm-spinner-wheel" />
                <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>
                  {loadingText}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                  Please wait a moment while we prepare your dashboard...
                </div>
              </div>
            )}

            {/* STUDENT GOOGLE LOGIN */}
            <div style={{ display: !loading && loginMode === 'student' ? 'block' : 'none' }}>
              <div className="ptm-form-stack" style={{ alignItems: 'center', padding: '10px 0 4px 0' }}>
                <div id="google-signin-button" style={{ minHeight: '44px', display: 'flex', justifyContent: 'center' }} />
                <p className="ptm-list-sub" style={{ textAlign: 'center', marginTop: '6px' }}>
                  Sign in with your institute Google account (<strong>@svnit.ac.in</strong> or <strong>@*.svnit.ac.in</strong>)
                </p>
              </div>
            </div>

            {/* DEAN / WARDEN / CLUB / STAFF PASSWORD LOGIN */}
            {!loading && loginMode === 'authority' && (
              <form onSubmit={handlePasswordLogin} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Quick Select Official Portal Role / Club</label>
                  <select
                    className="ptm-input"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                  >
                    {['Institute Administration', 'Hostel Chief Wardens (9 Bhawans)', 'Official SVNIT Clubs & Chapters', 'Central Maintenance Wings'].map((grp) => (
                      <optgroup key={grp} label={grp}>
                        {QUICK_AUTHORITY_ACCOUNTS.filter((x) => x.group === grp).map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ptm-label">Or Type Login ID Manually</label>
                  <input
                    type="text"
                    className="ptm-input"
                    placeholder="e.g. DEAN, CW_GAJJAR, ACM, DRISHTI"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <div>
                  <label className="ptm-label">Password</label>
                  <input
                    type="password"
                    className="ptm-input"
                    placeholder="Enter authority password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="ptm-btn-primary">
                  Sign In to Official Portal →
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="ptm-header">
            <div className="ptm-header-inner">
              <button type="button" className="ptm-header-left ptm-profile-trigger" onClick={() => setShowProfile(true)} aria-label="Open profile">
                <div className="ptm-user-avatar">{initials}</div>
                <div className="ptm-header-text">
                  <div className="ptm-header-title">
                    svnit<span style={{ color: '#00BAF2' }}>campus</span>
                  </div>
                  <div className="ptm-header-sub">
                    {user.full_name}
                  </div>
                </div>
              </button>
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

          {showProfile && !studentProfileIncomplete && (
            <div className="ptm-modal-backdrop" onClick={() => setShowProfile(false)}>
              <section className="ptm-modal-card" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="ptm-modal-close" onClick={() => setShowProfile(false)} aria-label="Close profile">×</button>
                <h2 id="profile-modal-title" className="ptm-page-title">Your Profile</h2>
                <div className="ptm-list">
                  <ProfileRow label="Name" value={user.full_name} />
                  <ProfileRow label={user.role === 'Student' ? 'Roll Number' : 'Account ID'} value={user.user_id} />
                  {user.role === 'Student' ? (
                    <>
                      <ProfileRow label="Academic Year" value={user.year || 'Not provided'} />
                      <ProfileRow label="Department / Branch" value={user.department || 'Not provided'} />
                      <ProfileRow label="Hostel Bhawan" value={user.hostel_block || 'Not set'} />
                      <ProfileRow label="Wing" value={user.wing || 'Not set'} />
                      <ProfileRow label="Room Number" value={user.room || 'Not set'} />
                      <ProfileRow label="Mobile Number" value={user.phone || 'Not set'} />
                    </>
                  ) : (
                    <>
                      <ProfileRow label="Role" value={user.role} />
                      <ProfileRow label="Department / Office" value={user.department || '—'} />
                      <ProfileRow label="Hostel Scope" value={user.hostel_block || '—'} />
                    </>
                  )}
                  <ProfileRow label="Official Email" value={user.email} />
                </div>
              </section>
            </div>
          )}

          {studentProfileIncomplete && (
            <div className="ptm-modal-backdrop">
              <section className="ptm-modal-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
                <span className="ptm-tag-pill">FIRST-TIME RESIDENT SETUP</span>
                <h2 id="onboarding-title" className="ptm-page-title">Complete Your Hostel Profile</h2>
                <p className="ptm-page-sub" style={{ marginBottom: '14px' }}>
                  Welcome, <strong>{user.full_name} ({user.user_id})</strong>! Select your current SVNIT Hostel Bhawan, Wing, and Room to activate hostel services.
                </p>
                {profileError && <div className="ptm-alert-error">{profileError}</div>}
                <form onSubmit={handleProfileSave} className="ptm-form-stack">
                  <label className="ptm-label">Select SVNIT Hostel Bhawan
                    <select
                      className="ptm-input"
                      value={profileDraft.hostel_block}
                      onChange={(event) => setProfileDraft({ ...profileDraft, hostel_block: event.target.value })}
                      required
                    >
                      <option value="">-- Choose Your Hostel Bhawan --</option>
                      {hostels.map((hostel) => (
                        <option key={hostel} value={hostel}>{hostel}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ptm-label">Select Hostel Wing
                    <select
                      className="ptm-input"
                      value={profileDraft.wing}
                      onChange={(event) => setProfileDraft({ ...profileDraft, wing: event.target.value })}
                      required
                    >
                      <option value="">-- Choose Your Wing --</option>
                      {'ABCDEFGH'.split('').map((letter) => (
                        <option key={letter} value={`Wing ${letter}`}>Wing {letter}</option>
                      ))}
                    </select>
                  </label>
                  <label className="ptm-label">Room Number
                    <input
                      className="ptm-input"
                      placeholder="e.g. B-204 or 315"
                      value={profileDraft.room}
                      onChange={(event) => setProfileDraft({ ...profileDraft, room: event.target.value })}
                      maxLength={20}
                      required
                    />
                  </label>
                  <label className="ptm-label">10-Digit Mobile Number
                    <input
                      className="ptm-input"
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={profileDraft.phone}
                      onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
                      autoComplete="tel"
                      required
                    />
                  </label>
                  <button type="submit" className="ptm-btn-primary" disabled={profileSaving}>
                    {profileSaving ? 'Saving Your Profile…' : 'Save & Enter svnitcampus Portal →'}
                  </button>
                </form>
              </section>
            </div>
          )}
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

  /* ROTATING BUFFERING WHEEL SPINNER */
  @keyframes ptmSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .ptm-wheel-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px 16px;
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 16px;
    text-align: center;
    margin: 8px 0;
  }
  .ptm-spinner-wheel {
    width: 42px;
    height: 42px;
    border: 4px solid #DBEAFE;
    border-top: 4px solid #002970;
    border-right: 4px solid #00BAF2;
    border-radius: 50%;
    animation: ptmSpin 0.75s linear infinite;
  }

  /* LOGIN TABS */
  .ptm-login-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: #F1F5F9;
    padding: 5px;
    border-radius: 14px;
    margin-bottom: 18px;
  }
  .ptm-login-tab {
    border: none;
    background: transparent;
    padding: 9px 10px;
    border-radius: 10px;
    font-size: 12.5px;
    font-weight: 700;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .ptm-login-tab.active {
    background: #002970;
    color: #FFFFFF;
    box-shadow: 0 2px 8px rgba(0, 41, 112, 0.18);
  }

  .ptm-root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #F5F7FA;
  }
  .ptm-profile-trigger {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .ptm-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.62);
  }
  .ptm-modal-card {
    position: relative;
    width: min(100%, 520px);
    max-height: min(90vh, 760px);
    overflow-y: auto;
    padding: 24px;
    border-radius: 20px;
    background: #FFFFFF;
    color: #111827;
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25);
  }
  .ptm-modal-close {
    position: absolute;
    top: 10px;
    right: 12px;
    border: 0;
    background: transparent;
    color: #64748B;
    font-size: 28px;
    cursor: pointer;
  }
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
    max-width: 430px;
    background: #FFFFFF;
    border: 1px solid #E5E7EB;
    border-radius: 22px;
    padding: 26px 22px;
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
    margin: 0 0 4px 0;
    font-size: 22px;
    font-weight: 800;
    color: #111827;
  }
  .ptm-login-sub {
    margin: 0 0 16px 0;
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