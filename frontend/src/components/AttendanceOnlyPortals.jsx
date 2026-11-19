import React, { useEffect, useState } from 'react';
import { apiFetch, extractErrorMessage, unwrapApiError } from '../api';
import { WardenAttendancePanel } from './CampusSecurity';
import { ListRowSkeleton } from './SkeletonLoader';
import NativeBottomSheet from './NativeBottomSheet';
import { lightImpact } from '../utils/nativeFeedback';
import { useBeaconScanner } from '../hooks/useBeaconScanner';
import { captureCompressedFrame } from '../utils/cameraFrame';


async function requestJson(url, options = {}, fallback = 'Request failed') {
  const response = await apiFetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(unwrapApiError(payload, fallback));
  }
  return payload;
}

function SectionHeader({ title, subtitle }) {
  return (
    <header className="ptm-drill-header">
      <div>
        <h1 className="ptm-page-title">{title}</h1>
        {subtitle && <p className="ptm-list-sub">{subtitle}</p>}
      </div>
    </header>
  );
}

export function StudentAttendancePortal({ user, apiUrl }) {
  const [tab, setTab] = useState('class');
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeSessions, setActiveSessions] = useState([]);
  const [marking, setMarking] = useState(false);
  const activeClassSession = activeSessions.find((session) => session.scope === 'CLASS') || null;
  const beaconScan = useBeaconScanner(activeClassSession?.beacon || null);

  // oxlint-disable-next-line react/set-state-in-effect, react-hooks/exhaustive-deps
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await requestJson(`${apiUrl}/api/attendance/mine`, {}, 'Could not load attendance.');
        if (active) setAttendance(data.attendance || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load attendance.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [apiUrl]);

  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/v1/attendance-sessions-active`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractErrorMessage(payload, 'Could not load live sessions.'));
        if (active) setActiveSessions(payload.sessions || []);
      })
      .catch((loadError) => {
        if (active) setError(extractErrorMessage(loadError, 'Could not load live sessions.'));
      });
    const timer = window.setInterval(async () => {
      try {
        const response = await apiFetch(`${apiUrl}/api/v1/attendance-sessions-active`);
        const payload = await response.json().catch(() => ({}));
        if (response.ok && active) setActiveSessions(payload.sessions || []);
      } catch {
        // Keep the last known live-session state during transient network errors.
      }
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiUrl]);

  const hostelRows = attendance.filter((row) => row.hostel_block);

  const markPresent = async () => {
    if (!activeClassSession) {
      setError('No active class attendance session is available.');
      return;
    }
    if (!beaconScan.inRange) {
      setError('Move closer to the configured classroom beacon.');
      return;
    }
    if (marking) return;
    setMarking(true);
    setError('');
    setMessage('');
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      const liveImage = captureCompressedFrame(video);
      let assertion = null;
      if (window.PublicKeyCredential && navigator.credentials) {
        const challengeBytes = new TextEncoder().encode(activeClassSession.current_nonce);
        assertion = await navigator.credentials.get({
          publicKey: {
            challenge: challengeBytes,
            timeout: 30000,
            userVerification: 'required',
            rpId: window.location.hostname
          }
        }).catch(() => null);
      }
      if (!assertion) throw new Error('Complete WebAuthn device verification before marking present.');
      const beacon = activeClassSession.beacon;
      await requestJson(`${apiUrl}/api/v1/attendance/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeClassSession.session_id,
          session_nonce: activeClassSession.current_nonce,
          beacon_uuid: beacon.uuid,
          beacon_major: beacon.major,
          beacon_minor: beacon.minor,
          rssi: beaconScan.rssi,
          live_image_base64: liveImage,
          webauthn_credential: {
            id: assertion.id,
            rawId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))),
            type: assertion.type,
            response: {
              clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(assertion.response.clientDataJSON))),
              authenticatorData: btoa(String.fromCharCode(...new Uint8Array(assertion.response.authenticatorData))),
              signature: btoa(String.fromCharCode(...new Uint8Array(assertion.response.signature))),
              userHandle: assertion.response.userHandle ? btoa(String.fromCharCode(...new Uint8Array(assertion.response.userHandle))) : null
            }
          }
        })
      }, 'Could not mark attendance.');
      await lightImpact();
      setMessage?.('Attendance marked present.');
    } catch (markError) {
      setError(extractErrorMessage(markError, 'Could not mark attendance.'));
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setMarking(false);
    }
  };

  return (
    <div>
      {tab === 'class' ? (
        <>
          <SectionHeader title="Class Attendance" subtitle="Subject-wise totals and day-by-day class attendance." />
          {error && <div className="ptm-alert-error" role="alert">{error}</div>}
          {message && <div className="ptm-alert-success" role="status">{message}</div>}
          {activeClassSession && (
            <div className="ptm-card">
              <div className="ptm-row-between">
                <div>
                  <div className="ptm-section-title">Live Mark Present</div>
                  <div className="ptm-list-sub">Beacon RSSI: <span className="attendance-percent">{beaconScan.rssi ?? 'Scanning'} dBm</span></div>
                </div>
                <span className="ptm-tag-pill">{beaconScan.inRange ? 'In range' : 'Out of range'}</span>
              </div>
              <button type="button" className="ptm-btn-primary" disabled={marking || !beaconScan.inRange} onClick={markPresent}>
                {marking ? 'Verifying…' : 'Mark Present'}
              </button>
            </div>
          )}
          <div className="ptm-card">
            {loading ? <ListRowSkeleton count={4} /> : (
              attendance.length === 0
                ? <p className="ptm-list-sub">No class attendance is available yet.</p>
                : <div className="ptm-list">
                    {attendance.map((row) => (
                      <article className="ptm-card" key={row.session_id}>
                        <div className="ptm-row-between">
                          <div>
                            <div className="ptm-list-title">{row.subject_name || row.session_id}</div>
                            <div className="ptm-list-sub">{row.session_date || row.started_at?.slice(0, 10) || 'Session'} · {row.status || 'Absent'}</div>
                          </div>
                          <span className="ptm-tag-pill">{row.status || 'Absent'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
            )}
          </div>
        </>
      ) : (
        <>
          <SectionHeader title="Hostel Attendance" subtitle={`Wing: ${user?.wing || 'Not assigned'}`} />
          {error && <div className="ptm-alert-error" role="alert">{error}</div>}
          <div className="ptm-card">
            {loading ? <ListRowSkeleton count={4} /> : hostelRows.length === 0
              ? <p className="ptm-list-sub">No hostel roll-call records yet.</p>
              : hostelRows.map((row) => (
                  <article className="ptm-list-row" key={row.session_id}>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{row.session_date || row.started_at?.slice(0, 10) || 'Roll call'}</div>
                      <div className="ptm-list-sub">{row.hostel_block || user?.hostel_block} · {row.status || 'Absent'}</div>
                    </div>
                  </article>
                ))}
          </div>
          <div className="ptm-card">
            <div className="ptm-section-title">Face & Device Binding</div>
            <p className="ptm-list-sub">Status: {user?.biometric_status || 'Not Enrolled'}</p>
            <button
              type="button"
              className="ptm-btn-primary"
              onClick={() => setMessage('Ask your Warden to open the timed enrollment window. Then complete face and WebAuthn enrollment in the secure prompt.')}
            >
              Open secure binding enrollment
            </button>
          </div>
        </>
      )}
      <nav className="ptm-bottom-nav" aria-label="Student attendance navigation">
        <button type="button" className={`ptm-bnav-btn ${tab === 'class' ? 'active' : ''}`} onClick={() => setTab('class')}>
          <span>Class</span>
        </button>
        <button type="button" className={`ptm-bnav-btn ${tab === 'hostel' ? 'active' : ''}`} onClick={() => setTab('hostel')}>
          <span>Hostel</span>
        </button>
      </nav>
    </div>
  );
}

export function FacultyAttendancePortal({ user: _user, apiUrl }) {
  const [tab, setTab] = useState('roster');
  const [courses, setCourses] = useState([]);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [studentId, setStudentId] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangePrefix, setRangePrefix] = useState('');
  const [csvText, setCsvText] = useState('');
  const [beacons, setBeacons] = useState([]);
  const [beaconForm, setBeaconForm] = useState({ name: '', uuid: '', major: '', minor: '', min_rssi: -75 });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeSession, setActiveSession] = useState(null);
  const [liveSummary, setLiveSummary] = useState({ present: 0, absent: 0, total: 0 });
  const [liveRecords, setLiveRecords] = useState([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideStudent, setOverrideStudent] = useState(null);
  const [overrideStatus, setOverrideStatus] = useState('PRESENT');
  const [overrideReason, setOverrideReason] = useState('');

  const loadCourses = async () => {
    try {
      const data = await requestJson(`${apiUrl}/api/v1/courses`, {}, 'Could not load courses.');
      setCourses(data.courses || []);
      setSelectedCourse((current) => current || data.courses?.[0]?.id || '');
    } catch (loadError) {
      setError(loadError.message || 'Could not load courses.');
    }
  };

  const loadBeacons = async () => {
    try {
      const data = await requestJson(`${apiUrl}/api/v1/beacons?scope=CLASS`, {}, 'Could not load beacons.');
      setBeacons(data.beacons || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load beacons.');
    }
  };

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    Promise.all([loadCourses(), loadBeacons()]).finally(() => setLoading(false));
  }, [apiUrl]);

  const refreshLiveSession = async (sessionId) => {
    if (!sessionId) return;
    try {
      const data = await requestJson(`${apiUrl}/api/v1/attendance-sessions/${encodeURIComponent(sessionId)}`, {}, 'Could not refresh live attendance.');
      setLiveSummary(data.summary || { present: 0, absent: 0, total: 0 });
      setLiveRecords(data.records || []);
    } catch (refreshError) {
      setError(extractErrorMessage(refreshError, 'Could not refresh live attendance.'));
    }
  };

  const startLiveSession = async (minutes) => {
    if (!selectedCourse) {
      setError('Select a course before starting a session.');
      return;
    }
    const selectedBeacon = beacons.find((beacon) => beacon.course_id === selectedCourse || beacon.beacon_kind === 'class');
    if (!selectedBeacon) {
      setError('Configure a room beacon before starting a live session.');
      return;
    }
    setError('');
    try {
      const data = await requestJson(`${apiUrl}/api/v1/attendance-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'CLASS',
          course_id: selectedCourse,
          beacon_id: selectedBeacon.beacon_id || selectedBeacon.id,
          duration_minutes: minutes
        })
      }, 'Could not start the attendance session.');
      setActiveSession(data.session);
      setMessage(`${minutes}-minute live session started.`);
      await lightImpact();
      await refreshLiveSession(data.session.id);
    } catch (startError) {
      setError(extractErrorMessage(startError, 'Could not start the attendance session.'));
    }
  };

  const closeLiveSession = async () => {
    if (!activeSession) return;
    try {
      await requestJson(`${apiUrl}/api/v1/attendance-sessions/${encodeURIComponent(activeSession.id)}/close`, {
        method: 'POST'
      }, 'Could not close the attendance session.');
      setMessage('Session closed. The attendance PDF is being emailed.');
      setActiveSession(null);
      await lightImpact();
    } catch (closeError) {
      setError(extractErrorMessage(closeError, 'Could not close the attendance session.'));
    }
  };

  const submitOverride = async () => {
    if (!activeSession || !overrideStudent) return;
    if (!overrideReason.trim()) {
      setError('Provide a reason for the attendance override.');
      return;
    }
    try {
      await requestJson(`${apiUrl}/api/v1/attendance-sessions/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          student_id: overrideStudent.student_id,
          status: overrideStatus,
          reason: overrideReason
        })
      }, 'Could not override attendance.');
      setOverrideOpen(false);
      setOverrideReason('');
      setMessage('Attendance override saved.');
      await lightImpact();
      await refreshLiveSession(activeSession.id);
    } catch (overrideError) {
      setError(extractErrorMessage(overrideError, 'Could not override attendance.'));
    }
  };

  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeSession) return undefined;
    const timer = window.setInterval(() => refreshLiveSession(activeSession.id), 3000);
    return () => window.clearInterval(timer);
  }, [activeSession?.id]);

  const createCourse = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await requestJson(`${apiUrl}/api/v1/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: courseName, code: courseCode })
      }, 'Could not create course.');
      setCourses((current) => [data.course, ...current]);
      setSelectedCourse(data.course.id);
      setCourseName('');
      setCourseCode('');
      setMessage('Course created.');
      await lightImpact();
    } catch (saveError) {
      setError(saveError.message || 'Could not create course.');
    }
  };

  const addEntries = async (entries) => {
    if (!selectedCourse) {
      setError('Create or select a course first.');
      return;
    }
    try {
      const data = await requestJson(`${apiUrl}/api/v1/course-enrollments/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: selectedCourse, entries: entries.map((entry) => ({
          student_id: entry.student_id,
          roll_no: entry.roll_number || entry.roll_no,
          student_name: entry.student_name || ''
        })) })
      }, 'Could not update roster.');
      setCourses((current) => current.map((course) => course.id === selectedCourse
        ? { ...course, roster_count: data.count }
        : course));
      setMessage(`Roster updated. ${data.count} student(s) enrolled.`);
      setError('');
    } catch (saveError) {
      setError(saveError.message || 'Could not update roster.');
    }
  };

  const generateRange = async () => {
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!rangePrefix || !Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      setError('Enter a valid roll-number prefix and range.');
      return;
    }
    const entries = [];
    for (let number = start; number <= end; number += 1) {
      const roll = `${rangePrefix}${String(number).padStart(String(rangeEnd).length, '0')}`;
      entries.push({ student_id: roll, roll_number: roll });
    }
    await addEntries(entries);
  };

  const parseCsv = async () => {
    const entries = csvText.split(/\r?\n/)
      .map((line) => line.split(',').map((value) => value.trim()))
      .filter((row) => row.length >= 2 && row[0] && row[1])
      .map((row) => ({ student_id: row[0], roll_number: row[1] }));
    if (!entries.length) {
      setError('CSV requires student_id,roll_number rows.');
      return;
    }
    await addEntries(entries);
  };

  const saveBeacon = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await requestJson(`${apiUrl}/api/v1/beacons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'CLASS',
          name: beaconForm.name,
          uuid: beaconForm.uuid,
          major: Number(beaconForm.major),
          minor: Number(beaconForm.minor),
          min_rssi: Number(beaconForm.min_rssi),
          course_id: selectedCourse
        })
      }, 'Could not save beacon.');
      setBeaconForm({ name: '', uuid: '', major: '', minor: '', min_rssi: -75 });
      setMessage('Room beacon saved.');
      await lightImpact();
      await loadBeacons();
    } catch (saveError) {
      setError(saveError.message || 'Could not save beacon.');
    }
  };

  return (
    <div>
      <SectionHeader title="Faculty Attendance" subtitle="Manage only attendance for your classroom." />
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      {message && <div className="ptm-alert-success" role="status">{message}</div>}
      {tab === 'roster' && (
        <div className="ptm-card">
          {loading ? <ListRowSkeleton count={4} /> : (
            <>
              <div className="ptm-section-title">My Classes & Roster</div>
              <form onSubmit={createCourse} className="ptm-grid-2">
                <label className="ptm-label">Subject name
                  <input className="ptm-input" value={courseName} onChange={(event) => setCourseName(event.target.value)} />
                </label>
                <label className="ptm-label">Subject code
                  <input className="ptm-input" value={courseCode} onChange={(event) => setCourseCode(event.target.value.toUpperCase())} />
                </label>
                <button type="submit" className="ptm-btn-primary">Create course</button>
              </form>
              <label className="ptm-label">Selected course
                <select className="ptm-input" value={selectedCourse} onChange={(event) => setSelectedCourse(event.target.value)}>
                  <option value="">Select course</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.subject_name} · {course.roster_count || 0} students</option>)}
                </select>
              </label>
              <div className="ptm-grid-2">
                <div className="ptm-card">
                  <div className="ptm-section-title">Single entry</div>
                  <input className="ptm-input" placeholder="Roll number" value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} />
                  <input className="ptm-input" placeholder="Student ID" value={studentId} onChange={(event) => setStudentId(event.target.value)} />
                  <button type="button" className="ptm-btn-primary" onClick={() => addEntries([{ student_id: studentId, roll_number: rollNumber }])}>Add student</button>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Roll-number range</div>
                  <input className="ptm-input" placeholder="Prefix, e.g. U23CS" value={rangePrefix} onChange={(event) => setRangePrefix(event.target.value)} />
                  <div className="ptm-grid-2">
                    <input className="ptm-input" type="number" placeholder="Start" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
                    <input className="ptm-input" type="number" placeholder="End" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
                  </div>
                  <button type="button" className="ptm-btn-primary" onClick={generateRange}>Generate roster</button>
                </div>
              </div>
              <label className="ptm-label">CSV upload: student_id,roll_number
                <textarea className="ptm-input" rows={5} value={csvText} onChange={(event) => setCsvText(event.target.value)} />
              </label>
              <button type="button" className="ptm-btn-secondary" onClick={parseCsv}>Import CSV</button>
            </>
          )}
        </div>
      )}
      {tab === 'live' && (
        <div className="ptm-card">
          <div className="ptm-section-title">Live Session</div>
          <p className="ptm-list-sub">Choose a 2, 3, or 5 minute timed session. Check-in enforcement uses the 30-second rotating nonce, WebAuthn, BLE beacon, and 480x640 JPEG face verification.</p>
          <div className="ptm-grid-2">
            {[2, 3, 5].map((minutes) => (
              <button type="button" key={minutes} className="ptm-btn-primary" disabled={Boolean(activeSession)} onClick={() => startLiveSession(minutes)}>
                Start {minutes} min
              </button>
            ))}
          </div>
          {activeSession && (
            <>
              <div className="ptm-row-between" style={{ marginTop: 14 }}>
                <strong className="attendance-percent">
                  Present {liveSummary.present} · Absent {liveSummary.absent} · Total {liveSummary.total}
                </strong>
                <button type="button" className="ptm-btn-danger" onClick={closeLiveSession}>Close session</button>
              </div>
              <div className="ptm-list">
                {liveRecords.map((record) => (
                  <button
                    type="button"
                    className="ptm-list-row"
                    key={record.student_id}
                    onClick={() => {
                      setOverrideStudent(record);
                      setOverrideStatus(record.status === 'PRESENT' ? 'ABSENT' : 'PRESENT');
                      setOverrideOpen(true);
                    }}
                  >
                    <div className="ptm-list-main">
                      <div className="ptm-list-title roll-number">{record.roll_no || record.student_id}</div>
                      <div className="ptm-list-sub">{record.student_name || record.student_id}</div>
                    </div>
                    <span className={`ptm-status-badge ${record.status === 'PRESENT' ? 'present' : 'absent'}`}>{record.status}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <NativeBottomSheet open={overrideOpen} onOpenChange={setOverrideOpen} title="Override attendance" description="A reason is required for the audit log.">
            <div className="ptm-form-stack">
              <div className="ptm-list-title">{overrideStudent?.roll_no || overrideStudent?.student_id} · {overrideStudent?.student_name || ''}</div>
              <label className="ptm-label">Status
                <select className="ptm-input" value={overrideStatus} onChange={(event) => setOverrideStatus(event.target.value)}>
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                </select>
              </label>
              <label className="ptm-label">Reason
                <textarea className="ptm-input" rows={3} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
              </label>
              <button type="button" className="ptm-btn-primary" onClick={submitOverride}>Save override</button>
            </div>
          </NativeBottomSheet>
        </div>
      )}
      {tab === 'beacons' && (
        <div className="ptm-card">
          <div className="ptm-section-title">Room Beacons</div>
          <form onSubmit={saveBeacon} className="ptm-grid-2">
            <input className="ptm-input" placeholder="Beacon name" value={beaconForm.name} onChange={(event) => setBeaconForm({ ...beaconForm, name: event.target.value })} />
            <input className="ptm-input" placeholder="UUID" value={beaconForm.uuid} onChange={(event) => setBeaconForm({ ...beaconForm, uuid: event.target.value })} />
            <input className="ptm-input" type="number" placeholder="Major" value={beaconForm.major} onChange={(event) => setBeaconForm({ ...beaconForm, major: event.target.value })} />
            <input className="ptm-input" type="number" placeholder="Minor" value={beaconForm.minor} onChange={(event) => setBeaconForm({ ...beaconForm, minor: event.target.value })} />
            <label className="ptm-label">Minimum RSSI: {beaconForm.min_rssi} dBm
              <input className="ptm-input" type="range" min="-85" max="-65" value={beaconForm.min_rssi} onChange={(event) => setBeaconForm({ ...beaconForm, min_rssi: Number(event.target.value) })} />
            </label>
            <button type="submit" className="ptm-btn-primary">Save beacon</button>
          </form>
          <div className="ptm-list">
            {beacons.map((beacon) => (
              <article className="ptm-list-row" key={beacon.id || beacon.beacon_id}>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{beacon.name}</div>
                  <div className="ptm-list-sub">{beacon.uuid || beacon.uuid_value} · {beacon.major}/{beacon.minor} · {beacon.min_rssi} dBm</div>
                </div>
                <button
                  type="button"
                  className="ptm-btn-secondary"
                  onClick={async () => {
                    try {
                      await requestJson(`${apiUrl}/api/v1/beacons/${encodeURIComponent(beacon.id || beacon.beacon_id)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          scope: 'CLASS',
                          name: beacon.name,
                          uuid: beacon.uuid || beacon.uuid_value,
                          major: beacon.major,
                          minor: beacon.minor,
                          min_rssi: beacon.min_rssi,
                          is_active: !(beacon.is_active ?? beacon.enabled)
                        })
                      }, 'Could not toggle beacon.');
                      await lightImpact();
                      await loadBeacons();
                    } catch (toggleError) {
                      setError(extractErrorMessage(toggleError, 'Could not toggle beacon.'));
                    }
                  }}
                >
                  {(beacon.is_active ?? beacon.enabled) ? 'Disable' : 'Enable'}
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
      <nav className="ptm-bottom-nav" aria-label="Faculty attendance navigation">
        <button type="button" className={`ptm-bnav-btn ${tab === 'roster' ? 'active' : ''}`} onClick={() => setTab('roster')}><span>Classes & Roster</span></button>
        <button type="button" className={`ptm-bnav-btn ${tab === 'live' ? 'active' : ''}`} onClick={() => setTab('live')}><span>Live Session</span></button>
        <button type="button" className={`ptm-bnav-btn ${tab === 'beacons' ? 'active' : ''}`} onClick={() => setTab('beacons')}><span>Room Beacons</span></button>
      </nav>
    </div>
  );
}

