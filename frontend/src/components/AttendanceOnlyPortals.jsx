import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { Capacitor } from '@capacitor/core';
import { compressCameraFrame } from '../utils/cameraFrame.js';
import { extractErrorMessage } from '../utils/errorParser.ts';
import {
  broadcastIosAttendanceForFiveSeconds,
  broadcastAttendanceForFiveSeconds,
  getBleKeyAgreementPublicKey,
  installBleHmacKey
} from '../utils/hardwareAuth.js';
import DeanStaffManager from './DeanStaffManager';
import StaffAccountAccess from './StaffAccountAccess';
import { impactSuccess } from '../utils/nativeFeedback';
import { Button, Chip, Icon, ProgressBar, StatusPill } from './ui/DesignSystem';
import './AttendanceOnlyPortals.css';

const ROOT = '/api/attendance-v2';
const ISRG_ROOT_X1 = `-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----`;

async function readSerialProvisioningResponse(reader) {
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error('ESP32 disconnected before confirming provisioning.');
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    if (pending.length > 4096) throw new Error('ESP32 sent an invalid serial response.');
    for (const line of lines) {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        continue;
      }
      if (response.status === 'OK') return response;
      if (response.status === 'ERROR') throw new Error(response.error || 'ESP32 rejected the configuration.');
    }
  }
}

