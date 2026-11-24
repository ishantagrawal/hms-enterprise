import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { extractErrorMessage } from '../utils/errorParser.ts';

const emptyForm = {
  roll_no: '',
  full_name: '',
  department: '',
  year: '',
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

export default function StudentOnboardingPortal({ apiUrl, user }) {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const [credentials, setCredentials] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStudents = useCallback(async (search = '') => {
    const response = await apiFetch(`${apiUrl}/api/onboarding/students?q=${encodeURIComponent(search)}`);
    setStudents(await readJson(response, 'Could not load student accounts.'));
  }, [apiUrl]);

  useEffect(() => {
    setLoading(true);
    loadStudents()
      .catch((loadError) => setError(extractErrorMessage(loadError)))
      .finally(() => setLoading(false));
  }, [loadStudents]);

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
        ? 'Student account is ready. Share this temporary password securely.'
        : 'Student details updated. The existing password was not changed.');
      setForm(emptyForm);
      await loadStudents(query);
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
      await loadStudents(query);
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
      setMessage('Temporary password generated. Share it securely; the student must change it at first sign-in.');
    } catch (resetError) {
      setError(extractErrorMessage(resetError));
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
      await loadStudents(query);
    } catch (searchError) {
      setError(extractErrorMessage(searchError));
    }
  };

  return (
    <div className="av-root">
      <header className="av-header">
        <div>
          <p className="av-kicker">Student account administration</p>
          <h1>Student Onboarding</h1>
          <p>Signed in as {user.full_name}. Create student accounts and issue one-time passwords.</p>
        </div>
      </header>
      {error && <div className="av-error" role="alert">{error}</div>}
      {message && <div className="av-message" role="status">{message}</div>}
      {credentials.length > 0 && (
        <section className="av-panel" aria-live="polite">
          <div className="av-row-between">
            <div>
              <h2>Temporary credentials</h2>
              <p>These passwords are shown only in this response. Share them privately; first sign-in requires a change.</p>
            </div>
            <button type="button" className="av-secondary" onClick={downloadCredentials}>Download secure handoff CSV</button>
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
      <section className="av-panel">
        <h2>Create a student account</h2>
        <form className="av-form-grid" onSubmit={createStudent}>
          <label>Roll number / username<input required value={form.roll_no} onChange={(event) => setForm({ ...form, roll_no: event.target.value })} /></label>
          <label>Student name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label>Department<input required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label>Academic year<input value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></label>
          <label>Hostel block<input value={form.hostel_block} onChange={(event) => setForm({ ...form, hostel_block: event.target.value })} /></label>
          <label>Wing<input value={form.wing} onChange={(event) => setForm({ ...form, wing: event.target.value })} /></label>
          <label>Room<input value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} /></label>
          <label>Student email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Student phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Guardian phone<input type="tel" value={form.guardian_phone} onChange={(event) => setForm({ ...form, guardian_phone: event.target.value })} /></label>
          <button className="av-primary" disabled={loading}>{loading ? 'Saving…' : 'Create / update student'}</button>
        </form>
        <form className="av-inline-form" onSubmit={importCsv}>
          <label>Bulk CSV: roll_no,name,department,year,hostel_block,wing,room,email,phone,guardian_phone
            <input type="file" name="studentsCsv" accept=".csv,text/csv" required />
          </label>
          <button className="av-secondary" disabled={loading}>Import CSV</button>
        </form>
      </section>
      <section className="av-panel">
        <div className="av-row-between">
          <h2>Student directory</h2>
          <form className="av-inline-form" onSubmit={search}>
            <input aria-label="Search students" placeholder="Roll number, name, department" value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="av-secondary">Search</button>
          </form>
        </div>
        <div className="av-list">
          {students.map((student) => (
            <div className="av-list-row" key={student.user_id}>
              <div><strong className="av-tabular">{student.user_id}</strong><small>{student.full_name} · {student.department || 'No department'} · {student.hostel_block || 'Residence not set'}</small></div>
              <span className={`av-status ${student.has_password ? 'is-good' : 'is-absent'}`}>
                {!student.has_password ? 'Password needed' : student.password_reset_required ? 'Must change password' : 'Active'}
              </span>
              <button type="button" className="av-secondary" onClick={() => resetPassword(student)}>Issue temporary password</button>
            </div>
          ))}
          {!students.length && <p className="av-empty">{loading ? 'Loading student accounts…' : 'No matching student accounts.'}</p>}
        </div>
      </section>
    </div>
  );
}
