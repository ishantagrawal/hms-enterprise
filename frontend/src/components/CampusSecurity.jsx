import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';
import { ListRowSkeleton } from './SkeletonLoader';

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || fallback);
  return data;
}

function localInputValue(isoValue) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function WardenOutpassPanel({ apiUrl }) {
  const [outpasses, setOutpasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [remarkById, setRemarkById] = useState({});
  const [timesById, setTimesById] = useState({});

  const loadOutpasses = useCallback(async () => {
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/outpasses?status=Pending`),
        'Could not load pending outpasses.'
      );
      setOutpasses(data.outpasses || []);
      setTimesById((current) => {
        const next = { ...current };
        (data.outpasses || []).forEach((item) => {
          if (!next[item.pass_id]) {
            next[item.pass_id] = {
              departure_at: localInputValue(item.departure_at),
              return_at: localInputValue(item.return_at)
            };
          }
        });
        return next;
      });
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not load pending outpasses.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // Pending requests are server-owned state and load when this panel opens.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadOutpasses(); }, [loadOutpasses]);

  const review = async (pass, decision) => {
    setBusyId(pass.pass_id);
    setError('');
    try {
      const times = timesById[pass.pass_id] || {};
      await readResponse(
        await apiFetch(`${apiUrl}/api/outpasses/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pass_id: pass.pass_id,
            decision,
            departure_at: times.departure_at ? new Date(times.departure_at).toISOString() : pass.departure_at,
            return_at: times.return_at ? new Date(times.return_at).toISOString() : pass.return_at,
            remark: remarkById[pass.pass_id] || ''
          })
        }),
        'Could not review this outpass.'
      );
      setOutpasses((current) => current.filter((item) => item.pass_id !== pass.pass_id));
    } catch (reviewError) {
      setError(reviewError.message || 'Could not review this outpass.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <div className="ptm-drill-header"><h1 className="ptm-page-title">Outpass review</h1></div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <div className="ptm-card">
        <div className="ptm-section-title">Pending requests</div>
        {loading ? <ListRowSkeleton count={3} /> : outpasses.length === 0 ? <p className="ptm-list-sub">There are no pending outpass requests.</p> : (
          <div className="ptm-list">
            {outpasses.map((pass) => (
              <article className="ptm-card" key={pass.pass_id}>
                <div className="ptm-list-title">{pass.student_id} · {pass.pass_type} pass</div>
                <div className="ptm-list-sub">{pass.destination} · {pass.purpose}</div>
                <p className="ptm-list-sub">Times are shown in your device time zone and checked against the college time zone.</p>
                <div className="ptm-grid-2">
                  <label className="ptm-label">Approved departure
                    <input className="ptm-input" type="datetime-local" value={timesById[pass.pass_id]?.departure_at || ''} onChange={(event) => setTimesById((current) => ({ ...current, [pass.pass_id]: { ...current[pass.pass_id], departure_at: event.target.value } }))} />
                  </label>
                  <label className="ptm-label">Approved return
                    <input className="ptm-input" type="datetime-local" value={timesById[pass.pass_id]?.return_at || ''} onChange={(event) => setTimesById((current) => ({ ...current, [pass.pass_id]: { ...current[pass.pass_id], return_at: event.target.value } }))} />
                  </label>
                </div>
                <label className="ptm-label">Warden note
                  <input className="ptm-input" maxLength={500} value={remarkById[pass.pass_id] || ''} onChange={(event) => setRemarkById((current) => ({ ...current, [pass.pass_id]: event.target.value }))} />
                </label>
                <div className="ptm-row-between">
                  <button type="button" className="ptm-btn-secondary" disabled={Boolean(busyId)} onClick={() => review(pass, 'reject')}>Reject</button>
                  <button type="button" className="ptm-btn-primary" disabled={Boolean(busyId)} onClick={() => review(pass, 'approve')}>{busyId === pass.pass_id ? 'Saving…' : 'Approve exact times'}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WardenLeavePassPanel({
  apiUrl,
  user,
  leavePasses = [],
  attendanceLogs = [],
  onLeavePassesChange,
  onAttendanceLogsChange
}) {
  const [busyId, setBusyId] = useState('');
  const [remarkById, setRemarkById] = useState({});
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const leaveCacheKey = `warden_leave_passes_${user?.college_id || 'college'}_${user?.hostel_block || 'hostel'}`;
  const attendanceCacheKey = `warden_attendance_logs_${user?.college_id || 'college'}_${user?.hostel_block || 'hostel'}`;
  const digitalPasses = leavePasses.filter((pass) => Boolean(pass.leave_type));
  const pendingPasses = digitalPasses.filter((pass) => ['Pending', 'Pending Warden Approval'].includes(pass.status));
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const approvedPasses = digitalPasses.filter((pass) => pass.status === 'Approved');
  const currentlyOnLeave = approvedPasses.filter((pass) => (
    (pass.from_date || pass.departure_at?.slice(0, 10) || '') <= today
    && (pass.to_date || pass.return_at?.slice(0, 10) || '') >= today
  ));
  const currentlyOutside = approvedPasses.filter((pass) => !pass.actual_return_at);
  const returnedPasses = approvedPasses.filter((pass) => Boolean(pass.actual_return_at));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const review = async (pass, decision) => {
    if (busyId) return;
    setBusyId(pass.pass_id);
    setError('');
    const finalStatus = decision === 'approved' ? 'Approved' : 'Rejected';
    const previousPasses = leavePasses;
    const previousLogs = attendanceLogs;
    const optimisticPasses = leavePasses.map((item) => item.pass_id === pass.pass_id
      ? { ...item, status: finalStatus, warden_remark: remarkById[pass.pass_id] || '' }
      : item);
    onLeavePassesChange?.(optimisticPasses);
    setCached(leaveCacheKey, optimisticPasses);
    if (decision === 'approved') {
      const start = new Date(`${pass.from_date || pass.departure_at?.slice(0, 10)}T00:00:00Z`);
      const end = new Date(`${pass.to_date || pass.return_at?.slice(0, 10)}T00:00:00Z`);
      const approvedLogs = [];
      for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
        const date = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
        approvedLogs.push({
          log_id: `local-${pass.pass_id}-${date}`,
          student_id: pass.student_id,
          student_name: pass.student_name,
          hostel_block: pass.hostel_block,
          wing: pass.wing || '',
          room: pass.room || '',
          date,
          time: '',
          status: 'On Approved Leave',
          verified_method: 'warden_approved_leave',
          optimistic: true
        });
      }
      const nextLogs = [
        ...approvedLogs,
        ...attendanceLogs.filter((log) => !approvedLogs.some((approved) => String(approved.student_id || '').toUpperCase() === String(log.student_id || '').toUpperCase() && approved.date === log.date))
      ];
      onAttendanceLogsChange?.(nextLogs);
      setCached(attendanceCacheKey, nextLogs);
    }

    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/leave/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pass_id: pass.pass_id,
            status: finalStatus,
            warden_remark: remarkById[pass.pass_id] || ''
          })
        }),
        'Could not review this leave pass.'
      );
      const updatedPasses = optimisticPasses.map((item) => item.pass_id === pass.pass_id ? data.leave_pass : item);
      onLeavePassesChange?.(updatedPasses);
      setCached(leaveCacheKey, updatedPasses);
    } catch (reviewError) {
      onLeavePassesChange?.(previousPasses);
      setCached(leaveCacheKey, previousPasses);
      if (decision === 'approved') {
        onAttendanceLogsChange?.(previousLogs);
        setCached(attendanceCacheKey, previousLogs);
      }
      setError(reviewError.message || 'Could not review this leave pass.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <div className="ptm-drill-header"><h1 className="ptm-page-title">Digital Leave Passes</h1></div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <div className="ptm-card">
        <div className="ptm-section-title">Pending Warden approval</div>
        <p className="ptm-list-sub">Parent approval is not required. Approved passes automatically mark the student as on leave for the selected dates.</p>
        {pendingPasses.length === 0 ? <p className="ptm-list-sub">There are no pending leave requests.</p> : (
          <div className="ptm-list">
            {pendingPasses.map((pass) => {
              const phoneLink = String(pass.parent_phone || '').replace(/[^\d+]/g, '');
              return (
                <article className="ptm-card" key={pass.pass_id}>
                  <div className="ptm-list-title">{pass.student_name || pass.student_id} · {pass.leave_type || pass.pass_type}</div>
                  <div className="ptm-list-sub">{pass.student_id} · {pass.hostel_block} · {pass.wing || 'Wing not assigned'} · Room {pass.room || '-'}</div>
                  <div className="ptm-list-sub"><strong>Dates:</strong> {pass.from_date || pass.departure_at?.slice(0, 10)} — {pass.to_date || pass.return_at?.slice(0, 10)}</div>
                  <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                  <div className="ptm-list-sub"><strong>Reason:</strong> {pass.reason || pass.purpose}</div>
                  {phoneLink && <a className="ptm-btn-secondary" style={{ display: 'inline-flex', width: 'auto', textDecoration: 'none' }} href={`tel:${phoneLink}`}>☎ Call parent · {pass.parent_phone}</a>}
                  <label className="ptm-label">Warden remark
                    <input className="ptm-input" maxLength={500} value={remarkById[pass.pass_id] || ''} onChange={(event) => setRemarkById((current) => ({ ...current, [pass.pass_id]: event.target.value }))} />
                  </label>
                  <div className="ptm-row-between">
                    <button type="button" className="ptm-btn-secondary" disabled={Boolean(busyId)} onClick={() => review(pass, 'rejected')}>{busyId === pass.pass_id ? 'Saving…' : '✕ Reject'}</button>
                    <button type="button" className="ptm-btn-primary" disabled={Boolean(busyId)} onClick={() => review(pass, 'approved')}>{busyId === pass.pass_id ? 'Saving…' : '✓ Approve'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">Students Currently on Approved Leave</div>
        {currentlyOnLeave.length === 0 ? <p className="ptm-list-sub">No approved passes cover today.</p> : (
          <div className="ptm-list">
            {currentlyOnLeave.map((pass) => (
              <article className="ptm-list-row" key={`today-${pass.pass_id}`}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{pass.student_name || pass.student_id} · {pass.student_id}</div>
                  <div className="ptm-list-sub">{pass.hostel_block} · {pass.wing || 'Wing not assigned'} · Room {pass.room || '-'}</div>
                  <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                  <div className="ptm-list-sub"><strong>Approved range:</strong> {pass.from_date} — {pass.to_date}</div>
                  <div className="ptm-list-sub"><strong>Return by:</strong> {pass.to_date} · {pass.expected_return_time || '22:00'}</div>
                </div>
                <span className="ptm-status-badge" style={{
                  background: pass.actual_return_at ? '#E0F2FE' : '#DCFCE7',
                  color: pass.actual_return_at ? '#0369A1' : '#166534'
                }}>
                  {pass.actual_return_at ? `Returned ${pass.actual_return_at}` : 'Currently outside'}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">🚶 Currently Outside Campus</div>
        {currentlyOutside.length === 0 ? <p className="ptm-list-sub">No approved passes are awaiting a beacon return.</p> : (
          <div className="ptm-list">
            {currentlyOutside.map((pass) => {
              const deadline = new Date(`${pass.to_date}T${pass.expected_return_time || '22:00'}:00`);
              const overdue = Number.isFinite(deadline.getTime()) && now > deadline;
              const studentPhone = String(pass.phone || '').replace(/[^\d+]/g, '');
              const parentPhone = String(pass.parent_phone || '').replace(/[^\d+]/g, '');
              return (
                <article
                  className="ptm-list-row"
                  key={`outside-${pass.pass_id}`}
                  style={overdue ? { border: '1px solid #FCA5A5', background: '#FEF2F2', borderRadius: 12, padding: 12 } : undefined}
                >
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">{pass.student_name || pass.student_id} · {pass.student_id}</div>
                    <div className="ptm-list-sub">{pass.hostel_block} · {pass.wing || 'Wing not assigned'} · Room {pass.room || '-'}</div>
                    <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                    <div className="ptm-list-sub"><strong>Allowed deadline:</strong> {pass.to_date} · {pass.expected_return_time || '22:00'}</div>
                    {overdue && <span className="ptm-status-badge" style={{ background: '#FEE2E2', color: '#B91C1C' }}>🚨 OVERDUE — PAST RETURN TIME</span>}
                    <div className="ptm-row-between" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 8 }}>
                      {studentPhone && <a className="ptm-btn-secondary" style={{ width: 'auto', textDecoration: 'none' }} href={`tel:${studentPhone}`}>☎ Call student</a>}
                      {parentPhone && <a className="ptm-btn-secondary" style={{ width: 'auto', textDecoration: 'none' }} href={`tel:${parentPhone}`}>☎ Call parent</a>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">🏠 Returned to Hostel Log</div>
        {returnedPasses.length === 0 ? <p className="ptm-list-sub">No beacon-verified returns yet.</p> : (
          <div className="ptm-list">
            {returnedPasses.map((pass) => (
              <article className="ptm-list-row" key={`returned-${pass.pass_id}`}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{pass.student_name || pass.student_id} · {pass.student_id}</div>
                  <div className="ptm-list-sub">{pass.hostel_block} · {pass.wing || 'Wing not assigned'} · Room {pass.room || '-'}</div>
                  <div className="ptm-list-sub"><strong>Destination:</strong> {pass.destination}</div>
                  <div className="ptm-list-sub"><strong>Allowed deadline:</strong> {pass.to_date} · {pass.expected_return_time || '22:00'}</div>
                  <div className="ptm-list-sub"><strong>Actual beacon return:</strong> {pass.actual_return_at}</div>
                  <div className="ptm-list-sub"><strong>Verified wing beacon:</strong> {pass.return_beacon_id}</div>
                  {pass.return_timing && <div className="ptm-list-sub">{pass.return_timing}</div>}
                </div>
                <span className="ptm-status-badge" style={{
                  background: pass.return_status === 'Returned Late' ? '#FEE2E2' : '#DCFCE7',
                  color: pass.return_status === 'Returned Late' ? '#B91C1C' : '#166534'
                }}>
                  {pass.return_status === 'Returned Late'
                    ? '🚨 Returned Late (After Deadline)'
                    : '✅ Returned On Time / Early'}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WardenAttendancePanel({ apiUrl, user }) {
  const hostel = user?.hostel_block || '';
  const configCacheKey = `warden_attendance_config_${user?.college_id || 'college'}_${hostel}`;
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [exceptionStatus, setExceptionStatus] = useState('Present');
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [config, setConfig] = useState(() => ({
    start_time: '21:00',
    end_time: '22:00',
    wings: [],
    wing_beacons: {},
    test_mode: false,
    ...getCached(configCacheKey)
  }));
  const [configBusy, setConfigBusy] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/warden/attendance-config`),
        'Could not load attendance settings.'
      );
      setConfig({
        start_time: data.start_time || '21:00',
        end_time: data.end_time || '22:00',
        wings: Array.isArray(data.wings) ? data.wings : [],
        wing_beacons: data.wing_beacons || {},
        test_mode: Boolean(data.test_mode)
      });
      setCached(configCacheKey, {
        start_time: data.start_time || '21:00',
        end_time: data.end_time || '22:00',
        wings: Array.isArray(data.wings) ? data.wings : [],
        wing_beacons: data.wing_beacons || {},
        test_mode: Boolean(data.test_mode)
      });
    } catch (configError) {
      setError(configError.message || 'Could not load attendance settings.');
    }
  }, [apiUrl, configCacheKey]);

  // Attendance settings are server-owned and load when this panel opens.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadConfig(); }, [loadConfig]);

  const loadSessions = useCallback(async () => {
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/attendance/sessions?hostel_block=${encodeURIComponent(hostel)}`),
        'Could not load roll calls.'
      );
      setSessions(data.sessions || []);
      setSelectedSession((current) => {
        const latest = (data.sessions || []).find((item) => item.session_id === current?.session_id);
        if (current && latest?.status !== current.status) return latest || current;
        if (!current) return (data.sessions || []).find((item) => item.status === 'Open') || null;
        return current;
      });
    } catch (loadError) {
      setError(loadError.message || 'Could not load roll calls.');
    }
  }, [apiUrl, hostel]);

  // Roll-call sessions are server-owned state and load when this panel opens.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadSelected = useCallback(async () => {
    if (!selectedSession) return;
    try {
      const sessionData = await readResponse(
        await apiFetch(`${apiUrl}/api/attendance/sessions/${encodeURIComponent(selectedSession.session_id)}`),
        'Could not load roll-call records.'
      );
      setRecords(sessionData.records || []);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Could not refresh this roll call.');
    }
  }, [apiUrl, selectedSession]);

  // Refreshes the selected session from the server and binds the live QR.
  useEffect(() => {
    if (!selectedSession) return undefined;
    // oxlint-disable-next-line react/set-state-in-effect
    loadSelected();
    const timer = window.setInterval(() => {
      loadSelected();
      loadSessions();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadSelected, loadSessions, selectedSession]);

  const startRollCall = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/attendance/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }),
        'Could not start roll call.'
      );
      setSelectedSession(data.session);
      await loadSessions();
    } catch (startError) {
      setError(startError.message || 'Could not start roll call.');
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (event) => {
    event.preventDefault();
    setConfigBusy(true);
    setError('');
    const previousConfig = getCached(configCacheKey);
    setCached(configCacheKey, config);
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/warden/attendance-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_time: config.start_time,
            end_time: config.end_time,
            wing_beacons: config.wing_beacons,
            test_mode: Boolean(config.test_mode)
          })
        }),
        'Could not save attendance settings.'
      );
      setError('');
      await loadConfig();
      setMessage(data.message || 'Attendance settings saved.');
    } catch (saveError) {
      setCached(configCacheKey, previousConfig);
      setError(saveError.message || 'Could not save attendance settings.');
    } finally {
      setConfigBusy(false);
    }
  };

  const saveException = async (event) => {
    event.preventDefault();
    if (!selectedSession) return;
    setBusy(true);
    setError('');
    try {
      await readResponse(
        await apiFetch(`${apiUrl}/api/attendance/exceptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: selectedSession.session_id,
            student_id: studentId,
            status: exceptionStatus,
            reason
          })
        }),
        'Could not save this attendance exception.'
      );
      setStudentId('');
      setReason('');
      await loadSelected();
    } catch (exceptionError) {
      setError(exceptionError.message || 'Could not save this attendance exception.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="ptm-drill-header"><h1 className="ptm-page-title">Night roll call · {hostel}</h1></div>
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      {message && <div className="ptm-sync-note" role="status">{message}</div>}
      <div className="ptm-card">
        <div className="ptm-section-title">Attendance time and BLE beacon settings</div>
        <p className="ptm-list-sub">Set the daily college-local attendance window and the ESP32 beacon name assigned to each hostel wing.</p>
        <form className="ptm-form-stack" onSubmit={saveConfig}>
          <div className="ptm-grid-2">
            <label className="ptm-label">Attendance starts
              <input className="ptm-input" type="time" required value={config.start_time} onChange={(event) => setConfig((current) => ({ ...current, start_time: event.target.value }))} />
            </label>
            <label className="ptm-label">Attendance ends
              <input className="ptm-input" type="time" required value={config.end_time} onChange={(event) => setConfig((current) => ({ ...current, end_time: event.target.value }))} />
            </label>
          </div>
          <div className="ptm-card">
            <div className="ptm-section-title">Expected BLE beacon per wing</div>
            <p className="ptm-list-sub">Enter the exact advertised device name configured on each ESP32 beacon. Students can mark attendance only when their detected beacon matches their assigned wing.</p>
            <div className="ptm-grid-2">
              {config.wings.length === 0
                ? <p className="ptm-list-sub">No wings are configured for {hostel}. Ask your Dean to configure this hostel’s wings first.</p>
                : config.wings.map((wing) => (
                  <label className="ptm-label" key={wing}>{wing} beacon name
                    <input
                      className="ptm-input"
                      maxLength={128}
                      value={config.wing_beacons?.[wing] || ''}
                      onChange={(event) => setConfig((current) => ({
                        ...current,
                        wing_beacons: { ...current.wing_beacons, [wing]: event.target.value }
                      }))}
                      placeholder={`e.g. ${wing}-BEACON`}
                    />
                  </label>
                ))}
            </div>
          </div>
          <label className="ptm-list-sub" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(config.test_mode)}
              onChange={(event) => setConfig((current) => ({ ...current, test_mode: event.target.checked }))}
            />
            <span>
              Enable Test Mode for simulated wing beacon checks
              <br />
              <strong>Use only for supervised testing.</strong> When enabled, a student can simulate a beacon without being physically near it.
            </span>
          </label>
          <button type="submit" className="ptm-btn-primary" disabled={configBusy}>{configBusy ? 'Saving…' : 'Save attendance settings'}</button>
        </form>
      </div>
      <div className="ptm-card">
        <div className="ptm-section-title">Roll calls</div>
        <button type="button" className="ptm-btn-primary" disabled={busy} onClick={startRollCall}>
          {busy ? 'Please wait…' : `Start roll call (${config.start_time}–${config.end_time})`}
        </button>
        <div className="ptm-list">
          {sessions.map((session) => (
            <button type="button" className="ptm-list-row" key={session.session_id} onClick={() => setSelectedSession(session)}>
              <span className="ptm-list-main">
                <span className="ptm-list-title">{session.session_date} · {session.hostel_block}</span>
                <span className="ptm-list-sub">{session.status} · closes {new Date(session.closes_at).toLocaleTimeString()}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {selectedSession && (
        <>
          {selectedSession.status === 'Open' && (
            <div className="ptm-sync-note" role="status">
              Roll call is active · students scan their assigned BLE beacon and complete the on-device blink check.
            </div>
          )}
          <div className="ptm-card">
            <div className="ptm-section-title">Recorded attendance ({records.length})</div>
            {records.length === 0 ? <p className="ptm-list-sub">No students marked yet. Unmarked residents are recorded absent at closing.</p> : (
              <div className="ptm-list">
                {records.map((record) => (
                  <div className="ptm-list-row" key={record.student_id}>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{record.full_name || record.student_id}</div>
                      <div className="ptm-list-sub">{record.student_id} · {record.status} · {record.method}</div>
                      {record.exception_reason && <div className="ptm-list-sub">Reason: {record.exception_reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ptm-card">
            <button type="button" className="ptm-btn-secondary" onClick={() => setShowExceptionForm((current) => !current)}>
              Manual Warden Override (Mark Present/Exception)
            </button>
            {showExceptionForm && (
              <>
                <p className="ptm-list-sub">Use only for an explained correction. The change is retained with the Warden’s reason.</p>
                <form className="ptm-form-stack" onSubmit={saveException}>
                  <label className="ptm-label">Student roll number
                    <input className="ptm-input" required value={studentId} onChange={(event) => setStudentId(event.target.value)} />
                  </label>
                  <label className="ptm-label">Corrected status
                    <select className="ptm-input" value={exceptionStatus} onChange={(event) => setExceptionStatus(event.target.value)}>
                      <option>Present</option><option>Absent</option><option>Excused</option>
                    </select>
                  </label>
                  <label className="ptm-label">Reason
                    <textarea className="ptm-input" required maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <button type="submit" className="ptm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save reasoned exception'}</button>
                </form>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function GateSecurityPortal({ user, apiUrl }) {
  const videoRef = useRef(null);
  const [activePasses, setActivePasses] = useState([]);
  const [code, setCode] = useState('');
  const [direction, setDirection] = useState('OUT');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const loadPasses = useCallback(async () => {
    try {
      const data = await readResponse(await apiFetch(`${apiUrl}/api/outpasses`), 'Could not load active passes.');
      setActivePasses(data.outpasses || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load active passes.');
    }
  }, [apiUrl]);

  // Active passes are server-owned state and load when this portal opens.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { loadPasses(); }, [loadPasses]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    let active = true;
    let stream;
    let timer;
    const startCamera = async () => {
      if (!('BarcodeDetector' in window)) {
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              setCode(codes[0].rawValue);
              setCameraOpen(false);
              return;
            }
          } catch {
            setError('Could not read the QR code. Adjust the camera and try again.');
          }
          timer = window.setTimeout(scan, 250);
        };
        scan();
      } catch (cameraError) {
        setError(cameraError.message || 'Camera permission is unavailable. Enter the code manually.');
        setCameraOpen(false);
      }
    };
    startCamera();
    return () => {
      active = false;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraOpen]);

  const scanPass = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult('');
    try {
      const data = await readResponse(
        await apiFetch(`${apiUrl}/api/outpasses/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim(), direction })
        }),
        'Gate scan was rejected.'
      );
      setResult(`${data.student_id} scanned ${data.direction.toLowerCase()} at ${new Date(data.scanned_at).toLocaleTimeString()}.`);
      setCode('');
      await loadPasses();
    } catch (scanError) {
      setError(scanError.message || 'Gate scan was rejected.');
    } finally {
      setBusy(false);
    }
  };

  return (
      <div className="ptm-page-wrap" style={{ maxWidth: '880px', margin: '0 auto' }}>
        <div className="ptm-drill-header"><h1 className="ptm-page-title">Gate Security</h1></div>
        <div className="ptm-card">
          <div className="ptm-section-title">Validate a student outpass</div>
          <p className="ptm-list-sub">Only active, warden-approved passes can be scanned. OUT must be recorded before RETURN.</p>
          {error && <div className="ptm-alert-error" role="alert">{error}</div>}
          {result && <div className="ptm-sync-note" role="status">{result}</div>}
          <div className="ptm-row-between">
            <label className="ptm-label">Scan direction
              <select className="ptm-input" value={direction} onChange={(event) => setDirection(event.target.value)}>
                <option value="OUT">Leaving hostel</option>
                <option value="RETURN">Returning to hostel</option>
              </select>
            </label>
            <button type="button" className="ptm-btn-secondary" onClick={() => setCameraOpen((open) => !open)}>{cameraOpen ? 'Stop camera' : 'Scan with camera'}</button>
          </div>
          {cameraOpen && !('BarcodeDetector' in window) && <p className="ptm-list-sub">QR camera scanning is not supported in this browser. Use a supported mobile browser or enter the scanned code manually.</p>}
          {cameraOpen && <video ref={videoRef} className="ptm-security-camera" playsInline muted aria-label="Outpass QR scanner" />}
          <form className="ptm-form-stack" onSubmit={scanPass}>
            <label className="ptm-label">QR code
              <input className="ptm-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Scan or enter the student’s rotating code" required />
            </label>
            <button type="submit" className="ptm-btn-primary" disabled={busy || !code.trim()}>{busy ? 'Verifying…' : `Validate ${direction}`}</button>
          </form>
        </div>
        <div className="ptm-card">
          <div className="ptm-section-title">Active approved passes</div>
          <div className="ptm-list">
            {activePasses.map((pass) => (
              <article className="ptm-card" key={pass.pass_id} style={{ borderLeft: '4px solid #15803D' }}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{pass.student_id} · {pass.destination}</div>
                  <div className="ptm-status-badge" style={{ background: '#DCFCE7', color: '#15803D' }}>WARDEN APPROVED</div>
                  <div className="ptm-list-sub"><strong>Permission from:</strong> {new Date(pass.departure_at).toLocaleString()}</div>
                  <div className="ptm-list-sub"><strong>Permission until:</strong> {new Date(pass.return_at).toLocaleString()}</div>
                </div>
              </article>
            ))}
            {activePasses.length === 0 && <p className="ptm-list-sub">No active passes.</p>}
          </div>
        </div>
        <p className="ptm-list-sub">Signed in: {user?.full_name || user?.user_id}</p>
      </div>
  );
}
