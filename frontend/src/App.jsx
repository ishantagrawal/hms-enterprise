import React, { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { apiFetch, API_URL } from './api';
import { getCached, setCached } from './cache';
import BrandLoadingScreen from './components/BrandLoadingScreen';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Capacitor } from '@capacitor/core';
import PrivacyAndDataDeletion from './components/PrivacyAndDataDeletion';
import AttendanceOnlyPortals from './components/AttendanceOnlyPortals.jsx';
import PasswordChangeForm from './components/PasswordChangeForm.jsx';
import StudentOnboardingPortal from './components/StudentOnboardingPortal.jsx';
import CompanyLandingPage from './pages/CompanyLandingPage.tsx';
import { extractErrorMessage } from './utils/errorParser.ts';

window.GLOBAL_SILICON_VALLEY_CSS = '';

const DeanPortal = lazy(() => import('./components/DeanPortal'));
const WardenPortal = lazy(() => import('./components/WardenPortal'));
const ClubPortal = lazy(() => import('./components/ClubPortal'));
const StaffPortal = lazy(() => import('./components/StaffPortal'));
const FounderPortal = lazy(() => import('./components/FounderPortal'));
const GateSecurityPortal = lazy(() => import('./components/CampusSecurity').then((module) => ({ default: module.GateSecurityPortal })));
const loadStudentPortal = () => import('./components/StudentPortal');
const StudentPortal = lazy(loadStudentPortal);

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

function ModuleUnavailableNotice() {
  return (
    <div className="ptm-page-wrap">
      <div className="ptm-card" role="status">
        <div className="ptm-section-title">This service is not enabled for your college.</div>
        <div className="ptm-list-sub">Contact your college administrator if you need access.</div>
      </div>
    </div>
  );
}

