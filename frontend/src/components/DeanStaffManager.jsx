import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api';
import { extractErrorMessage } from '../utils/errorParser.ts';
import './AttendanceOnlyPortals.css';

const EMPTY_FORM = {
  user_id: '',
  full_name: '',
  role: 'Faculty',
  email: '',
  department: '',
  hostel_block: 'All',
  phone: ''
};

const ACCOUNT_GROUPS = [
  { title: 'Faculty', roles: ['Faculty'] },
  { title: 'Wardens', roles: ['Warden'] },
  { title: 'Student Onboarding', roles: ['StudentOnboarding'] },
  { title: 'Central Staff', roles: ['Staff'] },
  { title: 'Gate Security', roles: ['GateSecurity', 'Gate Security'] },
  { title: 'Club Accounts', roles: ['ClubOrganizer'] }
];

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(extractErrorMessage(data, fallback));
  }
  return data;
}

export default function DeanStaffManager({ apiUrl }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [accounts, setAccounts] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/api/staff/accounts`);
    const data = await readJson(response, 'Could not load staff accounts.');
    setAccounts(data);
  }, [apiUrl]);

  useEffect(() => {
    loadAccounts().catch((loadError) => setError(extractErrorMessage(loadError)));
  }, [loadAccounts]);

  const groupedAccounts = useMemo(() => ACCOUNT_GROUPS.map((group) => ({
    ...group,
    accounts: accounts.filter((account) => group.roles.includes(account.role))
  })), [accounts]);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    setCredentials([]);
    try {
      const response = await apiFetch(`${apiUrl}/api/dean/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await readJson(response, 'Could not create the staff account.');
      setCredentials([data]);
      setMessage('Account created. Share this temporary password privately; the staff member must change it at first sign-in.');
      setForm(EMPTY_FORM);
      await loadAccounts();
    } catch (createError) {
      setError(extractErrorMessage(createError));
    } finally {
      setSaving(false);
    }
  };

  const importCsv = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = formElement.elements.staffCsv.files[0];
    if (!file) return;
    setSaving(true);
    setError('');
    setMessage('');
    setCredentials([]);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await apiFetch(`${apiUrl}/api/dean/staff/csv`, { method: 'POST', body });
      const data = await readJson(response, 'Could not import staff accounts.');
      setCredentials(data.accounts || []);
      setMessage(`${data.accounts?.length || 0} accounts created. Share these temporary passwords privately.`);
      formElement.reset();
      await loadAccounts();
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError));
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async (event) => {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/api/dean/staff/${encodeURIComponent(editing.user_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editing.full_name,
          email: editing.email,
          phone: editing.phone,
          department: editing.department,
          hostel_block: editing.hostel_block
        })
      });
      await readJson(response, 'Could not update this account.');
      setEditing(null);
      setMessage('Staff details updated.');
      await loadAccounts();
    } catch (saveError) {
      setError(extractErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const issuePassword = async (account) => {
    setSaving(true);
    setError('');
    setMessage('');
    setCredentials([]);
    try {
      const response = await apiFetch(`${apiUrl}/api/staff/accounts/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: account.user_id })
      });
      const data = await readJson(response, 'Could not reset this account password.');
      setCredentials([{
        user_id: account.user_id,
        full_name: account.full_name,
        role: account.role,
        temporary_password: data.temporary_password
      }]);
      setMessage('A new temporary password is ready. It is shown only once and must be changed at first sign-in.');
      await loadAccounts();
    } catch (resetError) {
      setError(extractErrorMessage(resetError));
    } finally {
      setSaving(false);
    }
  };

  const updateEditing = (field, value) => setEditing((current) => ({ ...current, [field]: value }));

  return (
    <div className="av-staff-manager">
      <section className="av-panel">
        <h2>Create a staff account</h2>
        <p className="av-subtitle">Temporary passwords are shown once. Passwords are never stored in a readable form.</p>
        {error && <div className="av-error" role="alert">{error}</div>}
        {message && <div className="av-message" role="status">{message}</div>}
        {credentials.length > 0 && (
          <div className="av-credentials" role="status">
            <div className="av-row-between">
              <strong>One-time credentials</strong>
              <button type="button" className="av-text-button" onClick={() => setCredentials([])}>Hide credentials</button>
            </div>
            {credentials.map((item) => (
              <div className="av-list-row" key={item.user_id}>
                <div><strong>{item.full_name} · {item.role}</strong><small>Username: <b className="av-tabular">{item.user_id}</b></small></div>
                <code className="av-temp-password">{item.temporary_password}</code>
              </div>
            ))}
          </div>
        )}
        <form className="av-form-grid" onSubmit={create}>
          <label>Username / account ID<input required maxLength="40" value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })} /></label>
          <label>Full name<input required maxLength="160" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="Faculty">Faculty</option>
            <option value="Warden">Warden</option>
            <option value="Staff">Central staff</option>
            <option value="StudentOnboarding">Student Onboarding Staff</option>
            <option value="GateSecurity">Gate Security</option>
          </select></label>
          {form.role === 'Warden'
            ? <label>Assigned hostel block<input required value={form.hostel_block === 'All' ? '' : form.hostel_block} onChange={(event) => setForm({ ...form, hostel_block: event.target.value })} /></label>
            : <label>Department / office<input required={form.role === 'Faculty'} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>}
          <label>Contact email<input type="email" maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Phone<input type="tel" maxLength="40" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <button className="av-primary" disabled={saving}>{saving ? 'Creating…' : 'Create staff account'}</button>
        </form>
        <form className="av-inline-form" onSubmit={importCsv}>
          <label>CSV: user_id,full_name,role,email,department,hostel_block,phone
            <input type="file" name="staffCsv" accept=".csv,text/csv" required />
          </label>
          <button className="av-secondary" disabled={saving}>{saving ? 'Importing…' : 'Import CSV'}</button>
        </form>
      </section>

      <section className="av-panel">
        <h2>Staff directory</h2>
        <p className="av-subtitle">Edit contact and assignment details, or issue a new one-time password. Account IDs and roles remain fixed for audit safety.</p>
        {groupedAccounts.map((group) => (
          <section className="av-staff-group" key={group.title}>
            <div className="av-row-between"><h3>{group.title}</h3><span className="av-count">{group.accounts.length}</span></div>
            {!group.accounts.length && <p className="av-empty">No {group.title.toLowerCase()} accounts.</p>}
            {group.accounts.map((account) => (
              <article className="av-staff-account" key={account.user_id}>
                {editing?.user_id === account.user_id ? (
                  <form className="av-form-grid" onSubmit={saveDetails}>
                    <label>Full name<input required maxLength="160" value={editing.full_name} onChange={(event) => updateEditing('full_name', event.target.value)} /></label>
                    <label>Email<input type="email" maxLength="254" value={editing.email || ''} onChange={(event) => updateEditing('email', event.target.value)} /></label>
                    <label>Phone<input type="tel" maxLength="40" value={editing.phone || ''} onChange={(event) => updateEditing('phone', event.target.value)} /></label>
                    <label>Department / office<input value={editing.department || ''} onChange={(event) => updateEditing('department', event.target.value)} /></label>
                    <label>{account.role === 'Warden' ? 'Hostel block' : 'Account scope'}<input value={editing.hostel_block || ''} onChange={(event) => updateEditing('hostel_block', event.target.value)} /></label>
                    <div className="av-form-actions">
                      <button className="av-primary" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
                      <button type="button" className="av-secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="av-staff-row">
                    <div className="av-staff-identity">
                      <strong>{account.full_name}</strong>
                      <span className="av-subtitle">{account.role} · <b className="av-tabular">{account.user_id}</b></span>
                      <span className="av-subtitle">{account.email || 'No email'} · {account.phone || 'No phone'}</span>
                      <span className="av-subtitle">{account.department || account.hostel_block || 'No department or block'} · {account.password_reset_required ? 'Must change password' : account.has_password ? 'Password active' : 'Password not set'}</span>
                    </div>
                    <div className="av-staff-actions">
                      <button type="button" className="av-secondary" onClick={() => { setError(''); setEditing({ ...account }); }}>Edit details</button>
                      <button type="button" className="av-secondary" disabled={saving || !account.can_manage} onClick={() => void issuePassword(account)}>
                        {saving ? 'Please wait…' : 'Reset password'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        ))}
      </section>
    </div>
  );
}
