import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { ListRowSkeleton } from './SkeletonLoader';

export default function StaffAccountAccess({ apiUrl, user }) {
  const [accounts, setAccounts] = useState([]);
  const [passwords, setPasswords] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccounts = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiUrl}/api/staff/accounts`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load staff accounts.');
      setAccounts(data);
    } catch (loadError) {
      setError(loadError.message || 'Could not load staff accounts.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const savePassword = async (event, account) => {
    event.preventDefault();
    const password = passwords[account.user_id] || '';
    setSavingId(account.user_id);
    setMessage('');
    setError('');
    try {
      const response = await apiFetch(`${apiUrl}/api/staff/accounts/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: account.user_id, password })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || 'Could not update password.');
      setPasswords((current) => ({ ...current, [account.user_id]: '' }));
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
        {user?.role === 'Warden'
          ? 'Manage passwords only for staff accounts created by your Warden account.'
          : user?.role === 'Dean'
            ? 'Manage Wardens, clubs, gate security, and central staff accounts. The Founder manages the Dean password.'
            : 'Manage the Dean account password. Deans manage Wardens, clubs, and central staff.'}
        {' '}Use a unique password of at least 12 characters. Students sign in with Google.
      </p>
      {message && <div className="ptm-alert-success" role="status">{message}</div>}
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
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
                  {account.has_password ? 'Password is set' : 'Password not set'}
                </div>
                {!account.can_manage && (
                  <div className="ptm-list-sub">Your role does not have permission to change this account's password.</div>
                )}
              </div>
              <label className="ptm-label" style={{ flex: '1 1 220px' }}>
                New password
                <input
                  className="ptm-input"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required={account.can_manage}
                  disabled={!account.can_manage}
                  value={passwords[account.user_id] || ''}
                  onChange={(event) => setPasswords((current) => ({
                    ...current,
                    [account.user_id]: event.target.value
                  }))}
                  placeholder="At least 12 characters"
                />
              </label>
              <button
                className="ptm-btn-primary"
                type="submit"
                disabled={!account.can_manage || savingId === account.user_id}
                style={{ width: 'auto', alignSelf: 'flex-end' }}
              >
                {savingId === account.user_id ? 'Saving…' : 'Set / reset'}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