async function requestJson(apiUrl, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(`${apiUrl}${ROOT}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(extractErrorMessage(data, `Request failed (${response.status}).`));
  return data;
}

async function requestAttendanceApi(apiUrl, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await apiFetch(`${apiUrl}/api/attendance${path}`, { ...options, headers });
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
    window.addEventListener('vidyut-native-back', handleBack);
    return () => window.removeEventListener('vidyut-native-back', handleBack);
  }, [onClose]);
  return {
    onTouchStart: (event) => { startY.current = event.touches[0]?.clientY ?? null; },
    onTouchEnd: (event) => {
      if (startY.current !== null && event.changedTouches[0].clientY - startY.current > 100) onClose();
      startY.current = null;
    }
  };
}

function AttendanceCheckIn({ apiUrl, session, user, onDone, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dismissProps = useDismissSheet(onClose);
  const isIos = Capacitor.getPlatform() === 'ios';

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
      const rollId = Number(user?.user_id);
      if (!Number.isInteger(rollId) || rollId < 0 || rollId > 0xffffffff) {
        throw new Error('This student account does not have a numeric 32-bit roll ID for BLE attendance.');
      }
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: bytesFromBase64Url(currentSession.current_nonce),
          rpId: window.location.hostname,
          userVerification: 'required',
          timeout: 30000
        }
      });
      if (!credential) throw new Error('The hardware passkey assertion was cancelled.');
      const token = await requestAttendanceApi(
        apiUrl,
        `/sessions/${encodeURIComponent(session.id)}/${isIos ? 'ios-ble-token' : 'android-ble-nonce'}`,
        {
          method: 'POST',
          body: JSON.stringify({
            session_nonce: currentSession.current_nonce,
            credential: encodeCredential(credential),
            live_image_base64: liveImage
          })
        }
      );
      if (isIos) {
        await broadcastIosAttendanceForFiveSeconds(
          token.session_nonce,
          rollId,
          token.attendance_token
        );
      } else {
        await broadcastAttendanceForFiveSeconds(token.session_nonce, rollId);
      }
      await impactSuccess().catch((hapticError) => console.error('Could not trigger check-in haptic feedback:', hapticError));
      onDone({ iosBleAdvertised: isIos });
    } catch (checkInError) {
      setError(extractErrorMessage(checkInError, 'Could not verify this check-in.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="av-checkin-screen">
      <header className="av-checkin-header">
        <button type="button" className="av-checkin-back" onClick={onClose} aria-label="Back to attendance">
          <Icon name="arrow" />
        </button>
        <div>
          <p>{session.scope === 'CLASS' ? session.course_title || session.course_code : 'Hostel roll call'}</p>
          <span>{session.beacon?.name || session.wing_name || session.class_group || 'Campus beacon'}</span>
        </div>
      </header>
      <main className="av-checkin-stage">
        <span className="av-live-badge"><i /> {session.course_code || session.wing_name} · {session.beacon?.name || 'Room beacon'}</span>
        <div className={`av-checkin-camera${cameraReady ? ' is-ready' : ''}`}>
          <video ref={videoRef} autoPlay playsInline muted />
          <span className="av-face-guide" aria-hidden="true"><i /><i /></span>
        </div>
        <h1 id="av-checkin-title">Verify your face</h1>
        <p>Hold your phone at eye level and keep your face in the oval.</p>
      </main>
      <section className="av-checkin-panel" role="dialog" aria-modal="true" aria-labelledby="av-checkin-title" {...dismissProps}>
        <div className="av-checkin-status">
          <span className={`av-checkin-status-icon${cameraReady ? ' is-good' : ''}`}>{cameraReady ? <Icon name="check" size={16} /> : null}</span>
          <div><strong>Device verification</strong><small>{cameraReady ? 'Camera is ready for secure verification' : 'Starting secure camera check'}</small></div>
        </div>
        <div className="av-checkin-status">
          {isIos
            ? <><span className="av-checkin-status-icon is-good"><Icon name="check" size={16} /></span><div><strong>Online iPhone check-in</strong><small>The server issues a short-lived token after passkey and face verification.</small></div></>
            : <><span className="av-checkin-status-icon is-good"><Icon name="check" size={16} /></span><div><strong>Online Android check-in</strong><small>The server verifies your passkey and face before BLE proof broadcasting.</small></div></>}
        </div>
        <div className="av-checkin-status">
          <span className={`av-checkin-status-icon${busy ? ' is-checking' : ''}`} />
          <div><strong>Face check</strong><small>{busy ? 'Checking your face…' : cameraReady ? 'Ready to verify your presence' : 'Waiting for camera'}</small></div>
        </div>
        {error && <p className="av-error">{error}</p>}
        <p className="av-checkin-manual"><Icon name="file" size={17} /> Phone issue? Ask your faculty or Warden to mark you manually.</p>
        <button className="av-primary" disabled={busy || !cameraReady} onClick={checkIn}>
          {busy ? 'Verifying…' : 'Verify and broadcast attendance'}
        </button>
        <p className="av-footnote">{isIos
          ? 'The compressed live frame is sent for server-side 1:1 verification; the server then issues a one-time BLE token.'
          : 'The compressed live frame is sent for 1:1 verification and discarded after processing.'}</p>
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
      const blePublicKey = Capacitor.getPlatform() === 'android'
        ? await getBleKeyAgreementPublicKey()
        : undefined;
      const enrollment = await requestJson(apiUrl, '/device/enrollment/complete', {
        method: 'POST',
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          credential: encodeCredential(credential),
          reference_image_base64: referenceImage,
          ble_public_key: blePublicKey
        })
      });
      if (enrollment.reverse_ble_enabled) await installBleHmacKey(enrollment);
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
        <p className="av-kicker">STUDENT ONBOARDING-APPROVED ENROLLMENT</p>
        <h2 id="av-enroll-title">Bind this device</h2>
        <div className="av-camera"><video ref={videoRef} autoPlay playsInline muted /></div>
        {error && <p className="av-error">{error}</p>}
        <button className="av-primary" disabled={busy || !ready} onClick={enroll}>{busy ? 'Securing device...' : 'Create passkey and face reference'}</button>
        <p className="av-footnote">Only one approved device is active. Ask Student Onboarding Staff to reset the lock when changing phones.</p>
      </section>
    </div>
  );
}

export function StudentAttendance({ apiUrl, modules, user, onHome }) {
  const [tab, setTab] = useState(modules?.class_attendance ? 'class' : 'hostel');
  const [summary, setSummary] = useState([]);
  const [hostel, setHostel] = useState(null);
  const [openSessions, setOpenSessions] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [now, setNow] = useState(() => Date.now());
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
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const availableTabs = [
    ...(modules?.class_attendance ? [{ id: 'class', label: 'Class Attendance' }] : []),
    ...(modules?.hostel_attendance ? [{ id: 'hostel', label: 'Hostel Attendance' }] : [])
  ];
  const enrollmentSeconds = deviceStatus?.enrollment_window_expires_at
    ? Math.max(0, Math.ceil((new Date(deviceStatus.enrollment_window_expires_at).getTime() - now) / 1000))
    : 0;
  const enrollmentCountdown = `${Math.floor(enrollmentSeconds / 60)}:${String(enrollmentSeconds % 60).padStart(2, '0')}`;
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
    <AttendanceShell title="Your attendance" tabs={availableTabs} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage} onHome={onHome}>
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
              <p>{enrollmentSeconds > 0
                ? `Your Student Onboarding-approved enrollment window is open for ${enrollmentCountdown}.`
                : 'Ask Student Onboarding Staff to open a timed device enrollment window.'}</p>
              {enrollmentSeconds > 0 && <button className="av-primary" onClick={() => setEnrolling(true)}>Enroll this device</button>}
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
          {!deviceStatus?.device_locked && enrollmentSeconds > 0 && (
            <button className="av-primary av-enroll-button" onClick={() => setEnrolling(true)}>Complete approved device enrollment</button>
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
      {checkIn && <AttendanceCheckIn apiUrl={apiUrl} session={checkIn} user={user} onClose={() => setCheckIn(null)} onDone={(result) => {
        setCheckIn(null);
        setMessage(result?.iosBleAdvertised
          ? 'iPhone BLE proof broadcast for 5 seconds; attendance is recorded when the ESP32 uploads its batch.'
          : 'Android BLE proof broadcast for 5 seconds; attendance is recorded when the ESP32 uploads its batch.');
        void refresh();
      }} />}
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

function AttendanceShell({ title, tabs, tab, setTab, children, error, message, setMessage, bottomTabs = false, onHome }) {
  return (
    <div className="av-root">
      <header className="av-heading">
        <span className="av-brand-mark">VO</span>
        <div><p className="av-kicker">VIDYUT OS</p><h1>{title}</h1></div>
        {onHome && <button type="button" className="av-home-button" onClick={onHome}>← Home</button>}
      </header>
      {tabs.length > 1 && <nav className={`av-tabs ${bottomTabs ? 'av-bottom-tabs' : ''}`} aria-label="Attendance sections">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>}
      {error && <p className="av-error">{error}</p>}
      {message && <button className="av-message" onClick={() => setMessage('')}>{message} ×</button>}
      {children}
    </div>
  );
}

function BeaconManager({ apiUrl, scope }) {
  const [beacons, setBeacons] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [form, setForm] = useState({ name: '', hostel_block: '', wing_name: '', min_rssi: -78 });
  const [wifiConfig, setWifiConfig] = useState(() => ({
    wifiSsid: localStorage.getItem('vidyut_esp32_wifi_ssid') || '',
    wifiPassword: localStorage.getItem('vidyut_esp32_wifi_password') || '',
    apiBaseUrl: localStorage.getItem('vidyut_esp32_api_base_url') || apiUrl,
    campusDomain: localStorage.getItem('vidyut_esp32_tenant_domain')
      || localStorage.getItem('vidyut_tenant_domain')
      || window.location.hostname
  }));
  const [provisioning, setProvisioning] = useState(null);
  const [serialBusy, setSerialBusy] = useState(false);
  const [serialStatus, setSerialStatus] = useState({ beaconId: '', message: '' });
  const [editingBeaconId, setEditingBeaconId] = useState('');
  const [editingBeaconName, setEditingBeaconName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch(`${apiUrl}/api/auth/me`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(extractErrorMessage(data, `Session request failed (${response.status}).`));
        const campusDomain = data.tenant?.primary_domain
          || data.user?.tenant?.primary_domain
          || data.user?.college?.primary_domain;
        if (typeof campusDomain === 'string' && campusDomain.trim() && active) {
          setWifiConfig((current) => ({ ...current, campusDomain: campusDomain.trim() }));
        }
      })
      .catch((sessionError) => {
        if (active) console.warn('Could not resolve the campus domain from the signed-in session:', sessionError);
      });
    return () => { active = false; };
  }, [apiUrl]);
  const load = useCallback(async () => setBeacons(await requestJson(apiUrl, `/beacons?scope=${scope}`)), [apiUrl, scope]);
  useEffect(() => { void load().catch((loadError) => setError(extractErrorMessage(loadError))); }, [load]);
  useEffect(() => {
    if (scope !== 'HOSTEL') return undefined;
    let active = true;
    apiFetch(`${apiUrl}/api/hostels/config`)
      .then(async (response) => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(extractErrorMessage(data, 'Could not load hostel wings.'));
        if (active) {
          setHostels(data);
          setForm((current) => ({
            ...current,
            hostel_block: current.hostel_block || data[0]?.name || '',
            wing_name: current.wing_name || data[0]?.wings?.[0] || ''
          }));
        }
      })
      .catch((loadError) => { if (active) setError(extractErrorMessage(loadError)); });
    return () => { active = false; };
  }, [apiUrl, scope]);
  const save = async (event) => {
    event.preventDefault();
    setError('');
    setProvisioning(null);
    try {
      const created = await requestJson(apiUrl, '/beacons', {
        method: 'POST',
        body: JSON.stringify({ ...form, scope, min_rssi: Number(form.min_rssi) })
      });
      setProvisioning(created);
      setForm((current) => ({ ...current, name: '', min_rssi: -78 }));
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
  const rotateKey = async (beacon) => {
    setError('');
    setProvisioning(null);
    try {
      const result = await requestJson(apiUrl, `/beacons/${encodeURIComponent(beacon.id)}/provision`, { method: 'POST' });
      setProvisioning({ ...beacon, ...result });
      await load();
    } catch (provisionError) { setError(extractErrorMessage(provisionError)); }
  };
  const saveProvisioningSettings = () => {
    setError('');
    const wifiSsid = wifiConfig.wifiSsid.trim();
    const wifiPassword = wifiConfig.wifiPassword;
    const apiBaseUrl = wifiConfig.apiBaseUrl.trim().replace(/\/+$/, '');
    const tenantDomain = wifiConfig.campusDomain.trim().toLowerCase();
    let parsedApiUrl;
    try {
      parsedApiUrl = new URL(apiBaseUrl);
    } catch {
      setError('Enter a valid HTTPS API base URL.');
      return null;
    }
    if (!wifiSsid || wifiSsid.length > 32 || wifiPassword.length > 64) {
      setError('Enter a Wi-Fi SSID (up to 32 characters) and a password of up to 64 characters.');
      return null;
    }
    if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.username || parsedApiUrl.password
        || (parsedApiUrl.pathname !== '/' && parsedApiUrl.pathname !== '')
        || parsedApiUrl.search || parsedApiUrl.hash) {
      setError('The API base URL must be an HTTPS origin without a path, query, or credentials.');
      return null;
    }
    if (!tenantDomain || /[/:?#@\s]/.test(tenantDomain)) {
      setError('The campus portal domain is unavailable. Sign in through the campus portal before provisioning.');
      return null;
    }
    try {
      localStorage.setItem('vidyut_esp32_wifi_ssid', wifiSsid);
      localStorage.setItem('vidyut_esp32_wifi_password', wifiPassword);
      localStorage.setItem('vidyut_esp32_api_base_url', apiBaseUrl);
      localStorage.setItem('vidyut_esp32_tenant_domain', tenantDomain);
      setWifiConfig((current) => ({ ...current, apiBaseUrl, campusDomain: tenantDomain }));
    } catch (storageError) {
      setError(`Could not save Wi-Fi settings in this browser: ${extractErrorMessage(storageError)}`);
      return null;
    }
    return { wifiSsid, wifiPassword, apiBaseUrl, tenantDomain };
  };
  const provisionViaUsb = async (beacon, knownProvisioning = provisioning) => {
    setError('');
    setSerialStatus({ beaconId: beacon.id, message: '' });
    if (!navigator.serial) {
      setSerialStatus({
        beaconId: beacon.id,
        message: 'Web Serial is unavailable. Open this portal in a supported Chromium browser over HTTPS to provision by USB.'
      });
      return;
    }
    const settings = saveProvisioningSettings();
    if (!settings) return;
    setSerialBusy(true);
    setSerialStatus({ beaconId: beacon.id, message: 'Connecting...' });
    let port;
    let reader;
    let writer;
    let timeoutId;
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      await new Promise((resolve) => window.setTimeout(resolve, 2000));

      let credentials = knownProvisioning?.id === beacon.id
        && knownProvisioning.provisioning_secret ? knownProvisioning : null;
      if (!credentials) {
        const rotated = await requestJson(apiUrl, `/beacons/${encodeURIComponent(beacon.id)}/provision`, { method: 'POST' });
        credentials = { ...beacon, ...rotated };
        setProvisioning(credentials);
        await load();
      }

      const beaconId = credentials.beacon_id || credentials.id;
      const signingSecret = credentials.provisioning_secret;
      if (!beaconId || !/^[0-9a-f]{64}$/i.test(signingSecret || '')) {
        throw new Error('The one-time beacon signing secret is missing or invalid. Rotate the beacon key and try again.');
      }
      const payload = {
        cmd: 'PROVISION',
        node_id: `node-${String(credentials.beacon_code || beacon.beacon_code || beaconId).toLowerCase()}`,
        beacon_id: beaconId,
        signing_secret: signingSecret,
        tenant_domain: settings.tenantDomain,
        wifi_ssid: settings.wifiSsid,
        wifi_password: settings.wifiPassword,
        api_base_url: settings.apiBaseUrl,
        root_ca_pem: ISRG_ROOT_X1
      };
      if (!port.readable || !port.writable) throw new Error('The selected serial port is not available.');
      reader = port.readable.getReader();
      writer = port.writable.getWriter();
      const serialResponsePromise = readSerialProvisioningResponse(reader);
      const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Timed out waiting for the ESP32 provisioning response.')), 20000);
      });
      const responsePromise = Promise.race([serialResponsePromise, timeoutPromise]);
      await writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
      const response = await responsePromise;
      if (response.beacon_id !== beaconId) throw new Error('The ESP32 confirmed a different beacon ID.');
      setSerialStatus({ beaconId: beacon.id, message: 'Provisioned & Rebooting' });
    } catch (provisionError) {
      setSerialStatus({
        beaconId: beacon.id,
        message: `USB provisioning failed: ${extractErrorMessage(provisionError)}`
      });
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (reader) {
        try {
          await reader.cancel();
        } catch (cleanupError) {
          console.error('Could not close the ESP32 serial reader cleanly.', cleanupError);
        }
        reader.releaseLock();
      }
      if (writer) writer.releaseLock();
      if (port?.readable || port?.writable) {
        try {
          await port.close();
        } catch (cleanupError) {
          console.error('Could not close the ESP32 serial port cleanly.', cleanupError);
        }
      }
      setSerialBusy(false);
    }
  };
  const renameBeacon = async (beacon) => {
    const name = editingBeaconName.trim();
    if (!name) {
      setError('Beacon display name is required.');
      return;
    }
    setError('');
    try {
      await requestJson(apiUrl, `/beacons/${encodeURIComponent(beacon.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...beacon, name })
      });
      setEditingBeaconId('');
      setEditingBeaconName('');
      await load();
    } catch (renameError) {
      setError(extractErrorMessage(renameError));
    }
  };
  const selectedHostel = hostels.find((hostel) => hostel.name === form.hostel_block);
  const updateHostel = (hostelName) => {
    const hostel = hostels.find((item) => item.name === hostelName);
    setForm((current) => ({
      ...current,
      hostel_block: hostelName,
      wing_name: hostel?.wings?.[0] || ''
    }));
  };
  return (
    <section className="av-panel">
      <h2>{scope === 'CLASS' ? 'Room Beacons' : 'Hostel Beacons'}</h2>
      <p className="av-subtitle">Beacon names are display labels in Vidyut OS. Renaming a label does not reflash the ESP32; its signed rotating ID stays linked to this record.</p>
      <p className="av-subtitle">ESP32 iBeacon IDs rotate every 30 seconds and are validated server-side. Rotation rejects stale captures, but not live BLE relays or cloning after a signing key is extracted from a physically accessed device.</p>
      {error && <p className="av-error">{error}</p>}
      <form className="av-form-grid" onSubmit={save}>
        <label>Display name<input required maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={scope === 'CLASS' ? 'Lecture Hall 1' : 'Gajjar · Wing A beacon 1'} /></label>
        {scope === 'HOSTEL' && <>
          <label>Hostel<select required value={form.hostel_block} onChange={(event) => updateHostel(event.target.value)}><option value="">Choose a hostel</option>{hostels.map((hostel) => <option key={hostel.hostel_id} value={hostel.name}>{hostel.name}</option>)}</select></label>
          <label>Wing<select required value={form.wing_name} onChange={(event) => setForm({ ...form, wing_name: event.target.value })}><option value="">Choose a wing</option>{(selectedHostel?.wings || []).map((wing) => <option key={wing} value={wing}>{wing}</option>)}</select></label>
        </>}
        <label>Minimum RSSI <b className="av-tabular">{form.min_rssi} dBm</b><input type="range" min="-85" max="-65" value={form.min_rssi} onChange={(event) => setForm({ ...form, min_rssi: event.target.value })} /></label>
        <button className="av-primary" disabled={scope === 'HOSTEL' && !form.wing_name}>Add and provision ESP32 beacon</button>
      </form>
      <div className="av-credentials av-provisioning-settings">
        <strong>USB provisioning network settings</strong>
        <p>Save the campus 2.4 GHz Wi-Fi, campus domain, and API settings once; they stay in this browser for future boards. The campus domain is pre-filled from your signed-in portal.</p>
        <div className="av-form-grid">
          <label>Campus 2.4 GHz Wi-Fi SSID<input maxLength="32" autoComplete="off" value={wifiConfig.wifiSsid} onChange={(event) => setWifiConfig({ ...wifiConfig, wifiSsid: event.target.value })} /></label>
          <label>Wi-Fi password<input type="password" maxLength="64" autoComplete="new-password" value={wifiConfig.wifiPassword} onChange={(event) => setWifiConfig({ ...wifiConfig, wifiPassword: event.target.value })} /></label>
          <label>Campus domain<input type="text" value={wifiConfig.campusDomain} onChange={(event) => setWifiConfig({ ...wifiConfig, campusDomain: event.target.value })} placeholder="campus.example.edu" /></label>
          <label>API base URL<input type="url" value={wifiConfig.apiBaseUrl} onChange={(event) => setWifiConfig({ ...wifiConfig, apiBaseUrl: event.target.value })} placeholder="https://api.example.edu" /></label>
          <button type="button" className="av-secondary" onClick={saveProvisioningSettings}>Save Wi-Fi settings</button>
        </div>
      </div>
      {provisioning?.provisioning_secret && (
        <div className="av-credentials" role="status">
          <strong>One-time ESP32 provisioning values</strong>
          <p>Vidyut OS stores only an encrypted copy and will never show this secret again. Provision the connected ESP32 now or keep this secret private for your records.</p>
          <div className="av-list-row"><span>Beacon code</span><code>{provisioning.beacon_code}</code></div>
          <div className="av-list-row"><span>Signing secret</span><code className="av-temp-password">{provisioning.provisioning_secret}</code></div>
          <button type="button" className="av-primary" disabled={serialBusy} onClick={() => provisionViaUsb(provisioning, provisioning)}>
            {serialBusy ? 'Connecting...' : 'Provision ESP32 via USB'}
          </button>
          {serialStatus.beaconId === provisioning.id && serialStatus.message && <p role="status">{serialStatus.message}</p>}
          <p className="av-subtitle">Keep the secret private and unique to this beacon. Rotate it here if the device is replaced or the secret is exposed.</p>
        </div>
      )}
      <div className="av-list">
        {beacons.map((beacon) => (
          <div className="av-list-row" key={beacon.id}>
            <div>
              {editingBeaconId === beacon.id
                ? <form className="av-inline-form" onSubmit={(event) => { event.preventDefault(); void renameBeacon(beacon); }}><label>Display name<input required maxLength="100" value={editingBeaconName} onChange={(event) => setEditingBeaconName(event.target.value)} /></label><button className="av-secondary">Save name</button></form>
                : <><strong>{beacon.name}</strong><small>{beacon.scope === 'HOSTEL' ? `${beacon.hostel_block} · ${beacon.wing_name} · ` : ''}Device code {beacon.beacon_code || 'not provisioned'}</small></>}
            </div>
            <label className="av-rssi-slider">Min {beacon.min_rssi} dBm<input type="range" min="-85" max="-65" value={beacon.min_rssi} onChange={(event) => updateRssi(beacon, event.target.value)} /></label>
            {!beacon.is_provisioned && <span className="av-status is-absent">Provisioning required</span>}
            <button type="button" className="av-secondary" onClick={() => { setEditingBeaconId(editingBeaconId === beacon.id ? '' : beacon.id); setEditingBeaconName(beacon.name); }}>Rename</button>
            <button className="av-secondary" onClick={() => rotateKey(beacon)}>{beacon.is_provisioned ? 'Rotate key' : 'Provision ESP32'}</button>
            <button type="button" className="av-secondary" disabled={serialBusy} onClick={() => provisionViaUsb(beacon)}>
              {serialBusy ? 'Connecting...' : 'Provision ESP32 via USB'}
            </button>
            {serialStatus.beaconId === beacon.id && serialStatus.message && <small role="status">{serialStatus.message}</small>}
            <button className="av-secondary" onClick={() => toggle(beacon)}>{beacon.is_active ? 'Deactivate' : 'Activate'}</button>
          </div>
        ))}
        {!beacons.length && <p className="av-empty">No beacons configured for this scope.</p>}
      </div>
    </section>
  );
}

