import React, { useState } from 'react';
import { apiFetch } from '../api';
import { extractErrorMessage } from '../utils/errorParser.ts';

export default function PasswordChangeForm({ apiUrl, user, mandatory = false, onSuccess, onCancel }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/auth/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(extractErrorMessage(data, 'Could not change your password.'));
      }
      onSuccess(data);
    } catch (submitError) {
      setError(extractErrorMessage(submitError, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={mandatory ? 'ptm-main-container' : ''}>
      <section className={mandatory ? 'ptm-modal-card' : ''} style={mandatory ? { margin: '10vh auto' } : undefined}>
        <h2 className="ptm-page-title">{mandatory ? 'Set your new password' : 'Change password'}</h2>
        <p className="ptm-page-sub">
          {mandatory
            ? `Welcome, ${user?.full_name || user?.user_id}. Change your temporary password to continue.`
            : 'Use a unique password with at least 12 characters.'}
        </p>
        {error && <div className="ptm-alert-error" role="alert">{error}</div>}
        <form className="ptm-form-stack" onSubmit={submit}>
          <label className="ptm-label">
            Current password
            <input
              className="ptm-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label className="ptm-label">
            New password
            <input
              className="ptm-input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label className="ptm-label">
            Confirm new password
            <input
              className="ptm-input"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <button className="ptm-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save new password'}
          </button>
          {!mandatory && onCancel && (
            <button className="ptm-btn-secondary" type="button" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
