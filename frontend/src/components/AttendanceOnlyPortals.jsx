import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { useBeaconScanner } from '../hooks/useBeaconScanner.ts';
import { compressCameraFrame } from '../utils/cameraFrame.js';
import { extractErrorMessage } from '../utils/errorParser.ts';
import DeanStaffManager from './DeanStaffManager';
import StaffAccountAccess from './StaffAccountAccess';
import { impactSuccess } from '../utils/nativeFeedback';
import './AttendanceOnlyPortals.css';

const ROOT = '/api/attendance-v2';

async function requestJson(apiUrl, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(`${apiUrl}${ROOT}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, `Request failed (${response.status}).`));
  return data;
}

function localDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function downloadPdf(apiUrl, path, filename) {
  const response = await apiFetch(`${apiUrl}${ROOT}${path}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(data, `Could not download PDF (${response.status}).`));
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bytesFromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlFromBuffer(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeCredential(credential) {
  const result = {
    id: credential.id,
    rawId: base64UrlFromBuffer(credential.rawId),
    type: credential.type,
    response: {}
  };
  for (const key of ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle', 'attestationObject']) {
    const value = credential.response[key];
    if (value) result.response[key] = base64UrlFromBuffer(value);
  }
  if (credential.response.getTransports) result.response.transports = credential.response.getTransports();
  return result;
}

function publicKeyOptions(options) {
  return {
    ...options,
    challenge: bytesFromBase64Url(options.challenge),
    user: options.user ? { ...options.user, id: bytesFromBase64Url(options.user.id) } : undefined,
    excludeCredentials: options.excludeCredentials?.map((item) => ({ ...item, id: bytesFromBase64Url(item.id) }))
  };
}

function useDismissSheet(onClose) {
  const startY = useRef(null);
  useEffect(() => {
    const handleBack = (event) => {
      event.preventDefault();
      onClose();
    };
    window.addEventListener('hms-native-back', handleBack);
    return () => window.removeEventListener('hms-native-back', handleBack);
  }, [onClose]);
  return {
    onTouchStart: (event) => { startY.current = event.touches[0]?.clientY ?? null; },
    onTouchEnd: (event) => {
      if (startY.current !== null && event.changedTouches[0].clientY - startY.current > 100) onClose();
      startY.current = null;
    }
  };
}

function AttendanceCheckIn({ apiUrl, session, onDone, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dismissProps = useDismissSheet(onClose);
  const scanner = useBeaconScanner({
    uuid: session.beacon.uuid,
    major: session.beacon.major,
    minor: session.beacon.minor,
    minRssi: session.beacon.min_rssi
  });

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          return videoRef.current.play();
        }
        return undefined;
      })
      .then(() => { if (active) setCameraReady(true); })
      .catch((cameraError) => { if (active) setError(extractErrorMessage(cameraError, 'Camera permission is required to check in.')); });
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const checkIn = async () => {
    if (!scanner.inRange || scanner.rssi === null) {
      setError('Move closer to the active room beacon before checking in.');
      return;
    }
    if (!cameraReady || !videoRef.current) {
      setError('Wait for the camera preview before checking in.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const liveImage = await compressCameraFrame(videoRef.current);
      const currentSession = (await requestJson(apiUrl, '/student/open-sessions'))
        .find((item) => item.id === session.id);
      if (!currentSession) throw new Error('This attendance session is no longer open.');
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: bytesFromBase64Url(currentSession.current_nonce),
          rpId: window.location.hostname,
          userVerification: 'required',
          timeout: 30000
        }
      });
      if (!credential) throw new Error('The hardware passkey assertion was cancelled.');
      await requestJson(apiUrl, '/check-in', {
        method: 'POST',
        body: JSON.stringify({
          session_id: session.id,
          session_nonce: currentSession.current_nonce,
          credential: encodeCredential(credential),
          uuid: session.beacon.uuid,
          major: session.beacon.major,
          minor: session.beacon.minor,
          rssi: scanner.rssi,
          live_image_base64: liveImage
        })
      });
      await impactSuccess().catch((hapticError) => console.error('Could not trigger check-in haptic feedback:', hapticError));
      onDone();
    } catch (checkInError) {
      setError(extractErrorMessage(checkInError, 'Could not verify this check-in.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="av-overlay" onClick={onClose}>
      <section className="av-sheet" role="dialog" aria-modal="true" aria-labelledby="av-checkin-title" onClick={(event) => event.stopPropagation()} {...dismissProps}>
        <button className="av-close" onClick={onClose} aria-label="Close check-in">×</button>
        <p className="av-kicker">{session.scope === 'CLASS' ? session.course_code : session.wing_name}</p>
        <h2 id="av-checkin-title">Verify your presence</h2>
        <div className="av-camera"><video ref={videoRef} autoPlay playsInline muted /></div>
        <div className={`av-beacon-state ${scanner.inRange ? 'is-good' : ''}`}>
          <span>{scanner.inRange ? 'Beacon verified' : 'Searching for room beacon'}</span>
          <strong>{scanner.rssi === null ? '-- dBm' : `${scanner.rssi} dBm`}</strong>
        </div>
        {scanner.simulationAvailable && (
          <label className="av-sim-toggle">
            <input type="checkbox" checked={scanner.simulation} onChange={(event) => event.target.checked ? scanner.startSimulation() : scanner.stopSimulation()} />
            Simulate Beacon in Browser
          </label>
        )}
        {scanner.error && <p className="av-error">{scanner.error}</p>}
        {error && <p className="av-error">{error}</p>}
        <button className="av-primary" disabled={busy || !cameraReady || !scanner.inRange} onClick={checkIn}>
          {busy ? 'Verifying...' : 'Mark Present'}
        </button>
        <p className="av-footnote">The compressed live frame is sent for 1:1 verification and discarded after processing.</p>
      </section>
    </div>
  );
}

function DeviceEnrollment({ apiUrl, onComplete, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dismissProps = useDismissSheet(onClose);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          return videoRef.current.play();
        }
        return undefined;
      })
      .then(() => { if (active) setReady(true); })
      .catch((cameraError) => { if (active) setError(extractErrorMessage(cameraError, 'Camera permission is required for enrollment.')); });
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const enroll = async () => {
    if (!ready || !videoRef.current) return;
    setBusy(true);
    setError('');
    try {
      const challenge = await requestJson(apiUrl, '/device/enrollment/options', { method: 'POST', body: '{}' });
      const credential = await navigator.credentials.create({ publicKey: publicKeyOptions(challenge.options) });
      if (!credential) throw new Error('Passkey enrollment was cancelled.');
      const referenceImage = await compressCameraFrame(videoRef.current);
      await requestJson(apiUrl, '/device/enrollment/complete', {
        method: 'POST',
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          credential: encodeCredential(credential),
          reference_image_base64: referenceImage
        })
      });
      onComplete();
    } catch (enrollError) {
      setError(extractErrorMessage(enrollError, 'Could not enroll this device.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="av-overlay">
      <section className="av-sheet" role="dialog" aria-modal="true" aria-labelledby="av-enroll-title" {...dismissProps}>
        <button className="av-close" onClick={onClose} aria-label="Close enrollment">×</button>
        <p className="av-kicker">WARDEN-APPROVED ENROLLMENT</p>
        <h2 id="av-enroll-title">Bind this device</h2>
        <div className="av-camera"><video ref={videoRef} autoPlay playsInline muted /></div>
        {error && <p className="av-error">{error}</p>}
        <button className="av-primary" disabled={busy || !ready} onClick={enroll}>{busy ? 'Securing device...' : 'Create passkey and face reference'}</button>
        <p className="av-footnote">Only one approved device is active. Ask your Warden to reset the lock when changing phones.</p>
      </section>
    </div>
  );
}

export function StudentAttendance({ apiUrl, modules }) {
  const [tab, setTab] = useState(modules?.class_attendance ? 'class' : 'hostel');
  const [summary, setSummary] = useState([]);
  const [hostel, setHostel] = useState(null);
  const [openSessions, setOpenSessions] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [checkIn, setCheckIn] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reportDate, setReportDate] = useState(localDateString);

  const refresh = useCallback(async () => {
    try {
      const requests = [];
      if (modules?.class_attendance) requests.push(requestJson(apiUrl, '/student/class-summary').then(setSummary));
      if (modules?.hostel_attendance) {
        requests.push(requestJson(apiUrl, '/student/hostel-history').then(setHostel));
      }
      if (modules?.class_attendance || modules?.hostel_attendance) {
        requests.push(requestJson(apiUrl, '/device/status').then(setDeviceStatus));
      }
      if (modules?.class_attendance || modules?.hostel_attendance) {
        requests.push(requestJson(apiUrl, '/student/open-sessions').then(setOpenSessions));
      }
      await Promise.all(requests);
      setError('');
    } catch (loadError) {
      setError(extractErrorMessage(loadError, 'Could not load attendance.'));
    }
  }, [apiUrl, modules?.class_attendance, modules?.hostel_attendance]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const availableTabs = [
    ...(modules?.class_attendance ? [{ id: 'class', label: 'Class Attendance' }] : []),
    ...(modules?.hostel_attendance ? [{ id: 'hostel', label: 'Hostel Attendance' }] : [])
  ];
  const activeSessions = openSessions.filter((session) => session.scope === (tab === 'class' ? 'CLASS' : 'HOSTEL'));
  const downloadPersonalReport = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await downloadPdf(
        apiUrl,
        `/student/daily-report.pdf?date=${encodeURIComponent(reportDate)}`,
        `${reportDate}-personal-attendance.pdf`
      );
    } catch (downloadError) {
      setError(extractErrorMessage(downloadError));
    }
  };

  return (
    <AttendanceShell title="Your attendance" tabs={availableTabs} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage} bottomTabs>
      <section className="av-panel">
        <div className="av-row-between">
          <div><h2>Daily personal report</h2><p className="av-subtitle">Download only your own attendance for a selected day.</p></div>
          <form className="av-inline-form" onSubmit={downloadPersonalReport}>
            <label>Date<input type="date" required value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
            <button className="av-secondary">Download PDF</button>
          </form>
        </div>
      </section>
      {tab === 'class' ? (
        <>
          {deviceStatus && !deviceStatus.device_locked && (
            <div className="av-panel av-device-enrollment">
              <strong>Secure your attendance device</strong>
              <p>{deviceStatus.enrollment_window_expires_at ? 'Your Warden-approved enrollment window is open.' : 'Ask your Warden to open a timed device enrollment window.'}</p>
              {deviceStatus.enrollment_window_expires_at && <button className="av-primary" onClick={() => setEnrolling(true)}>Enroll this device</button>}
            </div>
          )}
          {activeSessions.map((session) => (
            <div className="av-live-banner" key={session.id}>
              <span><i /> Live class · {session.course_code}{session.class_group ? ` · ${session.class_group}` : ''}{session.faculty_name ? ` · ${session.faculty_name}` : ''}</span>
              <button onClick={() => setCheckIn(session)}>Mark Present</button>
            </div>
          ))}
          <div className="av-card-grid">
            {summary.map((course) => (
              <button className="av-course-card" key={course.summary_id || course.course_id} onClick={() => setSelected(course)}>
                <span className="av-kicker">{course.course_code}</span>
                <strong>{course.course_title}</strong>
                <span className="av-subtitle">{course.faculty_name} · {course.department} · Year {course.year} · Division {course.division}</span>
                <span className={`av-percent ${course.percentage < 75 ? 'is-low' : ''}`}>{course.percentage}%</span>
                <span className="av-card-foot">{course.present_count} / {course.total_sessions} present <span>View history →</span></span>
              </button>
            ))}
            {!summary.length && <p className="av-empty">Your profile-based class attendance will appear here once your division has an attendance session.</p>}
          </div>
        </>
      ) : (
        <>
          {activeSessions.map((session) => (
            <div className="av-live-banner" key={session.id}>
              <span><i /> Live wing check-in · {session.wing_name}</span>
              <button onClick={() => setCheckIn(session)}>Mark Present</button>
            </div>
          ))}
          <div className="av-panel av-hostel-summary">
            <div><span className="av-kicker">ASSIGNED WING</span><strong>{hostel?.wing_name || 'Not assigned'}</strong></div>
            <div><span className="av-kicker">ROOM</span><strong className="av-tabular">{hostel?.room_no || '--'}</strong></div>
            <div><span className="av-kicker">THIS MONTH</span><strong className="av-tabular">{hostel?.monthly_percentage || 0}%</strong></div>
            {deviceStatus?.device_locked
              ? <span className="av-device-state is-good">Device approved</span>
              : <span className="av-device-state">Device not enrolled</span>}
          </div>
          {!deviceStatus?.device_locked && deviceStatus?.enrollment_window_expires_at && (
            <button className="av-primary av-enroll-button" onClick={() => setEnrolling(true)}>Complete Warden-approved device enrollment</button>
          )}
          <section className="av-panel">
            <h2>Nightly roll call</h2>
            <AttendanceRows rows={hostel?.records || []} />
          </section>
        </>
      )}
      {selected && (
        <AttendanceHistorySheet course={selected} onClose={() => setSelected(null)} />
      )}
      {checkIn && <AttendanceCheckIn apiUrl={apiUrl} session={checkIn} onClose={() => setCheckIn(null)} onDone={() => { setCheckIn(null); setMessage('Attendance marked present.'); void refresh(); }} />}
      {enrolling && <DeviceEnrollment apiUrl={apiUrl} onClose={() => setEnrolling(false)} onComplete={() => { setEnrolling(false); setMessage('This device is now approved.'); void refresh(); }} />}
    </AttendanceShell>
  );
}

