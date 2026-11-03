import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import StaffAccountAccess from './StaffAccountAccess';
import { DashboardCardSkeleton, GridCardSkeleton, ListRowSkeleton } from './SkeletonLoader';
import usePortalBackNavigation from '../hooks/usePortalBackNavigation';

const TENANT_MODULES = [
  ['grievances', 'Grievances'],
  ['mess_pulse', 'Mess Pulse'],
  ['event_radar', 'Events'],
  ['gate_outpass', 'Gate outpass'],
  ['attendance', 'Night attendance'],
  ['parent_alerts', 'Parent alerts']
];

export default function FounderPortal({ apiUrl, onLogout, user }) {
  const [page, setPage] = useState('home');
  usePortalBackNavigation(page, setPage);
  const [ads, setAds] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [moduleSaving, setModuleSaving] = useState({});
  const [tenantForm, setTenantForm] = useState({
    college_id: '',
    college_name: '',
    primary_domain: '',
    allowed_email_domain: '',
    timezone: 'Asia/Kolkata',
    initial_dean_id: '',
    initial_dean_name: '',
    initial_dean_email: '',
    initial_dean_password: '',
    logo_url: ''
  });
  const [dataLoading, setDataLoading] = useState(true);
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

  const loadAds = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/api/ads`);
      if (res.ok) setAds(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl]);

  const loadTenants = useCallback(async () => {
    setTenantLoading(true);
    try {
      const res = await apiFetch(`${apiUrl}/api/founder/tenants`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.detail || 'Could not load college settings.');
      setTenants(data);
    } catch (error) {
      setMsg(error.message || 'Could not load college settings.');
    } finally {
      setTenantLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadAds();
    loadTenants();
  }, [loadAds, loadTenants]);

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
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not create college.');
      setMsg(`College ${data.college_id} configured. Connect and verify ${data.domain} before launch.`);
      setTenantForm({
        college_id: '',
        college_name: '',
        primary_domain: '',
        allowed_email_domain: '',
        timezone: 'Asia/Kolkata',
        initial_dean_id: '',
        initial_dean_name: '',
        initial_dean_email: '',
        initial_dean_password: '',
        logo_url: ''
      });
      await loadTenants();
    } catch (error) {
      setMsg(error.message || 'Could not create college.');
    } finally {
      setTenantSaving(false);
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
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not update college modules.');
    } catch (error) {
      setTenants((current) => current.map((item) =>
        item.college_id === tenant.college_id ? tenant : item
      ));
      setMsg(error.message || 'Could not update college modules.');
    } finally {
      setModuleSaving((current) => ({ ...current, [tenant.college_id]: false }));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/ads/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setForm({
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
      loadAds();
    }
  };

  const handleDelete = async (id) => {
    await apiFetch(`${apiUrl}/api/ads/delete?ad_id=${id}`, { method: 'POST' });
    loadAds();
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

        <div className="ptm-drill-header">
          <div className="ptm-row-between">
            <span className="ptm-tag-pill">FOUNDER & MASTER ADMIN PORTAL</span>
            <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '8px 14px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
          <h1 className="ptm-page-title">Campus Ad & Sponsor Studio</h1>
          <p className="ptm-page-sub">Publish 15-day promotional banners directly to all Student & Warden home screens.</p>
        </div>

        <div className="ptm-card">
          <div className="ptm-section-title">College platform settings</div>
          <p className="ptm-list-sub">
            Add an exact custom domain and the college’s approved Google email domain. Configure DNS, TLS, and Google OAuth origins separately before launch.
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
              <label className="ptm-label">Approved Google email domain
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
              <label className="ptm-label">Initial Dean college email
                <input type="email" className="ptm-input" value={tenantForm.initial_dean_email} onChange={(e) => setTenantForm((current) => ({ ...current, initial_dean_email: e.target.value.trim().toLowerCase() }))} required />
              </label>
              <label className="ptm-label">Initial Dean password (12+ characters)
                <input type="password" autoComplete="new-password" minLength={12} maxLength={128} className="ptm-input" value={tenantForm.initial_dean_password} onChange={(e) => setTenantForm((current) => ({ ...current, initial_dean_password: e.target.value }))} required />
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
                      Portal: {tenant.primary_domain} • Google email: @{tenant.allowed_email_domain}
                    </div>
                    <div className="ptm-grid-2" style={{ marginTop: '10px' }}>
                      {TENANT_MODULES.map(([moduleName, label]) => (
                        <label key={moduleName} className="ptm-list-sub" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(tenant.modules?.[moduleName])}
                            disabled={Boolean(moduleSaving[tenant.college_id])}
                            onChange={(e) => handleModuleChange(tenant, moduleName, e.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <StaffAccountAccess apiUrl={apiUrl} user={user} />

        {dataLoading ? (
          <div className="ptm-skeleton-founder">
            <DashboardCardSkeleton />
            <GridCardSkeleton count={4} />
          </div>
        ) : (
          <>
            <div className="ptm-card">
              <div className="ptm-section-title">Publish New 15-Day Sponsor Ad</div>
              <form onSubmit={handleCreate} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Sponsor / Brand Tag</label>
                    <input type="text" className="ptm-input" placeholder="e.g. UNACADEMY • CAMPUS PARTNER" value={form.sponsor_tag} onChange={(e) => setForm({ ...form, sponsor_tag: e.target.value })} required />
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
                    <label className="ptm-label">Subtitle / Description / Dates</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Flat 40% Off for SVNIT Students" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Badge Text (Right Highlight)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. LIMITED TIME" value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} />
                  </div>
                </div>

                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Click Destination URL (Website / WhatsApp / Form)</label>
                    <input type="url" className="ptm-input" placeholder="https://..." value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Action Button Text</label>
                    <input type="text" className="ptm-input" placeholder="Apply Now →" value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} required />
                  </div>
                </div>

                <div>
                  <label className="ptm-label">Banner Gradient Theme</label>
                  <select className="ptm-input" value={form.bg_gradient} onChange={(e) => setForm({ ...form, bg_gradient: e.target.value })}>
                    <option value="linear-gradient(135deg, #002970 0%, #0284C7 100%)">Paytm Royal Blue (Default)</option>
                    <option value="linear-gradient(135deg, #0F172A 0%, #1E40AF 100%)">Midnight Tech Navy</option>
                    <option value="linear-gradient(135deg, #065F46 0%, #059669 100%)">Emerald Cashback Green</option>
                    <option value="linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)">Sunset Fest Orange</option>
                  </select>
                </div>

                <button type="submit" className="ptm-btn-primary">🚀 Publish Live Sponsor Ad Banner</button>
              </form>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Active Live Banners ({ads.length})</div>
              {ads.length === 0 ? (
                <div className="ptm-list-sub">No active sponsor ads running right now.</div>
              ) : (
                <div className="ptm-list">
                  {ads.map((ad) => (
                    <div key={ad.ad_id} className="ptm-list-row">
                      <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>📢</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{ad.title}</div>
                        <div className="ptm-list-sub">{ad.sponsor_tag} • Expires: {ad.expires_at}</div>
                      </div>
                      <button className="ptm-btn-danger" style={{ width: 'auto', padding: '6px 12px' }} onClick={() => handleDelete(ad.ad_id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}