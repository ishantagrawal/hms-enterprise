import React, { useState } from 'react';
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

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(extractErrorMessage(data, fallback));
  }
  return data;
}

function downloadCredentials(credentials) {
  if (!credentials.length) return;
  const csv = [
    'username,name,role,temporary_password',
    ...credentials.map((item) => [
      item.user_id, item.full_name, item.role, item.temporary_password
    ].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'temporary-staff-credentials.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function DeanStaffManager({ apiUrl }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [credentials, setCredentials] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

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
      setMessage('Account created. Share the temporary password privately; it must be changed at first sign-in.');
      setForm(EMPTY_FORM);
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
      setMessage(`${data.accounts?.length || 0} accounts created. Share credentials securely.`);
      formElement.reset();
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="av-panel">
      <h2>Staff & Faculty accounts</h2>
      <p className="av-subtitle">Create Faculty, Wardens, central staff, or Student Onboarding Staff. Each account gets a temporary password shown only once.</p>
      {error && <div className="av-error" role="alert">{error}</div>}
      {message && <div className="av-message" role="status">{message}</div>}
      {credentials.length > 0 && (
        <div className="av-panel">
          <div className="av-row-between">
            <strong>Temporary credentials</strong>
            <button type="button" className="av-secondary" onClick={() => downloadCredentials(credentials)}>
              Download handoff CSV
            </button>
          </div>
          <div className="av-list">
            {credentials.map((item) => (
              <div className="av-list-row" key={item.user_id}>
                <strong className="av-tabular">{item.user_id}</strong>
                <span>{item.full_name} · {item.role}</span>
                <code>{item.temporary_password}</code>
              </div>
            ))}
          </div>
        </div>
      )}
      <form className="av-form-grid" onSubmit={create}>
        <label>Username / account ID<input required value={form.user_id} onChange={(event) => setForm({ ...form, user_id: event.target.value })} /></label>
        <label>Full name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          <option value="Faculty">Faculty</option>
          <option value="Warden">Warden</option>
          <option value="Staff">Central staff</option>
          <option value="StudentOnboarding">Student Onboarding Staff</option>
          <option value="GateSecurity">Gate Security</option>
        </select></label>
        <label>Department / office<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
        <label>Hostel block (Wardens)<input value={form.hostel_block} onChange={(event) => setForm({ ...form, hostel_block: event.target.value })} /></label>
        <label>Contact email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <button className="av-primary" disabled={saving}>{saving ? 'Creating…' : 'Create staff account'}</button>
      </form>
      <form className="av-inline-form" onSubmit={importCsv}>
        <label>CSV: user_id,full_name,role,email,department,hostel_block,phone
          <input type="file" name="staffCsv" accept=".csv,text/csv" required />
        </label>
        <button className="av-secondary" disabled={saving}>Import CSV</button>
      </form>
    </section>
  );
}