function AttendanceRows({ rows }) {
  if (!rows.length) return <p className="av-empty">No attendance records yet.</p>;
  return (
    <div className="av-history-list">
      {rows.map((row) => (
        <div className="av-history-row" key={row.session_id || row.date}>
          <span className="av-tabular">{new Date(row.date).toLocaleString()}</span>
          <span className={`av-status ${row.status === 'PRESENT' ? 'is-good' : 'is-absent'}`}>{row.status}</span>
          <small>{row.marked_at ? `Checked in ${new Date(row.marked_at).toLocaleTimeString()}` : row.method || 'No check-in'}</small>
        </div>
      ))}
    </div>
  );
}

function AttendanceHistorySheet({ course, onClose }) {
  const dismissProps = useDismissSheet(onClose);
  return (
    <div className="av-overlay" onClick={onClose}>
      <section className="av-sheet av-history-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} {...dismissProps}>
        <button className="av-close" onClick={onClose} aria-label="Close history">×</button>
        <p className="av-kicker">{course.course_code} · {course.faculty_name}</p>
        <h2>{course.course_title}</h2>
        <AttendanceRows rows={course.sessions || []} />
      </section>
    </div>
  );
}

function AttendanceShell({ title, tabs, tab, setTab, children, error, message, setMessage, bottomTabs = false }) {
  return (
    <div className="av-root">
      <header className="av-heading"><span className="av-brand-mark">OS</span><div><p className="av-kicker">CAMPUS OS</p><h1>{title}</h1></div></header>
      {tabs.length > 1 && <nav className={`av-tabs ${bottomTabs ? 'av-bottom-tabs' : ''}`} aria-label="Attendance sections">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>}
      {error && <p className="av-error">{error}</p>}
      {message && <button className="av-message" onClick={() => setMessage('')}>{message} ×</button>}
      {children}
    </div>
  );
}

