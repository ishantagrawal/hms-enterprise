import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { extractErrorMessage } from '../utils/errorParser.ts';
import { Button, Chip, Icon, Sidebar, StatTile, StatusPill, TabBar } from './ui/DesignSystem';

const emptyForm = {
  roll_no: '',
  full_name: '',
  department: '',
  year: '',
  division: '',
  hostel_block: '',
  wing: '',
  room: '',
  phone: '',
  email: '',
  guardian_phone: ''
};

async function readJson(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(extractErrorMessage(data, fallback));
  }
  return data;
}

export default function StudentOnboardingPortal({ apiUrl, user, modules = {}, collegeName = 'Vidyut OS' }) {
  const [page, setPage] = useState('students');
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState('all');
  const [resetRequests, setResetRequests] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMoreStudents, setHasMoreStudents] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceAction, setDeviceAction] = useState('');
  const [yearRolloverPreview, setYearRolloverPreview] = useState(null);
  const [yearRolloverLoading, setYearRolloverLoading] = useState(false);
  const [yearRolloverSaving, setYearRolloverSaving] = useState(false);
  const [rolloverAcademicYear, setRolloverAcademicYear] = useState('');
  const selectedStudent = students.find((student) => student.user_id === selectedStudentId) || students[0] || null;

  const loadStudents = useCallback(async (search = '', nextOffset = 0) => {
    const response = await apiFetch(
      `${apiUrl}/api/onboarding/students?q=${encodeURIComponent(search)}&limit=101&offset=${nextOffset}`
    );
    const data = await readJson(response, 'Could not load student accounts.');
    setStudents(data.slice(0, 100));
    setOffset(nextOffset);
    setHasMoreStudents(data.length > 100);
  }, [apiUrl]);

  const loadResetRequests = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/api/onboarding/password-reset-requests`);
    setResetRequests(await readJson(response, 'Could not load password reset requests.'));
  }, [apiUrl]);

  const loadYearRolloverPreview = useCallback(async () => {
    const response = await apiFetch(`${apiUrl}/api/onboarding/year-rollover/preview`);
    setYearRolloverPreview(await readJson(response, 'Could not load the year rollover preview.'));
  }, [apiUrl]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStudents(), loadResetRequests()])
      .catch((loadError) => setError(extractErrorMessage(loadError)))
      .finally(() => setLoading(false));
  }, [loadStudents, loadResetRequests]);

  useEffect(() => {
    if (!students.some((student) => student.user_id === selectedStudentId)) {
      setSelectedStudentId(students[0]?.user_id || '');
    }
  }, [students, selectedStudentId]);

  useEffect(() => {
    if (page !== 'year_rollover') return;
    setYearRolloverLoading(true);
    loadYearRolloverPreview()
      .catch((loadError) => setError(extractErrorMessage(loadError)))
      .finally(() => setYearRolloverLoading(false));
  }, [page, loadYearRolloverPreview]);

  const createStudent = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setCredentials([]);
    setLoading(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/onboarding/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await readJson(response, 'Could not create the student account.');
      setCredentials(data.account?.temporary_password ? [data.account] : []);
      setMessage(data.account?.temporary_password
        ? 'Student account is ready. Share this one-time password securely.'
        : 'Student details updated. The existing password was not changed.');
      setForm(emptyForm);
      await loadStudents(query, offset);
    } catch (createError) {
      setError(extractErrorMessage(createError));
    } finally {
      setLoading(false);
    }
  };

  const importCsv = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const file = formElement.elements.studentsCsv.files[0];
    if (!file) return;
    setError('');
    setMessage('');
    setCredentials([]);
    setLoading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await apiFetch(`${apiUrl}/api/onboarding/students/csv`, { method: 'POST', body });
      const data = await readJson(response, 'Could not import student accounts.');
      const issued = (data.accounts || []).filter((item) => item.temporary_password);
      setCredentials(issued);
      setMessage(`${data.accounts?.length || 0} student records processed; ${issued.length} temporary passwords issued.`);
      formElement.reset();
      await loadStudents(query, offset);
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (student) => {
    setError('');
    setMessage('');
    setCredentials([]);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/onboarding/students/${encodeURIComponent(student.user_id)}/password`,
        { method: 'PUT' }
      );
      const data = await readJson(response, 'Could not reset the student password.');
      setCredentials([{
        user_id: data.user_id,
        full_name: student.full_name,
        temporary_password: data.temporary_password
      }]);
      setMessage('One-time password generated. Share it securely; the student must change it at first sign-in.');
      await loadStudents(query, offset);
    } catch (resetError) {
      setError(extractErrorMessage(resetError));
    }
  };

  const issueRequestedPassword = async (resetRequest) => {
    setError('');
    setMessage('');
    setCredentials([]);
    try {
      const response = await apiFetch(
        `${apiUrl}/api/onboarding/password-reset-requests/${encodeURIComponent(resetRequest.request_id)}/issue`,
        { method: 'POST' }
      );
      const data = await readJson(response, 'Could not issue a temporary password.');
      setCredentials([{
        user_id: data.user_id,
        full_name: resetRequest.full_name,
        temporary_password: data.temporary_password
      }]);
      setMessage('One-time password issued. Share it privately; it is shown only once and must be changed at sign-in.');
      await Promise.all([loadStudents(query, offset), loadResetRequests()]);
    } catch (issueError) {
      setError(extractErrorMessage(issueError));
    }
  };

  const applyYearRollover = async (event) => {
    event.preventDefault();
    if (yearRolloverSaving || !rolloverAcademicYear.trim()) return;
    const counts = yearRolloverPreview?.counts || {};
    const movingCount = Number(counts.year_1 || 0) + Number(counts.year_2 || 0) + Number(counts.year_3 || 0);
    if (!window.confirm(`Promote ${movingCount} students for academic year ${rolloverAcademicYear.trim()}? Numeric Years 1–3 move up one year. Year 4 and other values remain unchanged.`)) return;
    setError('');
    setMessage('');
    setYearRolloverSaving(true);
    try {
      const response = await apiFetch(`${apiUrl}/api/onboarding/year-rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academic_year: rolloverAcademicYear.trim() })
      });
      const data = await readJson(response, 'Could not apply the year rollover.');
      setMessage(`${data.promoted_total} students promoted for ${data.academic_year}. Year 4 and other year values were left unchanged.`);
      try {
        await Promise.all([loadYearRolloverPreview(), loadStudents(query, offset)]);
      } catch (refreshError) {
        setError(`Rollover completed, but the latest directory or preview could not be refreshed: ${extractErrorMessage(refreshError)}`);
      }
    } catch (rolloverError) {
      setError(extractErrorMessage(rolloverError));
    } finally {
      setYearRolloverSaving(false);
    }
  };

  const manageDevice = async (student, action) => {
    const key = `${student.user_id}:${action}`;
    setDeviceAction(key);
    setError('');
    setMessage('');
    try {
      const url = action === 'open'
        ? `${apiUrl}/api/attendance-v2/device/enrollment/open`
        : `${apiUrl}/api/attendance-v2/device/reset/${encodeURIComponent(student.user_id)}`;
      const response = await apiFetch(url, {
        method: 'POST',
        ...(action === 'open'
          ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.user_id, duration_seconds: 120 })
          }
          : {})
      });
      await readJson(response, 'Could not update the student device lock.');
      setMessage(action === 'open'
        ? `Two-minute device enrollment opened for ${student.user_id}.`
        : `Device lock reset for ${student.user_id}.`);
    } catch (deviceError) {
      setError(extractErrorMessage(deviceError));
    } finally {
      setDeviceAction('');
    }
  };

  const downloadCredentials = () => {
    if (!credentials.length) return;
    const csv = [
      'username,name,temporary_password',
      ...credentials.map((item) => [
        item.user_id,
        item.full_name,
        item.temporary_password
      ].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'temporary-student-credentials.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const search = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await loadStudents(query, 0);
    } catch (searchError) {
      setError(extractErrorMessage(searchError));
    }
  };

  const editSelectedStudent = () => {
    if (!selectedStudent) return;
    setForm({
      roll_no: selectedStudent.user_id || '',
      full_name: selectedStudent.full_name || '',
      department: selectedStudent.department || '',
      year: selectedStudent.year || '',
      division: selectedStudent.division || '',
      hostel_block: selectedStudent.hostel_block || '',
      wing: selectedStudent.wing || '',
      room: selectedStudent.room || '',
      phone: selectedStudent.phone || '',
      email: selectedStudent.email || '',
      guardian_phone: selectedStudent.guardian_phone || ''
    });
    setPage('add');
  };

  const groupFilters = [...new Set(students.map((student) => (
    student.department && student.division
      ? `${student.department}|${student.year || ''}|${student.division}`
      : ''
  )).filter(Boolean))].slice(0, 6);
  const filterOptions = [
    { id: 'all', label: 'All students' },
    { id: 'hostellers', label: 'Hostellers' },
    { id: 'day-scholars', label: 'Day scholars' },
    ...groupFilters.map((key) => {
      const [department, year, division] = key.split('|');
      return { id: `group:${key}`, key, label: `${department} · ${division}${year ? ` · Y${year}` : ''}` };
    })
  ];
  const visibleStudents = students.filter((student) => {
    if (directoryFilter === 'hostellers') return Boolean(student.hostel_block) && student.hostel_block !== 'Day Scholar';
    if (directoryFilter === 'day-scholars') return student.hostel_block === 'Day Scholar';
    if (directoryFilter.startsWith('group:')) {
      return `${student.department}|${student.year || ''}|${student.division}` === directoryFilter.slice(6);
    }
    return true;
  });
  const collegeInitials = collegeName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const onboardingNavItems = [
    { id: 'students', label: 'Student directory', icon: 'users', count: students.length },
    { id: 'add', label: 'Add or import students', icon: 'arrow' },
    { id: 'year_rollover', label: 'Year rollover', icon: 'calendar' },
    { id: 'requests', label: 'Password requests', icon: 'lock', count: resetRequests.length },
    ...((modules.class_attendance || modules.hostel_attendance) ? [{ id: 'devices', label: 'Device access', icon: 'shield' }] : [])
  ];

  return (
    <div className="av-onboarding-layout">
      <Sidebar
        title="Onboarding desk"
        brand={{ name: collegeName, initials: collegeInitials }}
        items={onboardingNavItems}
        active={page}
        onChange={setPage}
        className="av-onboarding-sidebar"
      />
      <main className="av-root av-onboarding-content">
        <header className="av-onboarding-header">
          <div>
            <p className="av-kicker">STUDENT ONBOARDING</p>
            <h1>{page === 'students' ? 'Student directory' : page === 'add' ? 'Add students' : page === 'requests' ? 'Password requests' : page === 'year_rollover' ? 'Year rollover' : 'Device access'}</h1>
            <p>Signed in as {user.full_name}. Student passwords are never displayed after creation; one-time temporary passwords can be shared securely.</p>
          </div>
          {page === 'students' && <Button type="button" onClick={() => { setForm(emptyForm); setPage('add'); }}><Icon name="arrow" /> Add student</Button>}
        </header>

        <div className="av-onboarding-stats">
          <StatTile label="Students on this page" value={students.length} detail="Directory results" />
          <StatTile label="Password requests" value={resetRequests.length} detail="Waiting for action" tone={resetRequests.length ? 'warning' : 'default'} />
          <StatTile label="One-time credentials" value={credentials.length} detail="Available to hand off now" />
        </div>

        {error && <div className="av-error" role="alert">{error}</div>}
        {message && <div className="av-message" role="status">{message}</div>}

        {credentials.length > 0 && (
          <section className="av-panel av-credentials-panel" aria-live="polite">
            <div className="av-row-between">
              <div><h2>One-time credentials</h2><p>These temporary passwords are shown only now. Share them securely; first sign-in requires a password change.</p></div>
              <button type="button" className="av-secondary" onClick={downloadCredentials}>Download credentials CSV</button>
            </div>
            <div className="av-list">
              {credentials.map((item) => (
                <div className="av-list-row" key={item.user_id}>
                  <strong className="av-tabular">{item.user_id}</strong>
                  <span>{item.full_name}</span>
                  <code>{item.temporary_password}</code>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === 'students' && (
          <div className="av-directory-layout">
            <section className="av-panel av-directory-panel">
              <div className="av-row-between av-directory-tools">
                <div><h2>Students</h2><p className="av-subtitle">Search and filter the college directory.</p></div>
                <form className="av-inline-form" onSubmit={search}>
                  <input aria-label="Search students" placeholder="Search roll no., name, class, hostel…" value={query} onChange={(event) => setQuery(event.target.value)} />
                  <button className="av-secondary"><Icon name="search" size={16} /> Search</button>
                </form>
              </div>
              <div className="av-filter-list" aria-label="Filter student directory">
                {filterOptions.map((option) => (
                  <Chip key={option.id} type="button" active={directoryFilter === option.id} onClick={() => setDirectoryFilter(option.id)}>
                    {option.label}
                  </Chip>
                ))}
              </div>
              <div className="av-student-table-wrap">
                <table className="av-student-table">
                  <thead><tr><th>Student</th><th>Class</th><th>Residence</th><th>Account</th></tr></thead>
                  <tbody>
                    {visibleStudents.map((student) => (
                      <tr
                        key={student.user_id}
                        className={selectedStudent?.user_id === student.user_id ? 'is-selected' : ''}
                      >
                        <td>
                          <button className="av-student-select" type="button" onClick={() => setSelectedStudentId(student.user_id)}>
                            <strong>{student.full_name}</strong><small>{student.user_id}</small>
                          </button>
                        </td>
                        <td>{student.department || '—'} · Y{student.year || '—'} · {student.division || '—'}</td>
                        <td>{student.hostel_block === 'Day Scholar' ? 'Day scholar' : `${student.hostel_block || 'Not set'}${student.wing ? ` · ${student.wing}` : ''}`}</td>
                        <td><StatusPill tone={!student.has_password || student.password_reset_required ? 'warning' : 'success'}>{!student.has_password ? 'Password needed' : student.password_reset_required ? 'Must change' : 'Active'}</StatusPill></td>
                      </tr>
                    ))}
                    {!visibleStudents.length && <tr><td colSpan="4"><p className="av-empty">{loading ? 'Loading student accounts…' : 'No matching student accounts.'}</p></td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="av-row-between av-pagination">
                <button type="button" className="av-secondary" disabled={offset === 0 || loading} onClick={() => loadStudents(query, Math.max(0, offset - 100)).catch((loadError) => setError(extractErrorMessage(loadError)))}>Previous 100</button>
                <span className="av-subtitle">Showing {students.length ? offset + 1 : 0}–{offset + students.length}</span>
                <button type="button" className="av-secondary" disabled={!hasMoreStudents || loading} onClick={() => loadStudents(query, offset + 100).catch((loadError) => setError(extractErrorMessage(loadError)))}>Next 100</button>
              </div>
            </section>

            <aside className="av-panel av-student-detail">
              {selectedStudent ? (
                <>
                  <div className="av-student-detail-top">
                    <span className="av-student-avatar">{selectedStudent.full_name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ST'}</span>
                    <StatusPill tone={!selectedStudent.has_password || selectedStudent.password_reset_required ? 'warning' : 'success'}>{!selectedStudent.has_password ? 'Password needed' : selectedStudent.password_reset_required ? 'Must change password' : 'Account active'}</StatusPill>
                  </div>
                  <h2>{selectedStudent.full_name}</h2>
                  <p className="av-student-id">{selectedStudent.user_id}</p>
                  <div className="av-student-details">
                    <div><span>Department</span><strong>{selectedStudent.department || 'Not assigned'}</strong></div>
                    <div><span>Year / division</span><strong>Year {selectedStudent.year || '—'} · {selectedStudent.division || '—'}</strong></div>
                    <div><span>Hostel</span><strong>{selectedStudent.hostel_block || 'Not assigned'}</strong></div>
                    <div><span>Wing / room</span><strong>{selectedStudent.wing || '—'} · {selectedStudent.room || '—'}</strong></div>
                    <div><span>Phone</span><strong>{selectedStudent.phone || 'Not added'}</strong></div>
                  </div>
                  <div className="av-student-detail-actions">
                    <Button variant="outline" type="button" onClick={editSelectedStudent}>Edit student details</Button>
                    <Button type="button" onClick={() => resetPassword(selectedStudent)}><Icon name="lock" /> Issue temporary password</Button>
                    {(modules.class_attendance || modules.hostel_attendance) && (
                      <>
                        <Button variant="outline" type="button" disabled={Boolean(deviceAction)} onClick={() => manageDevice(selectedStudent, 'open')}>
                          {deviceAction === `${selectedStudent.user_id}:open` ? 'Opening 2-minute window…' : 'Open 2-minute device enrollment'}
                        </Button>
                        <Button variant="outline" type="button" disabled={Boolean(deviceAction)} onClick={() => manageDevice(selectedStudent, 'reset')}>
                          {deviceAction === `${selectedStudent.user_id}:reset` ? 'Resetting device…' : 'Reset device lock'}
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="av-footnote">Passwords changed by students cannot be viewed. A reset creates a new one-time password.</p>
                </>
              ) : <p className="av-empty">Select a student to view their details.</p>}
            </aside>
          </div>
        )}

        {page === 'requests' && (
          <section className="av-panel">
            <div className="av-row-between">
              <div><h2>Password reset requests</h2><p className="av-subtitle">Issue a one-time password for students who cannot sign in.</p></div>
              <button type="button" className="av-secondary" onClick={() => loadResetRequests().catch((loadError) => setError(extractErrorMessage(loadError)))}>Refresh requests</button>
            </div>
            <div className="av-list">
              {resetRequests.map((item) => (
                <div className="av-list-row av-reset-request" key={item.request_id}>
                  <div><strong className="av-tabular">{item.student_id} · {item.full_name || 'Student'}</strong><small>{item.department || 'Department not set'} · Year {item.year || '—'} · Division {item.division || '—'}</small></div>
                  <StatusPill tone="warning">{new Date(item.created_at).toLocaleDateString()}</StatusPill>
                  <Button type="button" onClick={() => issueRequestedPassword(item)}>Issue temporary password</Button>
                </div>
              ))}
              {!resetRequests.length && <p className="av-empty">No pending password reset requests.</p>}
            </div>
          </section>
        )}

        {page === 'year_rollover' && (
          <div className="av-rollover-grid">
            <section className="av-panel">
              <div><h2>Academic year rollover</h2><p className="av-subtitle">Review the affected student counts before promoting a cohort.</p></div>
              <div className="av-rollover-stats">
                <StatTile label="Year 1 → 2" value={yearRolloverPreview?.counts?.year_1 ?? '—'} detail="Eligible students" />
                <StatTile label="Year 2 → 3" value={yearRolloverPreview?.counts?.year_2 ?? '—'} detail="Eligible students" />
                <StatTile label="Year 3 → 4" value={yearRolloverPreview?.counts?.year_3 ?? '—'} detail="Eligible students" />
                <StatTile label="Year 4 unchanged" value={yearRolloverPreview?.counts?.year_4_unchanged ?? '—'} detail="Remain active" />
              </div>
              <p className="av-rollover-note">Only students whose stored academic year is exactly 1, 2, or 3 are promoted. Year 4 and non-numeric/other values remain unchanged. A rollover label can be applied only once for this college.</p>
              {yearRolloverLoading && <p className="av-subtitle">Refreshing the preview…</p>}
              <form className="av-rollover-form" onSubmit={applyYearRollover}>
                <label>Academic year label
                  <input required minLength="4" maxLength="20" placeholder="e.g. 2026-27" value={rolloverAcademicYear} onChange={(event) => setRolloverAcademicYear(event.target.value)} />
                </label>
                <button className="av-primary" type="submit" disabled={yearRolloverLoading || yearRolloverSaving || !yearRolloverPreview || yearRolloverPreview.history?.some((item) => item.academic_year === rolloverAcademicYear.trim().toUpperCase())}>
                  {yearRolloverSaving ? 'Promoting students…' : yearRolloverPreview?.history?.some((item) => item.academic_year === rolloverAcademicYear.trim().toUpperCase()) ? 'Already completed' : 'Preview and promote'}
                </button>
              </form>
            </section>
            <section className="av-panel">
              <h2>Recent rollovers</h2>
              <p className="av-subtitle">Completed operations for this college.</p>
              <div className="av-list">
                {yearRolloverPreview?.history?.map((item) => (
                  <div className="av-list-row" key={item.academic_year}>
                    <div><strong>{item.academic_year}</strong><small>{String(item.created_at || '').replace('T', ' ').slice(0, 16)} · By {item.created_by}</small></div>
                    <StatusPill tone="success">{Number(item.promoted_counts?.year_1_to_2 || 0) + Number(item.promoted_counts?.year_2_to_3 || 0) + Number(item.promoted_counts?.year_3_to_4 || 0)} promoted</StatusPill>
                  </div>
                ))}
                {!yearRolloverLoading && !yearRolloverPreview?.history?.length && <p className="av-empty">No year rollovers have been recorded.</p>}
              </div>
            </section>
          </div>
        )}

        {page === 'add' && (
          <section className="av-panel">
            <div className="av-row-between"><div><h2>Add or update a student</h2><p className="av-subtitle">Set the class, division, hostel, wing, and contact details used by faculty and wardens.</p></div><button className="av-secondary" type="button" onClick={() => setPage('students')}>Back to directory</button></div>
            <form className="av-form-grid" onSubmit={createStudent}>
              <label>Roll number / username<input required value={form.roll_no} onChange={(event) => setForm({ ...form, roll_no: event.target.value })} /></label>
              <label>Student name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
              <label>Department<input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
              <label>Academic year<input value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></label>
              <label>Division / section<input maxLength="80" value={form.division} onChange={(event) => setForm({ ...form, division: event.target.value })} /></label>
              <label>Hostel block or Day Scholar<input value={form.hostel_block} onChange={(event) => setForm({ ...form, hostel_block: event.target.value })} /></label>
              <label>Wing<input value={form.wing} onChange={(event) => setForm({ ...form, wing: event.target.value })} /></label>
              <label>Room<input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} /></label>
              <label>Student email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>Student phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label>Guardian phone<input type="tel" value={form.guardian_phone} onChange={(event) => setForm({ ...form, guardian_phone: event.target.value })} /></label>
              <Button className="av-full-width" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save student record'}</Button>
            </form>
            <form className="av-import-form" onSubmit={importCsv}>
              <div><h3>Import a class roster</h3><p className="av-subtitle">CSV columns: roll_no, name, department, year, division, hostel_block, wing, room, email, phone, guardian_phone.</p></div>
              <label>Student roster CSV<input type="file" name="studentsCsv" accept=".csv,text/csv" required /></label>
              <button className="av-secondary" disabled={loading}>Import CSV</button>
            </form>
          </section>
        )}

        {page === 'devices' && (
          <section className="av-panel">
            <div className="av-row-between"><div><h2>Student device access</h2><p className="av-subtitle">Open a two-minute enrollment window or reset a lock when a student changes phones.</p></div><button className="av-secondary" type="button" onClick={() => setPage('students')}>Back to directory</button></div>
            <div className="av-list">
              {students.map((student) => (
                <div className="av-list-row av-device-student" key={student.user_id}>
                  <div><strong>{student.full_name}</strong><small>{student.user_id} · {student.department || '—'} · {student.hostel_block || 'Day Scholar'} {student.wing ? `· ${student.wing}` : ''}</small></div>
                  <div className="av-device-actions">
                    <button className="av-secondary" type="button" disabled={Boolean(deviceAction)} onClick={() => manageDevice(student, 'open')}>{deviceAction === `${student.user_id}:open` ? 'Opening…' : 'Open 2-minute window'}</button>
                    <button className="av-secondary" type="button" disabled={Boolean(deviceAction)} onClick={() => manageDevice(student, 'reset')}>{deviceAction === `${student.user_id}:reset` ? 'Resetting…' : 'Reset device lock'}</button>
                  </div>
                </div>
              ))}
              {!students.length && <p className="av-empty">No student accounts are loaded.</p>}
            </div>
          </section>
        )}
      </main>
      <TabBar items={onboardingNavItems} active={page} onChange={setPage} className="av-onboarding-tabbar" />
    </div>
  );
}
