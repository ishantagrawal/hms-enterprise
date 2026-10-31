import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';

const ALL_BHAWANS = [
  'Gajjar Bhawan',
  'Bhabha Bhawan',
  'Mother Teresa Bhawan',
  'Swami Vivekananda Bhawan',
  'Nehru Bhawan',
  'Tagore Bhawan',
  'Sarabhai Bhawan',
  'Raman Bhawan',
  'Atal Bihari Vajpayee Bhawan',
  'Day Scholar'
];

export default function WardenPortal({ user, apiUrl }) {
  const safeUser = user || {};
  const hostelBlock = safeUser.hostel_block || 'Gajjar Bhawan';
  const sKey = `warden_students_${hostelBlock}`;
  const cKey = `warden_complaints_${hostelBlock}`;
  const dKey = `warden_depts_${hostelBlock}`;

  const [page, setPage] = useState('home');
  const [dataLoading, setDataLoading] = useState(false);
  const [students, setStudents] = useState(() => getCached(sKey) || []);
  const [complaints, setComplaints] = useState(() => getCached(cKey) || []);
  const [departments, setDepartments] = useState(() => getCached(dKey) || []);
  const [msg, setMsg] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({ hostel_block: '', wing: '', room: '', phone: '' });

  const [newStudent, setNewStudent] = useState({
    user_id: '',
    full_name: '',
    wing: 'Wing A',
    room: '',
    department: 'Civil Engineering',
    year: '1st Year',
    phone: ''
  });

  const [newDept, setNewDept] = useState({ dept_id: '', name: '', email: '', icon: '🛠️' });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [wardenRemark, setWardenRemark] = useState('');

  const [regWing, setRegWing] = useState('All');
  const [regCategory, setRegCategory] = useState('All');

  const loadWardenData = useCallback(async () => {
    const hasCache = Boolean(getCached(sKey) || getCached(cKey));
    if (!hasCache) {
      setDataLoading(true);
    }

    try {
      const [sRes, cRes, dRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/warden/students?hostel_block=${encodeURIComponent(hostelBlock)}`),
        apiFetch(`${apiUrl}/api/complaints?role=Warden&hostel_block=${encodeURIComponent(hostelBlock)}`),
        apiFetch(`${apiUrl}/api/departments?hostel_block=${encodeURIComponent(hostelBlock)}`)
      ]);

      if (sRes.ok) {
        const d = await sRes.json();
        setStudents(d);
        setCached(sKey, d);
      }
      if (cRes.ok) {
        const d = await cRes.json();
        setComplaints(d);
        setCached(cKey, d);
      }
      if (dRes.ok) {
        const d = await dRes.json();
        setDepartments(d);
        setCached(dKey, d);
      }
    } catch (e) {
      console.error('Warden sync error:', e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, hostelBlock, sKey, cKey, dKey]);

  useEffect(() => {
    loadWardenData();
  }, [loadWardenData]);

  const handleOpenEditStudent = (st) => {
    setEditingStudent(st);
    setEditForm({
      hostel_block: st.hostel_block || hostelBlock,
      wing: st.wing || 'Wing A',
      room: st.room || '',
      phone: st.phone || ''
    });
    setPage('edit_student');
  };

  const handleSaveStudentEdit = async (e) => {
    e.preventDefault();
    if (!editingStudent) return;

    // Optimistic UI update
    const movedToAnotherHostel = editForm.hostel_block !== hostelBlock;
    const updatedStudents = movedToAnotherHostel
      ? students.filter((s) => s.user_id !== editingStudent.user_id)
      : students.map((s) => (s.user_id === editingStudent.user_id ? { ...s, ...editForm } : s));

    setStudents(updatedStudents);
    setCached(sKey, updatedStudents);
    setMsg(
      movedToAnotherHostel
        ? `✅ Transferred ${editingStudent.full_name} to ${editForm.hostel_block}!`
        : `✅ Updated room details for ${editingStudent.full_name}!`
    );
    setPage('directory');

    try {
      await apiFetch(`${apiUrl}/api/warden/update-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingStudent.user_id,
          ...editForm
        })
      });
      loadWardenData();
    } catch (err) {
      setMsg('❌ Error syncing student update.');
      loadWardenData();
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    const added = { ...newStudent, hostel_block: hostelBlock, role: 'Student' };
    const updated = [added, ...students];
    setStudents(updated);
    setCached(sKey, updated);
    setMsg(`✅ Resident ${newStudent.full_name} added!`);
    setNewStudent({ user_id: '', full_name: '', wing: 'Wing A', room: '', department: 'Civil Engineering', year: '1st Year', phone: '' });
    setPage('directory');

    try {
      await apiFetch(`${apiUrl}/api/warden/add-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(added)
      });
      loadWardenData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateHostelWing = async (e) => {
    e.preventDefault();
    setMsg(`✅ Maintenance Wing "${newDept.name}" created!`);
    const payload = { ...newDept, hostel_block: hostelBlock, type: 'Hostel' };
    setNewDept({ dept_id: '', name: '', email: '', icon: '🛠️' });

    try {
      await apiFetch(`${apiUrl}/api/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadWardenData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTicketStatus = async (ticketId, status) => {
    const updated = complaints.map((c) =>
      c.ticket_id === ticketId
        ? { ...c, status, staff_remark: wardenRemark || c.staff_remark }
        : c
    );
    setComplaints(updated);
    setCached(cKey, updated);
    setMsg(`✅ Ticket ${ticketId} marked as ${status}!`);
    setWardenRemark('');
    setPage('complaints');

    try {
      await apiFetch(`${apiUrl}/api/complaints/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          status,
          remark: wardenRemark || 'Updated by Chief Warden Office'
        })
      });
      loadWardenData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      (s.full_name || '').toLowerCase().includes(q) ||
      (s.user_id || '').toLowerCase().includes(q) ||
      (s.room || '').toLowerCase().includes(q) ||
      (s.wing || '').toLowerCase().includes(q)
    );
  });

  const filteredRegister = complaints.filter((c) => {
    const wingMatch = regWing === 'All' || (c.wing || '').toLowerCase().includes(regWing.toLowerCase());
    const catMatch = regCategory === 'All' || (c.routed_to || '') === regCategory || (c.category || '') === regCategory;
    return wingMatch && catMatch;
  });

  const handlePrintRegister = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rowsHtml = filteredRegister
      .map(
        (c) => `
        <tr>
          <td><strong>${c.ticket_id}</strong><br/><small>${c.created_at || ''}</small></td>
          <td>${c.wing || '-'} / ${c.room || '-'}</td>
          <td>${c.student_name || c.student_id || '-'}</td>
          <td>${c.student_phone || '-'}</td>
          <td>${c.routed_to || c.category || '-'}</td>
          <td><strong>${c.summary}</strong><br/><small>${c.description || ''}</small></td>
          <td>${c.status}</td>
        </tr>`
      )
      .join('');

    win.document.write(`
      <html>
        <head>
          <title>${hostelBlock} - Official Complaint Register</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #111; }
            h2 { margin: 0 0 4px 0; color: #002970; }
            p { margin: 0 0 12px 0; font-size: 12px; color: #555; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ccc; padding: 7px 8px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; color: #002970; }
          </style>
        </head>
        <body>
          <h2>${hostelBlock} — Physical Maintenance & Grievance Register</h2>
          <p>Wing Filter: ${regWing} | Category Filter: ${regCategory} | Total Records: ${filteredRegister.length}</p>
          <table>
            <thead>
              <tr>
                <th>Ticket / Date</th>
                <th>Wing / Room</th>
                <th>Student</th>
                <th>Mobile</th>
                <th>Category</th>
                <th>Complaint / Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>window.onload = () => { window.print(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const pendingCount = complaints.filter((c) => c.status !== 'Completed').length;

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Warden Home</button>
        <button className={`ptm-side-btn ${page === 'add_student' ? 'active' : ''}`} onClick={() => setPage('add_student')}>➕ Add / Upload Students</button>
        <button className={`ptm-side-btn ${page === 'directory' || page === 'edit_student' ? 'active' : ''}`} onClick={() => setPage('directory')}>🎓 Student Directory ({students.length})</button>
        <button className={`ptm-side-btn ${page === 'wings' ? 'active' : ''}`} onClick={() => setPage('wings')}>🛠️ Hostel Maintenance Wings</button>
        <button className={`ptm-side-btn ${page === 'complaints' || page === 'ticket_detail' ? 'active' : ''}`} onClick={() => setPage('complaints')}>💬 Hostel Complaints ({complaints.length})</button>
        <button className={`ptm-side-btn ${page === 'register' ? 'active' : ''}`} onClick={() => setPage('register')}>📋 Complaint Register</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {dataLoading ? (
          <div className="ptm-wheel-box">
            <div className="ptm-spinner-wheel" />
            <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>
              Loading {hostelBlock} Warden Portal...
            </div>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={() => setPage('directory')}>
                    <div className="ptm-row-between">
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6B7280' }}>{hostelBlock} Residents</span>
                      <span>🎓</span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{students.length} Students</div>
                    <button className="ptm-mini-btn">Manage Directory →</button>
                  </div>

                  <div className="ptm-mini-card" onClick={() => setPage('complaints')}>
                    <div className="ptm-row-between">
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6B7280' }}>Active Grievances</span>
                      <span>🛠️</span>
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{pendingCount} Open</div>
                    <button className="ptm-mini-btn">View All ({complaints.length}) →</button>
                  </div>

                  <div className="ptm-mini-card" onClick={() => setPage('register')}>
                    <div className="ptm-row-between">
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6B7280' }}>Physical Audit PDF</span>
                      <span>📋</span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '4px' }}>Print Register</div>
                    <button className="ptm-mini-btn">Export Landscape PDF →</button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">{hostelBlock} Chief Warden Controls</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('directory')}>
                      <div className="ptm-icon-circle">🎓</div>
                      <span className="ptm-icon-label">Student Directory</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('complaints')}>
                      <div className="ptm-icon-circle">💬</div>
                      <span className="ptm-icon-label">Hostel Complaints</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('register')}>
                      <div className="ptm-icon-circle">📋</div>
                      <span className="ptm-icon-label">Complaint Register</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('wings')}>
                      <div className="ptm-icon-circle">🛠️</div>
                      <span className="ptm-icon-label">Maintenance Wings</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {page === 'directory' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">{hostelBlock} Student Directory</h1>
                  <p className="ptm-page-sub">Tap "✏️ Edit" on any student to change their Room, Wing, or transfer them to another Hostel Bhawan.</p>
                </div>

                <div className="ptm-card">
                  <input
                    type="text"
                    className="ptm-input"
                    placeholder="🔍 Search by Roll No, Name, or Room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ marginBottom: '14px', borderRadius: '999px' }}
                  />

                  {filteredStudents.length === 0 ? (
                    <div className="ptm-list-sub" style={{ textAlign: 'center', padding: '20px' }}>No matching students found.</div>
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
                              🚪 {st.wing || 'Wing'} • Room {st.room || '-'} • {st.year || '1st Year'} • {st.department || 'SVNIT'} • 📞 {st.phone || 'N/A'}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ptm-btn-secondary"
                            style={{ width: 'auto', padding: '7px 14px', fontSize: '12px' }}
                            onClick={() => handleOpenEditStudent(st)}
                          >
                            ✏️ Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'edit_student' && editingStudent && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('directory')}>←</button>
                  <h1 className="ptm-page-title">Edit / Transfer Resident</h1>
                  <p className="ptm-page-sub">{editingStudent.full_name} ({editingStudent.user_id})</p>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleSaveStudentEdit} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Hostel Bhawan (Select another Bhawan to auto-transfer resident)</label>
                      <select
                        className="ptm-input"
                        value={editForm.hostel_block}
                        onChange={(e) => setEditForm({ ...editForm, hostel_block: e.target.value })}
                      >
                        {ALL_BHAWANS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ptm-label">Hostel Wing</label>
                      <input
                        type="text"
                        className="ptm-input"
                        value={editForm.wing}
                        onChange={(e) => setEditForm({ ...editForm, wing: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Room Number</label>
                      <input
                        type="text"
                        className="ptm-input"
                        value={editForm.room}
                        onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Mobile Number</label>
                      <input
                        type="text"
                        className="ptm-input"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="ptm-btn-primary">💾 Save Changes & Route Student</button>
                  </form>
                </div>
              </div>
            )}

            {page === 'add_student' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Add Resident to {hostelBlock}</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleAddStudent} className="ptm-form-stack">
                    <input type="text" className="ptm-input" placeholder="Roll No (e.g. U26CE011)" value={newStudent.user_id} onChange={(e) => setNewStudent({ ...newStudent, user_id: e.target.value.toUpperCase() })} required />
                    <input type="text" className="ptm-input" placeholder="Student Full Name" value={newStudent.full_name} onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })} required />
                    <input type="text" className="ptm-input" placeholder="Wing (e.g. Wing D)" value={newStudent.wing} onChange={(e) => setNewStudent({ ...newStudent, wing: e.target.value })} required />
                    <input type="text" className="ptm-input" placeholder="Room Number (e.g. D-315)" value={newStudent.room} onChange={(e) => setNewStudent({ ...newStudent, room: e.target.value })} required />
                    <input type="text" className="ptm-input" placeholder="Mobile Number" value={newStudent.phone} onChange={(e) => setNewStudent({ ...newStudent, phone: e.target.value })} />
                    <button type="submit" className="ptm-btn-primary">+ Add Resident</button>
                  </form>
                </div>
              </div>
            )}

            {page === 'wings' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">{hostelBlock} Maintenance Wings</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleCreateHostelWing} className="ptm-form-stack">
                    <input type="text" className="ptm-input" placeholder="Wing Code (e.g. MESS_GAJJAR)" value={newDept.dept_id} onChange={(e) => setNewDept({ ...newDept, dept_id: e.target.value.toUpperCase() })} required />
                    <input type="text" className="ptm-input" placeholder="Wing Title (e.g. Gajjar Mess & Water Committee)" value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} required />
                    <input type="email" className="ptm-input" placeholder="Supervisor Email" value={newDept.email} onChange={(e) => setNewDept({ ...newDept, email: e.target.value })} />
                    <button type="submit" className="ptm-btn-primary">+ Add Hostel Wing</button>
                  </form>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Active Maintenance Departments</div>
                  <div className="ptm-list">
                    {departments.map((d) => (
                      <div key={d.id} className="ptm-list-row">
                        <div className="ptm-avatar-pastel">{d.icon || '🛠️'}</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{d.title}</div>
                          <div className="ptm-list-sub">ID: {d.id} • Scope: {d.type || 'Hostel'}</div>
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
                  <h1 className="ptm-page-title">{hostelBlock} Grievances ({complaints.length})</h1>
                </div>
                <div className="ptm-card">
                  {complaints.length === 0 ? (
                    <div className="ptm-list-sub">No complaints found for {hostelBlock}.</div>
                  ) : (
                    <div className="ptm-list">
                      {complaints.map((c) => (
                        <div key={c.ticket_id} className="ptm-list-row" onClick={() => { setSelectedTicket(c); setPage('ticket_detail'); }}>
                          <div className="ptm-avatar-pastel">🛠️</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{c.summary}</div>
                            <div className="ptm-list-sub">
                              {c.ticket_id} • {c.wing} Room {c.room} • {c.student_name || c.student_id}
                            </div>
                            <span className="ptm-tag-pill">{c.routed_to} • {c.created_at}</span>
                          </div>
                          <span className="ptm-status-badge" style={{ background: c.status === 'Completed' ? '#DCFCE7' : '#FEF3C7', color: c.status === 'Completed' ? '#15803D' : '#B45309' }}>
                            {c.status} ›
                          </span>
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
                  <span className="ptm-tag-pill">{selectedTicket.ticket_id} • {selectedTicket.wing} Room {selectedTicket.room}</span>
                  <h1 className="ptm-page-title">{selectedTicket.summary}</h1>
                </div>
                <div className="ptm-card">
                  <p style={{ marginBottom: '12px' }}>{selectedTicket.description}</p>
                  <div className="ptm-list-sub" style={{ marginBottom: '14px' }}>
                    <strong>Student:</strong> {selectedTicket.student_name || selectedTicket.student_id} • 📞 {selectedTicket.student_phone || 'N/A'}
                  </div>
                  <textarea
                    rows="2"
                    className="ptm-input"
                    placeholder="Add Warden / Maintenance Supervisor action remark..."
                    value={wardenRemark}
                    onChange={(e) => setWardenRemark(e.target.value)}
                    style={{ marginBottom: '12px' }}
                  />
                  <div className="ptm-grid-2">
                    <button className="ptm-btn-primary" onClick={() => handleUpdateTicketStatus(selectedTicket.ticket_id, 'Awaiting Confirmation')}>
                      ⚡ Mark Action Taken (Ask Student to Verify)
                    </button>
                    <button className="ptm-btn-secondary" onClick={() => handleUpdateTicketStatus(selectedTicket.ticket_id, 'In Progress')}>
                      🔧 Mark In Progress
                    </button>
                  </div>
                </div>
              </div>
            )}

            {page === 'register' && (
              <div>
                <div className="ptm-drill-header">
                  <span className="ptm-tag-pill">{hostelBlock} • PHYSICAL REGISTER</span>
                  <h1 className="ptm-page-title">Hostel Complaint Register</h1>
                  <p className="ptm-page-sub">Filter maintenance requests by wing and category, then export a print-ready landscape register.</p>
                </div>

                <div className="ptm-card">
                  <div className="ptm-grid-2" style={{ marginBottom: '14px' }}>
                    <div>
                      <label className="ptm-label">Wing</label>
                      <select className="ptm-input" value={regWing} onChange={(e) => setRegWing(e.target.value)}>
                        <option value="All">All Wings</option>
                        {['Wing A', 'Wing B', 'Wing C', 'Wing D', 'Wing E', 'Wing F', 'Wing G', 'Wing H'].map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ptm-label">Category</label>
                      <select className="ptm-input" value={regCategory} onChange={(e) => setRegCategory(e.target.value)}>
                        <option value="All">All Categories</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.title}>{d.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button className="ptm-btn-primary" onClick={handlePrintRegister}>
                    📥 Download Register PDF ({filteredRegister.length})
                  </button>
                </div>

                <div className="ptm-card" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB', textAlign: 'left' }}>
                        <th style={{ padding: '10px 8px' }}>Ticket / Date</th>
                        <th style={{ padding: '10px 8px' }}>Wing / Room</th>
                        <th style={{ padding: '10px 8px' }}>Student</th>
                        <th style={{ padding: '10px 8px' }}>Mobile</th>
                        <th style={{ padding: '10px 8px' }}>Category</th>
                        <th style={{ padding: '10px 8px' }}>Complaint / Action</th>
                        <th style={{ padding: '10px 8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRegister.map((c) => (
                        <tr key={c.ticket_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 8px' }}><strong>{c.ticket_id}</strong><br/><span style={{ fontSize: '11px', color: '#6B7280' }}>{c.created_at}</span></td>
                          <td style={{ padding: '10px 8px' }}>{c.wing}<br/>{c.room}</td>
                          <td style={{ padding: '10px 8px' }}>{c.student_name || c.student_id}</td>
                          <td style={{ padding: '10px 8px' }}>{c.student_phone || '-'}</td>
                          <td style={{ padding: '10px 8px' }}>{c.routed_to || c.category}</td>
                          <td style={{ padding: '10px 8px' }}><strong>{c.summary}</strong><br/>{c.description}</td>
                          <td style={{ padding: '10px 8px' }}>{c.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        <button className={`ptm-bnav-btn ${page === 'directory' ? 'active' : ''}`} onClick={() => setPage('directory')}><span>🎓</span><span>Directory</span></button>
        <button className={`ptm-bnav-btn ${page === 'complaints' ? 'active' : ''}`} onClick={() => setPage('complaints')}><span>💬</span><span>Tickets</span></button>
        <button className={`ptm-bnav-btn ${page === 'register' ? 'active' : ''}`} onClick={() => setPage('register')}><span>📋</span><span>Register</span></button>
      </nav>
    </div>
  );
}