function BeaconManager({ apiUrl, scope }) {
  const [beacons, setBeacons] = useState([]);
  const [form, setForm] = useState({ name: '', uuid: '', major: 1, minor: 1, min_rssi: -78 });
  const [error, setError] = useState('');
  const load = useCallback(async () => setBeacons(await requestJson(apiUrl, `/beacons?scope=${scope}`)), [apiUrl, scope]);
  useEffect(() => { void load().catch((loadError) => setError(extractErrorMessage(loadError))); }, [load]);
  const save = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await requestJson(apiUrl, '/beacons', {
        method: 'POST',
        body: JSON.stringify({ ...form, scope, major: Number(form.major), minor: Number(form.minor), min_rssi: Number(form.min_rssi) })
      });
      setForm({ name: '', uuid: '', major: 1, minor: 1, min_rssi: -78 });
      await load();
    } catch (saveError) { setError(extractErrorMessage(saveError)); }
  };
  const updateRssi = async (beacon, value) => {
    try {
      await requestJson(apiUrl, `/beacons/${encodeURIComponent(beacon.id)}`, { method: 'PATCH', body: JSON.stringify({ ...beacon, min_rssi: Number(value) }) });
      await load();
    } catch (updateError) { setError(extractErrorMessage(updateError)); }
  };
  const toggle = async (beacon) => {
    try { await requestJson(apiUrl, `/beacons/${encodeURIComponent(beacon.id)}/toggle`, { method: 'POST' }); await load(); }
    catch (toggleError) { setError(extractErrorMessage(toggleError)); }
  };
  return (
    <section className="av-panel">
      <h2>{scope === 'CLASS' ? 'Room Beacons' : 'Hostel Beacons'}</h2>
      {error && <p className="av-error">{error}</p>}
      <form className="av-form-grid" onSubmit={save}>
        <label>Beacon name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>iBeacon UUID<input required value={form.uuid} onChange={(event) => setForm({ ...form, uuid: event.target.value })} /></label>
        <label>Major<input type="number" min="0" max="65535" value={form.major} onChange={(event) => setForm({ ...form, major: event.target.value })} /></label>
        <label>Minor<input type="number" min="0" max="65535" value={form.minor} onChange={(event) => setForm({ ...form, minor: event.target.value })} /></label>
        <label>Minimum RSSI <b className="av-tabular">{form.min_rssi} dBm</b><input type="range" min="-85" max="-65" value={form.min_rssi} onChange={(event) => setForm({ ...form, min_rssi: event.target.value })} /></label>
        <button className="av-primary">Add beacon</button>
      </form>
      <div className="av-list">
        {beacons.map((beacon) => (
          <div className="av-list-row" key={beacon.id}>
            <div><strong>{beacon.name}</strong><small>{beacon.uuid} · {beacon.major}/{beacon.minor}</small></div>
            <label className="av-rssi-slider">Min {beacon.min_rssi} dBm<input type="range" min="-85" max="-65" value={beacon.min_rssi} onChange={(event) => updateRssi(beacon, event.target.value)} /></label>
            <button className="av-secondary" onClick={() => toggle(beacon)}>{beacon.is_active ? 'Deactivate' : 'Activate'}</button>
          </div>
        ))}
        {!beacons.length && <p className="av-empty">No beacons configured for this scope.</p>}
      </div>
    </section>
  );
}

