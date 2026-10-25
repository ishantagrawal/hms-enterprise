import React, { useState, useEffect, useCallback } from 'react';

export default function WardenPortal({ user, apiUrl }) {
  const [page, setPage] = useState('home');
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [msg, setMsg] = useState(null);

  const hostelName = user.hostel_block && user.hostel_block !== 'All' ? user.hostel_block : 'Gajjar Bhawan';

  // 6-Field Student Onboarding (Roll No, Name, Room No, Department, Year, DOB)
  const [studentForm, setStudentForm] = useState({
    user_id: '',
    full_name: '',
    room: '',
    department: 'Civil Engineering',
    year: '1st Year',
    dob: ''
  });

  const [bulkCsvText, setBulkCsvText] = useState('');
  const [deptForm, setDeptForm] = useState({ dept_id: '', name: '', password: '123', icon: '🧹' });

  const loadWardenData = useCallback(async () => {
    try {
      const [cRes, dRes, sRes] = await Promise.all([
        fetch(`${apiUrl}/api/complaints?role=Warden&hostel_block=${encodeURIComponent(hostelName)}`),
        fetch(`${apiUrl}/api/departments?hostel_block=${encodeURIComponent(hostelName)}`),
        fetch(`${apiUrl}/api/warden/students?hostel_block=${encodeURIComponent(hostelName)}`)
      ]);
      if (cRes.ok) setComplaints(await cRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (sRes.ok) setStudents(await sRes.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, hostelName]);

  useEffect(() => { loadWardenData(); }, [loadWardenData]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/warden/add-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...studentForm, hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setStudentForm({ user_id: '', full_name: '', room: '', department: studentForm.department, year: studentForm.year, dob: '' });
      loadWardenData();
    } else {
      setMsg(`❌ ${data.detail || 'Error'}`);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    const lines = bulkCsvText.trim().split('\n');
    const parsed = [];
    for (let line of lines) {
      const p = line.split(',').map((x) => x.trim());
      // 6 Fields: RollNo, Name, RoomNo, Department, Year, DOB(DDMMYYYY)
      if (p.length >= 6) {
        parsed.push({
          user_id: p[0],
          full_name: p[1],
          room: p[2],
          department: p[3],
          year: p[4],
          dob: p[5],
          hostel_block: hostelName
        });
      }
    }
    if (parsed.length === 0) {
      setMsg('❌ Format required: RollNo, Name, RoomNo, Department, Year, DOB(DDMMYYYY)');
      return;
    }
    const res = await fetch(`${apiUrl}/api/warden/upload-students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setBulkCsvText('');
      loadWardenData();
      setPage('directory');
    }
  };

  const handleResetDob = async (rollNo) => {
    const res = await fetch(`${apiUrl}/api/warden/reset-student-password?warden_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: rollNo, new_password: 'DOB' })
    });
    const data = await res.json();
    if (res.ok && data.success) setMsg(`✅ ${data.message}`);
  };

  const handleCreateHostelDept = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/departments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...deptForm, dept_type: 'Hostel', hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setDeptForm({ dept_id: '', name: '', password: '123', icon: '🧹' });
      loadWardenData();
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.room.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openComplaints = complaints.filter((c) => c.status !== 'Completed');
  const hostelDepts = departments.filter((d) => d.type === 'Hostel');

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Warden Home</button>
        <button className={`ptm-side-btn ${page === 'onboard' ? 'active' : ''}`} onClick={() => setPage('onboard')}>➕ Add / Upload Students</button>
        <button className={`ptm-side-btn ${page === 'directory' ? 'active' : ''}`} onClick={() => setPage('directory')}>🎓 Student Directory ({students.length})</button>
        <button className={`ptm-side-btn ${page === 'departments' ? 'active' : ''}`} onClick={() => setPage('departments')}>🛠️ Hostel Maintenance Wings</button>
        <button className={`ptm-side-btn ${page === 'complaints' ? 'active' : ''}`} onClick={() => setPage('complaints')}>💬 Hostel Complaints ({openComplaints.length})</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {page === 'home' && (
          <div>
            <div className="ptm-mini-grid">
              <div className="ptm-mini-card" onClick={() => setPage('directory')}>
                <div className="ptm-row-between"><span style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280' }}>{hostelName} Students</span><span>🎓</span></div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{students.length}</div>
                <button className="ptm-mini-btn">Student Directory →</button>
              </div>
              <div className="ptm-mini-card" onClick={() => setPage('complaints')}>
                <div className="ptm-row-between"><span style={{ fontSize: '12px', fontWeight: 700, color: '#6B7280' }}>Active Complaints</span><span>💬</span></div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{openComplaints.length}</div>
                <button className="ptm-mini-btn">View Complaints →</button>
              </div>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">{hostelName} Quick Actions</div>
              <div className="ptm-icon-grid">
                <button className="ptm-icon-tile" onClick={() => setPage('onboard')}>
                  <div className="ptm-icon-circle">➕</div>
                  <span className="ptm-icon-label">Add / Bulk Upload Students</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('directory')}>
                  <div className="ptm-icon-circle">🔍</div>
                  <span className="ptm-icon-label">Search & Reset DOB Pass</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('departments')}>
                  <div className="ptm-icon-circle">🛠️</div>
                  <span className="ptm-icon-label">Hostel Staff Wings</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('complaints')}>
                  <div className="ptm-icon-circle">💬</div>
                  <span className="ptm-icon-label">All Grievances</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6-FIELD STUDENT ONBOARDING PAGE */}
        {page === 'onboard' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Onboard {hostelName} Students</h1>
              <p className="ptm-page-sub">Requires 6 fields: Roll Number, Name, Room Number, Department, Year, and DOB (DDMMYYYY)</p>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">1. Bulk Paste Student List (6 Columns)</div>
              <p className="ptm-list-sub" style={{ marginBottom: '12px' }}>
                Format per line: <strong>RollNo, Name, RoomNo, Department, Year, DOB(DDMMYYYY)</strong>
              </p>
              <form onSubmit={handleBulkUpload} className="ptm-form-stack">
                <textarea
                  rows="5"
                  className="ptm-input"
                  placeholder="U26CE011, Ishant Agrawal, B-204, Civil Engineering, 1st Year, 10072007"
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  required
                />
                <button type="submit" className="ptm-btn-primary">📤 Upload & Create Student Logins</button>
              </form>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">2. Add Single Student Manually</div>
              <form onSubmit={handleAddStudent} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Roll Number (Login ID)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. U26CE011" value={studentForm.user_id} onChange={(e) => setStudentForm({ ...studentForm, user_id: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Full Name</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Ishant Agrawal" value={studentForm.full_name} onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Room Number</label>
                    <input type="text" className="ptm-input" placeholder="e.g. B-204" value={studentForm.room} onChange={(e) => setStudentForm({ ...studentForm, room: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Date of Birth (DDMMYYYY = Password)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. 10072007" value={studentForm.dob} onChange={(e) => setStudentForm({ ...studentForm, dob: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Department</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Civil Engineering" value={studentForm.department} onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Academic Year</label>
                    <select className="ptm-input" value={studentForm.year} onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })}>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary">Register Student</button>
              </form>
            </div>
          </div>
        )}

        {/* STUDENT DIRECTORY & 1-CLICK DOB RESET */}
        {page === 'directory' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">{hostelName} Student Directory</h1>
            </div>
            <div className="ptm-search-pill">
              <span>🔍</span>
              <input type="text" placeholder="Search by Roll No, Name, or Room..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="ptm-card">
              {filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6B7280' }}>No students found.</div>
              ) : (
                <div className="ptm-list">
                  {filteredStudents.map((st) => (
                    <div key={st.user_id} className="ptm-list-row">
                      <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>
                        {st.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{st.full_name} ({st.user_id})</div>
                        <div className="ptm-list-sub">🚪 Room {st.room} • {st.year} • {st.department}</div>
                        <span className="ptm-tag-pill">DOB: {st.dob}</span>
                      </div>
                      <button className="ptm-btn-secondary" onClick={() => handleResetDob(st.user_id)}>
                        Reset to DOB
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HOSTEL MAINTENANCE WINGS */}
        {page === 'departments' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">{hostelName} Maintenance Wings</h1>
            </div>
            <div className="ptm-card">
              <div className="ptm-section-title">Create {hostelName} Department & Login</div>
              <form onSubmit={handleCreateHostelDept} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Department Login ID</label>
                    <input type="text" className="ptm-input" placeholder="e.g. GAJJAR_PLUMB" value={deptForm.dept_id} onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Department Name</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Plumbing, Cleanliness" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div><label className="ptm-label">Password</label><input type="text" className="ptm-input" value={deptForm.password} onChange={(e) => setDeptForm({ ...deptForm, password: e.target.value })} required /></div>
                  <div><label className="ptm-label">Icon</label><input type="text" className="ptm-input" value={deptForm.icon} onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })} required /></div>
                </div>
                <button type="submit" className="ptm-btn-primary">+ Create Department Login</button>
              </form>
            </div>
            <div className="ptm-card">
              <div className="ptm-section-title">Active {hostelName} Wings ({hostelDepts.length})</div>
              <div className="ptm-list">
                {hostelDepts.map((d) => (
                  <div key={d.id} className="ptm-list-row">
                    <div className="ptm-avatar-pastel">{d.icon}</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{d.title}</div>
                      <div className="ptm-list-sub">Login ID: <strong>{d.id}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COMPLAINTS LIST & FULL-PAGE TICKET DETAIL */}
        {page === 'complaints' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">{hostelName} Grievances</h1>
            </div>
            <div className="ptm-card">
              {complaints.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#6B7280' }}>No complaints logged in {hostelName}.</div>
              ) : (
                <div className="ptm-list">
                  {complaints.map((c) => (
                    <div key={c.ticket_id} className="ptm-list-row" onClick={() => { setSelectedTicket(c); setPage('ticket_detail'); }}>
                      <div className="ptm-avatar-pastel">🛠️</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{c.summary}</div>
                        <div className="ptm-list-sub">Room {c.room} • {c.student_name} ({c.student_id})</div>
                        <span className="ptm-tag-pill">{c.routed_to}</span>
                      </div>
                      <span className="ptm-status-badge" style={{ background: '#F3F4F6', color: '#111827' }}>{c.status} ›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'ticket_detail' && selectedTicket && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('complaints')}>←</button>
              <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>{selectedTicket.ticket_id}</span>
              <h1 className="ptm-page-title">{selectedTicket.summary}</h1>
            </div>
            <div className="ptm-card">
              <p style={{ color: '#374151', marginBottom: '16px' }}>{selectedTicket.description}</p>
              <div className="ptm-list">
                <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">1️⃣ Lodged by Resident</div><div className="ptm-list-sub">{selectedTicket.student_name} ({selectedTicket.student_id}) • Room {selectedTicket.room} • {selectedTicket.created_at}</div></div></div>
                <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">2️⃣ Department Resolution</div><div className="ptm-list-sub">{selectedTicket.staff_remark || 'Pending inspection'}</div></div></div>
                <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">3️⃣ Student Verification</div><div className="ptm-list-sub">{selectedTicket.status}</div></div></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        <button className={`ptm-bnav-btn ${page === 'onboard' ? 'active' : ''}`} onClick={() => setPage('onboard')}><span>➕</span><span>Add Student</span></button>
        <button className={`ptm-bnav-btn ${page === 'directory' ? 'active' : ''}`} onClick={() => setPage('directory')}><span>🎓</span><span>Directory</span></button>
        <button className={`ptm-bnav-btn ${page === 'complaints' ? 'active' : ''}`} onClick={() => setPage('complaints')}><span>💬</span><span>Complaints</span></button>
      </nav>
    </div>
  );
}