export function WardenAttendanceOnlyPortal({ user, apiUrl }) {
  const [tab, setTab] = useState('roll');

  return (
    <div>
      {tab === 'roll' && (
        <>
          <SectionHeader title="Wing Roll Call" subtitle="Open and close hostel attendance sessions." />
          <WardenAttendancePanel apiUrl={apiUrl} user={user} />
        </>
      )}
      {tab === 'approvals' && (
        <StudentDeviceApprovals apiUrl={apiUrl} user={user} />
      )}
      {tab === 'beacons' && (
        <HostelBeaconManager apiUrl={apiUrl} user={user} />
      )}
      <nav className="ptm-bottom-nav" aria-label="Warden attendance navigation">
        <button type="button" className={`ptm-bnav-btn ${tab === 'roll' ? 'active' : ''}`} onClick={() => setTab('roll')}><span>Wing Roll Call</span></button>
        <button type="button" className={`ptm-bnav-btn ${tab === 'approvals' ? 'active' : ''}`} onClick={() => setTab('approvals')}><span>Device Approvals</span></button>
        <button type="button" className={`ptm-bnav-btn ${tab === 'beacons' ? 'active' : ''}`} onClick={() => setTab('beacons')}><span>Hostel Beacons</span></button>
      </nav>
    </div>
  );
}