function classGroupKey(group) {
  return JSON.stringify([group.department, group.year, group.division]);
}

function FacultyAttendance({ apiUrl }) {
  const [tab, setTab] = useState('session');
  const [courses, setCourses] = useState([]);
  const [beacons, setBeacons] = useState([]);
  const [classGroups, setClassGroups] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [courseForm, setCourseForm] = useState({ code: '', title: '' });
  const [activeCourse, setActiveCourse] = useState('');
  const [activeGroup, setActiveGroup] = useState('');
  const [activeBeacon, setActiveBeacon] = useState('');
  const [duration, setDuration] = useState('manual');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    const [courseList, beaconList, liveSessions, groupList] = await Promise.all([
      requestJson(apiUrl, '/courses'),
      requestJson(apiUrl, '/beacons?scope=CLASS'),
      requestJson(apiUrl, '/sessions?scope=CLASS'),
      requestJson(apiUrl, '/directory/class-groups')
    ]);
    setCourses(courseList);
    setBeacons(beaconList);
    setSessions(liveSessions);
    setClassGroups(groupList);
    setActiveCourse((current) => current && courseList.some((course) => course.id === current) ? current : '');
    setActiveGroup((current) => current && groupList.some((group) => classGroupKey(group) === current)
      ? current
      : groupList[0] ? classGroupKey(groupList[0]) : '');
    setActiveBeacon((current) => current && beaconList.some((beacon) => beacon.id === current && beacon.is_active)
      ? current
      : beaconList.find((beacon) => beacon.is_active)?.id || '');
  }, [apiUrl]);
  useEffect(() => { void reload().catch((loadError) => setError(extractErrorMessage(loadError))); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => { void reload().catch((loadError) => setError(extractErrorMessage(loadError))); }, 5000);
    return () => window.clearInterval(timer);
  }, [reload]);
  const run = async (action, success) => {
    setError('');
    try {
      const result = await action();
      setMessage(typeof success === 'function' ? success(result) : success);
      await reload();
    }
    catch (actionError) { setError(extractErrorMessage(actionError)); }
  };
  const createCourse = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, '/courses', { method: 'POST', body: JSON.stringify(courseForm) }), 'Course created.');
  };
  const start = (event) => {
    event.preventDefault();
    const selectedGroup = classGroups.find((group) => classGroupKey(group) === activeGroup);
    return run(() => requestJson(apiUrl, '/sessions', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'CLASS',
        course_id: activeCourse || null,
        department: selectedGroup?.department,
        year: selectedGroup?.year,
        division: selectedGroup?.division,
        beacon_id: activeBeacon,
        duration_minutes: duration === 'manual' ? null : Number(duration)
      })
    }), 'Class session started for the selected division.');
  };
  const close = (session) => run(
    () => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' }),
    (result) => result.report_queued
      ? 'Session closed; the PDF report was queued for email.'
      : 'Session closed. Verify your report email to receive PDFs automatically.'
  );
  const override = async (session, item) => {
    const reason = window.prompt(`Audit reason for ${item.roll_no}:`);
    if (!reason) return;
    await run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/override`, {
      method: 'POST', body: JSON.stringify({ student_id: item.student_id, status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason })
    }), 'Attendance override recorded.');
  };
  const activeBeacons = beacons.filter((beacon) => beacon.is_active);
  return (
    <AttendanceShell title="Faculty attendance" tabs={[
      { id: 'session', label: 'Class Sessions' },
      { id: 'courses', label: 'Subject Labels' },
      { id: 'reports', label: 'Reports' },
      { id: 'beacons', label: 'Room Beacons' }
    ]} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage}>
      {tab === 'courses' && <section className="av-panel">
        <h2>Subject labels</h2>
        <p className="av-subtitle">Optional labels are shared within your college. Class rosters come from student profile divisions.</p>
        <form className="av-form-grid" onSubmit={createCourse}>
          <label>Course code<input required value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })} /></label>
          <label>Course title<input required value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label>
          <button className="av-primary">Create course</button>
        </form>
        <div className="av-list">{courses.map((course) => <div className="av-list-row" key={course.id}><strong>{course.code}</strong><span>{course.title}</span></div>)}</div>
      </section>}
      {tab === 'session' && <section className="av-panel">
        <h2>Start classroom attendance</h2>
        <form className="av-form-grid" onSubmit={start}>
          <label>Department / year / division<select required value={activeGroup} onChange={(event) => setActiveGroup(event.target.value)}><option value="">Select class division</option>{classGroups.map((group) => <option key={classGroupKey(group)} value={classGroupKey(group)}>{group.department} · Year {group.year} · Division {group.division} · {group.student_count} students</option>)}</select></label>
          <label>Subject label (optional)<select value={activeCourse} onChange={(event) => setActiveCourse(event.target.value)}><option value="">No subject label</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
          <label>Classroom beacon<select required value={activeBeacon} onChange={(event) => setActiveBeacon(event.target.value)}><option value="">Select registered room beacon</option>{activeBeacons.map((beacon) => <option key={beacon.id} value={beacon.id}>{beacon.name}</option>)}</select></label>
          <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="manual">Manual stop</option></select></label>
          <button className="av-primary" disabled={!activeGroup || !activeBeacon}>Start session</button>
        </form>
        {!classGroups.length && <p className="av-empty">Assign department, academic year, and division to student profiles in Student Onboarding before starting attendance.</p>}
        {!activeBeacons.length && <p className="av-empty">Register and activate a classroom beacon before starting attendance.</p>}
        <SessionCards sessions={sessions} onClose={close} onOverride={override} />
      </section>}
      {tab === 'reports' && <DailyReportsPanel apiUrl={apiUrl} scope="CLASS" />}
      {tab === 'beacons' && <BeaconManager apiUrl={apiUrl} scope="CLASS" />}
    </AttendanceShell>
  );
}

function SessionCards({ sessions, onClose, onOverride }) {
  return <div className="av-list">{sessions.map((session) => (
    <article className="av-panel av-session-card" key={session.id}>
      <div className="av-row-between"><div><p className="av-kicker">{session.scope} · {session.course_code || session.wing_name}{session.class_group ? ` · ${session.class_group}` : ''}{session.faculty_name ? ` · ${session.faculty_name}` : ''}</p><h3>Session live <span className="av-tabular">{session.present_count}/{session.students?.length || 0}</span></h3></div><button className="av-secondary" onClick={() => onClose(session)}>Close session</button></div>
      <div className="av-roster">{(session.students || []).map((item) => <div className="av-roster-row" key={`${session.id}-${item.roll_no}`}><span className="av-tabular">{item.roll_no}</span><span>{item.student_name || item.student_id || 'Not linked'}</span><span className={`av-status ${item.status === 'PRESENT' ? 'is-good' : 'is-absent'}`}>{item.status}</span>{item.student_id && <button className="av-text-button" onClick={() => onOverride(session, item)}>Override</button>}</div>)}</div>
    </article>
  ))}{!sessions.length && <p className="av-empty">No active session.</p>}</div>;
}

function ReportEmailSettings({ apiUrl }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    requestJson(apiUrl, '/report-email')
      .then((result) => { setEmail(result.email || ''); setVerified(result.verified); })
      .catch((loadError) => setError(extractErrorMessage(loadError)));
  }, [apiUrl]);

  const sendCode = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await requestJson(apiUrl, '/report-email/verification', { method: 'POST', body: JSON.stringify({ email }) });
      setCodeSent(true);
      setVerified(false);
      setMessage('Verification code sent. Check your inbox.');
    } catch (sendError) { setError(extractErrorMessage(sendError)); }
    finally { setBusy(false); }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await requestJson(apiUrl, '/report-email/verify', { method: 'POST', body: JSON.stringify({ email, code }) });
      setVerified(true);
      setCodeSent(false);
      setCode('');
      setMessage('Report email verified. Closed-session PDFs will be sent here.');
    } catch (verifyError) { setError(extractErrorMessage(verifyError)); }
    finally { setBusy(false); }
  };

  return (
    <section className="av-panel">
      <h2>Attendance report email</h2>
      <p className="av-subtitle">{verified ? `Verified: ${email}` : 'Verify an email address to receive closed-session PDF reports.'}</p>
      {error && <p className="av-error">{error}</p>}
      {message && <p className="av-success">{message}</p>}
      {!codeSent ? (
        <form className="av-inline-form" onSubmit={sendCode}>
          <label>Email for PDF reports<input type="email" required maxLength="254" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <button className="av-secondary" disabled={busy}>{busy ? 'Sending...' : verified ? 'Change email' : 'Send verification code'}</button>
        </form>
      ) : (
        <form className="av-inline-form" onSubmit={verifyCode}>
          <label>Six-digit email code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" required value={code} onChange={(event) => setCode(event.target.value)} /></label>
          <button className="av-primary" disabled={busy}>{busy ? 'Verifying...' : 'Verify email'}</button>
        </form>
      )}
    </section>
  );
}

function DailyReportsPanel({ apiUrl, scope, showEmailSettings = true }) {
  const [date, setDate] = useState(localDateString);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (selectedDate) => {
    setBusy(true); setError('');
    try {
      const result = await requestJson(apiUrl, `/reports/sessions?scope=${scope}&date=${encodeURIComponent(selectedDate)}`);
      setReports(result);
    } catch (loadError) { setError(extractErrorMessage(loadError)); }
    finally { setBusy(false); }
  }, [apiUrl, scope]);

  useEffect(() => { void load(localDateString()); }, [load]);

  const submit = (event) => {
    event.preventDefault();
    void load(date);
  };

  const download = async (report) => {
    setError('');
    try {
      await downloadPdf(apiUrl, `/reports/session/${encodeURIComponent(report.session_id)}.pdf`, `${date}-${report.scope.toLowerCase()}-attendance.pdf`);
    } catch (downloadError) { setError(extractErrorMessage(downloadError)); }
  };

  return (
    <>
      {showEmailSettings && <ReportEmailSettings apiUrl={apiUrl} />}
      <section className="av-panel">
        <div className="av-row-between">
          <div><h2>Daily attendance PDFs</h2><p className="av-subtitle">Download reports for your authorized sessions.</p></div>
          <form className="av-inline-form" onSubmit={submit}>
            <label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <button className="av-secondary" disabled={busy}>{busy ? 'Loading...' : 'View reports'}</button>
          </form>
        </div>
        {error && <p className="av-error">{error}</p>}
        <div className="av-list">
          {reports.map((report) => (
            <div className="av-list-row" key={report.session_id}>
              <div><strong>{report.title}</strong><small>{report.date} · {report.status} · {report.present}/{report.total} present · {report.absent} absent</small></div>
              <button className="av-secondary" onClick={() => void download(report)}>Download PDF</button>
            </div>
          ))}
          {!reports.length && !busy && <p className="av-empty">No attendance sessions for this date.</p>}
        </div>
      </section>
    </>
  );
}

export function DeanAttendanceOverview({ apiUrl, modules = {} }) {
  const classEnabled = Boolean(modules.class_attendance);
  const hostelEnabled = Boolean(modules.hostel_attendance);
  const tabs = [
    ...(classEnabled ? [{ id: 'CLASS', label: 'Class attendance' }] : []),
    ...(hostelEnabled ? [{ id: 'HOSTEL', label: 'Hostel attendance' }] : [])
  ];
  const [scope, setScope] = useState(classEnabled ? 'CLASS' : 'HOSTEL');

  useEffect(() => {
    if (scope === 'CLASS' && !classEnabled) setScope('HOSTEL');
    else if (scope === 'HOSTEL' && !hostelEnabled) setScope('CLASS');
  }, [scope, classEnabled, hostelEnabled]);

  if (!tabs.length) return null;
  return (
    <div className="av-root">
      <header className="av-heading"><span className="av-brand-mark">OS</span><div><p className="av-kicker">CAMPUS OS</p><h1>Attendance reports</h1></div></header>
      {tabs.length > 1 && <nav className="av-tabs" aria-label="Attendance report scopes">{tabs.map((item) => <button key={item.id} className={scope === item.id ? 'is-active' : ''} onClick={() => setScope(item.id)}>{item.label}</button>)}</nav>}
      <DailyReportsPanel apiUrl={apiUrl} scope={scope} showEmailSettings={false} />
    </div>
  );
}

export function WardenAttendance({ apiUrl, modules }) {
  const [tab, setTab] = useState(modules?.hostel_attendance ? 'rollcall' : 'devices');
  const [beacons, setBeacons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [student, setStudent] = useState('');
  const [wing, setWing] = useState('');
  const [room, setRoom] = useState('');
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('3');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    if (!modules?.hostel_attendance) {
      setBeacons([]);
      setSessions([]);
      return;
    }
    const [beaconList, liveSessions] = await Promise.all([requestJson(apiUrl, '/beacons?scope=HOSTEL'), requestJson(apiUrl, '/sessions?scope=HOSTEL')]);
    setBeacons(beaconList); setSessions(liveSessions);
  }, [apiUrl, modules?.hostel_attendance]);
  useEffect(() => { void reload().catch((loadError) => setError(extractErrorMessage(loadError))); }, [reload]);
  useEffect(() => {
    if (!modules?.hostel_attendance) return;
    requestJson(apiUrl, '/directory/students?scope=HOSTEL')
      .then(setStudents)
      .catch((loadError) => setError(extractErrorMessage(loadError)));
  }, [apiUrl, modules?.hostel_attendance]);
  const run = async (action, success) => {
    setError('');
    try {
      const result = await action();
      setMessage(typeof success === 'function' ? success(result) : success);
      await reload();
    }
    catch (actionError) { setError(extractErrorMessage(actionError)); }
  };
  const start = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, '/sessions', { method: 'POST', body: JSON.stringify({ scope: 'HOSTEL', wing_name: wing, beacon_id: beacons[0]?.id, duration_minutes: duration === 'manual' ? null : Number(duration) }) }), 'Wing roll call started.');
  };
  const addMember = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, '/hostel/members', { method: 'POST', body: JSON.stringify({ wing_name: wing, room_no: room, roll_no: roll, student_name: name }) }), 'Student added to the wing roster.');
  };
  const openWindow = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, '/device/enrollment/open', { method: 'POST', body: JSON.stringify({ student_id: student, duration_seconds: 120 }) }), 'Two-minute enrollment window opened.');
  };
  const reset = () => run(() => requestJson(apiUrl, `/device/reset/${encodeURIComponent(student)}`, { method: 'POST' }), 'Device lock reset.');
  const close = (session) => run(
    () => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' }),
    (result) => result.report_queued
      ? 'Roll call closed; the PDF report was queued for email.'
      : 'Roll call closed. Verify your report email to receive PDFs automatically.'
  );
  const override = async (session, item) => {
    const reason = window.prompt(`Audit reason for ${item.roll_no}:`);
    if (!reason) return;
    await run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/override`, { method: 'POST', body: JSON.stringify({ student_id: item.student_id, status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason }) }), 'Roll-call override recorded.');
  };
  const tabs = [
    ...(modules?.hostel_attendance ? [{ id: 'rollcall', label: 'Wing Roll Call' }] : []),
    ...(modules?.class_attendance || modules?.hostel_attendance ? [{ id: 'devices', label: 'Device Approvals' }] : []),
    ...(modules?.hostel_attendance ? [{ id: 'beacons', label: 'Hostel Beacons' }] : [])
  ];
  return (
    <AttendanceShell title="Warden attendance" tabs={tabs} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage}>
      {tab === 'rollcall' && <section className="av-panel">
        <h2>Open wing roll call</h2>
        <form className="av-form-grid" onSubmit={start}><label>Wing name<input required value={wing} onChange={(event) => setWing(event.target.value)} /></label><label>Session duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="manual">Manual stop</option></select></label><button className="av-primary" disabled={!beacons.length}>Start roll call</button></form>
        <h2>Add resident to roster</h2>
        <form className="av-form-grid" onSubmit={addMember}><label>Room<input required value={room} onChange={(event) => setRoom(event.target.value)} /></label><label>Existing student<select required value={roll} onChange={(event) => { const selected = students.find((item) => item.roll_no === event.target.value); setRoll(event.target.value); setName(selected?.student_name || ''); }}><option value="">Select roll number</option>{students.map((item) => <option key={item.user_id} value={item.roll_no}>{item.roll_no} · {item.student_name}</option>)}</select></label><button className="av-secondary" disabled={!students.length}>Add resident</button></form>
        <SessionCards sessions={sessions} onClose={close} onOverride={override} />
      </section>}
      {tab === 'rollcall' && <DailyReportsPanel apiUrl={apiUrl} scope="HOSTEL" />}
      {tab === 'devices' && <section className="av-panel"><h2>Device approvals</h2><form className="av-form-grid" onSubmit={openWindow}><label>Student roll number<input required value={student} onChange={(event) => setStudent(event.target.value)} /></label><button className="av-primary">Open 120-second enrollment window</button></form><button className="av-secondary" disabled={!student} onClick={reset}>Reset device lock for phone change</button></section>}
      {tab === 'beacons' && <BeaconManager apiUrl={apiUrl} scope="HOSTEL" />}
    </AttendanceShell>
  );
}

function DeanAttendance({ apiUrl, user }) {
  return <AttendanceShell title="Institute staff" tabs={[{ id: 'staff', label: 'Staff & Faculty' }]} tab="staff" setTab={() => {}}>
    <DeanStaffManager apiUrl={apiUrl} />
    <StaffAccountAccess apiUrl={apiUrl} user={user} />
  </AttendanceShell>;
}

export default function AttendanceOnlyPortals({ apiUrl, user, modules = {} }) {
  if (user?.role === 'Student') return <StudentAttendance apiUrl={apiUrl} modules={modules} />;
  if (user?.role === 'Faculty') return <FacultyAttendance apiUrl={apiUrl} />;
  if (user?.role === 'Warden') return <WardenAttendance apiUrl={apiUrl} modules={modules} />;
  if (user?.role === 'Dean') return <DeanAttendance apiUrl={apiUrl} user={user} />;
  return <div className="av-root"><p className="av-empty">Attendance tools are not available for this account.</p></div>;
}