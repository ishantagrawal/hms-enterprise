import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { useBeaconScanner } from '../hooks/useBeaconScanner.ts';
import { compressCameraFrame } from '../utils/cameraFrame.js';
import { extractErrorMessage } from '../utils/errorParser.ts';
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

function StudentAttendance({ apiUrl, modules }) {
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

  return (
    <AttendanceShell title="Your attendance" tabs={availableTabs} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage} bottomTabs>
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
              <span><i /> Live class session · {session.course_code}</span>
              <button onClick={() => setCheckIn(session)}>Mark Present</button>
            </div>
          ))}
          <div className="av-card-grid">
            {summary.map((course) => (
              <button className="av-course-card" key={course.course_id} onClick={() => setSelected(course)}>
                <span className="av-kicker">{course.course_code}</span>
                <strong>{course.course_title}</strong>
                <span className="av-subtitle">{course.faculty_name}</span>
                <span className={`av-percent ${course.percentage < 75 ? 'is-low' : ''}`}>{course.percentage}%</span>
                <span className="av-card-foot">{course.present_count} / {course.total_sessions} present <span>View history →</span></span>
              </button>
            ))}
            {!summary.length && <p className="av-empty">Your enrolled subjects will appear here.</p>}
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
      <header className="av-heading"><span className="av-brand-mark">CV</span><div><p className="av-kicker">CAMPUSVERIFY</p><h1>{title}</h1></div></header>
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