function profileDraftFromUser(user) {
  const isDS = user?.hostel_block === 'Day Scholar';
  return {
    residence_type: isDS ? 'day_scholar' : 'hosteller',
    hostel_block: isDS ? 'Day Scholar' : (user?.hostel_block || ''),
    wing: isDS ? 'N/A' : (user?.wing || ''),
    room: isDS ? 'N/A' : (user?.room || ''),
    phone: user?.phone || ''
  };
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/app" replace /> : <CompanyLandingPage />} />
      <Route path="/app/*" element={<AuthenticatedApp />} />
      <Route path="/privacy-and-data-deletion" element={<PrivacyAndDataDeletion />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

function AuthenticatedApp() {
  const isNativeApp = Capacitor.isNativePlatform();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffLoginLoading, setStaffLoginLoading] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [tenantDomain, setTenantDomain] = useState(
    () => localStorage.getItem('hms_tenant_domain') || (isNativeApp ? 'svnitcampus.in' : '')
  );
  const [tenantDomainConnected, setTenantDomainConnected] = useState(
    () => !isNativeApp || Boolean(localStorage.getItem('hms_tenant_domain'))
  );
  const [tenantDomainLoading, setTenantDomainLoading] = useState(false);
  const [tenantDomainError, setTenantDomainError] = useState('');
  const [hostels, setHostels] = useState(() => getCached('tenant_hostels') || []);
  const [hostelConfig, setHostelConfig] = useState(() => getCached('tenant_hostel_config') || []);
  const [profileDraft, setProfileDraft] = useState({ residence_type: 'hosteller', hostel_block: '', wing: '', room: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);

  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return undefined;
    CapacitorUpdater.notifyAppReady().catch((error) => {
      console.error('Capgo could not confirm the native app boot:', error);
    });
    return undefined;
  }, []);

  useEffect(() => {
    let active = true;
    const loadTenantConfig = () => {
      const selectedDomain = localStorage.getItem('hms_tenant_domain');
      const headers = selectedDomain ? { 'X-Campus-Domain': selectedDomain } : undefined;
      fetch(`${API_URL}/api/tenant`, { headers })
        .then((response) => {
          if (!response.ok) throw new Error(`College configuration request failed (${response.status}).`);
          return response.json();
        })
        .then((tenantConfig) => {
          if (!active) return;
          if (isNativeApp && selectedDomain) setTenantDomainConnected(true);
          setTenant((current) => (
            current && JSON.stringify(current) === JSON.stringify(tenantConfig)
              ? current
              : tenantConfig
          ));
          if (Array.isArray(tenantConfig?.hostels)) {
            setHostels(tenantConfig.hostels);
            setCached('tenant_hostels', tenantConfig.hostels);
          }
          if (Array.isArray(tenantConfig?.hostel_config)) {
            setHostelConfig(tenantConfig.hostel_config);
            setCached('tenant_hostel_config', tenantConfig.hostel_config);
          }
        })
        .catch((error) => {
          if (!active) return;
          if (isNativeApp && localStorage.getItem('hms_tenant_domain')) setTenantDomainConnected(false);
          setTenant((current) => (
            current && Object.values(current.modules || {}).some((enabled) => enabled === true)
              ? { ...current, modules: {} }
              : current
          ));
          console.error('Could not load college configuration:', error);
        });
    };
    loadTenantConfig();
    const refreshInterval = window.setInterval(loadTenantConfig, 30_000);
    window.addEventListener('focus', loadTenantConfig);
    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', loadTenantConfig);
    };
  }, [isNativeApp]);

  const handleStaffLogin = async (event) => {
    event.preventDefault();
    if (staffLoginLoading) return;
    setStaffLoginLoading(true);
    setLoginError(null);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('hms_tenant_domain')
            ? { 'X-Campus-Domain': localStorage.getItem('hms_tenant_domain') }
            : {})
        },
        body: JSON.stringify({ username: staffUsername, password: staffPassword })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(extractErrorMessage(data, 'Sign-in failed.'));
      localStorage.setItem('hms_session_token', data.token);
      localStorage.removeItem('hms_google_credential');
      localStorage.setItem('hms_user', JSON.stringify(data.user));
      setStaffPassword('');
      setProfileDraft(profileDraftFromUser(data.user));
      setUser(data.user);
    } catch (error) {
      setLoginError(extractErrorMessage(error, 'Sign-in failed.'));
    } finally {
      setStaffLoginLoading(false);
    }
  };

  const handleTenantDomainConnect = async (event) => {
    event.preventDefault();
    const domain = tenantDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!domain || /[/:?#@\s]/.test(domain)) {
      setTenantDomainError('Enter the college portal hostname, such as portal.example.edu.');
      return;
    }

    setTenantDomainLoading(true);
    setTenantDomainError('');
    setTenant(null);
    const previousDomain = localStorage.getItem('hms_tenant_domain');
    if (previousDomain !== domain) {
      localStorage.removeItem('hms_session_token');
      localStorage.removeItem('hms_user');
      setUser(null);
    }
    localStorage.setItem('hms_tenant_domain', domain);
    setTenantDomain(domain);

    try {
      const response = await fetch(`${API_URL}/api/tenant`, {
        headers: { 'X-Campus-Domain': domain }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(extractErrorMessage(data, 'Could not load this college.'));
      setTenant(data);
      if (Array.isArray(data.hostels)) {
        setHostels(data.hostels);
        setCached('tenant_hostels', data.hostels);
      }
      if (Array.isArray(data.hostel_config)) {
        setHostelConfig(data.hostel_config);
        setCached('tenant_hostel_config', data.hostel_config);
      }
      setTenantDomainConnected(true);
    } catch (error) {
      setTenantDomainConnected(false);
      setTenantDomainError(extractErrorMessage(error, 'Could not load this college.'));
    } finally {
      setTenantDomainLoading(false);
    }
  };

  useEffect(() => {
    const restoreSession = async () => {
      localStorage.removeItem('hms_google_credential');
      const credential = localStorage.getItem('hms_session_token');
      const cachedUser = localStorage.getItem('hms_user');
      if (credential && cachedUser) {
        try {
          const parsed = JSON.parse(cachedUser);
          setProfileDraft(profileDraftFromUser(parsed));
          setUser(parsed);
        } catch {
          localStorage.removeItem('hms_user');
        }
        // Render the cached portal immediately, then validate the session in the background.
        apiFetch(`${API_URL}/api/auth/me`)
          .then(async (res) => {
            if (!res.ok) throw new Error('Session expired');
            const data = await res.json();
            localStorage.setItem('hms_session_token', credential);
            localStorage.removeItem('hms_google_credential');
            localStorage.setItem('hms_user', JSON.stringify(data.user));
            setProfileDraft(profileDraftFromUser(data.user));
            setUser(data.user);
          })
          .catch(() => {
            localStorage.removeItem('hms_session_token');
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
    const handleAuthExpired = () => {
      localStorage.removeItem('hms_session_token');
      localStorage.removeItem('hms_google_credential');
      setUser(null);
      setShowProfile(false);
      setLoginError('Your session expired. Please sign in again.');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('hms-auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('hms-auth-expired', handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return undefined;
    let disposed = false;
    let listenerHandle;
    import('@capacitor/app')
      .then(({ App: NativeApp }) => NativeApp.addListener('backButton', ({ canGoBack }) => {
        const event = new Event('hms-native-back', { cancelable: true });
        const handled = !window.dispatchEvent(event);
        if (!handled) {
          if (canGoBack) window.history.back();
          else NativeApp.exitApp();
        }
      }))
      .then((handle) => {
        if (disposed) handle.remove();
        else listenerHandle = handle;
      })
      .catch((error) => console.error('Could not register the native back-button handler:', error));
    return () => {
      disposed = true;
      listenerHandle?.remove();
    };
  }, []);

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
      const payload = profileDraft.residence_type === 'day_scholar'
        ? { hostel_block: 'Day Scholar', wing: 'N/A', room: 'N/A', phone: profileDraft.phone }
        : { hostel_block: profileDraft.hostel_block, wing: profileDraft.wing, room: profileDraft.room, phone: profileDraft.phone };

      const res = await apiFetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not save your profile.'));
      localStorage.setItem('hms_user', JSON.stringify(data.user));
      setProfileDraft(profileDraftFromUser(data.user));
      setUser(data.user);
    } catch (error) {
      setProfileError(extractErrorMessage(error, 'Could not save your profile.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleStudentProfileRefresh = useCallback((updatedUser) => {
    setUser((currentUser) => {
      const mergedUser = { ...currentUser, ...updatedUser };
      localStorage.setItem('hms_user', JSON.stringify(mergedUser));
      return mergedUser;
    });
  }, []);

  const handlePasswordChangeComplete = useCallback((data) => {
    localStorage.setItem('hms_session_token', data.token);
    localStorage.removeItem('hms_user');
    localStorage.setItem('hms_user', JSON.stringify(data.user));
    setUser(data.user);
    setShowPasswordChange(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('hms_user');
    localStorage.removeItem('hms_session_token');
    localStorage.removeItem('hms_google_credential');
    setUser(null);
    setShowProfile(false);
  };

  if (!authReady) {
    return <BrandLoadingScreen label="Preparing your secure portal" />;
  }
  if (user?.password_reset_required) {
    return (
      <div className="ptm-root">
        <PasswordChangeForm apiUrl={API_URL} user={user} mandatory onSuccess={handlePasswordChangeComplete} />
      </div>
    );
  }

  const isFounder = user?.role === 'Founder' || user?.user_id === 'FOUNDER';
  const isDayScholar = user?.hostel_block === 'Day Scholar';
  const studentProfileIncomplete =
    user?.role === 'Student' &&
    (!user.hostel_block || !user.phone || (!isDayScholar && (!user.wing || !user.room)));

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SV';
  const selectedHostelConfig = hostelConfig.find(
    (item) => item.name === profileDraft.hostel_block
  );
  const modules = tenant?.modules || {};
  const canSignIn = !isNativeApp || (
    tenantDomainConnected &&
    tenantDomain.trim().toLowerCase() === (localStorage.getItem('hms_tenant_domain') || '')
  );

  return (
    <div className="ptm-root">
      <style>{PAYTM_APPLE_CSS}</style>

      {showInstallHelp ? (
        <div className="ptm-main-container">
          <div className="ptm-page-wrap">
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setShowInstallHelp(false)}>←</button>
              <h1 className="ptm-page-title">Install Campus OS</h1>
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
                  src={tenant?.logo_url || '/campus-os-mark.svg'}
                  alt={tenant?.college_name || 'College'}
                  style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <span className="ptm-brand-pill">{tenant?.college_name || 'Campus Portal'}</span>
              </div>
              <button type="button" className="ptm-install-chip" onClick={handleInstallClick}>
                📲 Install App
              </button>
            </div>

            <h1 className="ptm-login-heading">{tenant?.college_name || 'Campus'} Portal</h1>
            <p className="ptm-login-sub">Sign in with the username and password provided by your college.</p>

            {isNativeApp && (
              <form className="ptm-form-stack" onSubmit={handleTenantDomainConnect}>
                <label className="ptm-label">
                  College portal domain
                  <input
                    className="ptm-input"
                    autoCapitalize="none"
                    autoComplete="url"
                    placeholder="portal.example.edu"
                    value={tenantDomain}
                    onChange={(event) => {
                      setTenantDomain(event.target.value);
                      setTenantDomainConnected(false);
                      setTenantDomainError('');
                    }}
                    required
                  />
                </label>
                <button className="ptm-btn-secondary" type="submit" disabled={tenantDomainLoading}>
                  {tenantDomainLoading ? 'Connecting…' : 'Connect college'}
                </button>
                {tenantDomainError && <div className="ptm-alert-error" role="alert">{tenantDomainError}</div>}
              </form>
            )}

            {loginError && <div className="ptm-alert-error">{loginError}</div>}

            <form className="ptm-form-stack" onSubmit={handleStaffLogin}>
              <div className="ptm-section-title" style={{ marginBottom: 0 }}>Username and password</div>
              <label className="ptm-label">
                Username or roll number
                <input
                  className="ptm-input"
                  autoComplete="username"
                  value={staffUsername}
                  onChange={(event) => setStaffUsername(event.target.value)}
                  required
                />
              </label>
              <label className="ptm-label">
                Password
                <input
                  className="ptm-input"
                  type="password"
                  autoComplete="current-password"
                  value={staffPassword}
                  onChange={(event) => setStaffPassword(event.target.value)}
                  required
                />
              </label>
              <button className="ptm-btn-primary" type="submit" disabled={staffLoginLoading || tenantDomainLoading || !canSignIn}>
                {staffLoginLoading ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="ptm-list-sub" style={{ textAlign: 'center', margin: 0 }}>
                Students: ask Student Onboarding Staff for your login. Staff: contact your Dean for account access.
              </p>
            </form>
          </div>
        </div>
      ) : (
        <>
          <header className="ptm-header">
            <div className="ptm-header-inner">
              <button type="button" className="ptm-header-left ptm-profile-trigger" onClick={() => setShowProfile(true)} aria-label="Open profile">
                <div className="ptm-user-avatar">{initials}</div>
                <div className="ptm-header-text">
                  <div className="ptm-header-title" title={tenant?.college_name || 'Campus'}>
                    {tenant?.college_name || 'Campus'}
                  </div>
                  <div className="ptm-header-sub" title={user.full_name}>
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
            <Suspense fallback={
              <BrandLoadingScreen />
            }>
              {isFounder && <FounderPortal user={user} apiUrl={API_URL} onLogout={handleLogout} />}
              {user.role === 'Dean' && (
                <DeanPortal
                  user={user}
                  apiUrl={API_URL}
                  modules={modules}
                  tenantName={tenant?.college_name}
                  institutionEmailDomain={tenant?.allowed_email_domain}
                />
              )}
              {user.role === 'Student' && <StudentPortal user={user} apiUrl={API_URL} modules={modules} onUserUpdate={handleStudentProfileRefresh} />}
              {user.role === 'Warden' && <WardenPortal user={user} apiUrl={API_URL} modules={modules} />}
              {user.role === 'Faculty' && modules.class_attendance === true && <AttendanceOnlyPortals user={user} apiUrl={API_URL} modules={modules} />}
              {user.role === 'Faculty' && modules.class_attendance !== true && <ModuleUnavailableNotice />}
              {(user.role === 'Gate Security' || user.role === 'GateSecurity') && tenant?.modules?.gate_outpass === true && <GateSecurityPortal user={user} apiUrl={API_URL} />}
              {(user.role === 'Gate Security' || user.role === 'GateSecurity') && tenant?.modules?.gate_outpass !== true && <ModuleUnavailableNotice />}
              {user.role === 'ClubOrganizer' && modules.event_radar === true && <ClubPortal user={user} apiUrl={API_URL} />}
              {user.role === 'ClubOrganizer' && modules.event_radar !== true && <ModuleUnavailableNotice />}
              {user.role === 'Staff' && modules.grievances === true && <StaffPortal user={user} apiUrl={API_URL} />}
              {user.role === 'Staff' && modules.grievances !== true && <ModuleUnavailableNotice />}
              {user.role === 'StudentOnboarding' && <StudentOnboardingPortal user={user} apiUrl={API_URL} />}
            </Suspense>
          </main>

          {showProfile && !studentProfileIncomplete && (
            <div className="ptm-modal-backdrop" onClick={() => setShowProfile(false)}>
              <section className="ptm-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="ptm-modal-close" onClick={() => setShowProfile(false)}>×</button>
                <h2 className="ptm-page-title">Your Profile</h2>
                <div className="ptm-list">
                  <ProfileRow label="Name" value={user.full_name} />
                  <ProfileRow label={user.role === 'Student' ? 'Roll Number' : 'Account ID'} value={user.user_id} />
                  {user.role === 'Student' ? (
                    <>
                      <ProfileRow label="Academic Year" value={user.year || 'Not provided'} />
                      <ProfileRow label="Department / Branch" value={user.department || 'Not provided'} />
                      <ProfileRow label="Residence Status" value={isDayScholar ? 'Day Scholar (Non-Hosteller)' : user.hostel_block} />
                      {!isDayScholar && (
                        <>
                          <ProfileRow label="Wing" value={user.wing || 'Not set'} />
                          <ProfileRow label="Room Number" value={user.room || 'Not set'} />
                        </>
                      )}
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
                <button type="button" className="ptm-btn-secondary" onClick={() => setShowPasswordChange(true)}>
                  Change password
                </button>
              </section>
            </div>
          )}

          {showPasswordChange && (
            <div className="ptm-modal-backdrop" onClick={() => setShowPasswordChange(false)}>
              <section className="ptm-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="ptm-modal-close" onClick={() => setShowPasswordChange(false)}>×</button>
                <PasswordChangeForm
                  apiUrl={API_URL}
                  user={user}
                  onSuccess={handlePasswordChangeComplete}
                  onCancel={() => setShowPasswordChange(false)}
                />
              </section>
            </div>
          )}

          {studentProfileIncomplete && (
            <div className="ptm-modal-backdrop">
              <section className="ptm-modal-card" role="dialog" aria-modal="true">
                <span className="ptm-tag-pill">FIRST-TIME STUDENT SETUP</span>
                <h2 className="ptm-page-title">Complete Your Campus Profile</h2>
                <p className="ptm-page-sub" style={{ marginBottom: '14px' }}>
                  Welcome, <strong>{user.full_name} ({user.user_id})</strong>! Are you a Hostel Resident or a Day Scholar?
                </p>

                <div className="ptm-login-tabs" style={{ marginBottom: '14px' }}>
                  <button
                    type="button"
                    className={`ptm-login-tab ${profileDraft.residence_type === 'hosteller' ? 'active' : ''}`}
                    onClick={() => setProfileDraft({ ...profileDraft, residence_type: 'hosteller', hostel_block: '', wing: '', room: '' })}
                  >
                    🏢 Hostel Resident
                  </button>
                  <button
                    type="button"
                    className={`ptm-login-tab ${profileDraft.residence_type === 'day_scholar' ? 'active' : ''}`}
                    onClick={() => setProfileDraft({ ...profileDraft, residence_type: 'day_scholar', hostel_block: 'Day Scholar', wing: 'N/A', room: 'N/A' })}
                  >
                    🏡 Day Scholar
                  </button>
                </div>

                {profileError && <div className="ptm-alert-error">{profileError}</div>}

                <form onSubmit={handleProfileSave} className="ptm-form-stack">
                  {profileDraft.residence_type === 'hosteller' ? (
                    <>
                      <label className="ptm-label">Select College Hostel
                        <select
                          className="ptm-input"
                          value={profileDraft.hostel_block === 'Day Scholar' ? '' : profileDraft.hostel_block}
                          onChange={(event) => setProfileDraft({
                            ...profileDraft,
                            hostel_block: event.target.value,
                            wing: '',
                            room: ''
                          })}
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
                          value={profileDraft.wing === 'N/A' ? '' : profileDraft.wing}
                          onChange={(event) => setProfileDraft({ ...profileDraft, wing: event.target.value })}
                          required
                        >
                          <option value="">-- Choose Your Wing --</option>
                          {(selectedHostelConfig?.wings || []).map((wing) => (
                            <option key={wing} value={wing}>{wing}</option>
                          ))}
                        </select>
                      </label>
                      <label className="ptm-label">Room Number
                        <input
                          className="ptm-input"
                          placeholder="e.g. B-204 or 315"
                          value={profileDraft.room === 'N/A' ? '' : profileDraft.room}
                          onChange={(event) => setProfileDraft({ ...profileDraft, room: event.target.value })}
                          maxLength={20}
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: '12px', padding: '12px', fontSize: '12.5px', color: '#0369A1' }}>
                      ✨ As a <strong>Day Scholar</strong>, you can use the enabled campus events, clubs, and notice services. Hostel-only services will be hidden.
                    </div>
                  )}

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
                    {profileSaving ? 'Saving Your Profile…' : `Save & Enter ${tenant?.college_name || 'Campus'} Portal →`}
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
    overscroll-behavior-x: none;
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

  .ptm-root { width: 100%; min-width: 0; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; background: #F5F7FA; }
  .ptm-profile-trigger { padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
  .ptm-modal-backdrop { position: fixed; inset: 0; z-index: 300; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(15, 23, 42, 0.62); }
  .ptm-modal-card { position: relative; width: min(100%, 520px); max-height: min(90vh, 760px); overflow-y: auto; padding: 24px; border-radius: 20px; background: #FFFFFF; color: #111827; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25); }
  .ptm-modal-close { position: absolute; top: 10px; right: 12px; border: 0; background: transparent; color: #64748B; font-size: 28px; cursor: pointer; }
  .ptm-header { position: sticky; top: 0; z-index: 100; background: #FFFFFF; border-bottom: 1px solid #E5E7EB; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03); }
  .ptm-header-inner { width: 100%; max-width: 1280px; min-width: 0; margin: 0 auto; min-height: 60px; padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .ptm-header-left { display: flex; align-items: center; gap: 10px; width: 0; min-width: 0; flex: 1 1 0; overflow: hidden; }
  .ptm-user-avatar { width: 38px; height: 38px; border-radius: 50%; background: #E8EAF6; color: #002970; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ptm-header-text { min-width: 0; flex: 1 1 auto; overflow: hidden; }
  .ptm-header-title { display: -webkit-box; min-width: 0; overflow: hidden; color: #002970; font-size: 16px; font-weight: 800; line-height: 1.2; white-space: normal; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .ptm-header-sub { min-width: 0; overflow: hidden; color: #6B7280; font-size: 12px; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; }
  .ptm-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
  .ptm-install-chip { background: #E0F2FE; color: #002970; border: 1px solid #BAE6FD; padding: 6px 11px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ptm-logout-btn { background: #FEE2E2; color: #B91C1C; border: none; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ptm-login-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: linear-gradient(180deg, #E8F4FD 0%, #F5F7FA 100%); }
  .ptm-login-box { width: 100%; max-width: 430px; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 22px; padding: 26px 22px; box-shadow: 0 12px 32px rgba(0, 41, 112, 0.08); }
  .ptm-login-top-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .ptm-brand-pill { background: #002970; color: #FFFFFF; padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
  .ptm-login-heading { margin: 0 0 4px 0; font-size: 22px; font-weight: 800; color: #111827; }
  .ptm-login-sub { margin: 0 0 16px 0; font-size: 13px; color: #6B7280; }
  .ptm-alert-error { background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .ptm-alert-success { background: #F0FDF4; border: 1px solid #BBF7D0; color: #166534; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin: 10px 0; }
  .ptm-main-container { flex: 1; width: 100%; min-width: 0; max-width: 1280px; margin: 0 auto; padding: 14px 12px calc(92px + env(safe-area-inset-bottom)); }
  .ptm-shell-layout { display: grid; grid-template-columns: minmax(0, 250px) minmax(0, 1fr); gap: 20px; align-items: start; min-width: 0; }
  .ptm-shell-layout > * { min-width: 0; }
  .ptm-sidebar-desktop { min-width: 0; max-height: calc(100dvh - 88px); overflow-y: auto; overscroll-behavior-y: contain; background: #FFFFFF; border: 1px solid #EAEEF4; border-radius: 18px; padding: 12px; position: sticky; top: 76px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 8px rgba(0, 41, 112, 0.03); }
  .ptm-side-btn { width: 100%; background: transparent; border: none; border-radius: 12px; padding: 11px 14px; text-align: left; font-size: 13.5px; font-weight: 600; color: #4B5563; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: 0.15s; }
  .ptm-side-btn:hover { background: #F3F4F6; color: #111827; }
  .ptm-side-btn.active { background: #002970; color: #FFFFFF; font-weight: 700; }
  .ptm-page-wrap { max-width: 880px; min-width: 0; margin: 0 auto; width: 100%; text-align: left; }
  .ptm-drill-header { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: 6px; margin-bottom: 14px; width: 100%; }
  .ptm-back-btn { width: 36px; height: 36px; border-radius: 50%; background: #FFFFFF; border: 1px solid #D1D5DB; color: #111827; font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .ptm-page-title { margin: 2px 0 0 0; font-size: 22px; font-weight: 800; color: #111827; text-align: left; line-height: 1.25; }
  .ptm-page-sub { margin: 0; font-size: 13px; color: #6B7280; text-align: left; }
  .ptm-card { min-width: 0; background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 18px; padding: 16px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0, 41, 112, 0.03); text-align: left; overflow-wrap: anywhere; }
  .ptm-section-title { font-size: 16px; font-weight: 800; color: #111827; margin: 0 0 12px 0; text-align: left; }
  .ptm-icon-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; text-align: center; }
  .ptm-icon-grid > *, .ptm-mini-grid > *, .ptm-grid-2 > * { min-width: 0; }
  .ptm-icon-tile { background: transparent; border: none; padding: 6px 2px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; border-radius: 12px; }
  .ptm-icon-circle { width: 48px; height: 48px; border-radius: 50%; background: #002970; color: #FFFFFF; font-size: 20px; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 3px 8px rgba(0, 41, 112, 0.14); }
  .ptm-icon-circle.light { background: #E8F4FD; color: #002970; box-shadow: none; border: 1px solid #BAE6FD; }
  .ptm-tile-badge { position: absolute; top: -4px; right: -4px; background: #EF4444; color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 999px; border: 2px solid #FFFFFF; }
  .ptm-icon-label { font-size: 11.5px; font-weight: 600; color: #1F2937; line-height: 1.25; }
  .ptm-mini-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
  .ptm-mini-card { background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; padding: 14px; cursor: pointer; text-align: left; box-shadow: 0 1px 4px rgba(0, 41, 112, 0.03); }
  .ptm-mini-btn { margin-top: 8px; width: 100%; background: #F1F5F9; color: #111827; border: none; border-radius: 8px; padding: 6px 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ptm-list { display: flex; flex-direction: column; }
  .ptm-list-row { display: flex; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid #F1F5F9; cursor: pointer; text-align: left; }
  .ptm-list-row:last-child { border-bottom: none; }
  .ptm-avatar-pastel { width: 42px; height: 42px; border-radius: 50%; background: #FEF3C7; color: #B45309; font-weight: 800; font-size: 15px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ptm-list-main { flex: 1; min-width: 0; }
  .ptm-list-title { font-size: 14.5px; font-weight: 700; color: #111827; margin-bottom: 2px; }
  .ptm-list-sub { font-size: 12.5px; color: #6B7280; line-height: 1.4; word-break: break-word; }
  .ptm-tag-pill { display: inline-block; margin-top: 4px; background: #F3F4F6; border: 1px solid #E5E7EB; color: #374151; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .ptm-status-badge { padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .ptm-form-stack { display: flex; flex-direction: column; gap: 12px; text-align: left; }
  .ptm-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .ptm-security-camera { display: block; width: min(100%, 520px); max-height: 60vh; margin: 12px auto; border-radius: 16px; background: #111827; object-fit: cover; }
  .ptm-label { display: block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px; }
  .ptm-input { width: 100%; min-width: 0; max-width: 100%; background: #FFFFFF; border: 1.5px solid #D1D5DB; border-radius: 12px; padding: 11px 13px; font-size: 14px; color: #111827; outline: none; }
  .ptm-input:focus { border-color: #002970; }
  .ptm-search-pill { display: flex; align-items: center; gap: 10px; background: #FFFFFF; border: 1.5px solid #D1D5DB; border-radius: 999px; padding: 10px 16px; margin-bottom: 14px; }
  .ptm-search-pill input { border: none; outline: none; width: 100%; font-size: 14px; color: #111827; background: transparent; }
  .ptm-btn-primary { width: 100%; background: #002970; color: #FFFFFF; border: none; border-radius: 12px; padding: 12px 16px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .ptm-btn-secondary { max-width: 100%; background: #E8F4FD; color: #002970; border: 1px solid #BAE6FD; border-radius: 10px; padding: 8px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .ptm-btn-danger { width: 100%; background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 12px; padding: 12px 16px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .ptm-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
  .ptm-cal-weekday { text-align: center; font-size: 11px; font-weight: 700; color: #6B7280; padding: 4px 0; }
  .ptm-cal-cell { height: 62px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 5px; display: flex; flex-direction: column; justify-content: space-between; cursor: pointer; overflow: hidden; }
  .ptm-cal-cell.selected { background: #E8F4FD; border: 2px solid #002970; }
  .ptm-cal-cell.empty { background: transparent; border: none; cursor: default; }
  .ptm-cal-daynum { font-size: 12px; font-weight: 700; color: #1F2937; }
  .ptm-cal-event-chip { font-size: 9.5px; font-weight: 700; background: #002970; color: #FFFFFF; padding: 2px 4px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ptm-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; flex-wrap: wrap; }
  .ptm-toast { background: #002970; color: #FFFFFF; padding: 12px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 14px; cursor: pointer; }
  .ptm-sync-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 10px 12px; border: 1px solid #BFDBFE; border-radius: 12px; background: #EFF6FF; color: #1E40AF; font-size: 12px; font-weight: 600; }
  .ptm-sync-note.error { border-color: #FECACA; background: #FEF2F2; color: #991B1B; }
  .ptm-sync-retry { flex-shrink: 0; border: 0; background: transparent; color: #1D4ED8; font-weight: 800; cursor: pointer; }
  .ptm-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .ptm-event-feedback-summary { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding: 10px; border-radius: 10px; background: #F8FAFC; color: #475569; font-size: 12px; }
  .ptm-event-feedback-summary strong { color: #92400E; }
  .ptm-event-feedback-summary p { margin: 4px 0 0; color: #334155; font-style: italic; overflow-wrap: anywhere; }
  .ptm-event-organizer-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .ptm-profile-request { padding: 14px 0; border-bottom: 1px solid #E2E8F0; }
  .ptm-profile-request:last-child { border-bottom: 0; }
  .ptm-profile-request-changes { display: grid; gap: 6px; margin-top: 12px; }
  .ptm-profile-request-change { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 9px; background: #F8FAFC; color: #64748B; font-size: 12px; }
  .ptm-profile-request-change strong { color: #1D4ED8; }
  .ptm-profile-request-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
  .ptm-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: calc(64px + env(safe-area-inset-bottom)); padding: 0 4px env(safe-area-inset-bottom); background: rgba(255, 255, 255, 0.96); border-top: 1px solid #E5E7EB; justify-content: space-around; align-items: center; z-index: 150; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .ptm-bnav-btn { background: none; border: none; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; font-weight: 600; color: #6B7280; cursor: pointer; flex: 1; }
  .ptm-bnav-btn.active { color: #002970; font-weight: 800; }
  .ptm-bnav-btn:focus-visible, .ptm-back-btn:focus-visible, .ptm-side-btn:focus-visible, .ptm-icon-tile:focus-visible { outline: 3px solid #38BDF8; outline-offset: 2px; }
  .ptm-btn-primary:disabled, .ptm-btn-secondary:disabled, .ptm-btn-danger:disabled { cursor: wait; opacity: 0.7; }
  .ptm-card table { display: block; width: 100%; max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; white-space: nowrap; }

  @media (max-width: 1024px) {
    .ptm-shell-layout { grid-template-columns: 1fr; }
    .ptm-sidebar-desktop { display: none; }
    .ptm-bottom-nav { display: flex; justify-content: flex-start; overflow-x: auto; overscroll-behavior-x: contain; }
    .ptm-bnav-btn { flex: 0 0 max(72px, 20%); }
    .ptm-main-container { padding: 12px 12px calc(76px + env(safe-area-inset-bottom)); }
    .ptm-page-wrap { max-width: none; }
    .ptm-input { font-size: 16px; }
    .ptm-bnav-btn { min-height: 44px; }
    .ptm-shell-layout { gap: 12px; }
    .ptm-card, .ptm-page-wrap, .ptm-list-main { min-width: 0; }
    .ptm-event-organizer-actions { flex-wrap: wrap; }
  }
  @media (max-width: 540px) {
    .ptm-hide-xs { display: none; }
    .ptm-cal-cell { height: 54px; }
    .ptm-main-container { padding-left: 10px; padding-right: 10px; }
    .ptm-card { padding: 14px; border-radius: 16px; }
    .ptm-btn-secondary { white-space: normal; overflow-wrap: anywhere; }
    .ptm-icon-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .ptm-icon-tile { min-height: 78px; justify-content: center; }
    .ptm-page-title { font-size: 20px; overflow-wrap: anywhere; }
    .ptm-list-row { gap: 8px; align-items: flex-start; flex-wrap: wrap; }
    .ptm-list-row > .ptm-list-main { flex: 1 1 calc(100% - 54px); }
    .ptm-status-badge { white-space: normal; text-align: center; }
    .ptm-event-organizer-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; max-width: none; flex: 1 0 100%; }
    .ptm-event-organizer-actions > button { width: 100% !important; white-space: normal; }
    .ptm-profile-request-change { flex-direction: column; gap: 2px; }
    .ptm-row-between { align-items: stretch; }
    .ptm-row-between > .ptm-btn-secondary { white-space: normal; }
    .ptm-bottom-nav { justify-content: flex-start; }
    .ptm-bnav-btn { flex-basis: max(72px, 20%); font-size: 10px; }
  }
`;