function StudentDeviceApprovals({ apiUrl, user: _user }) {
  const [message, setMessage] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');

  const openEnrollment = async () => {
    setError('');
    setMessage('');
    if (!studentId.trim()) {
      setError('Enter the student roll number or account ID.');
      return;
    }
    try {
      await requestJson(`${apiUrl}/api/warden/unlock-biometric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId.trim() })
      }, 'Could not open the enrollment window.');
      setMessage('Timed face and WebAuthn enrollment window opened.');
      await lightImpact();
    } catch (actionError) {
      setError(extractErrorMessage(actionError, 'Could not open the enrollment window.'));
    }
  };

  const resetDevice = async () => {
    await openEnrollment();
  };

  return (
    <>
      <SectionHeader title="Face & Device Approvals" subtitle="Timed enrollment and device-lock reset." />
      <div className="ptm-card">
        {error && <div className="ptm-alert-error" role="alert">{error}</div>}
        <label className="ptm-label">Student roll number or account ID
          <input className="ptm-input roll-number" value={studentId} onChange={(event) => setStudentId(event.target.value)} />
        </label>
        <button type="button" className="ptm-btn-primary" onClick={openEnrollment}>Open timed enrollment window</button>
        <button type="button" className="ptm-btn-secondary" onClick={resetDevice}>Reset student device lock</button>
        {message && <p className="ptm-list-sub" role="status">{message}</p>}
      </div>
    </>
  );
}

function HostelBeaconManager({ apiUrl, user }) {
  const [beacons, setBeacons] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', uuid: '', major: '', minor: '', min_rssi: -75 });

  useEffect(() => {
    apiFetch(`${apiUrl}/api/v1/beacons?scope=HOSTEL`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(unwrapApiError(payload, 'Could not load hostel beacons.'));
        setBeacons(payload.beacons || []);
      })
      .catch((loadError) => setError(loadError.message || 'Could not load hostel beacons.'));
  }, [apiUrl]);

  const save = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await requestJson(`${apiUrl}/api/v1/beacons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'HOSTEL',
          name: form.name,
          uuid: form.uuid,
          major: Number(form.major),
          minor: Number(form.minor),
          min_rssi: Number(form.min_rssi),
          wing_id: user?.wing || ''
        })
      }, 'Could not save beacon.');
      setForm({ name: '', uuid: '', major: '', minor: '', min_rssi: -75 });
      await lightImpact();
    } catch (saveError) {
      setError(saveError.message || 'Could not save beacon.');
    }
  };

  return (
    <>
      <SectionHeader title="Hostel Beacons" subtitle="Configure the assigned wing's BLE beacons." />
      {error && <div className="ptm-alert-error" role="alert">{error}</div>}
      <div className="ptm-card">
        <form onSubmit={save} className="ptm-grid-2">
          <input className="ptm-input" placeholder="Beacon name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          <input className="ptm-input" placeholder="UUID" value={form.uuid} onChange={(event) => setForm({ ...form, uuid: event.target.value })} />
          <input className="ptm-input" type="number" placeholder="Major" value={form.major} onChange={(event) => setForm({ ...form, major: event.target.value })} />
          <input className="ptm-input" type="number" placeholder="Minor" value={form.minor} onChange={(event) => setForm({ ...form, minor: event.target.value })} />
          <label className="ptm-label">Minimum RSSI: {form.min_rssi} dBm
            <input className="ptm-input" type="range" min="-85" max="-65" value={form.min_rssi} onChange={(event) => setForm({ ...form, min_rssi: Number(event.target.value) })} />
          </label>
          <button type="submit" className="ptm-btn-primary">Add beacon</button>
        </form>
        <div className="ptm-list">
          {beacons.map((beacon) => (
            <article className="ptm-list-row" key={beacon.id || beacon.beacon_id}>
              <div className="ptm-list-main">
                <div className="ptm-list-title">{beacon.name}</div>
                <div className="ptm-list-sub">{beacon.uuid || beacon.uuid_value} · {beacon.major}/{beacon.minor} · {beacon.min_rssi} dBm</div>
              </div>
              <button
                type="button"
                className="ptm-btn-secondary"
                onClick={async () => {
                  try {
                    await requestJson(`${apiUrl}/api/v1/beacons/${encodeURIComponent(beacon.id || beacon.beacon_id)}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        scope: 'HOSTEL',
                        name: beacon.name,
                        uuid: beacon.uuid || beacon.uuid_value,
                        major: beacon.major,
                        minor: beacon.minor,
                        min_rssi: beacon.min_rssi,
                        is_active: !(beacon.is_active ?? beacon.enabled)
                      })
                    }, 'Could not toggle beacon.');
                    await lightImpact();
                    const response = await apiFetch(`${apiUrl}/api/v1/beacons?scope=HOSTEL`);
                    const payload = await response.json();
                    setBeacons(payload.beacons || []);
                  } catch (toggleError) {
                    setError(extractErrorMessage(toggleError, 'Could not toggle beacon.'));
                  }
                }}
              >
                {(beacon.is_active ?? beacon.enabled) ? 'Disable' : 'Enable'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
