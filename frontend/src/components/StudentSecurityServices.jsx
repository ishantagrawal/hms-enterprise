import React, { useCallback, useEffect, useState } from 'react';
import { BleClient, ScanMode } from '@capacitor-community/bluetooth-le';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';
import { getDeviceBindingToken, getOrCreateDeviceBindingToken } from '../utils/deviceBinding';
import LocalFaceCheckModal from './LocalFaceCheckModal';
import { ListRowSkeleton } from './SkeletonLoader';

async function responseData(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || fallback);
  return data;
}

function errorText(error, fallback) {
  return error?.message || fallback;
}

export function StudentLeavePassPanel({ apiUrl, user, hostels = [], initialPasses = [], onPassesChange }) {
  const cacheKey = `digital_leave_passes_${user?.college_id || 'college'}_${user?.user_id || 'student'}`;
  const [passes, setPasses] = useState(() => getCached(cacheKey) || initialPasses);
  const [form, setForm] = useState({
    leave_type: 'Day Outpass',
    from_date: '',
    to_date: '',
    expected_return_time: '22:00',
    destination: '',
    reason: '',
    parent_phone: user?.guardian_phone || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [returningPassId, setReturningPassId] = useState('');
  const [pendingReturn, setPendingReturn] = useState(null);
  const [clock, setClock] = useState(() => new Date());
  const expectedBeacon = hostels.find((hostel) => hostel.name === user?.hostel_block)?.wing_beacons?.[user?.wing] || '';
  const testModeEnabled = Boolean(hostels.find((hostel) => hostel.name === user?.hostel_block)?.attendance_test_mode);
  const digitalPasses = passes.filter((pass) => Boolean(pass.leave_type));

  // Bootstrap owns the server list; synchronize it when the parent refreshes.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    setPasses(initialPasses);
    setCached(cacheKey, initialPasses);
  }, [cacheKey, initialPasses]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const savePasses = useCallback((next) => {
    setPasses(next);
    setCached(cacheKey, next);
    onPassesChange?.(next);
  }, [cacheKey, onPassesChange]);

  const submitLeave = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const days = Math.floor((Date.parse(`${form.to_date}T00:00:00Z`) - Date.parse(`${form.from_date}T00:00:00Z`)) / 86400000) + 1;
    if (!Number.isFinite(days) || days < 1) {
      setError('Choose a valid start and end date.');
      return;
    }
    if (form.leave_type === 'Day Outpass' && days !== 1) {
      setError('A Day Outpass must start and end on the same date.');
      return;
    }
    if (form.leave_type === 'Home Leave' && days > 30) {
      setError('Home Leave cannot exceed 30 calendar days.');
      return;
    }

    const optimisticId = `local-${crypto.randomUUID()}`;
    const optimisticPass = {
      pass_id: optimisticId,
      student_id: user?.user_id || '',
      student_name: user?.full_name || '',
      hostel_block: user?.hostel_block || '',
      wing: user?.wing || '',
      room: user?.room || '',
      phone: user?.phone || '',
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      expected_return_time: form.expected_return_time || (form.leave_type === 'Day Outpass' ? '22:00' : '21:00'),
      days_count: days,
      destination: form.destination.trim(),
      reason: form.reason.trim(),
      status: 'Pending Warden Approval',
      created_at: new Date().toISOString(),
      optimistic: true
    };
    const previous = passes;
    savePasses([optimisticPass, ...previous]);
    setSubmitting(true);
    try {
      const data = await responseData(
        await apiFetch(`${apiUrl}/api/leave/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        }),
        'Could not submit your leave request.'
      );
      savePasses([data.leave_pass, ...previous]);
      setForm({
        leave_type: 'Day Outpass',
        from_date: '',
        to_date: '',
        expected_return_time: '22:00',
        destination: '',
        reason: '',
        parent_phone: user?.guardian_phone || ''
      });
      setMessage('Digital leave pass sent to your Warden for approval.');
    } catch (submitError) {
      savePasses(previous);
      setError(errorText(submitError, 'Could not submit your leave request.'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReturn = async (pass, simulated = false) => {
    if (returningPassId) return;
    setError('');
    setMessage('');
    if (user?.biometric_status !== 'Locked') {
      setError('Ask your Warden to unlock device enrollment before confirming your return.');
      return;
    }
    if (!expectedBeacon) {
      setError(`Your Warden has not configured the ${user?.wing || 'assigned wing'} beacon yet.`);
      return;
    }
    setReturningPassId(pass.pass_id);
    const previousPasses = passes;
    try {
      const beacon = simulated
        ? { wing_beacon_id: expectedBeacon, rssi: -58, simulated: true }
        : await scanWingBeacon(expectedBeacon);
      setPendingReturn({ pass, beacon, previousPasses });
    } catch (returnError) {
      savePasses(previousPasses);
      setError(errorText(returnError, 'Could not confirm your return.'));
      setReturningPassId('');
    }
  };

  const completeReturnFaceCheck = useCallback(async (result) => {
    if (!pendingReturn) return;
    if (!result.success) {
      setError(result.error || 'The local face check was not completed.');
      setPendingReturn(null);
      setReturningPassId('');
      return;
    }
    const { pass, beacon, previousPasses } = pendingReturn;
    try {
      const deviceBindingToken = await getDeviceBindingToken(user);
      if (!deviceBindingToken) {
        throw new Error('This device binding is missing. Ask your Warden to unlock device enrollment again.');
      }
      const requestBody = {
        pass_id: pass.pass_id,
        device_binding_token: deviceBindingToken,
        liveness_passed: true,
        ...beacon
      };
      const nowText = clock.toLocaleString();
      const optimisticPasses = previousPasses.map((item) => item.pass_id === pass.pass_id
        ? { ...item, actual_return_at: nowText, return_status: 'Return confirmed', return_beacon_id: beacon.wing_beacon_id, optimistic: true }
        : item);
      savePasses(optimisticPasses);
      const data = await responseData(
        await apiFetch(`${apiUrl}/api/leave/mark-return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }),
        'Could not verify your return.'
      );
      savePasses(optimisticPasses.map((item) => item.pass_id === pass.pass_id ? data.leave_pass : item));
      setMessage('Return confirmed with the assigned wing beacon and an on-device blink check.');
      setPendingReturn(null);
    } catch (returnError) {
      savePasses(previousPasses);
      setError(errorText(returnError, 'Could not confirm your return.'));
      setPendingReturn(null);
    } finally {
      setReturningPassId('');
    }
  }, [apiUrl, clock, pendingReturn, savePasses, user]);

  return (
    <div>
      <div className="ptm-drill-header"><h1 className="ptm-page-title">Digital Gate Leave Pass</h1></div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      {message && <div className="ptm-sync-note" role="status">{message}</div>}
      <div className="ptm-card">
        <div className="ptm-section-title">Apply for leave</div>
        <p className="ptm-list-sub">Your Warden approves the pass. Parent approval is not required.</p>
        <form className="ptm-form-stack" onSubmit={submitLeave}>
          <label className="ptm-label">Leave type
            <select className="ptm-input" value={form.leave_type} onChange={(event) => setForm((current) => ({
              ...current,
              leave_type: event.target.value,
              expected_return_time: event.target.value === 'Day Outpass' ? '22:00' : '21:00'
            }))}>
              <option>Day Outpass</option>
              <option>Home Leave</option>
            </select>
          </label>
          <div className="ptm-grid-2">
            <label className="ptm-label">From date
              <input className="ptm-input" type="date" required value={form.from_date} onChange={(event) => setForm((current) => ({ ...current, from_date: event.target.value }))} />
            </label>
            <label className="ptm-label">To date
              <input className="ptm-input" type="date" required min={form.from_date || undefined} value={form.to_date} onChange={(event) => setForm((current) => ({ ...current, to_date: event.target.value }))} />
            </label>
          </div>
          <label className="ptm-label">Expected return time
            <input className="ptm-input" type="time" required value={form.expected_return_time} onChange={(event) => setForm((current) => ({ ...current, expected_return_time: event.target.value }))} />
          </label>
          <label className="ptm-label">Destination
            <input className="ptm-input" required maxLength={160} value={form.destination} onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))} />
          </label>
          <label className="ptm-label">Reason
            <textarea className="ptm-input" required maxLength={500} rows={3} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
          </label>
          <label className="ptm-label">Parent / guardian phone
            <input className="ptm-input" type="tel" autoComplete="tel" maxLength={24} value={form.parent_phone} onChange={(event) => setForm((current) => ({ ...current, parent_phone: event.target.value }))} />
          </label>
          <button className="ptm-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit leave request'}</button>
        </form>
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">Your digital passes</div>
        {digitalPasses.length === 0 ? <p className="ptm-list-sub">No leave passes yet.</p> : (
          <div className="ptm-list">
            {digitalPasses.map((pass) => (
              <article className="ptm-card" key={pass.pass_id}>
                {pass.status === 'Approved' ? (
                  <div className="leave-pass-guard-card">
                    <div className="leave-pass-approval-banner">
                      <span className="leave-pass-live-dot" aria-label="Live pass" />
                      <span>✅ APPROVED BY WARDEN — ALLOW GATE EXIT</span>
                      <time>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</time>
                    </div>
                    <div className="leave-pass-guard-content">
                      <div className="ptm-row-between">
                        <strong className="leave-pass-type">
                          {(pass.leave_type || '').toLowerCase() === 'day outpass' || pass.pass_type === 'day'
                            ? 'DAY OUTPASS'
                            : 'OUTSTATION LEAVE'}
                        </strong>
                        <span className="ptm-status-badge" style={{ background: '#DCFCE7', color: '#166534' }}>WARDEN APPROVED</span>
                      </div>
                      <div className="leave-pass-student-name">{pass.student_name || user?.full_name}</div>
                      <div className="leave-pass-detail"><strong>Roll Number:</strong> {pass.student_id || user?.user_id}</div>
                      <div className="leave-pass-detail"><strong>Hostel & Room:</strong> {pass.hostel_block || user?.hostel_block} · {pass.wing || user?.wing} · Room {pass.room || user?.room}</div>
                      <div className="leave-pass-detail"><strong>Destination:</strong> {pass.destination}</div>
                      <div className="leave-pass-validity">
                        <div>
                          <span>VALID FROM</span>
                          <strong>{pass.from_date || pass.departure_at?.slice(0, 10)} · 12:00 AM</strong>
                        </div>
                        <div>
                          <span>EXPECTED RETURN</span>
                          <strong>{pass.to_date || pass.return_at?.slice(0, 10)} · {pass.expected_return_time || '22:00'}</strong>
                        </div>
                      </div>
                      <div className="ptm-list-sub">Approved by {pass.approved_by || 'Chief Warden'}</div>
                      {pass.actual_return_at ? (
                        <div className="leave-pass-returned" role="status">
                          <strong>🏠 Returned to Hostel at {pass.actual_return_at}</strong>
                          <span className="ptm-status-badge" style={{
                            background: pass.return_status === 'Returned Late' ? '#FEE2E2' : '#DCFCE7',
                            color: pass.return_status === 'Returned Late' ? '#B91C1C' : '#166534'
                          }}>
                            {pass.return_status === 'Returned Late' ? '🚨 Returned Late' : `✅ ${pass.return_status || 'Returned On Time'}`}
                          </span>
                          <span className="ptm-list-sub">Beacon: {pass.return_beacon_id} · {pass.return_timing}</span>
                        </div>
                      ) : (
                        <div className="leave-pass-return-action">
                          <button
                            type="button"
                            className="ptm-btn-primary"
                            disabled={Boolean(returningPassId) || !expectedBeacon || user?.biometric_status !== 'Locked'}
                            onClick={() => confirmReturn(pass)}
                          >
                            {returningPassId === pass.pass_id ? 'Scanning beacon and verifying…' : '📡 Confirm Return at Hostel Wing Beacon'}
                          </button>
                          {testModeEnabled && expectedBeacon && (
                            <button
                              type="button"
                              className="ptm-btn-secondary"
                              disabled={Boolean(returningPassId) || user?.biometric_status !== 'Locked'}
                              onClick={() => confirmReturn(pass, true)}
                            >
                              Use local development test beacon
                            </button>
                          )}
                          {!expectedBeacon && <span className="ptm-list-sub">Your Warden must configure the {user?.wing || 'assigned wing'} beacon.</span>}
                          {user?.biometric_status !== 'Locked' && <span className="ptm-list-sub">Ask your Warden to unlock device enrollment before return verification.</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="ptm-row-between">
                      <div className="ptm-list-title">{pass.leave_type || pass.pass_type} · {pass.days_count || 1} day(s)</div>
                      <span className="ptm-status-badge">{pass.status === 'Pending' ? 'Pending Warden Approval' : pass.status}</span>
                    </div>
                    <div className="ptm-list-sub"><strong>Dates:</strong> {pass.from_date || pass.departure_at?.slice(0, 10)} — {pass.to_date || pass.return_at?.slice(0, 10)}</div>
                    <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                    <div className="ptm-list-sub"><strong>Reason:</strong> {pass.reason || pass.purpose}</div>
                    {pass.review_remark && <div className="ptm-list-sub">Warden note: {pass.review_remark}</div>}
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
      {pendingReturn && <LocalFaceCheckModal onResult={completeReturnFaceCheck} />}
    </div>
  );
}

export function StudentOutpassPanel({ apiUrl }) {
  const [outpasses, setOutpasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    pass_type: 'day',
    destination: '',
    purpose: '',
    departure_at: '',
    return_at: ''
  });

  const loadOutpasses = useCallback(async () => {
    try {
      const data = await responseData(await apiFetch(`${apiUrl}/api/outpasses`), 'Could not load your outpasses.');
      setOutpasses(data.outpasses || []);
      setError('');
    } catch (loadError) {
      setError(errorText(loadError, 'Could not load your outpasses.'));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // The list is server-owned state and is fetched when this panel opens.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadOutpasses(); }, [loadOutpasses]);

  const submitRequest = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const data = await responseData(
        await apiFetch(`${apiUrl}/api/outpasses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            departure_at: new Date(form.departure_at).toISOString(),
            return_at: new Date(form.return_at).toISOString()
          })
        }),
        'Could not submit your outpass request.'
      );
      setOutpasses((current) => [data.outpass, ...current]);
      setForm({ pass_type: 'day', destination: '', purpose: '', departure_at: '', return_at: '' });
      setMessage('Outpass request sent to your warden for review.');
    } catch (submitError) {
      setError(errorText(submitError, 'Could not submit your outpass request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="ptm-drill-header">
        <h1 className="ptm-page-title">Gate outpasses</h1>
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">Request an outpass</div>
        <p className="ptm-list-sub">Your warden reviews the request and confirms the approved departure and return times.</p>
        {error && <div className="ptm-alert-error" role="alert">{error}</div>}
        {message && <div className="ptm-sync-note" role="status">{message}</div>}
        <form className="ptm-form-stack" onSubmit={submitRequest}>
          <label className="ptm-label">Pass type
            <select className="ptm-input" value={form.pass_type} onChange={(event) => setForm((current) => ({ ...current, pass_type: event.target.value }))}>
              <option value="day">Day outpass</option>
              <option value="outstation">Outstation leave (up to 30 days)</option>
            </select>
          </label>
          <label className="ptm-label">Destination
            <input className="ptm-input" required maxLength={160} value={form.destination} onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))} />
          </label>
          <label className="ptm-label">Reason
            <textarea className="ptm-input" required maxLength={500} rows={3} value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} />
          </label>
          <div className="ptm-grid-2">
            <label className="ptm-label">Departure time
              <input className="ptm-input" type="datetime-local" required value={form.departure_at} onChange={(event) => setForm((current) => ({ ...current, departure_at: event.target.value }))} />
            </label>
            <label className="ptm-label">Return time
              <input className="ptm-input" type="datetime-local" required value={form.return_at} onChange={(event) => setForm((current) => ({ ...current, return_at: event.target.value }))} />
            </label>
          </div>
          <p className="ptm-list-sub">Times are submitted from your device time zone and checked against the college time zone.</p>
          <button className="ptm-btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for warden approval'}</button>
        </form>
      </div>

      <div className="ptm-card">
        <div className="ptm-section-title">Your requests</div>
        {loading ? <ListRowSkeleton count={3} /> : outpasses.length === 0 ? <p className="ptm-list-sub">No outpass requests yet.</p> : (
          <div className="ptm-list">
            {outpasses.map((pass) => (
              <article className="ptm-card" key={pass.pass_id} style={{ borderLeft: pass.status === 'Approved' ? '4px solid #15803D' : undefined }}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{pass.destination} · {pass.pass_type}</div>
                  {pass.status === 'Approved' ? (
                    <div style={{ margin: '10px 0' }}>
                      <div className="ptm-list-title">WARDEN-APPROVED GATE PERMISSION</div>
                      <div className="ptm-status-badge" style={{ background: '#DCFCE7', color: '#15803D' }}>APPROVED · TIME-BOUNDED</div>
                      <div className="ptm-list-sub"><strong>Valid from:</strong> {new Date(pass.departure_at).toLocaleString()}</div>
                      <div className="ptm-list-sub"><strong>Valid until:</strong> {new Date(pass.return_at).toLocaleString()}</div>
                      <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                      <div className="ptm-list-sub"><strong>Reason:</strong> {pass.purpose}</div>
                    </div>
                  ) : (
                    <div className="ptm-list-sub">{new Date(pass.departure_at).toLocaleString()} — {new Date(pass.return_at).toLocaleString()}</div>
                  )}
                  {pass.status !== 'Approved' && <div className="ptm-list-sub">{pass.purpose}</div>}
                  <div className="ptm-list-sub">Status: {pass.status}{pass.review_remark ? ` · Warden: ${pass.review_remark}` : ''}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function currentEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function scanWingBeacon(expectedBeaconId) {
  await BleClient.initialize();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, beacon) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      BleClient.stopLEScan().catch((scanError) => {
        console.error('Could not stop the BLE scan cleanly:', scanError);
      });
      if (error) reject(error);
      else resolve(beacon);
    };
    const timeoutId = window.setTimeout(
      () => finish(new Error('No assigned wing beacon found in 3 seconds. Move closer and try again.')),
      3000
    );
    BleClient.requestLEScan(
      { name: expectedBeaconId, allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY },
      (result) => {
        const name = result.localName || result.device?.name || '';
        if (name !== expectedBeaconId) return;
        if (!Number.isInteger(result.rssi)) {
          finish(new Error('The scanner did not report beacon signal strength. Use the native app or Warden-enabled Test Mode.'));
          return;
        }
        finish(null, { wing_beacon_id: name, rssi: result.rssi, simulated: false });
      }
    ).catch((scanError) => finish(new Error(scanError?.message || 'BLE scanning is unavailable. Use the native app or Warden-enabled Test Mode.')));
  });
}

export function StudentBiometricAttendancePanel({
  apiUrl,
  user,
  hostels = [],
  initialLogs = [],
  developerSimulateBeacon = false,
  onDeveloperSimulateBeaconChange,
  onLogsChange,
  onUserUpdate
}) {
  const cacheKey = `attendance_logs_${user?.college_id || 'college'}_${user?.user_id || 'student'}`;
  const [logs, setLogs] = useState(() => getCached(cacheKey) || initialLogs);
  const [biometricStatus, setBiometricStatus] = useState(user?.biometric_status || 'Unenrolled');
  const [enrollmentUntil, setEnrollmentUntil] = useState(Number(user?.enroll_window_until || 0));
  const [faceEnrolled, setFaceEnrolled] = useState(Boolean(user?.face_enrolled));
  const [faceConsent, setFaceConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [usingTestBeacon, setUsingTestBeacon] = useState(false);
  const [pendingAttendance, setPendingAttendance] = useState(null);
  const [pendingEnrollment, setPendingEnrollment] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(currentEpochSeconds);
  const enrollmentOpen = biometricStatus === 'Enrollment Unlocked' && enrollmentUntil >= nowSeconds;
  const expectedBeacon = hostels.find((hostel) => hostel.name === user?.hostel_block)?.wing_beacons?.[user?.wing] || '';
  const testModeEnabled = Boolean(hostels.find((hostel) => hostel.name === user?.hostel_block)?.attendance_test_mode);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(currentEpochSeconds()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the mounted panel aligned with bootstrap updates from the portal.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setLogs(initialLogs);
    setCached(cacheKey, initialLogs);
  }, [cacheKey, initialLogs]);

  // A Warden can unlock enrollment while the student portal remains open.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setBiometricStatus(user?.biometric_status || 'Unenrolled');
    setEnrollmentUntil(Number(user?.enroll_window_until || 0));
    setFaceEnrolled(Boolean(user?.face_enrolled));
  }, [user?.biometric_status, user?.enroll_window_until, user?.face_enrolled]);

  useEffect(() => {
    let active = true;
    const refreshStatus = async () => {
      try {
        const data = await responseData(
          await apiFetch(`${apiUrl}/api/attendance/biometric-status`),
          'Could not refresh device enrollment status.'
        );
        if (!active) return;
        setBiometricStatus(data.biometric_status);
        setEnrollmentUntil(Number(data.enroll_window_until || 0));
        setFaceEnrolled(Boolean(data.face_enrolled));
        if (
          data.biometric_status !== user?.biometric_status
          || Number(data.enroll_window_until || 0) !== Number(user?.enroll_window_until || 0)
          || Boolean(data.face_enrolled) !== Boolean(user?.face_enrolled)
        ) {
          onUserUpdate?.(data);
        }
      } catch (statusError) {
        if (active) setError((current) => current || errorText(statusError, 'Could not refresh device enrollment status.'));
      }
    };
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiUrl, onUserUpdate, user?.biometric_status, user?.enroll_window_until, user?.face_enrolled]);

  const saveLogs = useCallback((next) => {
    setLogs(next);
    setCached(cacheKey, next);
    onLogsChange?.(next);
  }, [cacheKey, onLogsChange]);

  const registerAndLock = async () => {
    if (!enrollmentOpen) {
      setError('Ask your Warden to unlock the 2-minute enrollment window first.');
      return;
    }
    if (!faceConsent) {
      setError('Review and confirm face verification consent before enrolling.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    setPendingEnrollment(true);
  };

  const completeEnrollmentFaceCheck = async (result) => {
    if (!result.success) {
      setError(result.error || 'Face enrollment was not completed.');
      setPendingEnrollment(false);
      setBusy(false);
      return;
    }
    let referenceImage = result.imageBase64 || '';
    let requestBody = '';
    try {
      const deviceBindingToken = await getOrCreateDeviceBindingToken(user);
      requestBody = JSON.stringify({
        device_binding_token: deviceBindingToken,
        reference_image_base64: referenceImage,
        consent_confirmed: true
      });
      const data = await responseData(
        await apiFetch(`${apiUrl}/api/biometric/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        }),
        'Could not enroll face verification on this device.'
      );
      setBiometricStatus(data.biometric_status);
      setEnrollmentUntil(Number(data.enroll_window_until || 0));
      setFaceEnrolled(Boolean(data.face_enrolled));
      setFaceConsent(false);
      onUserUpdate?.(data);
      setMessage('Face verification and device binding enrolled. The reference image is encrypted at rest; attendance frames are not retained.');
    } catch (enrollError) {
      setError(errorText(enrollError, 'Face verification enrollment failed.'));
    } finally {
      referenceImage = '';
      requestBody = '';
      result.imageBase64 = '';
      setPendingEnrollment(false);
      setBusy(false);
    }
  };

  const markWithBeacon = async (simulated = false, developerSimulation = false) => {
    if (biometricStatus !== 'Locked' || !faceEnrolled) {
      setError('Complete face verification enrollment during a Warden-authorized setup window first.');
      return;
    }
    if (!expectedBeacon) {
      setError(`Your Warden has not configured the ${user?.wing || 'assigned wing'} beacon yet.`);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    setUsingTestBeacon(simulated);
    try {
      const deviceBindingToken = await getDeviceBindingToken(user);
      if (!deviceBindingToken) {
        throw new Error('This device binding is missing. Ask your Warden to unlock device enrollment again.');
      }
      const detectedBeacon = developerSimulation
        ? { beacon_id: 'WING-D-BEACON', rssi: -50 }
        : simulated
          ? { beacon_id: expectedBeacon, rssi: -58 }
          : await scanWingBeacon(expectedBeacon);
      const beacon = {
        wing_beacon_id: detectedBeacon.beacon_id || detectedBeacon.wing_beacon_id,
        rssi: detectedBeacon.rssi,
        simulated
      };
      setPendingAttendance({ beacon, deviceBindingToken });
    } catch (markError) {
      setError(errorText(markError, 'Could not record attendance.'));
      setBusy(false);
      setUsingTestBeacon(false);
    }
  };

  const completeAttendanceFaceCheck = useCallback(async (result) => {
    if (!pendingAttendance) return;
    if (!result.success) {
      setError(result.error || 'Face verification was not completed.');
      setPendingAttendance(null);
      setBusy(false);
      setUsingTestBeacon(false);
      return;
    }
    let liveImage = result.imageBase64 || '';
    let requestBody = '';
    const { beacon, deviceBindingToken } = pendingAttendance;
    try {
      requestBody = JSON.stringify({
        ...beacon,
        device_binding_token: deviceBindingToken,
        live_image_base64: liveImage
      });
      const data = await responseData(
        await apiFetch(`${apiUrl}/api/attendance/verify-identity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody
        }),
        'Could not verify your identity or record attendance.'
      );
      saveLogs([data.attendance_log, ...logs].slice(0, 30));
      setMessage('Attendance recorded after server-side 1:1 face verification.');
    } catch (markError) {
      setError(errorText(markError, 'Could not verify your identity or record attendance.'));
    } finally {
      liveImage = '';
      requestBody = '';
      result.imageBase64 = '';
      setPendingAttendance(null);
      setBusy(false);
      setUsingTestBeacon(false);
    }
  }, [apiUrl, logs, pendingAttendance, saveLogs]);

  return (
    <div>
      <div className="ptm-drill-header"><h1 className="ptm-page-title">Server-Verified Face & Device Binding</h1></div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      {message && <div className="ptm-sync-note" role="status">{message}</div>}
      <div className="ptm-card">
        <div className="ptm-section-title">Warden-authorized face enrollment</div>
        <p className="ptm-list-sub">Face verification is required to mark attendance. With your confirmation, one enrollment image is encrypted and stored for 1:1 checks. Live attendance frames are sent to the server for comparison and are not retained.</p>
        {biometricStatus === 'Locked' && faceEnrolled ? (
          <div className="ptm-sync-note" role="status">✅ Face reference enrolled · attendance requires a server-side 1:1 match and this device token.</div>
        ) : (
          <>
            <div className="ptm-list-sub">Status: {biometricStatus === 'Enrollment Unlocked' ? 'Enrollment window open' : 'Face enrollment required'}</div>
            {enrollmentOpen
              ? <p className="ptm-list-sub">Complete setup before {new Date(enrollmentUntil * 1000).toLocaleTimeString()} while standing with your Warden.</p>
              : <p className="ptm-list-sub">Ask your Warden to unlock a two-minute setup window while you are together.</p>}
            <label className="ptm-list-sub" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={faceConsent}
                disabled={busy}
                onChange={(event) => setFaceConsent(event.target.checked)}
              />
              <span>I understand face verification is required for attendance and consent to storing one encrypted enrollment reference image.</span>
            </label>
            <button type="button" className="ptm-btn-primary" onClick={registerAndLock} disabled={busy || !enrollmentOpen || !faceConsent}>
              {busy ? 'Please wait…' : 'Enroll Face & Lock This Device'}
            </button>
          </>
        )}
      </div>
      {biometricStatus === 'Locked' && faceEnrolled && (
        <div className="ptm-card">
          <div className="ptm-section-title">Mark attendance at your wing</div>
          <p className="ptm-list-sub">Attendance requires an active Warden roll call, this device token, your assigned BLE beacon, and a server-side 1:1 face match.</p>
          {!expectedBeacon && <div className="ptm-alert-error" role="alert">Your Warden must configure the {user?.wing || 'assigned wing'} beacon before attendance is available.</div>}
          {onDeveloperSimulateBeaconChange && (
            <label className="ptm-list-sub" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={developerSimulateBeacon}
                disabled={busy}
                onChange={(event) => onDeveloperSimulateBeaconChange(event.target.checked)}
              />
              <span>
                Developer Test Mode: Simulate BLE Beacon
                <br />
                <strong>Uses WING-D-BEACON at -50 dBm; Warden Test Mode must also be enabled.</strong>
              </span>
            </label>
          )}
          <button
            type="button"
            className="ptm-btn-primary"
            onClick={() => markWithBeacon(developerSimulateBeacon, developerSimulateBeacon)}
            disabled={busy || !expectedBeacon}
          >
            {busy && !usingTestBeacon ? 'Scanning beacon…' : '📡 Scan Wing Beacon & Verify Face'}
          </button>
          {testModeEnabled && expectedBeacon && (
            <button type="button" className="ptm-btn-secondary" onClick={() => markWithBeacon(true)} disabled={busy}>
              {busy && usingTestBeacon ? 'Checking simulated beacon…' : `⚡ Simulate ${user?.wing || 'Wing'} Beacon (Test Mode)`}
            </button>
          )}
        </div>
      )}
      <div className="ptm-card">
        <div className="ptm-section-title">Attendance history</div>
        {logs.length === 0 ? <p className="ptm-list-sub">No biometric attendance or approved-leave logs yet.</p> : (
          <div className="ptm-list">
            {logs.map((log) => (
              <div className="ptm-list-row" key={log.log_id}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{log.date} · {log.hostel_block} · {log.wing}</div>
                  <div className="ptm-list-sub">{log.status}{log.time ? ` · ${log.time}` : ''}</div>
                  {log.wing_beacon_id && <div className="ptm-list-sub">Beacon: {log.wing_beacon_id}{log.rssi == null ? '' : ` · RSSI ${log.rssi} dBm`}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {pendingEnrollment && <LocalFaceCheckModal purpose="enrollment" onResult={completeEnrollmentFaceCheck} />}
      {pendingAttendance && <LocalFaceCheckModal onResult={completeAttendanceFaceCheck} />}
    </div>
  );
}