function FacultyAttendance({ apiUrl }) {
  const [tab, setTab] = useState('courses');
  const [courses, setCourses] = useState([]);
  const [beacons, setBeacons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [courseForm, setCourseForm] = useState({ code: '', title: '', default_beacon_id: '' });
  const [activeCourse, setActiveCourse] = useState('');
  const [student, setStudent] = useState({ roll_no: '', student_name: '' });
  const [range, setRange] = useState({ start_roll_no: '', end_roll_no: '' });
  const [duration, setDuration] = useState('3');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    const [courseList, beaconList, liveSessions] = await Promise.all([
      requestJson(apiUrl, '/courses'),
      requestJson(apiUrl, '/beacons?scope=CLASS'),
      requestJson(apiUrl, '/sessions?scope=CLASS')
    ]);
    setCourses(courseList); setBeacons(beaconList); setSessions(liveSessions);
    setActiveCourse((current) => current || courseList[0]?.id || '');
  }, [apiUrl]);
  useEffect(() => { void reload().catch((loadError) => setError(extractErrorMessage(loadError))); }, [reload]);
  useEffect(() => {
    const timer = window.setInterval(() => { void reload().catch((loadError) => setError(extractErrorMessage(loadError))); }, 5000);
    return () => window.clearInterval(timer);
  }, [reload]);
  const run = async (action, success) => {
    setError('');
    try { await action(); setMessage(success); await reload(); }
    catch (actionError) { setError(extractErrorMessage(actionError)); }
  };
  const createCourse = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, '/courses', { method: 'POST', body: JSON.stringify(courseForm) }), 'Course created.');
  };
  const addStudent = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, `/courses/${encodeURIComponent(activeCourse)}/students`, { method: 'POST', body: JSON.stringify(student) }), 'Student added to course roster.');
  };
  const addRange = (event) => {
    event.preventDefault();
    return run(() => requestJson(apiUrl, `/courses/${encodeURIComponent(activeCourse)}/students/range`, { method: 'POST', body: JSON.stringify(range) }), 'Roll-number range imported.');
  };
  const uploadCsv = (event) => {
    event.preventDefault();
    const file = event.currentTarget.elements.roster.files[0];
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    return run(() => requestJson(apiUrl, `/courses/${encodeURIComponent(activeCourse)}/students/csv`, { method: 'POST', body }), 'Roster CSV imported.');
  };
  const start = (event) => {
    event.preventDefault();
    const course = courses.find((item) => item.id === activeCourse);
    return run(() => requestJson(apiUrl, '/sessions', {
      method: 'POST',
      body: JSON.stringify({ scope: 'CLASS', course_id: activeCourse, beacon_id: course?.default_beacon_id || beacons[0]?.id, duration_minutes: duration === 'manual' ? null : Number(duration) })
    }), 'Class session started.');
  };
  const close = (session) => run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' }), 'Session closed; report email queued.');
  const override = async (session, item) => {
    const reason = window.prompt(`Audit reason for ${item.roll_no}:`);
    if (!reason) return;
    await run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/override`, {
      method: 'POST', body: JSON.stringify({ student_id: item.student_id, status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason })
    }), 'Attendance override recorded.');
  };
  return (
    <AttendanceShell title="Faculty attendance" tabs={[{ id: 'courses', label: 'My Classes & Roster' }, { id: 'session', label: 'Live Session' }, { id: 'beacons', label: 'Room Beacons' }]} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage}>
      {tab === 'courses' && <section className="av-panel">
        <h2>Create a course</h2>
        <form className="av-form-grid" onSubmit={createCourse}>
          <label>Course code<input required value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value })} /></label>
          <label>Course title<input required value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} /></label>
          <label>Default room beacon<select value={courseForm.default_beacon_id} onChange={(event) => setCourseForm({ ...courseForm, default_beacon_id: event.target.value })}><option value="">Select later</option>{beacons.map((beacon) => <option key={beacon.id} value={beacon.id}>{beacon.name}</option>)}</select></label>
          <button className="av-primary">Create course</button>
        </form>
        <div className="av-form-grid av-roster-forms">
          <label>Course roster<select value={activeCourse} onChange={(event) => setActiveCourse(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
          <form onSubmit={addStudent}><label>Single student roll number<input required value={student.roll_no} onChange={(event) => setStudent({ ...student, roll_no: event.target.value })} /></label><label>Name<input value={student.student_name} onChange={(event) => setStudent({ ...student, student_name: event.target.value })} /></label><button className="av-secondary">Add student</button></form>
          <form onSubmit={addRange}><label>From roll number<input required value={range.start_roll_no} onChange={(event) => setRange({ ...range, start_roll_no: event.target.value })} /></label><label>To roll number<input required value={range.end_roll_no} onChange={(event) => setRange({ ...range, end_roll_no: event.target.value })} /></label><button className="av-secondary">Add roll range</button></form>
          <form onSubmit={uploadCsv}><label>CSV roster (roll_no, name)<input type="file" name="roster" accept=".csv,text/csv" required /></label><button className="av-secondary">Import CSV</button></form>
        </div>
      </section>}
      {tab === 'session' && <section className="av-panel">
        <h2>Live class session</h2>
        <form className="av-form-grid" onSubmit={start}>
          <label>Course<select required value={activeCourse} onChange={(event) => setActiveCourse(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}</select></label>
          <label>Duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="manual">Manual stop</option></select></label>
          <button className="av-primary" disabled={!courses.length || (!beacons.length && !courses.find((item) => item.id === activeCourse)?.default_beacon_id)}>Start session</button>
        </form>
        <SessionCards sessions={sessions} onClose={close} onOverride={override} />
      </section>}
      {tab === 'beacons' && <BeaconManager apiUrl={apiUrl} scope="CLASS" />}
    </AttendanceShell>
  );
}

function SessionCards({ sessions, onClose, onOverride }) {
  return <div className="av-list">{sessions.map((session) => (
    <article className="av-panel av-session-card" key={session.id}>
      <div className="av-row-between"><div><p className="av-kicker">{session.scope} · {session.course_id || session.wing_name}</p><h3>Session live <span className="av-tabular">{session.present_count}/{session.students?.length || 0}</span></h3></div><button className="av-secondary" onClick={() => onClose(session)}>Close session</button></div>
      <div className="av-roster">{(session.students || []).map((item) => <div className="av-roster-row" key={`${session.id}-${item.roll_no}`}><span className="av-tabular">{item.roll_no}</span><span>{item.student_name || item.student_id || 'Not linked'}</span><span className={`av-status ${item.status === 'PRESENT' ? 'is-good' : 'is-absent'}`}>{item.status}</span>{item.student_id && <button className="av-text-button" onClick={() => onOverride(session, item)}>Override</button>}</div>)}</div>
    </article>
  ))}{!sessions.length && <p className="av-empty">No active session.</p>}</div>;
}

function WardenAttendance({ apiUrl, modules }) {
  const [tab, setTab] = useState(modules?.hostel_attendance ? 'rollcall' : 'devices');
  const [beacons, setBeacons] = useState([]);
  const [sessions, setSessions] = useState([]);
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
  const run = async (action, success) => {
    setError('');
    try { await action(); setMessage(success); await reload(); }
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
  const close = (session) => run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' }), 'Roll call closed.');
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
        <form className="av-form-grid" onSubmit={addMember}><label>Room<input required value={room} onChange={(event) => setRoom(event.target.value)} /></label><label>Roll number<input required value={roll} onChange={(event) => setRoll(event.target.value)} /></label><label>Student name<input value={name} onChange={(event) => setName(event.target.value)} /></label><button className="av-secondary">Add resident</button></form>
        <SessionCards sessions={sessions} onClose={close} onOverride={override} />
      </section>}
      {tab === 'devices' && <section className="av-panel"><h2>Device approvals</h2><form className="av-form-grid" onSubmit={openWindow}><label>Student roll number<input required value={student} onChange={(event) => setStudent(event.target.value)} /></label><button className="av-primary">Open 120-second enrollment window</button></form><button className="av-secondary" disabled={!student} onClick={reset}>Reset device lock for phone change</button></section>}
      {tab === 'beacons' && <BeaconManager apiUrl={apiUrl} scope="HOSTEL" />}
    </AttendanceShell>
  );
}

function DeanAttendance({ apiUrl }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'FACULTY', department_or_block: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => setStaff(await requestJson(apiUrl, '/admin/staff')), [apiUrl]);
  useEffect(() => { void load().catch((loadError) => setError(extractErrorMessage(loadError))); }, [load]);
  const create = async (event) => {
    event.preventDefault();
    try {
      await requestJson(apiUrl, '/admin/staff', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', email: '', role: 'FACULTY', department_or_block: '' });
      setMessage('Staff account provisioned. Their institute email will claim this role on sign-in.');
      await load();
    } catch (createError) { setError(extractErrorMessage(createError)); }
  };
  const upload = async (event) => {
    event.preventDefault();
    const file = event.currentTarget.elements.staffCsv.files[0];
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    try { await requestJson(apiUrl, '/admin/staff/csv', { method: 'POST', body }); setMessage('Staff CSV imported.'); await load(); }
    catch (uploadError) { setError(extractErrorMessage(uploadError)); }
  };
  return <AttendanceShell title="Institute staff" tabs={[{ id: 'staff', label: 'Staff & Faculty' }]} tab="staff" setTab={() => {}} error={error} message={message} setMessage={setMessage}>
    <section className="av-panel">
      <h2>Provision Faculty and Wardens</h2>
      <form className="av-form-grid" onSubmit={create}>
        <label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>Institute email<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="FACULTY">Faculty</option><option value="WARDEN">Warden</option></select></label>
        <label>Department or hostel block<input required value={form.department_or_block} onChange={(event) => setForm({ ...form, department_or_block: event.target.value })} /></label>
        <button className="av-primary">Provision staff</button>
      </form>
      <form className="av-inline-form" onSubmit={upload}><label>CSV: name,email,role,department_or_block<input type="file" name="staffCsv" accept=".csv,text/csv" required /></label><button className="av-secondary">Import CSV</button></form>
      <div className="av-list">{staff.map((item) => <div className="av-list-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email} · {item.department_or_block}</small></div><span className="av-status">{item.role}</span><small>{item.claimed_by_user_id ? 'Claimed' : 'Pending claim'}</small></div>)}</div>
    </section>
  </AttendanceShell>;
}

export default function AttendanceOnlyPortals({ apiUrl, user, modules = {}, legacyPortal = null }) {
  const [showLegacy, setShowLegacy] = useState(false);
  if (showLegacy && legacyPortal) {
    return <div className="av-legacy-wrap"><button className="av-secondary av-back-attendance" onClick={() => setShowLegacy(false)}>← Back to Attendance</button>{legacyPortal}</div>;
  }
  const switchButton = legacyPortal && <button className="av-secondary av-back-attendance" onClick={() => setShowLegacy(true)}>Open Campus Portal</button>;
  if (user?.role === 'Student') return <>{switchButton}<StudentAttendance apiUrl={apiUrl} modules={modules} /></>;
  if (user?.role === 'Faculty') return <FacultyAttendance apiUrl={apiUrl} />;
  if (user?.role === 'Warden') return <>{switchButton}<WardenAttendance apiUrl={apiUrl} modules={modules} /></>;
  if (user?.role === 'Dean') return <>{switchButton}<DeanAttendance apiUrl={apiUrl} /></>;
  return <div className="av-root"><p className="av-empty">Attendance tools are not available for this account.</p></div>;
}