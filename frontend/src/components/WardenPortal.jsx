import React, { useState, useEffect, useCallback } from 'react';

const getStatusColor = (st) => {
  if (st === 'Completed') return '#4ade80';
  if (st === 'Awaiting Confirmation') return '#38bdf8';
  return '#fbbf24';
};

export default function WardenPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [msg, setMsg] = useState(null);

  const hostelName = user.hostel_block && user.hostel_block !== 'All' ? user.hostel_block : 'Gajjar Bhawan';

  // 1. Unified Hostel-Specific Department Creator (Department = Staff Login)
  const [deptForm, setDeptForm] = useState({
    dept_id: '',
    name: '',
    password: '123',
    icon: '🧹'
  });

  // 2. Manual Student Onboarding Form (DOB = Default Password)
  const [studentForm, setStudentForm] = useState({
    user_id: '',
    full_name: '',
    hostel_block: hostelName,
    room: '',
    department: 'Civil Engineering',
    phone: '+91 ',
    email: '',
    dob: ''
  });

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

  const handleCreateHostelDept = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/departments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dept_id: deptForm.dept_id,
          name: deptForm.name,
          password: deptForm.password,
          dept_type: 'Hostel',
          hostel_block: hostelName,
          icon: deptForm.icon
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setDeptForm({ dept_id: '', name: '', password: '123', icon: '🧹' });
        loadWardenData();
      } else {
        setMsg(`❌ ${data.detail || 'Error creating department'}`);
      }
    } catch {
      setMsg('❌ Connection error.');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/warden/add-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...studentForm, hostel_block: hostelName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setStudentForm({
          user_id: '',
          full_name: '',
          hostel_block: hostelName,
          room: '',
          department: studentForm.department,
          phone: '+91 ',
          email: '',
          dob: ''
        });
        loadWardenData();
      } else {
        setMsg(`❌ ${data.detail || 'Failed to onboard student'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const handleResetDob = async (rollNo) => {
    try {
      const res = await fetch(`${apiUrl}/api/warden/reset-student-password?warden_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: rollNo, new_password: 'DOB' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
      } else {
        setMsg(`❌ ${data.detail || 'Reset failed'}`);
      }
    } catch {
      setMsg('❌ Error resetting password.');
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
  const centralDepts = departments.filter((d) => d.type === 'Central');

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>
          💬 {hostelName} Complaints ({openComplaints.length} Open)
        </button>
        <button className={`hms-dtab ${activeTab === 'departments' ? 'active' : ''}`} onClick={() => setActiveTab('departments')}>
          🛠️ Hostel Maintenance Departments ({hostelDepts.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
          🎓 Student Onboarding & Directory ({students.length})
        </button>
      </div>

      {/* TAB 1: ALL HOSTEL COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div>
          {complaints.length === 0 ? (
            <div className="hms-empty-card">No complaints recorded for {hostelName}.</div>
          ) : (
            <div className="hms-grid-2">
              {complaints.map((c) => (
                <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                  <div className="hms-avatar-circle">🛠️</div>
                  <div style={{ flex: 1 }}>
                    <div className="hms-row-between">
                      <span className="hms-item-title">{c.summary}</span>
                      <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                    </div>
                    <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                    <div className="hms-row-between" style={{ marginTop: '6px' }}>
                      <span className="hms-item-sub">Rm {c.room} • {c.student_name} ({c.student_id})</span>
                      <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: HOSTEL-SPECIFIC DEPARTMENTS (1-STEP UNIFIED CREATOR) */}
      {activeTab === 'departments' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🛠️ Create {hostelName} Maintenance Department</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Create a hostel-specific department (e.g. Plumbing, Cleanliness, Carpentry, Mess). This single form adds the option for {hostelName} students AND creates the department login account.
            </p>
            <form onSubmit={handleCreateHostelDept} className="hms-stack">
              <div>
                <label className="hms-label">Department Login ID</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. GAJJAR_PLUMB, GAJJAR_CLEAN, GAJJAR_TILES"
                  value={deptForm.dept_id}
                  onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="hms-label">Department / Issue Name</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. Plumbing, Room Cleaning, Carpentry"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <div>
                  <label className="hms-label">Department Password</label>
                  <input
                    type="text"
                    className="hms-input"
                    placeholder="e.g. 123"
                    value={deptForm.password}
                    onChange={(e) => setDeptForm({ ...deptForm, password: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="hms-label">Emoji Icon</label>
                  <input
                    type="text"
                    className="hms-input"
                    placeholder="e.g. 🚰 or 🧹"
                    value={deptForm.icon}
                    onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="hms-btn-primary">✨ Create Hostel Department & Login</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏢 Dedicated {hostelName} Departments ({hostelDepts.length})</div>
            <div className="hms-stack" style={{ marginBottom: '20px' }}>
              {hostelDepts.map((d) => (
                <div key={d.id} className="hms-row-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>{d.icon}</span>
                    <div>
                      <div className="hms-item-title">{d.title}</div>
                      <div className="hms-item-sub">Login ID: <strong>{d.id}</strong></div>
                    </div>
                  </div>
                  <span className="hms-pill-badge">Hostel Wing</span>
                </div>
              ))}
            </div>

            <div className="hms-section-label">🌐 Central Campus Departments (Managed by Dean)</div>
            <div className="hms-stack">
              {centralDepts.map((d) => (
                <div key={d.id} className="hms-row-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>{d.icon}</span>
                    <div>
                      <div className="hms-item-title">{d.title}</div>
                      <div className="hms-item-sub">Central ID: {d.id} (View-only for Warden)</div>
                    </div>
                  </div>
                  <span className="hms-pill-badge">Central</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANUAL STUDENT ONBOARDING & DIRECTORY */}
      {activeTab === 'students' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">➕ Manually Onboard Resident Student ({hostelName})</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Fill in the required resident details. The student's <strong>Date of Birth (DDMMYYYY)</strong> is automatically set as their initial password.
            </p>
            <form onSubmit={handleAddStudent} className="hms-stack">
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Roll Number</label>
                  <input type="text" className="hms-input" placeholder="e.g. U26CE011" value={studentForm.user_id} onChange={(e) => setStudentForm({ ...studentForm, user_id: e.target.value })} required />
                </div>
                <div>
                  <label className="hms-label">Room Number</label>
                  <input type="text" className="hms-input" placeholder="e.g. B-204" value={studentForm.room} onChange={(e) => setStudentForm({ ...studentForm, room: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="hms-label">Student Full Name</label>
                <input type="text" className="hms-input" placeholder="e.g. Ishant Agrawal" value={studentForm.full_name} onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value })} required />
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Department / Branch</label>
                  <input type="text" className="hms-input" placeholder="e.g. Civil Engineering" value={studentForm.department} onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })} required />
                </div>
                <div>
                  <label className="hms-label">DOB (DDMMYYYY = Password)</label>
                  <input type="text" className="hms-input" placeholder="e.g. 10072007" value={studentForm.dob} onChange={(e) => setStudentForm({ ...studentForm, dob: e.target.value })} required />
                </div>
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Phone Number</label>
                  <input type="text" className="hms-input" placeholder="+91 9876543210" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} required />
                </div>
                <div>
                  <label className="hms-label">Institute Email</label>
                  <input type="email" className="hms-input" placeholder="u26ce011@svnit.ac.in" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} required />
                </div>
              </div>
              <button type="submit" className="hms-btn-primary">💾 Register Resident in {hostelName}</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🔍 {hostelName} Student Directory ({filteredStudents.length})</div>
            <div className="hms-search-box" style={{ marginBottom: '12px' }}>
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search by Roll No, Name, or Room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="hms-stack" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {filteredStudents.map((st) => (
                <div key={st.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{st.full_name} ({st.user_id})</div>
                    <div className="hms-item-sub">🚪 Rm {st.room} • {st.department} • DOB: {st.dob}</div>
                  </div>
                  <button
                    className="hms-btn-ghost-sm"
                    onClick={() => handleResetDob(st.user_id)}
                    title="Reset student password back to their Date of Birth"
                  >
                    🔑 Reset to DOB
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SIMPLE 3-STAGE TICKET TIMELINE */}
      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedTicket.ticket_id} • {selectedTicket.routed_to}</span>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <h3>{selectedTicket.summary}</h3>
            <p className="hms-muted">{selectedTicket.description}</p>

            <div className="hms-section-label" style={{ marginTop: '14px' }}>📌 3-Stage Ticket Status</div>
            <div className="hms-stack">
              <div className="hms-row-item">
                <span>1️⃣ Lodged by {selectedTicket.student_name} (Rm {selectedTicket.room})</span>
                <span className="hms-muted-xs">{selectedTicket.created_at}</span>
              </div>
              <div className="hms-row-item">
                <span>2️⃣ Department Resolution: {selectedTicket.staff_remark || 'Pending inspection'}</span>
                <span className="hms-muted-xs">{selectedTicket.resolved_at || 'In Queue'}</span>
              </div>
              <div className="hms-row-item">
                <span>3️⃣ Resident Confirmation</span>
                <strong style={{ color: getStatusColor(selectedTicket.status) }}>{selectedTicket.status}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}