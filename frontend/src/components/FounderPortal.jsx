import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import StaffAccountAccess from './StaffAccountAccess';
import { ListRowSkeleton } from './SkeletonLoader';
import usePortalBackNavigation from '../hooks/usePortalBackNavigation';
import { extractErrorMessage } from '../utils/errorParser.ts';
import { Button, Icon, Sidebar, StatTile, StatusPill, TabBar, Toggle } from './ui/DesignSystem';

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

export default function FounderPortal({ apiUrl, onLogout, user, tenantName = 'Vidyut OS' }) {
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
      setMsg(`College ${data.college_id} configured. Share each temporary password privately; it must be changed at first sign-in.`);
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
        ? `Created ${data.accounts.length} missing main account${data.accounts.length === 1 ? '' : 's'}. Share each temporary password privately.`
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

  const enabledFeatures = tenants.reduce(
    (total, tenant) => total + Object.values(tenant.modules || {}).filter(Boolean).length,
    0
  );
  const founderNavItems = [
    { id: 'home', label: 'Overview', icon: 'home' },
    { id: 'colleges', label: 'Colleges', icon: 'building', count: tenants.length },
    { id: 'features', label: 'Feature access', icon: 'shield' },
    { id: 'accounts', label: 'Main accounts', icon: 'users' },
    { id: 'banners', label: 'Sponsored banners', icon: 'file' }
  ];
  const founderMobileItems = founderNavItems.map((item) => ({
    ...item,
    label: item.id === 'features' ? 'Features' : item.id === 'accounts' ? 'Accounts' : item.id === 'banners' ? 'Banners' : item.id === 'colleges' ? 'Colleges' : 'Home'
  }));
  const pageTitles = {
    home: 'Platform overview',
    colleges: 'College onboarding',
    features: 'Feature access',
    accounts: 'Main account access',
    banners: 'College-wide banners'
  };
  const renderTenantSection = (section) => (
    tenantLoading ? <ListRowSkeleton count={3} /> : tenants.length === 0 ? (
      <div className="ptm-empty-state">No colleges are configured yet. Add a college to get started.</div>
    ) : (
      <div className="ptm-tenant-list">
        {tenants.map((tenant) => (
          <article className="ptm-card ptm-tenant-card" key={tenant.college_id}>
            <header className="ptm-tenant-heading">
              <span className="ptm-tenant-mark">{tenant.college_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL'}</span>
              <div>
                <h3>{tenant.college_name} <small>{tenant.college_id}</small></h3>
                <p>{tenant.primary_domain} · @{tenant.allowed_email_domain}</p>
              </div>
            </header>
            {section === 'colleges' && (
              <div className="ptm-tenant-actions">
                <StatusPill tone="neutral">3 main account roles</StatusPill>
                <Button
                  variant="outline"
                  type="button"
                  disabled={Boolean(provisioningCollege)}
                  onClick={() => provisionMissingAccounts(tenant)}
                >
                  {provisioningCollege === tenant.college_id ? 'Provisioning…' : 'Provision missing accounts'}
                </Button>
              </div>
            )}
            {section === 'features' && (
              <div className="ptm-feature-list">
                {TENANT_MODULES.map(([moduleName, label, available = true]) => (
                  <div className="ptm-feature-row" key={moduleName}>
                    <span><strong>{label}</strong>{!available && <small>Coming soon</small>}</span>
                    <Toggle
                      label={`${label} for ${tenant.college_name}`}
                      checked={available && Boolean(tenant.modules?.[moduleName])}
                      disabled={!available || Boolean(moduleSaving[tenant.college_id])}
                      onChange={(enabled) => handleModuleChange(tenant, moduleName, enabled)}
                    />
                  </div>
                ))}
              </div>
            )}
            {section === 'accounts' && <StaffAccountAccess apiUrl={apiUrl} user={user} collegeId={tenant.college_id} />}
            {section === 'banners' && <CollegeAdManager apiUrl={apiUrl} collegeId={tenant.college_id} />}
          </article>
        ))}
      </div>
    )
  );

  return (
    <div className="ptm-founder-layout">
      <Sidebar
        title="Platform admin"
        brand={{ name: tenantName, initials: 'VO' }}
        items={founderNavItems}
        active={page}
        onChange={setPage}
        className="ptm-founder-sidebar"
      />
      <main className="ptm-founder-content">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}
        {credentials.length > 0 && (
          <section className="ptm-card ptm-credentials-card" aria-live="polite">
            <div className="ptm-section-title">One-time initial credentials</div>
            <p className="ptm-list-sub">These temporary passwords are shown only now. Share them privately; each account must change its password at first sign-in.</p>
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

        <header className="ptm-founder-page-header">
          <div>
            <span className="ptm-dashboard-kicker">FOUNDER CONSOLE</span>
            <h1>{pageTitles[page]}</h1>
            <p>Provision colleges, control services, and manage primary accounts.</p>
          </div>
          <Button variant="outline" type="button" onClick={onLogout}><Icon name="user" /> Sign out</Button>
        </header>

        {page === 'home' && (
          <div className="ptm-founder-dashboard">
            <div className="ptm-founder-stats">
              <StatTile label="Configured colleges" value={tenants.length} detail="College portals" />
              <StatTile label="Enabled services" value={enabledFeatures} detail="Across all colleges" />
              <StatTile label="Main account roles" value="3" detail="Dean · Onboarding · Beacon manager" />
            </div>
            <section className="ptm-founder-hero">
              <span className="ptm-dashboard-kicker">VIDYUT OS PLATFORM</span>
              <h2>Manage every college from one console.</h2>
              <p>Set up college portals, choose enabled services, and manage college-level access from a single place.</p>
              <Button type="button" onClick={() => setPage('colleges')}><Icon name="building" /> Add or manage colleges</Button>
            </section>
            <section className="ptm-card">
              <div className="ptm-row-between">
                <div><div className="ptm-section-title">Configured colleges</div><p className="ptm-list-sub">Recent colleges on the platform.</p></div>
                <button className="ptm-text-action" onClick={() => setPage('colleges')}>View all <Icon name="arrow" size={16} /></button>
              </div>
              {tenantLoading ? <ListRowSkeleton count={3} /> : tenants.slice(0, 4).map((tenant) => (
                <div className="ptm-tenant-summary-row" key={tenant.college_id}>
                  <span className="ptm-tenant-mark">{tenant.college_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL'}</span>
                  <span><strong>{tenant.college_name}</strong><small>{tenant.primary_domain}</small></span>
                  <StatusPill tone="success">{Object.values(tenant.modules || {}).filter(Boolean).length} services</StatusPill>
                </div>
              ))}
              {!tenantLoading && !tenants.length && <p className="ptm-empty-state">No colleges are configured yet.</p>}
            </section>
          </div>
        )}

        {page === 'colleges' && (
          <div className="ptm-founder-sections">
            <section className="ptm-card">
              <div className="ptm-section-title">Create a college portal</div>
              <p className="ptm-list-sub">A new college is provisioned with one Dean, Student Onboarding Staff, and Beacon Manager account.</p>
              <form onSubmit={handleCreateTenant} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <label className="ptm-label">College ID<input className="ptm-input" value={tenantForm.college_id} onChange={(event) => setTenantForm((current) => ({ ...current, college_id: event.target.value.toUpperCase() }))} required maxLength={40} placeholder="e.g. IITB" /></label>
                  <label className="ptm-label">College name<input className="ptm-input" value={tenantForm.college_name} onChange={(event) => setTenantForm((current) => ({ ...current, college_name: event.target.value }))} required maxLength={160} /></label>
                </div>
                <div className="ptm-grid-2">
                  <label className="ptm-label">Approved portal domain<input className="ptm-input" value={tenantForm.primary_domain} onChange={(event) => setTenantForm((current) => ({ ...current, primary_domain: event.target.value.trim().toLowerCase() }))} required placeholder="portal.example.edu" /></label>
                  <label className="ptm-label">Institution email domain<input className="ptm-input" value={tenantForm.allowed_email_domain} onChange={(event) => setTenantForm((current) => ({ ...current, allowed_email_domain: event.target.value.trim().toLowerCase().replace(/^@/, '') }))} required placeholder="example.edu" /></label>
                </div>
                <label className="ptm-label">College time zone<input className="ptm-input" value={tenantForm.timezone} onChange={(event) => setTenantForm((current) => ({ ...current, timezone: event.target.value.trim() }))} required placeholder="Asia/Kolkata" /></label>
                <div className="ptm-grid-2">
                  <label className="ptm-label">Initial Dean account ID<input className="ptm-input" value={tenantForm.initial_dean_id} onChange={(event) => setTenantForm((current) => ({ ...current, initial_dean_id: event.target.value.toUpperCase() }))} required maxLength={40} /></label>
                  <label className="ptm-label">Initial Dean name<input className="ptm-input" value={tenantForm.initial_dean_name} onChange={(event) => setTenantForm((current) => ({ ...current, initial_dean_name: event.target.value }))} required maxLength={160} /></label>
                </div>
                <label className="ptm-label">Initial Dean contact email<input type="email" className="ptm-input" value={tenantForm.initial_dean_email} onChange={(event) => setTenantForm((current) => ({ ...current, initial_dean_email: event.target.value.trim().toLowerCase() }))} required /></label>
                <label className="ptm-label">College logo URL (optional)<input type="url" className="ptm-input" value={tenantForm.logo_url} onChange={(event) => setTenantForm((current) => ({ ...current, logo_url: event.target.value }))} placeholder="https://..." /></label>
                <Button type="submit" disabled={tenantSaving}>{tenantSaving ? 'Creating college…' : 'Create college'} <Icon name="arrow" /></Button>
              </form>
            </section>
            <section className="ptm-founder-sections__list">
              <div className="ptm-section-title">College accounts</div>
              <p className="ptm-list-sub">Provision any missing main accounts for existing colleges.</p>
              {renderTenantSection('colleges')}
            </section>
          </div>
        )}

        {page === 'features' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">College feature access</div><p className="ptm-list-sub">Each college can use only the modules enabled here.</p></div>{renderTenantSection('features')}</section>}
        {page === 'accounts' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">Main account access</div><p className="ptm-list-sub">Manage or reset a college’s Dean, Student Onboarding Staff, and Beacon Manager accounts.</p></div>{renderTenantSection('accounts')}</section>}
        {page === 'banners' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">College-wide student banners</div><p className="ptm-list-sub">Create or update sponsored banners for a selected college.</p></div>{renderTenantSection('banners')}</section>}
      </main>
      <TabBar items={founderMobileItems} active={page} onChange={setPage} className="ptm-founder-tabbar" />
    </div>
  );
}