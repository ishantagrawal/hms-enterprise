import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { downloadComplaintRegister } from '../registerPdf';

export default function WardenPortal({ user, apiUrl }) {
  const [page, setPage] = useState('home');
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [msg, setMsg] = useState(null);
  const [wingFilter, setWingFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const hostelName = user.hostel_block && user.hostel_block !== 'All' ? user.hostel_block : 'Gajjar Bhawan';

  const [studentForm, setStudentForm] = useState({
    user_id: '',
    full_name: '',
    room: '',
    department: 'Civil Engineering',
    year: '1st Year'
  });

  const [bulkCsvText, setBulkCsvText] = useState('');
  const [deptForm, setDeptForm] = useState({ dept_id: '', name: '', email: '', icon: '🧹' });

  const loadWardenData = useCallback(async () => {
    try {
      const [dRes, sRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/departments?hostel_block=${encodeURIComponent(hostelName)}`),
        apiFetch(`${apiUrl}/api/warden/students?hostel_block=${encodeURIComponent(hostelName)}`)
      ]);
      if (dRes.ok) setDepartments(await dRes.json());
      if (sRes.ok) setStudents(await sRes.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, hostelName]);

  const loadWardenComplaints = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        role: 'Warden',
        hostel_block: hostelName,
        wing: wingFilter,
        category: categoryFilter
      });
      const response = await apiFetch(`${apiUrl}/api/complaints?${query.toString()}`);
      if (response.ok) setComplaints(await response.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, hostelName, wingFilter, categoryFilter]);

  useEffect(() => { loadWardenData(); }, [loadWardenData]);
  useEffect(() => { loadWardenComplaints(); }, [loadWardenComplaints]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/warden/add-student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...studentForm, hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setStudentForm({ user_id: '', full_name: '', room: '', department: studentForm.department, year: studentForm.year });
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
      if (p.length >= 5) {
        parsed.push({
          user_id: p[0],
          full_name: p[1],
          room: p[2],
          department: p[3],
          year: p[4],
          hostel_block: hostelName
        });
      }
    }
    if (parsed.length === 0) {
      setMsg('❌ Format required: RollNo, Name, RoomNo, Department, Year');
      return;
    }
    const res = await apiFetch(`${apiUrl}/api/warden/upload-students`, {
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
    } else {
      setMsg(`❌ ${data.detail || 'Could not upload the student list.'}`);
    }
  };

  const handleCreateHostelDept = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/departments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...deptForm, dept_type: 'Hostel', hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setDeptForm({ dept_id: '', name: '', email: '', icon: '🧹' });
      loadWardenData();
    } else {
      setMsg(`❌ ${data.detail || 'Could not save department.'}`);
    }
  };

  const handleDownloadRegister = async () => {
    try {
      await downloadComplaintRegister({
        title: 'Hostel Complaint Register',
        hostel: hostelName,
        wing: wingFilter || 'All Wings',
        category: categoryFilter || 'All Categories',
        complaints
      });
    } catch (error) {
      setMsg(`❌ ${error.message || 'Could not generate the complaint register PDF.'}`);
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      (s.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.user_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.room || '').toLowerCase().includes(searchQuery.toLowerCase())
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
        <button className={`ptm-side-btn ${page === 'register' ? 'active' : ''}`} onClick={() => setPage('register')}>📋 Complaint Register</button>
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
                  <span className="ptm-icon-label">Student Directory</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('departments')}>
                  <div className="ptm-icon-circle">🛠️</div>
                  <span className="ptm-icon-label">Hostel Staff Wings</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('register')}>
                  <div className="ptm-icon-circle">📋</div>
                  <span className="ptm-icon-label">Complaint Register</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {page === 'onboard' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Onboard {hostelName} Students</h1>
              <p className="ptm-page-sub">Add residents using their SVNIT roll number and hostel details. Sign-in is handled by Google.</p>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">1. Bulk Paste Student List (5 Columns)</div>
              <p className="ptm-list-sub" style={{ marginBottom: '12px' }}>
                Format per line: <strong>RollNo, Name, RoomNo, Department, Year</strong>
              </p>
              <form onSubmit={handleBulkUpload} className="ptm-form-stack">
                <textarea
                  rows="5"
                  className="ptm-input"
                  placeholder="U26CE011, Ishant Agrawal, D-315, Civil Engineering, 1st Year"
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  required
                />
                <button type="submit" className="ptm-btn-primary">📤 Upload & Save Students</button>
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
                <div>
                  <label className="ptm-label">Room Number</label>
                  <input type="text" className="ptm-input" placeholder="e.g. D-315" value={studentForm.room} onChange={(e) => setStudentForm({ ...studentForm, room: e.target.value })} required />
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
                        {(st.full_name || 'ST').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{st.full_name} ({st.user_id})</div>
                        <div className="ptm-list-sub">
                          🚪 {st.wing ? `${st.wing} • ` : ''}Room {st.room || '—'} • {st.year} • {st.department}
                          {st.phone ? ` • 📞 ${st.phone}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
                    <label className="ptm-label">Department ID (auto-prefixed for this hostel)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. PLUMBING" value={deptForm.dept_id} onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Department Name</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Plumbing, Cleanliness" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Staff official Google email</label>
                    <input type="email" className="ptm-input" placeholder="staff@svnit.ac.in" value={deptForm.email} onChange={(e) => setDeptForm({ ...deptForm, email: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Icon</label>
                    <input type="text" className="ptm-input" value={deptForm.icon} onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })} required />
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary">+ Create Department and Google Access</button>
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
                      <div className="ptm-list-sub">
                        Department ID: <strong>{d.id}</strong> • Google account: {d.login_email || 'Not configured'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
                        <div className="ptm-list-sub">
                          {c.wing ? `${c.wing} • ` : ''}Room {c.room} • {c.student_name} ({c.student_id})
                        </div>
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

        {page === 'register' && (
          <div>
            <div className="ptm-drill-header">
              <span className="ptm-tag-pill">{hostelName} • PHYSICAL REGISTER</span>
              <h1 className="ptm-page-title">Hostel Complaint Register</h1>
              <p className="ptm-page-sub">Filter maintenance requests by wing and category, then export a print-ready landscape register.</p>
            </div>
            <div className="ptm-card">
              <div className="ptm-grid-2">
                <label className="ptm-label">Wing
                  <select className="ptm-input" value={wingFilter} onChange={(event) => setWingFilter(event.target.value)}>
                    <option value="">All Wings</option>
                    {'ABCDEFGH'.split('').map((letter) => <option key={letter} value={`Wing ${letter}`}>Wing {letter}</option>)}
                  </select>
                </label>
                <label className="ptm-label">Category
                  <select className="ptm-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <option value="">All Categories</option>
                    {departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
                  </select>
                </label>
              </div>
              <button type="button" className="ptm-btn-primary" style={{ marginTop: '12px' }} onClick={handleDownloadRegister}>
                📥 Download Register PDF ({complaints.length})
              </button>
            </div>
            <div className="ptm-card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px', textAlign: 'left' }}>
                <thead>
                  <tr>
                    {['Ticket / Date', 'Wing / Room', 'Student', 'Mobile', 'Category', 'Complaint / Action', 'Status'].map((heading) => (
                      <th key={heading} style={{ padding: '9px', borderBottom: '2px solid #CBD5E1' }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((complaint) => (
                    <tr key={complaint.ticket_id}>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.ticket_id}<br />{complaint.created_at}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.wing || 'Unassigned'}<br />{complaint.room}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.student_name}<br />{complaint.student_id}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.phone || '—'}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.routed_to}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.summary}<br />{complaint.staff_remark || complaint.description}</td>
                      <td style={{ padding: '9px', borderBottom: '1px solid #E2E8F0' }}>{complaint.status}</td>
                    </tr>
                  ))}
                  {complaints.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>No complaints match these filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                <div className="ptm-list-row">
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">1️⃣ Lodged by Resident</div>
                    <div className="ptm-list-sub">
                      {selectedTicket.student_name} ({selectedTicket.student_id}) • {selectedTicket.wing ? `${selectedTicket.wing}, ` : ''}Room {selectedTicket.room}
                      {selectedTicket.phone ? ` • 📞 ${selectedTicket.phone}` : ''} • {selectedTicket.created_at}
                    </div>
                  </div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">2️⃣ Department Resolution</div>
                    <div className="ptm-list-sub">{selectedTicket.staff_remark || 'Pending inspection'}</div>
                  </div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main">
                    <div className="ptm-list-title">3️⃣ Student Verification</div>
                    <div className="ptm-list-sub">{selectedTicket.status}</div>
                  </div>
                </div>
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
        <button className={`ptm-bnav-btn ${page === 'register' ? 'active' : ''}`} onClick={() => setPage('register')}><span>📋</span><span>Register</span></button>
      </nav>
    </div>
  );
}