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

function formatBillingAmount(amount, currency) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return '—';
  const currencyCode = /^[A-Z]{3}$/.test(currency || '') ? currency : 'INR';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currencyCode })
      .format(numericAmount / 100);
  } catch {
    return `${currencyCode} ${(numericAmount / 100).toFixed(2)}`;
  }
}

async function fetchBillingStatus(apiUrl, collegeId) {
  const response = await apiFetch(`${apiUrl}/api/founder/tenants/${encodeURIComponent(collegeId)}/billing-status`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, 'Could not load billing status.'));
  return data;
}

function FounderBillingPanel({ apiUrl, tenant, onTenantUpdated }) {
  const [customerId, setCustomerId] = useState(tenant?.razorpay_customer_id || '');
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const collegeId = tenant?.college_id;

  const loadBilling = useCallback(async () => {
    if (!collegeId) return;
    setLoading(true);
    setError('');
    try {
      setBilling(await fetchBillingStatus(apiUrl, collegeId));
    } catch (loadError) {
      setError(extractErrorMessage(loadError, 'Could not load billing status.'));
    } finally {
      setLoading(false);
    }
  }, [apiUrl, collegeId]);

  useEffect(() => {
    let active = true;
    fetchBillingStatus(apiUrl, collegeId)
      .then((data) => {
        if (!active) return;
        setError('');
        setBilling(data);
      })
      .catch((loadError) => {
        if (active) setError(extractErrorMessage(loadError, 'Could not load billing status.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [apiUrl, collegeId]);

  const saveCustomerId = async (event) => {
    event.preventDefault();
    if (!collegeId || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/api/founder/tenants/${encodeURIComponent(collegeId)}/razorpay-customer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ razorpay_customer_id: customerId.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(extractErrorMessage(data, 'Could not save the Razorpay Customer ID.'));
      setCustomerId(data.razorpay_customer_id);
      setMessage(data.razorpay_customer_id ? 'Razorpay Customer ID saved.' : 'Razorpay Customer ID removed.');
      await onTenantUpdated();
      await loadBilling();
    } catch (saveError) {
      setError(extractErrorMessage(saveError, 'Could not save the Razorpay Customer ID.'));
    } finally {
      setSaving(false);
    }
  };

  const reload = () => loadBilling();
  const subscriptions = billing?.subscriptions || [];
  const invoices = billing?.invoices || [];

  return (
    <div className="ptm-card">
      <div className="ptm-row-between">
        <div>
          <div className="ptm-section-title">Razorpay billing · {tenant?.college_name}</div>
          <p className="ptm-list-sub">Read-only subscription and invoice status from the shared Razorpay account.</p>
        </div>
        <Button variant="outline" type="button" disabled={loading || !collegeId} onClick={reload}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>
      {message && <div className="ptm-alert-success" role="status">{message}</div>}
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <form className="ptm-form-stack" onSubmit={saveCustomerId}>
        <label className="ptm-label">
          Razorpay Customer ID
          <input
            className="ptm-input"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            maxLength={80}
            placeholder="cust_..."
            aria-describedby="ptm-razorpay-customer-help"
          />
        </label>
        <p id="ptm-razorpay-customer-help" className="ptm-list-sub">Map each college to its Customer ID in the shared Razorpay account. Leave blank to remove the mapping.</p>
        <Button type="submit" disabled={saving || !collegeId}>
          {saving ? 'Saving…' : 'Save Customer ID'}
        </Button>
      </form>

      {loading && <ListRowSkeleton count={2} />}
      {!loading && billing?.status === 'not_configured' && (
        <div className="ptm-alert-warning" role="status">{billing.message}</div>
      )}
      {!loading && billing?.status === 'missing_customer_id' && (
        <div className="ptm-empty-state">{billing.message}</div>
      )}
      {!loading && billing?.status === 'ready' && (
        <>
          {!billing.subscription_scan_complete && (
            <div className="ptm-alert-warning" role="status">Subscription scan reached its page limit. Results may be incomplete; refresh after older records are reviewed.</div>
          )}
          <section className="ptm-billing-section">
            <div className="ptm-section-title">Subscriptions</div>
            <div className="ptm-list">
              {subscriptions.map((subscription) => (
                <div className="ptm-list-row" key={subscription.id}>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">{subscription.id || 'Subscription'}</div>
                    <div className="ptm-list-sub">
                      Plan {subscription.plan_id || '—'} · Created {subscription.created_at ? new Date(subscription.created_at).toLocaleDateString() : '—'}
                    </div>
                    <div className="ptm-list-sub">
                      Next charge {subscription.charge_at ? new Date(subscription.charge_at).toLocaleDateString() : '—'} · Paid {subscription.paid_count ?? 0}/{subscription.total_count ?? '—'}
                    </div>
                  </div>
                  <StatusPill tone={subscription.status === 'active' ? 'success' : 'neutral'}>{subscription.status || 'unknown'}</StatusPill>
                </div>
              ))}
              {!subscriptions.length && <p className="ptm-empty-state">No subscriptions were found for this customer.</p>}
            </div>
          </section>
          <section className="ptm-billing-section">
            <div className="ptm-section-title">Invoices</div>
            <div className="ptm-list">
              {invoices.map((invoice) => (
                <div className="ptm-list-row" key={invoice.id}>
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">{invoice.invoice_number || invoice.id || 'Invoice'}</div>
                    <div className="ptm-list-sub">
                      {invoice.date ? new Date(invoice.date).toLocaleDateString() : '—'} · {formatBillingAmount(invoice.amount, invoice.currency)}
                    </div>
                    <div className="ptm-list-sub">
                      Paid {formatBillingAmount(invoice.amount_paid, invoice.currency)} · Due {formatBillingAmount(invoice.amount_due, invoice.currency)}
                    </div>
                  </div>
                  <StatusPill tone={invoice.status === 'paid' ? 'success' : 'neutral'}>{invoice.status || 'unknown'}</StatusPill>
                </div>
              ))}
              {!invoices.length && <p className="ptm-empty-state">No invoices were found for this customer.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function FounderPortal({ apiUrl, onLogout, user, tenantName = 'Vidyut OS' }) {
  const [page, setPage] = useState('colleges');
  usePortalBackNavigation(page, setPage);
  const [tenants, setTenants] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [showCreateCollege, setShowCreateCollege] = useState(false);
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
      setSelectedCollegeId((current) => current && data.some((tenant) => tenant.college_id === current)
        ? current
        : data[0]?.college_id || '');
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
      setShowCreateCollege(false);
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
    { id: 'home', label: 'Dashboard', icon: 'home' },
    { id: 'colleges', label: 'Colleges', icon: 'building', count: tenants.length },
    { id: 'features', label: 'Feature access', icon: 'shield' },
    { id: 'banners', label: 'Banners', icon: 'file' },
    { id: 'accounts', label: 'Main accounts', icon: 'users' },
    { id: 'billing', label: 'Billing', icon: 'file' }
  ];
  const founderMobileItems = founderNavItems.map((item) => ({
    ...item,
    label: item.id === 'features' ? 'Features' : item.id === 'accounts' ? 'Accounts' : item.id === 'banners' ? 'Banners' : item.id === 'billing' ? 'Billing' : item.id === 'colleges' ? 'Colleges' : 'Home'
  }));
  const pageTitles = {
    home: 'Platform overview',
    colleges: 'Colleges',
    features: 'Feature access',
    accounts: 'Main account access',
    banners: 'College-wide banners',
    billing: 'Billing'
  };
  const activeTenant = tenants.find((tenant) => tenant.college_id === selectedCollegeId) || tenants[0] || null;
  const renderTenantFeatures = (tenant) => (
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
  );
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
            {section === 'features' && renderTenantFeatures(tenant)}
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
            {page !== 'colleges' && <span className="ptm-dashboard-kicker">FOUNDER CONSOLE</span>}
            <h1>{pageTitles[page]}</h1>
            <p>{page === 'colleges'
              ? 'Create a college and provision its Dean, onboarding desk, and Beacon Manager.'
              : page === 'billing'
                ? 'Review Razorpay subscription and invoice status for each college.'
              : 'Provision colleges, control services, and manage primary accounts.'}</p>
          </div>
          <div className="ptm-founder-header-actions">
            {page === 'colleges' && <Button type="button" onClick={() => setShowCreateCollege(true)}><Icon name="building" /> Add college</Button>}
            <Button variant="outline" type="button" onClick={onLogout}><Icon name="user" /> Sign out</Button>
          </div>
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
          <div className="ptm-founder-college-page">
            <div className="ptm-founder-stats ptm-founder-college-stats">
              <StatTile label="Colleges" value={tenants.length} detail="Configured portals" />
              <StatTile label="Students" value={tenants.reduce((total, tenant) => total + Number(tenant.student_count || 0), 0).toLocaleString('en-IN')} detail="Across all college portals" />
              <StatTile label="Enabled services" value={enabledFeatures} detail="Across all colleges" />
              <StatTile label="Main accounts" value={tenants.reduce((total, tenant) => total + Number(tenant.main_account_count || 0), 0)} detail="Dean · Onboarding · Beacon" />
            </div>
            <div className="ptm-founder-college-layout">
              <section className="ptm-card ptm-founder-college-list">
                <div className="ptm-row-between">
                  <div><div className="ptm-section-title">Your colleges</div><p className="ptm-list-sub">Select a college to manage enabled services.</p></div>
                </div>
                {tenantLoading ? <ListRowSkeleton count={3} /> : tenants.map((tenant) => (
                  <div className={`ptm-founder-college-row${activeTenant?.college_id === tenant.college_id ? ' is-selected' : ''}`} key={tenant.college_id}>
                    <button type="button" className="ptm-founder-college-select" onClick={() => setSelectedCollegeId(tenant.college_id)}>
                      <span className="ptm-tenant-mark">{tenant.college_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CL'}</span>
                      <span><strong>{tenant.college_name}</strong><small>{Object.values(tenant.modules || {}).filter(Boolean).length} services enabled</small></span>
                      <StatusPill tone={tenant.enabled ? 'success' : 'warning'}>{tenant.enabled ? 'Live' : 'Onboarding'}</StatusPill>
                    </button>
                    <div className="ptm-founder-college-row-actions">
                      <Button variant="outline" type="button" onClick={() => setPage('accounts')}>Manage</Button>
                      <Button
                        variant="outline"
                        type="button"
                        disabled={Boolean(provisioningCollege)}
                        onClick={() => provisionMissingAccounts(tenant)}
                      >
                        {provisioningCollege === tenant.college_id ? 'Provisioning…' : 'Provision'}
                      </Button>
                    </div>
                  </div>
                ))}
                {!tenantLoading && !tenants.length && <p className="ptm-empty-state">No colleges are configured yet.</p>}
              </section>
              <aside className="ptm-founder-college-side">
                <section className="ptm-card ptm-founder-feature-card">
                  <div className="ptm-section-title">{activeTenant?.college_name || 'College'} features</div>
                  <p className="ptm-list-sub">Features enabled for this college.</p>
                  {activeTenant ? renderTenantFeatures(activeTenant) : <p className="ptm-empty-state">Add a college to configure services.</p>}
                </section>
                <section className="ptm-founder-banner-card">
                  <span className="ptm-dashboard-kicker">SPONSORED BANNER</span>
                  <h2>Shown on every student’s home screen at this college.</h2>
                  <Button variant="outline" type="button" disabled={!activeTenant} onClick={() => setPage('banners')}>Manage banner</Button>
                </section>
              </aside>
            </div>
          </div>
        )}

        {showCreateCollege && (
          <div className="ptm-modal-backdrop" onClick={() => setShowCreateCollege(false)}>
            <section className="ptm-modal-card ptm-founder-create-modal" role="dialog" aria-modal="true" aria-labelledby="ptm-create-college-title" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ptm-modal-close" onClick={() => setShowCreateCollege(false)} aria-label="Close create college">×</button>
              <h2 id="ptm-create-college-title">Create a college portal</h2>
              <p>A new college is provisioned with one Dean, Student Onboarding Staff, and Beacon Manager account.</p>
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
          </div>
        )}

        {page === 'features' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">College feature access</div><p className="ptm-list-sub">Each college can use only the modules enabled here.</p></div>{renderTenantSection('features')}</section>}
        {page === 'accounts' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">Main account access</div><p className="ptm-list-sub">Manage or reset a college’s Dean, Student Onboarding Staff, and Beacon Manager accounts.</p></div>{renderTenantSection('accounts')}</section>}
        {page === 'banners' && <section className="ptm-founder-sections"><div><div className="ptm-section-title">College-wide student banners</div><p className="ptm-list-sub">Create or update sponsored banners for a selected college.</p></div>{renderTenantSection('banners')}</section>}
        {page === 'billing' && (
          <section className="ptm-founder-sections">
            <div>
              <div className="ptm-section-title">College billing status</div>
              <p className="ptm-list-sub">Billing records are read-only. Configure the shared Razorpay account on the backend using RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.</p>
            </div>
            {tenantLoading ? <ListRowSkeleton count={2} /> : activeTenant ? (
              <>
                <label className="ptm-label">
                  College
                  <select
                    className="ptm-input"
                    value={activeTenant.college_id}
                    onChange={(event) => setSelectedCollegeId(event.target.value)}
                  >
                    {tenants.map((tenant) => (
                      <option key={tenant.college_id} value={tenant.college_id}>{tenant.college_name}</option>
                    ))}
                  </select>
                </label>
                <FounderBillingPanel
                  key={activeTenant.college_id}
                  apiUrl={apiUrl}
                  tenant={activeTenant}
                  onTenantUpdated={loadTenants}
                />
              </>
            ) : <div className="ptm-empty-state">Create a college before configuring billing.</div>}
          </section>
        )}
      </main>
      <TabBar items={founderMobileItems} active={page} onChange={setPage} className="ptm-founder-tabbar" />
    </div>
  );
}