import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import StaffAccountAccess from './StaffAccountAccess';
import { ListRowSkeleton } from './SkeletonLoader';
import usePortalBackNavigation from '../hooks/usePortalBackNavigation';
import { extractErrorMessage } from '../utils/errorParser.ts';

const TENANT_MODULES = [
  ['grievances', 'Grievances'],
  ['mess_pulse', 'Mess Pulse (coming soon)', false],
  ['event_radar', 'Events'],
  ['gate_outpass', 'Gate outpass'],
  ['attendance', 'Night attendance'],
  ['class_attendance', 'Class attendance'],
  ['hostel_attendance', 'Hostel attendance'],
  ['parent_alerts', 'Parent alerts']
];

function CollegeAdManager({ apiUrl, collegeId }) {
  const [ads, setAds] = useState([]);
  const [form, setForm] = useState({
    sponsor_tag: '',
    title: '',
    subtitle: '',
    badge_text: '',
    cta_text: 'Learn more',
    target_url: '',
    image_url: '',
    bg_gradient: 'linear-gradient(135deg, #002970 0%, #0284C7 100%)',
    days_valid: 15
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const endpoint = `${apiUrl}/api/founder/tenants/${encodeURIComponent(collegeId)}/ads`;

  const loadAds = useCallback(async () => {
    const response = await apiFetch(endpoint);
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(extractErrorMessage(data, 'Could not load college ad banners.'));
    setAds(data);
  }, [endpoint]);

  useEffect(() => {
    loadAds().catch((loadError) => setError(extractErrorMessage(loadError)));
  }, [loadAds]);

  const createAd = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, days_valid: Number(form.days_valid) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not create ad banner.'));
      setMessage('College-wide banner published.');
      setForm((current) => ({ ...current, sponsor_tag: '', title: '', subtitle: '', badge_text: '', target_url: '', image_url: '' }));
      await loadAds();
    } catch (createError) {
      setError(extractErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  };

  const deleteAd = async (adId) => {
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${endpoint}/${encodeURIComponent(adId)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not remove ad banner.'));
      setMessage('Banner removed.');
      await loadAds();
    } catch (deleteError) {
      setError(extractErrorMessage(deleteError));
    }
  };

  return (
    <div className="ptm-card">
      <div className="ptm-section-title">College-wide ad banner</div>
      <p className="ptm-list-sub">Publish a sponsored banner to this college's student home page. Destination and image links must use HTTPS.</p>
      {message && <div className="ptm-alert-success" role="status">{message}</div>}
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <form className="ptm-form-stack" onSubmit={createAd}>
        <div className="ptm-grid-2">
          <label className="ptm-label">Sponsor label<input className="ptm-input" required maxLength={80} value={form.sponsor_tag} onChange={(event) => setForm({ ...form, sponsor_tag: event.target.value })} /></label>
          <label className="ptm-label">Banner title<input className="ptm-input" required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        </div>
        <label className="ptm-label">Short description<input className="ptm-input" required maxLength={300} value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} /></label>
        <div className="ptm-grid-2">
          <label className="ptm-label">Badge (optional)<input className="ptm-input" maxLength={40} value={form.badge_text} onChange={(event) => setForm({ ...form, badge_text: event.target.value })} /></label>
          <label className="ptm-label">Button label<input className="ptm-input" maxLength={40} value={form.cta_text} onChange={(event) => setForm({ ...form, cta_text: event.target.value })} /></label>
        </div>
        <label className="ptm-label">HTTPS destination URL<input className="ptm-input" type="url" required value={form.target_url} onChange={(event) => setForm({ ...form, target_url: event.target.value })} /></label>
        <label className="ptm-label">HTTPS image URL (optional)<input className="ptm-input" type="url" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} /></label>
        <label className="ptm-label">Banner duration (days)<input className="ptm-input" type="number" min="1" max="365" required value={form.days_valid} onChange={(event) => setForm({ ...form, days_valid: event.target.value })} /></label>
        <button className="ptm-btn-primary" type="submit" disabled={saving}>{saving ? 'Publishing…' : 'Publish college banner'}</button>
      </form>
      <div className="ptm-list" style={{ marginTop: '12px' }}>
        {ads.map((ad) => (
          <div className="ptm-list-row" key={ad.ad_id}>
            <div className="ptm-list-main">
              <div className="ptm-list-title">{ad.title}</div>
              <div className="ptm-list-sub">{ad.sponsor_tag} · Expires {new Date(ad.expires_at).toLocaleDateString()}</div>
            </div>
            <button type="button" className="ptm-btn-danger" style={{ width: 'auto' }} onClick={() => deleteAd(ad.ad_id)}>Remove</button>
          </div>
        ))}
        {!ads.length && <p className="ptm-list-sub">No sponsored banners configured for this college.</p>}
      </div>
    </div>
  );
}