function BeaconManagerPortal({ apiUrl, modules }) {
  const scopes = [
    ...(modules?.class_attendance ? ['CLASS'] : []),
    ...(modules?.hostel_attendance ? ['HOSTEL'] : [])
  ];
  return (
    <div className="av-root">
      <header className="av-heading">
        <span className="av-brand-mark">VO</span>
        <div><p className="av-kicker">VIDYUT OS</p><h1>Beacon management</h1></div>
      </header>
      {!scopes.length && <p className="av-empty">Beacon attendance modules are not enabled for this college.</p>}
      {scopes.map((scope) => <BeaconManager key={scope} apiUrl={apiUrl} scope={scope} />)}
    </div>
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
  const [selectedBeaconIds, setSelectedBeaconIds] = useState([]);
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
    setSelectedBeaconIds((current) => {
      const activeIds = beaconList.filter((beacon) => beacon.is_active && beacon.is_provisioned).map((beacon) => beacon.id);
      const retained = current.filter((id) => activeIds.includes(id));
      return retained.length ? retained : activeIds.slice(0, 1);
    });
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
        beacon_id: selectedBeaconIds[0],
        beacon_ids: selectedBeaconIds,
        duration_minutes: duration === 'manual' ? null : Number(duration)
      })
    }), 'Class session started for the selected division.');
  };
  const close = async (session) => {
    setError('');
    try {
      const result = await requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' });
      setMessage(result.report_queued
        ? 'Session closed. Downloading the attendance report; an email copy is also queued.'
        : 'Session closed. Downloading the attendance report.');
      try {
        await downloadPdf(
          apiUrl,
          `/reports/session/${encodeURIComponent(session.id)}.pdf`,
          `${localDateString()}-${(session.class_group || session.course_code || 'class').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-attendance.pdf`
        );
      } catch (downloadError) {
        setError(`Session closed, but its PDF could not be downloaded: ${extractErrorMessage(downloadError)}`);
      }
      await reload().catch((loadError) => setError(`Session closed, but the live roster could not refresh: ${extractErrorMessage(loadError)}`));
    } catch (closeError) {
      setError(extractErrorMessage(closeError));
    }
  };
  const override = async (session, item) => {
    const reason = window.prompt(`Audit reason for ${item.roll_no} (minimum 3 characters):`);
    if (!reason?.trim()) return;
    if (reason.trim().length < 3) {
      setError('Enter an audit reason of at least 3 characters.');
      return;
    }
    await run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/override`, {
      method: 'POST', body: JSON.stringify({ student_id: item.student_id, status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason })
    }), 'Attendance override recorded.');
  };
  const activeBeacons = beacons.filter((beacon) => beacon.is_active && beacon.is_provisioned);
  return (
    <AttendanceShell title="Faculty attendance" tabs={[
      { id: 'session', label: 'Class Sessions' },
      { id: 'courses', label: 'Subject Labels' },
      { id: 'reports', label: 'Reports' }
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
      {tab === 'session' && <section className={`av-panel${sessions.length ? ' av-live-container' : ''}`}>
        {sessions.length ? (
          <div className="av-live-session-stage">
            <div className="av-row-between">
              <div><h2>Attendance is live</h2><p className="av-subtitle">Monitor check-ins and record attendance manually when needed.</p></div>
              <StatusPill tone="live"><span className="av-live-dot" /> LIVE</StatusPill>
            </div>
            <SessionCards apiUrl={apiUrl} sessions={sessions} onClose={close} onOverride={override} />
          </div>
        ) : (
          <>
        <h2>Start classroom attendance</h2>
        <form className="av-form-grid" onSubmit={start}>
          <fieldset className="av-choice-field av-class-choice">
            <legend>Choose a class or division</legend>
            <div className="av-chip-list">
              {classGroups.map((group) => {
                const key = classGroupKey(group);
                return (
                  <Chip
                    key={key}
                    type="button"
                    active={activeGroup === key}
                    aria-pressed={activeGroup === key}
                    onClick={() => setActiveGroup(key)}
                  >
                    {group.department} · {group.division}
                  </Chip>
                );
              })}
            </div>
            {classGroups.find((group) => classGroupKey(group) === activeGroup) && (
              <p className="av-selection-detail">
                Year {classGroups.find((group) => classGroupKey(group) === activeGroup).year}
                {' · '}{classGroups.find((group) => classGroupKey(group) === activeGroup).student_count} students
              </p>
            )}
          </fieldset>
          <label>Subject label (optional)
            <select value={activeCourse} onChange={(event) => setActiveCourse(event.target.value)}>
              <option value="">No subject label</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.title}</option>)}
            </select>
          </label>
          <fieldset className="av-choice-field av-beacon-choice">
            <legend>Choose one or more classroom beacons</legend>
            <div className="av-beacon-grid">
              {activeBeacons.map((beacon) => (
                <button
                  type="button"
                  key={beacon.id}
                  className={`av-beacon-option${selectedBeaconIds.includes(beacon.id) ? ' is-selected' : ''}`}
                  aria-pressed={selectedBeaconIds.includes(beacon.id)}
                  onClick={() => setSelectedBeaconIds((current) => current.includes(beacon.id)
                    ? current.filter((id) => id !== beacon.id)
                    : [...current, beacon.id])}
                >
                  <span className="av-beacon-icon"><Icon name="map" /></span>
                  <span className="av-beacon-copy"><strong>{beacon.name}</strong><small>Classroom beacon</small></span>
                  <StatusPill tone={selectedBeaconIds.includes(beacon.id) ? 'success' : 'neutral'}>
                    {selectedBeaconIds.includes(beacon.id) ? 'Selected' : 'Available'}
                  </StatusPill>
                </button>
              ))}
            </div>
          </fieldset>
          <label>Attendance window
            <select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="2">2 minutes</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="manual">Stop manually</option>
            </select>
          </label>
          <Button className="av-start-button" type="submit" disabled={!activeGroup || !selectedBeaconIds.length}>
            <Icon name="attendance" /> Start attendance
          </Button>
        </form>
        {!classGroups.length && <p className="av-empty">Assign department, academic year, and division to student profiles in Student Onboarding before starting attendance.</p>}
        {!activeBeacons.length && <p className="av-empty">Register, provision, and activate a classroom beacon before starting attendance.</p>}
          </>
        )}
      </section>}
      {tab === 'reports' && <DailyReportsPanel apiUrl={apiUrl} scope="CLASS" />}
    </AttendanceShell>
  );
}

function SessionCards({ apiUrl, sessions, onClose, onOverride }) {
  const [auditRows, setAuditRows] = useState({});
  const [auditOpen, setAuditOpen] = useState({});
  const [auditLoading, setAuditLoading] = useState({});
  const [auditErrors, setAuditErrors] = useState({});
  const loadAudit = async (session) => {
    if (auditOpen[session.id]) {
      setAuditOpen((current) => ({ ...current, [session.id]: false }));
      return;
    }
    setAuditOpen((current) => ({ ...current, [session.id]: true }));
    if (auditRows[session.id]) return;
    setAuditLoading((current) => ({ ...current, [session.id]: true }));
    setAuditErrors((current) => ({ ...current, [session.id]: '' }));
    try {
      const rows = await requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/audit`);
      setAuditRows((current) => ({ ...current, [session.id]: rows }));
    } catch (loadError) {
      setAuditOpen((current) => ({ ...current, [session.id]: false }));
      setAuditErrors((current) => ({ ...current, [session.id]: extractErrorMessage(loadError) }));
    } finally {
      setAuditLoading((current) => ({ ...current, [session.id]: false }));
    }
  };
  return <div className="av-list">{sessions.map((session) => {
    const students = session.students || [];
    const presentCount = session.present_count ?? students.filter((student) => student.status === 'PRESENT').length;
    const absentStudents = students.filter((student) => student.status !== 'PRESENT');
    const progress = students.length ? Math.round((presentCount / students.length) * 100) : 0;
    return (
      <article className="av-panel av-session-card av-live-session" key={session.id}>
        <div className="av-live-session-head">
          <div>
            <StatusPill tone="live"><span className="av-live-dot" /> LIVE NOW</StatusPill>
            <p className="av-kicker">{session.scope} · {session.course_code || session.wing_name}{session.class_group ? ` · ${session.class_group}` : ''}{session.faculty_name ? ` · ${session.faculty_name}` : ''}</p>
            <h3>{session.course_title || session.course_code || 'Class attendance'}</h3>
          </div>
          <div className="av-live-count"><strong>{presentCount}</strong><span> / {students.length} present</span></div>
        </div>
        <ProgressBar value={progress} label={`Attendance ${progress}%`} className="av-live-progress" />
        <div className="av-live-session-meta">
          <span><Icon name="users" size={16} /> {session.class_group || 'Selected class'}</span>
          <span><Icon name="clock" size={16} /> Live attendance session</span>
        </div>
        <div className="av-roster-section">
          <div className="av-row-between"><div><h4>Manual attendance</h4><p className="av-subtitle">For phone or battery issues, mark the student present and enter a reason. Every change is audited.</p></div><StatusPill tone="warning">{absentStudents.length} absent</StatusPill></div>
          <div className="av-roster">
            {absentStudents.map((item) => (
              <div className="av-roster-row" key={`${session.id}-${item.roll_no}`}>
                <span className="av-tabular">{item.roll_no}</span>
                <span>{item.student_name || item.student_id || 'Not linked'}</span>
                <StatusPill tone="warning">Absent</StatusPill>
                {item.student_id && <button className="av-text-button" onClick={() => onOverride(session, item)}>Manual mark present</button>}
              </div>
            ))}
            {!absentStudents.length && <p className="av-empty">All students are marked present.</p>}
          </div>
          <button type="button" className="av-secondary" onClick={() => void loadAudit(session)}>
            {auditLoading[session.id] ? 'Loading audit…' : auditOpen[session.id] ? 'Hide audit trail' : 'View audit trail'}
          </button>
          {auditErrors[session.id] && <p className="av-error" role="alert">{auditErrors[session.id]}</p>}
          {auditOpen[session.id] && (
            <div className="av-history-list" aria-live="polite">
              {(auditRows[session.id] || []).map((entry) => (
                <div className="av-history-row" key={entry.id}>
                  <span><strong>{entry.roll_no || entry.student_id}</strong> · {entry.previous_status || 'Unmarked'} → {entry.new_status}</span>
                  <span>{entry.actor_name || entry.actor_id}</span>
                  <small>{entry.reason} · {new Date(entry.created_at).toLocaleString()}</small>
                </div>
              ))}
              {auditRows[session.id]?.length === 0 && <p className="av-empty">No manual attendance changes have been recorded.</p>}
            </div>
          )}
        </div>
        <div className="av-live-session-actions">
          <Button variant="outline" type="button" onClick={() => onClose(session)}>
            <Icon name="file" /> End session & download PDF
          </Button>
        </div>
      </article>
    );
  })}{!sessions.length && <p className="av-empty">No active session.</p>}</div>;
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
  const [auditSession, setAuditSession] = useState('');
  const [auditRows, setAuditRows] = useState([]);
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
  const viewAudit = async (report) => {
    if (auditSession === report.session_id) {
      setAuditSession('');
      setAuditRows([]);
      return;
    }
    setError('');
    try {
      const rows = await requestJson(apiUrl, `/sessions/${encodeURIComponent(report.session_id)}/audit`);
      setAuditRows(rows);
      setAuditSession(report.session_id);
    } catch (auditError) {
      setError(extractErrorMessage(auditError));
    }
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
            <div key={report.session_id}>
              <div className="av-list-row">
                <div><strong>{report.title}</strong><small>{report.date} · {report.status} · {report.present}/{report.total} present · {report.absent} absent</small></div>
                <button type="button" className="av-secondary" onClick={() => void download(report)}>Download PDF</button>
                {report.audit_entries > 0 && <button type="button" className="av-secondary" onClick={() => void viewAudit(report)}>{auditSession === report.session_id ? 'Hide audit' : `Audit (${report.audit_entries})`}</button>}
              </div>
              {auditSession === report.session_id && (
                <div className="av-history-list">
                  {auditRows.map((entry) => (
                    <div className="av-history-row" key={entry.id}>
                      <span><strong>{entry.roll_no || entry.student_id}</strong> · {entry.previous_status || 'Unmarked'} → {entry.new_status}</span>
                      <span>{entry.actor_name || entry.actor_id}</span>
                      <small>{entry.reason} · {new Date(entry.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                  {!auditRows.length && <p className="av-empty">No manual attendance changes have been recorded.</p>}
                </div>
              )}
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
      <header className="av-heading"><span className="av-brand-mark">VO</span><div><p className="av-kicker">VIDYUT OS</p><h1>Attendance reports</h1></div></header>
      {tabs.length > 1 && <nav className="av-tabs" aria-label="Attendance report scopes">{tabs.map((item) => <button key={item.id} className={scope === item.id ? 'is-active' : ''} onClick={() => setScope(item.id)}>{item.label}</button>)}</nav>}
      <DailyReportsPanel apiUrl={apiUrl} scope={scope} showEmailSettings={false} />
    </div>
  );
}

export function WardenAttendance({ apiUrl, modules, user }) {
  const [tab, setTab] = useState('rollcall');
  const [beacons, setBeacons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [hostels, setHostels] = useState([]);
  const assignedHostel = String(user?.hostel_block || '').trim();
  const [hostelBlock, setHostelBlock] = useState(assignedHostel);
  const [wing, setWing] = useState('');
  const [selectedBeaconIds, setSelectedBeaconIds] = useState([]);
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
    let active = true;
    apiFetch(`${apiUrl}/api/hostels/config`)
      .then(async (response) => {
        const data = await response.json().catch(() => []);
        if (!response.ok) throw new Error(extractErrorMessage(data, 'Could not load configured hostel wings.'));
        if (!active) return;
        setHostels(data);
        const initialHostel = assignedHostel && assignedHostel.toLowerCase() !== 'all'
          ? assignedHostel
          : data[0]?.name || '';
        setHostelBlock((current) => current || initialHostel);
        setWing((current) => current || data.find((item) => item.name === initialHostel)?.wings?.[0] || '');
      })
      .catch((loadError) => { if (active) setError(extractErrorMessage(loadError)); });
    return () => { active = false; };
  }, [apiUrl, assignedHostel]);
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
    if (!selectedBeaconIds.length) {
      setError('Choose at least one active beacon for this hostel and wing.');
      return;
    }
    return run(() => requestJson(apiUrl, '/sessions', {
      method: 'POST',
      body: JSON.stringify({
        scope: 'HOSTEL',
        hostel_block: hostelBlock,
        wing_name: wing,
        beacon_id: selectedBeaconIds[0],
        beacon_ids: selectedBeaconIds,
        duration_minutes: duration === 'manual' ? null : Number(duration)
      })
    }), `${wing === 'ALL' ? 'All-wing' : 'Wing'} roll call started.`);
  };
  const close = async (session) => {
    setError('');
    try {
      const result = await requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/close`, { method: 'POST' });
      setMessage(result.report_queued
        ? 'Roll call closed. Downloading the attendance report; an email copy is also queued.'
        : 'Roll call closed. Downloading the attendance report.');
      try {
        await downloadPdf(
          apiUrl,
          `/reports/session/${encodeURIComponent(session.id)}.pdf`,
          `${localDateString()}-${(session.wing_name || 'hostel-roll-call').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-attendance.pdf`
        );
      } catch (downloadError) {
        setError(`Roll call closed, but its PDF could not be downloaded: ${extractErrorMessage(downloadError)}`);
      }
      await reload().catch((loadError) => setError(extractErrorMessage(loadError)));
    } catch (closeError) {
      setError(extractErrorMessage(closeError));
    }
  };
  const override = async (session, item) => {
    const reason = window.prompt(`Audit reason for ${item.roll_no} (minimum 3 characters):`);
    if (!reason?.trim()) return;
    if (reason.trim().length < 3) {
      setError('Enter an audit reason of at least 3 characters.');
      return;
    }
    await run(() => requestJson(apiUrl, `/sessions/${encodeURIComponent(session.id)}/override`, { method: 'POST', body: JSON.stringify({ student_id: item.student_id, status: item.status === 'PRESENT' ? 'ABSENT' : 'PRESENT', reason }) }), 'Roll-call override recorded.');
  };
  const tabs = [
    ...(modules?.hostel_attendance ? [{ id: 'rollcall', label: 'Wing Roll Call' }] : []),
    ...(modules?.hostel_attendance ? [{ id: 'reports', label: 'Reports' }] : [])
  ];
  const selectedHostel = hostels.find((item) => item.name === hostelBlock);
  const availableBeacons = beacons.filter((beacon) => (
    beacon.is_active
    && beacon.is_provisioned
    && beacon.hostel_block?.toLowerCase() === hostelBlock.toLowerCase()
    && (wing.toUpperCase() === 'ALL' || beacon.wing_name?.toLowerCase() === wing.toLowerCase() || beacon.wing_name?.toUpperCase() === 'ALL')
  ));
  const updateWing = (value) => {
    setWing(value);
    setSelectedBeaconIds([]);
  };
  const toggleBeaconSelection = (beaconId) => {
    setSelectedBeaconIds((current) => current.includes(beaconId)
      ? current.filter((id) => id !== beaconId)
      : [...current, beaconId]);
  };
  return (
    <AttendanceShell title="Warden attendance" tabs={tabs} tab={tab} setTab={setTab} error={error} message={message} setMessage={setMessage}>
      {tab === 'rollcall' && <section className={`av-panel${sessions.length ? ' av-live-container' : ''}`}>
        {sessions.length ? (
          <div className="av-live-session-stage">
            <div className="av-row-between">
              <div><h2>Wing roll call is live</h2><p className="av-subtitle">Record a manual check-in only if a resident cannot use their phone.</p></div>
              <StatusPill tone="live"><span className="av-live-dot" /> LIVE</StatusPill>
            </div>
            <SessionCards sessions={sessions} onClose={close} onOverride={override} />
          </div>
        ) : (
          <>
        <h2>Open hostel roll call</h2>
        <p className="av-subtitle">Student Onboarding maintains hostel and wing assignments. Start one wing or all wings; multi-wing roll calls can use multiple provisioned beacons.</p>
        <form className="av-form-grid" onSubmit={start}>
          <label>Hostel<select required value={hostelBlock} onChange={(event) => { setHostelBlock(event.target.value); setWing(''); setSelectedBeaconIds([]); }} disabled={assignedHostel && assignedHostel.toLowerCase() !== 'all'}><option value="">Choose hostel</option>{hostels.map((hostel) => <option key={hostel.hostel_id} value={hostel.name}>{hostel.name}</option>)}</select></label>
          <label>Wing<select required value={wing} onChange={(event) => updateWing(event.target.value)}><option value="">Choose wing</option>{selectedHostel?.wings?.map((item) => <option key={item} value={item}>{item}</option>)}<option value="ALL">All wings</option></select></label>
          <label>Session duration<select value={duration} onChange={(event) => setDuration(event.target.value)}><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="5">5 minutes</option><option value="manual">Manual stop</option></select></label>
          <fieldset className="av-choice-field">
            <legend>Active beacon(s) for this selection</legend>
            {availableBeacons.map((beacon) => (
              <label className="av-beacon-option" key={beacon.id}>
                <input type="checkbox" checked={selectedBeaconIds.includes(beacon.id)} onChange={() => toggleBeaconSelection(beacon.id)} />
                <span><strong>{beacon.name}</strong><small>{beacon.wing_name} · code {beacon.beacon_code}</small></span>
              </label>
            ))}
            {!availableBeacons.length && <p className="av-empty">No active, provisioned beacon matches this hostel and wing. Ask the Beacon Manager to configure one.</p>}
          </fieldset>
          <button className="av-primary" disabled={!hostelBlock || !wing || !selectedBeaconIds.length}>Start roll call</button>
        </form>
          </>
        )}
      </section>}
      {tab === 'reports' && <DailyReportsPanel apiUrl={apiUrl} scope="HOSTEL" />}
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
  if (user?.role === 'Warden') return <WardenAttendance apiUrl={apiUrl} modules={modules} user={user} />;
  if (user?.role === 'Dean') return <DeanAttendance apiUrl={apiUrl} user={user} />;
  if (user?.role === 'BeaconManager') return <BeaconManagerPortal apiUrl={apiUrl} modules={modules} />;
  return <div className="av-root"><p className="av-empty">Attendance tools are not available for this account.</p></div>;
}