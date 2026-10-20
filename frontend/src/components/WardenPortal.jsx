import React, { useState, useEffect, useCallback } from 'react';

const SAMPLE_CSV = `U26CE091, Aarav Verma, Gajjar Bhawan, B-102, Civil Engineering, 1st Year, +919876543291, u26ce091@svnit.ac.in, 14082007
U26ME044, Priyansh Shah, Gajjar Bhawan, A-208, Mechanical Engineering, 1st Year, +919876543292, u26me044@svnit.ac.in, 22112007`;

export default function WardenPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [complaints, setComplaints] = useState([]);
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState(null);

  const hostelName = user.hostel_block;

  // 1. Manual Single Student Onboarding
  const [studentForm, setStudentForm] = useState({
    user_id: '', full_name: '', hostel_block: hostelName,
    room: '', department: 'Civil Engineering', year: '1st Year',
    phone: '', email: '', dob: ''
  });
  const [bulkCsv, setBulkCsv] = useState('');

  // 2. Manual Hostel Complaint Category & Hostel Staff Creation
  const [deptForm, setDeptForm] = useState({ title: '', icon: '🧹' });
  const [staffForm, setStaffForm] = useState({ user_id: '', password: '123', full_name: '', department: 'Cleanliness & Hygiene', phone: '' });

  const loadWardenData = useCallback(async () => {
    try {
      const [cRes, sRes, dRes, sfRes] = await Promise.all([
        fetch(`${apiUrl}/api/complaints?role=Warden&hostel_block=${encodeURIComponent(hostelName)}`),
        fetch(`${apiUrl}/api/warden/students?hostel_block=${encodeURIComponent(hostelName)}`),
        fetch(`${apiUrl}/api/departments?hostel_block=${encodeURIComponent(hostelName)}`),
        fetch(`${apiUrl}/api/staff?hostel_block=${encodeURIComponent(hostelName)}`)
      ]);
      if (cRes.ok) setComplaints(await cRes.json());
      if (sRes.ok) setStudents(await sRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (sfRes.ok) setStaffList(await sfRes.json());
    } catch (e) { console.error(e); }
  }, [apiUrl, hostelName]);

  useEffect(() => { loadWardenData(); }, [loadWardenData]);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/warden/add-student`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...studentForm, hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setStudentForm({ ...studentForm, user_id: '', full_name: '', room: '', phone: '', email: '', dob: '' });
      loadWardenData();
    } else setMsg(`❌ ${data.detail || 'Error'}`);
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    const lines = bulkCsv.trim().split('\n');
    const parsed = [];
    for (let l of lines) {
      const p = l.split(',').map((x) => x.trim());
      if (p.length >= 9) {
        parsed.push({
          user_id: p[0], full_name: p[1], hostel_block: hostelName, room: p[3],
          department: p[4], year: p[5], phone: p[6], email: p[7], dob: p[8]
        });
      }
    }
    if (parsed.length === 0) {
      setMsg('❌ Please check CSV format (9 columns per line).');
      return;
    }
    const res = await fetch(`${apiUrl}/api/warden/upload-students`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setBulkCsv('');
      loadWardenData();
    }
  };

  const handleResetDob = async (rollNo) => {
    const res = await fetch(`${apiUrl}/api/warden/reset-student-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: rollNo })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`🔑 ${data.message}`);
    }
  };

  const handleCreateHostelDept = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/departments/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: deptForm.title,
        dept_type: 'Hostel',
        hostel_block: hostelName,
        icon: deptForm.icon,
        created_by: user.user_id
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setDeptForm({ title: '', icon: '🧹' });
      loadWardenData();
    } else setMsg(`❌ ${data.detail || 'Error'}`);
  };

  const handleCreateHostelStaff = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/staff/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...staffForm, hostel_block: hostelName })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setStaffForm({ user_id: '', password: '123', full_name: '', department: 'Cleanliness & Hygiene', phone: '' });
      loadWardenData();
    }
  };

  const filteredStudents = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.room.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>
          💬 {hostelName} Complaints ({complaints.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
          🎓 Student Directory & Onboarding ({students.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
          🛠️ Hostel Staff & Custom Categories ({staffList.length})
        </button>
      </div>

      {/* TAB 1: ALL HOSTEL COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div className="hms-card">
          <div className="hms-row-between" style={{ marginBottom: '16px' }}>
            <div className="hms-section-label" style={{ margin: 0 }}>🏢 All Resident Complaints in {hostelName}</div>
            <button
              className="hms-btn-ghost-sm"
              onClick={() => window.open(`${apiUrl}/api/complaints/export-pdf?hostel_block=${encodeURIComponent(hostelName)}`, '_blank')}
            >
              🖨️ Print Hostel Grievance PDF
            </button>
          </div>
          {complaints.length === 0 ? (
            <div className="hms-empty-card">No complaints logged for {hostelName}.</div>
          ) : (
            <div className="hms-grid-2">
              {complaints.map((c) => (
                <div key={c.ticket_id} className="hms-card" style={{ background: '#090d16' }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{c.summary}</span>
                    <span className="hms-pill-badge">{c.category}</span>
                  </div>
                  <p className="hms-item-sub" style={{ margin: '6px 0' }}>{c.description}</p>
                  <div className="hms-item-sub">👤 {c.student_name} ({c.student_id}) • Room {c.room}</div>

                  {/* 3-Stage Status View */}
                  <div className="hms-timeline-box">
                    <div className="hms-tl-step">
                      <span className="hms-tl-dot" style={{ background: '#4ade80', color: '#050811' }}>✓</span>
                      <span><strong>1. Lodged:</strong> {c.created_at}</span>
                    </div>
                    <div className="hms-tl-step">
                      <span className="hms-tl-dot" style={{ background: c.staff_read_at ? '#38bdf8' : '#1e293b', color: '#fff' }}>{c.staff_read_at ? '✓' : '2'}</span>
                      <span><strong>2. Staff Read/Action:</strong> {c.staff_done_at ? `Done (${c.staff_remark})` : c.staff_read_at ? `Read at ${c.staff_read_at}` : 'Pending Staff Read'}</span>
                    </div>
                    <div className="hms-tl-step">
                      <span className="hms-tl-dot" style={{ background: c.status === 'Completed' ? '#8b5cf6' : '#1e293b', color: '#fff' }}>{c.status === 'Completed' ? '✓' : '3'}</span>
                      <span><strong>3. Student Verified:</strong> {c.status === 'Completed' ? `Satisfied (${c.student_verified_at})` : c.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MANUAL STUDENT ONBOARDING & DIRECTORY WITH 1-CLICK DOB RESET */}
      {activeTab === 'students' && (
        <div className="hms-grid-2">
          <div className="hms-stack">
            <div className="hms-card">
              <div className="hms-section-label">➕ Manually Onboard Student ({hostelName})</div>
              <form onSubmit={handleAddStudent} className="hms-stack">
                <div className="hms-grid-2" style={{ gap: '8px' }}>
                  <input type="text" className="hms-input" placeholder="Roll No (e.g. U26CE015)" value={studentForm.user_id} onChange={(e) => setStudentForm({ ...studentForm, user_id: e.target.value })} required />
                  <input type="text" className="hms-input" placeholder="Full Name" value={studentForm.full_name} onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })} required />
                </div>
                <div className="hms-grid-2" style={{ gap: '8px' }}>
                  <input type="text" className="hms-input" placeholder="Room No (e.g. B-205)" value={studentForm.room} onChange={(e) => setStudentForm({ ...studentForm, room: e.target.value })} required />
                  <input type="text" className="hms-input" placeholder="DOB DDMMYYYY (Default Pass)" value={studentForm.dob} onChange={(e) => setStudentForm({ ...studentForm, dob: e.target.value })} required />
                </div>
                <div className="hms-grid-2" style={{ gap: '8px' }}>
                  <input type="text" className="hms-input" placeholder="Branch / Dept (e.g. Civil Engineering)" value={studentForm.department} onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })} required />
                  <select className="hms-input" value={studentForm.year} onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })}>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
                <div className="hms-grid-2" style={{ gap: '8px' }}>
                  <input type="text" className="hms-input" placeholder="Phone Number" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} required />
                  <input type="email" className="hms-input" placeholder="Official Email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} required />
                </div>
                <button type="submit" className="hms-btn-primary">💾 Add Student (Default Password = DOB)</button>
              </form>
            </div>

            <div className="hms-card">
              <div className="hms-row-between" style={{ marginBottom: '8px' }}>
                <div className="hms-section-label" style={{ margin: 0 }}>📥 Bulk Student Upload (CSV)</div>
                <button type="button" className="hms-btn-ghost-sm" onClick={() => setBulkCsv(SAMPLE_CSV)}>Load Sample</button>
              </div>
              <form onSubmit={handleBulkUpload} className="hms-stack">
                <textarea rows="3" className="hms-input" placeholder="RollNo, Name, Hostel, Room, Branch, Year, Phone, Email, DOB(DDMMYYYY)" value={bulkCsv} onChange={(e) => setBulkCsv(e.target.value)} required />
                <button type="submit" className="hms-btn-primary">📤 Upload Bulk Students</button>
              </form>
            </div>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🔍 {hostelName} Student Directory — Search & Reset Password to DOB</div>
            <div className="hms-search-box" style={{ marginBottom: '14px' }}>
              <span>🔍</span>
              <input type="text" placeholder="Search student by Roll No, Name, or Room..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="hms-stack" style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {filteredStudents.map((st) => (
                <div key={st.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{st.full_name} ({st.user_id})</div>
                    <div className="hms-item-sub">🚪 Room {st.room} • {st.department} ({st.year}) • DOB: {st.dob}</div>
                  </div>
                  <button className="hms-btn-primary-sm" onClick={() => handleResetDob(st.user_id)}>
                    🔑 Reset to DOB
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOSTEL-SPECIFIC DEPARTMENTS & STAFF MANAGEMENT */}
      {activeTab === 'staff' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">➕ 1. Create Hostel-Specific Complaint Department</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Need a new category for {hostelName} (like "Tiles & Flooring", "Mess Hygiene", "Washroom Smell")? Create it here and residents of {hostelName} will immediately see it!
            </p>
            <form onSubmit={handleCreateHostelDept} className="hms-stack" style={{ marginBottom: '22px' }}>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Category Name (e.g. Washroom Hygiene)" value={deptForm.title} onChange={(e) => setDeptForm({ ...deptForm, title: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Emoji Icon (e.g. 🧼)" value={deptForm.icon} onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">+ Create Hostel Complaint Option</button>
            </form>

            <div className="hms-section-label">👷 2. Create Hostel Maintenance Staff Account</div>
            <form onSubmit={handleCreateHostelStaff} className="hms-stack">
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Staff Login ID (e.g. PLUMB_GAJJAR)" value={staffForm.user_id} onChange={(e) => setStaffForm({ ...staffForm, user_id: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required />
              </div>
              <input type="text" className="hms-input" placeholder="Staff Member Full Name" value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} required />
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <select className="hms-input" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}>
                  {departments.filter((d) => d.type === 'Hostel').map((d) => (
                    <option key={d.id} value={d.id}>{d.icon} {d.title}</option>
                  ))}
                </select>
                <input type="text" className="hms-input" placeholder="Phone Number" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">💾 Create Hostel Staff Account</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">👷 Attached Staff Members for {hostelName} ({staffList.length})</div>
            <div className="hms-stack">
              {staffList.map((s) => (
                <div key={s.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{s.full_name} (ID: {s.user_id})</div>
                    <div className="hms-item-sub">Department: <strong>{s.department}</strong> • 📞 {s.phone}</div>
                  </div>
                  <span className="hms-pill-badge">{s.hostel_block === 'All' ? 'Central Team' : s.hostel_block}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('complaints')} className={`hms-bnav-item ${activeTab === 'complaints' ? 'active' : ''}`}><span>💬</span><span>Complaints</span></button>
        <button onClick={() => setActiveTab('students')} className={`hms-bnav-item ${activeTab === 'students' ? 'active' : ''}`}><span>🎓</span><span>Students</span></button>
        <button onClick={() => setActiveTab('staff')} className={`hms-bnav-item ${activeTab === 'staff' ? 'active' : ''}`}><span>🛠️</span><span>Staff</span></button>
      </nav>
    </div>
  );
}