export default function FounderPortal({ apiUrl, onLogout, user }) {
  const [page, setPage] = useState('home');
  usePortalBackNavigation(page, setPage);
  const [tenants, setTenants] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [moduleSaving, setModuleSaving] = useState({});
  const [credentials, setCredentials] = useState([]);
  const [provisioningCollege, setProvisioningCollege] = useState('');
  const [tenantForm, setTenantForm] = useState({
    college_id: '',
    college_name: '',
    primary_domain: '',
    allowed_email_domain: '',
    timezone: 'Asia/Kolkata',
    initial_dean_id: '',
    initial_dean_name: '',
    initial_dean_email: '',
    logo_url: ''
  });
  const [msg, setMsg] = useState(null);

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const res = await apiFetch(`${apiUrl}/api/founder/tenants`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(extractErrorMessage(data, 'Could not load college settings.'));
      setTenants(data);
    } catch (error) {
      setMsg(extractErrorMessage(error, 'Could not load college settings.'));
    } finally {
      setTenantLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleCreateTenant = async (e) => {
    e.preventDefault();
    if (tenantSaving) return;
    setTenantSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${apiUrl}/api/founder/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantForm)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not create college.'));
      setCredentials(data.accounts || []);
      setMsg(`College ${data.college_id} configured. Share each temporary passphrase privately; it must be changed at first sign-in.`);
      setTenantForm({
        college_id: '',
        college_name: '',
        primary_domain: '',
        allowed_email_domain: '',
        timezone: 'Asia/Kolkata',
        initial_dean_id: '',
        initial_dean_name: '',
        initial_dean_email: '',
        logo_url: ''
      });
      await loadTenants();
    } catch (error) {
      setMsg(extractErrorMessage(error, 'Could not create college.'));
    } finally {
      setTenantSaving(false);
    }
  };

  const provisionMissingAccounts = async (tenant) => {
    setProvisioningCollege(tenant.college_id);
    setMsg(null);
    setCredentials([]);
    try {
      const res = await apiFetch(
        `${apiUrl}/api/founder/tenants/${encodeURIComponent(tenant.college_id)}/accounts/provision`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not provision college accounts.'));
      setCredentials(data.accounts || []);
      setMsg(data.accounts?.length
        ? `Created ${data.accounts.length} missing main account${data.accounts.length === 1 ? '' : 's'}. Share each passphrase privately.`
        : 'The Student Onboarding Staff and Beacon Manager accounts are already provisioned.');
      await loadTenants();
    } catch (error) {
      setMsg(extractErrorMessage(error, 'Could not provision college accounts.'));
    } finally {
      setProvisioningCollege('');
    }
  };

  const handleModuleChange = async (tenant, moduleName, enabled) => {
    if (moduleSaving[tenant.college_id]) return;
    const modules = { ...tenant.modules, [moduleName]: enabled };
    setModuleSaving((current) => ({ ...current, [tenant.college_id]: true }));
    setTenants((current) => current.map((item) =>
      item.college_id === tenant.college_id ? { ...item, modules } : item
    ));
    try {
      const res = await apiFetch(`${apiUrl}/api/founder/tenants/${encodeURIComponent(tenant.college_id)}/modules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modules })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not update college modules.'));
    } catch (error) {
      setTenants((current) => current.map((item) =>
        item.college_id === tenant.college_id ? tenant : item
      ));
      setMsg(extractErrorMessage(error, 'Could not update college modules.'));
    } finally {
      setModuleSaving((current) => ({ ...current, [tenant.college_id]: false }));
    }
  };

  return (
    <div
      className="ptm-founder-screen"
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 60px)',
        padding: '16px 0',
        color: '#111827',
        backgroundColor: '#F5F7FA'
      }}
    >
      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}
        {credentials.length > 0 && (
          <section className="ptm-card" aria-live="polite">
            <div className="ptm-section-title">One-time initial credentials</div>
            <p className="ptm-list-sub">These passphrases are shown only now. Share them privately; each account must change its password at first sign-in.</p>
            <div className="ptm-list">
              {credentials.map((account) => (
                <div className="ptm-list-row" key={account.user_id}>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">{account.role} · {account.full_name}</div>
                    <div className="ptm-list-sub">Username: <strong>{account.user_id}</strong></div>
                  </div>
                  <code>{account.temporary_password}</code>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="ptm-drill-header">
          <div className="ptm-row-between">
            <span className="ptm-tag-pill">FOUNDER & MASTER ADMIN PORTAL</span>
            <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '8px 14px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
          <h1 className="ptm-page-title">Vidyut OS Founder Console</h1>
          <p className="ptm-page-sub">Provision colleges and their three main accounts, manage tenant features, and reset main-account passwords.</p>
        </div>

        <div className="ptm-card">
          <div className="ptm-section-title">College platform settings</div>
          <p className="ptm-list-sub">
            Add the college portal domain and institution email domain, then configure DNS and TLS before launch. The college receives a Dean, Student Onboarding Staff, and Beacon Manager account.
          </p>
          <form onSubmit={handleCreateTenant} className="ptm-form-stack">
            <div className="ptm-grid-2">
              <label className="ptm-label">College ID
                <input className="ptm-input" value={tenantForm.college_id} onChange={(e) => setTenantForm((current) => ({ ...current, college_id: e.target.value.toUpperCase() }))} required maxLength={40} placeholder="e.g. IITB" />
              </label>
              <label className="ptm-label">College name
                <input className="ptm-input" value={tenantForm.college_name} onChange={(e) => setTenantForm((current) => ({ ...current, college_name: e.target.value }))} required maxLength={160} />
              </label>
            </div>
            <div className="ptm-grid-2">
              <label className="ptm-label">Approved custom portal domain
                <input className="ptm-input" value={tenantForm.primary_domain} onChange={(e) => setTenantForm((current) => ({ ...current, primary_domain: e.target.value.trim().toLowerCase() }))} required placeholder="portal.example.edu" />
              </label>
              <label className="ptm-label">Institution email domain
                <input className="ptm-input" value={tenantForm.allowed_email_domain} onChange={(e) => setTenantForm((current) => ({ ...current, allowed_email_domain: e.target.value.trim().toLowerCase().replace(/^@/, '') }))} required placeholder="example.edu" />
              </label>
            </div>
            <label className="ptm-label">College time zone (IANA)
              <input className="ptm-input" value={tenantForm.timezone} onChange={(e) => setTenantForm((current) => ({ ...current, timezone: e.target.value.trim() }))} required placeholder="Asia/Kolkata" />
            </label>
            <div className="ptm-grid-2">
              <label className="ptm-label">Initial Dean account ID
                <input className="ptm-input" value={tenantForm.initial_dean_id} onChange={(e) => setTenantForm((current) => ({ ...current, initial_dean_id: e.target.value.toUpperCase() }))} required maxLength={40} />
              </label>
              <label className="ptm-label">Initial Dean name
                <input className="ptm-input" value={tenantForm.initial_dean_name} onChange={(e) => setTenantForm((current) => ({ ...current, initial_dean_name: e.target.value }))} required maxLength={160} />
              </label>
            </div>
            <div className="ptm-grid-2">
              <label className="ptm-label">Initial Dean contact email
                <input type="email" className="ptm-input" value={tenantForm.initial_dean_email} onChange={(e) => setTenantForm((current) => ({ ...current, initial_dean_email: e.target.value.trim().toLowerCase() }))} required />
              </label>
            </div>
            <label className="ptm-label">College logo URL (optional)
                <input type="url" className="ptm-input" value={tenantForm.logo_url} onChange={(e) => setTenantForm((current) => ({ ...current, logo_url: e.target.value }))} placeholder="https://..." />
            </label>
            <button type="submit" className="ptm-btn-primary" disabled={tenantSaving}>
              {tenantSaving ? 'Creating college…' : 'Add college'}
            </button>
          </form>

          <div className="ptm-section-title" style={{ marginTop: '24px' }}>Configured colleges</div>
          {tenantLoading ? (
            <ListRowSkeleton count={3} />
          ) : tenants.length === 0 ? (
            <div className="ptm-list-sub">No colleges are configured yet.</div>
          ) : (
            <div className="ptm-list">
              {tenants.map((tenant) => (
                <div key={tenant.college_id} className="ptm-list-row" style={{ alignItems: 'flex-start' }}>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">{tenant.college_name} ({tenant.college_id})</div>
                    <div className="ptm-list-sub">
                      Portal: {tenant.primary_domain} • Email domain: @{tenant.allowed_email_domain}
                    </div>
                    <div className="ptm-grid-2" style={{ marginTop: '10px' }}>
                      {TENANT_MODULES.map(([moduleName, label, available = true]) => (
                        <label key={moduleName} className="ptm-list-sub" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={available && Boolean(tenant.modules?.[moduleName])}
                            disabled={!available || Boolean(moduleSaving[tenant.college_id])}
                            onChange={(e) => handleModuleChange(tenant, moduleName, e.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="ptm-row-between" style={{ marginTop: '14px', justifyContent: 'flex-start', gap: '10px' }}>
                      <button
                        type="button"
                        className="ptm-btn-secondary"
                        disabled={Boolean(provisioningCollege)}
                        onClick={() => provisionMissingAccounts(tenant)}
                      >
                        {provisioningCollege === tenant.college_id ? 'Provisioning…' : 'Provision missing main accounts'}
                      </button>
                    </div>
                    <details style={{ marginTop: '12px' }}>
                      <summary className="ptm-list-sub" style={{ cursor: 'pointer' }}>Main accounts and password resets</summary>
                      <StaffAccountAccess apiUrl={apiUrl} user={user} collegeId={tenant.college_id} />
                    </details>
                    <details style={{ marginTop: '12px' }}>
                      <summary className="ptm-list-sub" style={{ cursor: 'pointer' }}>Sponsored student banner</summary>
                      <CollegeAdManager apiUrl={apiUrl} collegeId={tenant.college_id} />
                    </details>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}