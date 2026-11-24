import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import StaffAccountAccess from './StaffAccountAccess';
import { ListRowSkeleton } from './SkeletonLoader';
import usePortalBackNavigation from '../hooks/usePortalBackNavigation';
import { extractErrorMessage } from '../utils/errorParser.ts';

const TENANT_MODULES = [
  ['grievances', 'Grievances'],
  ['mess_pulse', 'Mess Pulse'],
  ['event_radar', 'Events'],
  ['gate_outpass', 'Gate outpass'],
  ['attendance', 'Night attendance'],
  ['class_attendance', 'Class attendance'],
  ['hostel_attendance', 'Hostel attendance'],
  ['parent_alerts', 'Parent alerts']
];

export default function FounderPortal({ apiUrl, onLogout, user }) {
  const [page, setPage] = useState('home');
  usePortalBackNavigation(page, setPage);
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
      setMsg(`College ${data.college_id} configured. Initial Dean ${data.initial_dean_id} temporary password: ${data.temporary_password}. Share privately; it must be changed at first sign-in.`);
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

        <div className="ptm-drill-header">
          <div className="ptm-row-between">
            <span className="ptm-tag-pill">FOUNDER & MASTER ADMIN PORTAL</span>
            <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '8px 14px' }} onClick={onLogout}>
              Sign Out
            </button>
          </div>
          <h1 className="ptm-page-title">Campus OS Founder Console</h1>
          <p className="ptm-page-sub">Provision colleges and Deans, manage tenant features, and reset Dean passwords.</p>
        </div>

        <div className="ptm-card">
          <div className="ptm-section-title">College platform settings</div>
          <p className="ptm-list-sub">
            Add the college portal domain and institution email domain, then configure DNS and TLS before launch.
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
      </div>
    </div>
  );
}