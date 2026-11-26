import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { ListRowSkeleton } from './SkeletonLoader';

export default function StaffAccountAccess({ apiUrl, user, collegeId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [credential, setCredential] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const accountUrl = collegeId
    ? `${apiUrl}/api/founder/tenants/${encodeURIComponent(collegeId)}/accounts`
    : `${apiUrl}/api/staff/accounts`;

  const loadAccounts = useCallback(async () => {
    try {
      const response = await apiFetch(accountUrl);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load staff accounts.');
      setAccounts(data);
    } catch (loadError) {
      setError(loadError.message || 'Could not load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, [accountUrl]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const savePassword = async (event, account) => {
    event.preventDefault();
    setSavingId(account.user_id);
    setMessage('');
    setError('');
    setCredential(null);
    try {
      const passwordUrl = collegeId
        ? `${apiUrl}/api/founder/tenants/${encodeURIComponent(collegeId)}/accounts/password`
        : `${apiUrl}/api/staff/accounts/password`;
      const response = await apiFetch(passwordUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: account.user_id })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || 'Could not update password.');
      setCredential({ user_id: account.user_id, full_name: account.full_name, password: data.temporary_password });
      setMessage(data.message);
      await loadAccounts();
    } catch (saveError) {
      setError(saveError.message || 'Could not update password.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <div className="ptm-card">
      <div className="ptm-section-title">Staff account access</div>
      <p className="ptm-list-sub">
        {collegeId
          ? 'Manage the Dean, Student Onboarding Staff, and Beacon Manager accounts for this college. Each reset creates a one-time password that must be changed at first sign-in.'
          : user?.role === 'Dean'
            ? 'Reset staff accounts. Each reset creates a temporary password that must be changed at first sign-in. Student passwords are managed by Student Onboarding Staff.'
            : 'Reset the Dean account password. Deans manage other staff accounts.'}
      </p>
      {message && <div className="ptm-alert-success" role="status">{message}</div>}
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      {credential && (
        <div className="ptm-alert-success" role="status">
          Temporary password for <strong>{credential.user_id}</strong>: <code>{credential.password}</code>. Share privately; it is shown only once.
        </div>
      )}
      {loading ? (
        <ListRowSkeleton count={4} />
      ) : accounts.length === 0 ? (
        <div className="ptm-list-sub">No staff accounts are configured for this college.</div>
      ) : (
        <div className="ptm-list">
          {accounts.map((account) => (
            <form
              className="ptm-list-row"
              key={account.user_id}
              onSubmit={(event) => savePassword(event, account)}
              style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
            >
              <div className="ptm-list-main" style={{ minWidth: '180px' }}>
                <div className="ptm-list-title">{account.full_name}</div>
                <div className="ptm-list-sub">
                  {account.role} · ID: <strong>{account.user_id}</strong>
                  {account.hostel_block && account.hostel_block !== 'All' ? ` · ${account.hostel_block}` : ''}
                </div>
                <div className="ptm-list-sub">
                  {!account.has_password ? 'Password not set' : account.password_reset_required ? 'Must change temporary password' : 'Password is set'}
                </div>
                {!account.can_manage && (
                  <div className="ptm-list-sub">Your role does not have permission to change this account's password.</div>
                )}
              </div>
              <button
                className="ptm-btn-primary"
                type="submit"
                disabled={!account.can_manage || savingId === account.user_id}
                style={{ width: 'auto', alignSelf: 'flex-end' }}
              >
                {savingId === account.user_id ? 'Generating…' : 'Issue temporary password'}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
