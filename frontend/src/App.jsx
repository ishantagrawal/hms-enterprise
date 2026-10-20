import React, { useState, useEffect, useCallback } from 'react';

// =========================================================
// GLOBAL API & CONFIGURATION
// =========================================================
const API_URL = 'https://hms-enterprise-mqvx.onrender.com';

const COMPLAINT_CATEGORIES = [
  { id: 'Electricity', title: 'Electricity', icon: '⚡' },
  { id: 'Plumbing', title: 'Plumbing', icon: '🚰' },
  { id: 'LAN / Wi-Fi', title: 'LAN / Wi-Fi', icon: '🌐' },
  { id: 'Carpentry', title: 'Carpentry', icon: '🪚' },
  { id: 'Water Cooler', title: 'RO / Water Cooler', icon: '💧' },
  { id: 'Mess & Hygiene', title: 'Cleaning & Hygiene', icon: '🧹' }
];

const SVNIT_HOSTELS = [
  { code: 'GAJJAR', name: 'Gajjar Bhawan', cwId: 'CW_GAJJAR', wId: 'W_GAJJAR', ext: '0261-2201659', icon: '🏢' },
  { code: 'BHABHA', name: 'Bhabha Bhawan', cwId: 'CW_BHABHA', wId: 'W_BHABHA', ext: '0261-2201790', icon: '🏢' },
  { code: 'MTB', name: 'Mother Teresa Bhawan', cwId: 'CW_MTB', wId: 'W_MTB', ext: '0261-2201967', icon: '🏢' },
  { code: 'SVB', name: 'Swami Vivekananda Bhawan', cwId: 'CW_SVB', wId: 'W_SVB', ext: '0261-2201657', icon: '🏢' },
  { code: 'NEHRU', name: 'Nehru Bhawan', cwId: 'CW_NEHRU', wId: 'W_NEHRU', ext: '0261-2201703', icon: '🏢' },
  { code: 'TAGORE', name: 'Tagore Bhawan', cwId: 'CW_TAGORE', wId: 'W_TAGORE', ext: '0261-2201707', icon: '🏢' },
  { code: 'SARABHAI', name: 'Sarabhai Bhawan', cwId: 'CW_SARABHAI', wId: 'W_SARABHAI', ext: '0261-2201793', icon: '🏢' },
  { code: 'RAMAN', name: 'Raman Bhawan', cwId: 'CW_RAMAN', wId: 'W_RAMAN', ext: '0261-2201789', icon: '🏢' },
  { code: 'ABVB', name: 'Atal Bihari Vajpayee Bhawan', cwId: 'CW_ABVB', wId: 'W_ABVB', ext: '0261-2201880', icon: '🏢' }
];

const SAMPLE_CSV_DATA = `U26CE011, Ishant Agrawal, Gajjar Bhawan, B-204, Civil Engineering, +919876543210, u26ce011@svnit.ac.in, 10072007
U26CS099, DevanshVerma, Bhabha Bhawan, A-105, Computer Engineering, +919876500011, u26cs099@svnit.ac.in, 24052007
U26AI015, Ananya Sharma, Mother Teresa Bhawan, C-201, Artificial Intelligence, +919876500022, u26ai015@svnit.ac.in, 12102007
U26ME042, Harshil Patel, Swami Vivekananda Bhawan, D-309, Mechanical Engineering, +919876500033, u26me042@svnit.ac.in, 08012007`;

const getCategoryIcon = (catName) => {
  const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
  return found ? found.icon : '🛠️';
};

const getStatusColor = (status) => {
  if (status === 'Completed' || status === 'Approved') return '#4ade80';
  if (status === 'Awaiting Confirmation') return '#38bdf8';
  if (status === 'Pending Dean Approval' || status === 'Pending' || status === 'In Progress') return '#fbbf24';
  return '#f87171';
};

// =========================================================
// 1. FOUNDER PORTAL (Multi-NIT, Bulk Students, Create Club, Security)
// =========================================================
function FounderPortal({ apiUrl }) {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [clubsList, setClubsList] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('SVNIT');
  const [newHostelName, setNewHostelName] = useState('');
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [clubForm, setClubForm] = useState({ club_id: '', name: '', mission: '', faculty_advisor: '', head_coordinator: '' });
  const [msg, setMsg] = useState(null);

  const [founderNewPass, setFounderNewPass] = useState('');
  const [targetUserId, setTargetUserId] = useState('DEAN');
  const [targetNewPass, setTargetNewPass] = useState('');

  const loadFounderData = useCallback(async () => {
    try {
      const [tRes, sRes, cRes] = await Promise.all([
        fetch(`${apiUrl}/api/founder/tenants`),
        fetch(`${apiUrl}/api/founder/students`),
        fetch(`${apiUrl}/api/unicore/clubs`)
      ]);
      if (tRes.ok) { const d = await tRes.json(); if (Array.isArray(d)) setTenants(d); }
      if (sRes.ok) { const d = await sRes.json(); if (Array.isArray(d)) setStudentsList(d); }
      if (cRes.ok) { const d = await cRes.json(); if (Array.isArray(d)) setClubsList(d); }
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadFounderData(); }, [loadFounderData]);

  const handleToggleModule = async (instId, modKey, currentVal) => {
    try {
      const res = await fetch(`${apiUrl}/api/founder/toggle-module`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: instId, module_key: modKey, enabled: !currentVal })
      });
      if (res.ok) { setMsg(`✅ Module '${modKey}' updated for ${instId}`); loadFounderData(); }
    } catch { setMsg('❌ Failed to update module.'); }
  };

  const handleAddHostel = async (e) => {
    e.preventDefault();
    if (!newHostelName.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/founder/add-hostel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: selectedTenantId, hostel_name: newHostelName.trim() })
      });
      if (res.ok) { setMsg(`🏢 Added '${newHostelName}' to ${selectedTenantId}`); setNewHostelName(''); loadFounderData(); }
    } catch { setMsg('❌ Failed to add hostel.'); }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    try {
      const lines = bulkCsvText.trim().split('\n');
      const parsed = [];
      for (let l of lines) {
        const p = l.split(',').map((x) => x.trim());
        if (p.length >= 8) {
          parsed.push({
            user_id: p[0], full_name: p[1], hostel_block: p[2], room: p[3],
            department: p[4], phone: p[5], email: p[6], dob: p[7]
          });
        }
      }
      if (parsed.length === 0) {
        setMsg('❌ Please enter valid comma-separated lines (8 columns).');
        return;
      }
      const res = await fetch(`${apiUrl}/api/founder/upload-students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setBulkCsvText('');
        loadFounderData();
      } else setMsg(`❌ ${data.detail || 'Upload failed'}`);
    } catch { setMsg('❌ CSV parsing error.'); }
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/founder/create-club`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clubForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setClubForm({ club_id: '', name: '', mission: '', faculty_advisor: '', head_coordinator: '' });
        loadFounderData();
      } else setMsg(`❌ ${data.detail || 'Creation failed'}`);
    } catch { setMsg('❌ Connection error.'); }
  };

  const handleChangeFounderPass = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=FOUNDER`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: 'FOUNDER', new_password: founderNewPass.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) { setMsg('🔒 Founder Master Password hardened & saved!'); setFounderNewPass(''); }
    } catch { setMsg('❌ Error.'); }
  };

  const handleOverrideUserPass = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=FOUNDER`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId.trim().toUpperCase(), new_password: targetNewPass.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) { setMsg(`✅ ${data.message}`); setTargetNewPass(''); }
      else setMsg(`❌ ${data.detail || 'Failed'}`);
    } catch { setMsg('❌ Error.'); }
  };

  const activeNit = tenants.find((t) => t.institute_id === selectedTenantId) || tenants[0] || {};

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-hero-banner">
        <div>
          <span className="hms-pill-badge">👑 MULTI-NIT FOUNDER HQ</span>
          <h2>Cloud Control & Multi-Campus Tenant Manager</h2>
          <p>Configure NIT modules, bulk upload students with DOB passwords, and register clubs.</p>
        </div>
        <div className="hms-subtab-group">
          <button className={`hms-subtab ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>🏛️ NIT Campuses</button>
          <button className={`hms-subtab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>📥 Bulk Students ({studentsList.length})</button>
          <button className={`hms-subtab ${activeTab === 'clubs' ? 'active' : ''}`} onClick={() => setActiveTab('clubs')}>🎭 Create Club ({clubsList.length})</button>
          <button className={`hms-subtab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>🔐 Master Security</button>
        </div>
      </div>

      {activeTab === 'tenants' && (
        <>
          <div className="hms-chip-strip">
            {tenants.map((nit) => (
              <button key={nit.institute_id} onClick={() => setSelectedTenantId(nit.institute_id)} className={`hms-campus-chip ${selectedTenantId === nit.institute_id ? 'active' : ''}`}>
                🏛️ {nit.institute_id} — {nit.city}
              </button>
            ))}
          </div>
          <div className="hms-grid-2">
            <div className="hms-card">
              <h3>{activeNit.name}</h3>
              <p className="hms-muted">📍 {activeNit.city}</p>
              <div className="hms-section-label" style={{ marginTop: '16px' }}>⚡ Live Module Toggles</div>
              <div className="hms-stack">
                {activeNit.modules && Object.entries(activeNit.modules).map(([k, v]) => (
                  <div key={k} className="hms-row-item">
                    <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{k.replace('_', ' ')}</span>
                    <button onClick={() => handleToggleModule(activeNit.institute_id, k, v)} className={v ? 'hms-btn-primary-sm' : 'hms-btn-ghost-sm'}>
                      {v ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="hms-card">
              <div className="hms-section-label">🏢 Configured Hostels ({activeNit.hostels?.length || 0})</div>
              <div className="hms-tag-cloud" style={{ marginBottom: '16px' }}>
                {activeNit.hostels?.map((h, i) => <span key={i} className="hms-tag">🏠 {h}</span>)}
              </div>
              <form onSubmit={handleAddHostel} className="hms-stack">
                <input type="text" className="hms-input" placeholder={`Add new hostel to ${activeNit.institute_id}...`} value={newHostelName} onChange={(e) => setNewHostelName(e.target.value)} />
                <button type="submit" className="hms-btn-primary">+ Add Hostel Bhawan</button>
              </form>
            </div>
          </div>
        </>
      )}

      {activeTab === 'students' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <div className="hms-section-label" style={{ margin: 0 }}>📥 Bulk Student Upload (CSV Format)</div>
              <button type="button" className="hms-btn-ghost-sm" onClick={() => setBulkCsvText(SAMPLE_CSV_DATA)}>
                📋 Load Sample CSV
              </button>
            </div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Format: <code>RollNo, FullName, Hostel, Room, Department, Phone, Email, DOB(DDMMYYYY)</code><br />
              Default password is automatically set to the student's <strong>DOB (DDMMYYYY)</strong>.
            </p>
            <form onSubmit={handleBulkUpload} className="hms-stack">
              <textarea rows="6" className="hms-input" placeholder={SAMPLE_CSV_DATA} value={bulkCsvText} onChange={(e) => setBulkCsvText(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">📤 Upload & Register Students</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🎓 Active Registered Students ({studentsList.length})</div>
            <div className="hms-stack" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {studentsList.map((st) => (
                <div key={st.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{st.full_name} ({st.user_id})</div>
                    <div className="hms-item-sub">🏢 {st.hostel_block} (Rm {st.room}) • {st.department}</div>
                  </div>
                  <span className="hms-pill-badge">DOB: {st.dob}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clubs' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🎭 Register New Student Club / Chapter</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Creates the official club dossier AND generates a Coordinator Login ID (Default Password: <code>123</code>).
            </p>
            <form onSubmit={handleCreateClub} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Club ID / Login Code (e.g. ROBOTICS, EDC, LIT)" value={clubForm.club_id} onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value })} required />
              <input type="text" className="hms-input" placeholder="Full Club Name (e.g. Robotics & AI Society)" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
              <input type="text" className="hms-input" placeholder="Faculty Advisor Name & Dept" value={clubForm.faculty_advisor} onChange={(e) => setClubForm({ ...clubForm, faculty_advisor: e.target.value })} required />
              <input type="text" className="hms-input" placeholder="Student Head Coordinator Name" value={clubForm.head_coordinator} onChange={(e) => setClubForm({ ...clubForm, head_coordinator: e.target.value })} required />
              <textarea rows="2" className="hms-input" placeholder="Club Mission & Objectives..." value={clubForm.mission} onChange={(e) => setClubForm({ ...clubForm, mission: e.target.value })} required />
              <button type="submit" className="hms-btn-primary">✨ Create Club & Generate Login</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏛️ Registered Campus Clubs ({clubsList.length})</div>
            <div className="hms-stack" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {clubsList.map((c) => (
                <div key={c.club_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{c.name}</div>
                    <div className="hms-item-sub">Advisor: {c.faculty_advisor} • Head: {c.head_coordinator}</div>
                  </div>
                  <span className="hms-pill-badge">ID: {c.club_id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🔒 1. Strengthen Founder Master Password</div>
            <form onSubmit={handleChangeFounderPass} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Enter new hard password for FOUNDER" value={founderNewPass} onChange={(e) => setFounderNewPass(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Update Founder Password</button>
            </form>
          </div>
          <div className="hms-card">
            <div className="hms-section-label">⚡ 2. Override Any User Password</div>
            <form onSubmit={handleOverrideUserPass} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Target ID (e.g. DEAN, CW_GAJJAR, ACM, U26CE011)" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} required />
              <input type="text" className="hms-input" placeholder="New Password" value={targetNewPass} onChange={(e) => setTargetNewPass(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Execute Override</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// 2. STUDENT PORTAL (Full Event Description, Live RSVP, Feedback, Complaints)
// =========================================================
function StudentPortal({ user, complaints, apiUrl, onRefresh }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState(null);

  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedClubView, setSelectedClubView] = useState(null);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9); // October
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const loadStudentData = useCallback(async () => {
    try {
      const [evRes, clRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/unicore/clubs`)
      ]);
      if (evRes.ok) { const d = await evRes.json(); if (Array.isArray(d)) setEvents(d); }
      if (clRes.ok) { const d = await clRes.json(); if (Array.isArray(d)) setClubs(d); }
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadStudentData(); }, [loadStudentData]);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/complaints`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, category, summary, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ Grievance ${data.ticket.ticket_id} registered & routed to ${data.ticket.routed_to}!`);
        setSummary(''); setDescription(''); setShowNewModal(false); onRefresh();
      }
    } catch { setMsg('❌ Failed to submit complaint.'); }
    setSubmitting(false);
  };

  const handleStudentVerify = async (ticketId, satisfied) => {
    const res = await fetch(`${apiUrl}/api/complaints/student-verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, satisfied })
    });
    if (res.ok) {
      setMsg(satisfied ? '✅ Complaint verified & closed!' : '🔄 Ticket reopened for maintenance re-check!');
      setSelectedTicket(null);
      onRefresh();
    }
  };

  const handleRsvp = async (eventId) => {
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: user.user_id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(data.message);
        setEvents((prev) => prev.map((ev) => (ev.event_id === eventId ? { ...ev, rsvps: data.rsvps } : ev)));
        setSelectedEvent((prev) => (prev && prev.event_id === eventId ? { ...prev, rsvps: data.rsvps } : prev));
      }
    } catch { setMsg('❌ Failed to update RSVP.'); }
  };

  const handleFeedbackSubmit = async (e, eventId) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: user.user_id, rating: feedbackRating, review: feedbackReview })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('🤖 Thank you! Your feedback has been added to the AI Event Audit!');
        setFeedbackReview('');
        setSelectedEvent(data.event);
        loadStudentData();
      }
    } catch { setMsg('❌ Failed to submit feedback.'); }
  };

  const handleSelfPassChange = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/student/change-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      if (res.ok && data.success) { setMsg('✅ Custom password saved!'); setOldPass(''); setNewPass(''); }
      else setMsg(`❌ ${data.detail || 'Failed'}`);
    } catch { setMsg('❌ Error.'); }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset, y = calYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m); setCalYear(y);
  };

  const filteredComplaints = complaints.filter(
    (c) =>
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticket_id.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const actionPending = complaints.filter((c) => c.status === 'Awaiting Confirmation').length;
  const studentVisibleEvents = events.filter((e) => e.status === 'Approved' || e.status === 'Completed');
  const upcomingEvents = studentVisibleEvents.filter((e) => e.status === 'Approved');
  const completedEvents = studentVisibleEvents.filter((e) => e.status === 'Completed');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>
          💬 My Grievances {actionPending > 0 && <span className="hms-badge-inline">{actionPending}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'eventradar' ? 'active' : ''}`} onClick={() => setActiveTab('eventradar')}>
          📡 EventRadar & Clubs ({studentVisibleEvents.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
          📅 Night Attendance
        </button>
        <button className={`hms-dtab ${activeTab === 'leave' ? 'active' : ''}`} onClick={() => setActiveTab('leave')}>
          🪪 Leave & Outpass
        </button>
        <button className={`hms-dtab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          👤 Profile & Password
        </button>
      </div>

      {/* TAB 1: COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div>
          <div className="hms-toolbar">
            <div className="hms-search-box">
              <span>🔍</span>
              <input type="text" placeholder="Search complaints by summary, category, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <button className="hms-btn-primary" style={{ width: 'auto' }} onClick={() => setShowNewModal(true)}>
              + Lodge New Grievance
            </button>
          </div>

          {filteredComplaints.length === 0 ? (
            <div className="hms-empty-card">
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📭</div>
              <h3>No Grievances Found</h3>
              <p className="hms-muted">Tap "+ Lodge New Grievance" to report any room or hostel issue.</p>
            </div>
          ) : (
            <div className="hms-grid-2">
              {filteredComplaints.map((c) => (
                <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                  <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                  <div style={{ flex: 1 }}>
                    <div className="hms-row-between">
                      <span className="hms-item-title">{c.summary}</span>
                      <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                    </div>
                    <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                    <div className="hms-row-between" style={{ marginTop: '6px' }}>
                      <span className="hms-item-sub">{c.ticket_id} • {c.category}</span>
                      <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                        {c.status === 'Awaiting Confirmation' ? '⚡ Tap to Verify Resolution' : c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="hms-fab-mobile" onClick={() => setShowNewModal(true)}>+</button>
        </div>
      )}

      {/* TAB 2: EVENTRADAR & CLUBS */}
      {activeTab === 'eventradar' && (
        <div className="hms-stack" style={{ gap: '22px' }}>
          <div className="hms-grid-calendar-layout">
            {/* Monthly Calendar */}
            <div className="hms-card">
              <div className="hms-row-between" style={{ marginBottom: '14px' }}>
                <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
                <h3 style={{ margin: 0 }}>🗓️ {monthNames[calMonth]} {calYear}</h3>
                <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
              </div>
              <div className="hms-cal-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="hms-cal-head">{d}</div>)}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="hms-cal-day empty" />)}
                {Array.from({ length: daysNum }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const matched = studentVisibleEvents.filter((e) => e.date === dateStr);
                  return (
                    <div key={dateStr} className="hms-cal-day">
                      <span className="hms-cal-num">{dayNum}</span>
                      {matched.map((ev) => (
                        <div
                          key={ev.event_id}
                          onClick={() => setSelectedEvent(ev)}
                          className="hms-cal-pill"
                          style={{ background: ev.status === 'Completed' ? '#475569' : '#8b5cf6' }}
                        >
                          {ev.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming & Past Events Sidebar */}
            <div className="hms-stack">
              <div className="hms-card">
                <div className="hms-section-label">🎟️ Upcoming Approved Campus Events ({upcomingEvents.length})</div>
                <div className="hms-stack">
                  {upcomingEvents.map((ev) => {
                    const isGoing = ev.rsvps?.some((r) => r.toUpperCase() === user.user_id.toUpperCase());
                    return (
                      <div key={ev.event_id} className="hms-item-card" onClick={() => setSelectedEvent(ev)}>
                        <div className="hms-avatar-circle">🎪</div>
                        <div style={{ flex: 1 }}>
                          <div className="hms-row-between">
                            <span className="hms-item-title">{ev.title}</span>
                            <span className="hms-pill-badge">{ev.club_id}</span>
                          </div>
                          <p className="hms-item-sub" style={{ margin: '4px 0', color: '#cbd5e1' }}>{ev.description}</p>
                          <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                          <div className="hms-row-between" style={{ marginTop: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 800 }}>
                              👥 {ev.rsvps?.length || 0} Students Attending
                            </span>
                            <span className="hms-status-pill" style={{ color: isGoing ? '#4ade80' : '#c084fc', borderColor: isGoing ? '#4ade80' : '#8b5cf6' }}>
                              {isGoing ? '✓ You Are Going' : 'Are You Attending? →'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="hms-card">
                <div className="hms-section-label">⭐ Past Completed Events — Give Feedback & View AI Audit ({completedEvents.length})</div>
                <div className="hms-stack">
                  {completedEvents.map((ev) => (
                    <div key={ev.event_id} className="hms-item-card" onClick={() => setSelectedEvent(ev)}>
                      <div className="hms-avatar-circle">🏁</div>
                      <div style={{ flex: 1 }}>
                        <div className="hms-row-between">
                          <span className="hms-item-title">{ev.title}</span>
                          <span className="hms-pill-badge">{ev.club_id}</span>
                        </div>
                        <p className="hms-item-sub" style={{ margin: '4px 0' }}>{ev.description}</p>
                        <div className="hms-row-between" style={{ marginTop: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>
                            ⭐ Avg Rating: {ev.ai_audit?.average_rating || 4.9}/5.0 ({ev.feedbacks?.length || 0} reviews)
                          </span>
                          <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>
                            Tap to Rate & View AI Audit →
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Official Campus Clubs Directory for Students */}
          <div className="hms-card">
            <div className="hms-section-label">🏛️ Explore Official Student Clubs & Chapters ({clubs.length})</div>
            <div className="hms-grid-3">
              {clubs.map((c) => (
                <div key={c.club_id} className="hms-item-card" onClick={() => setSelectedClubView(c)}>
                  <div className="hms-avatar-circle">🎭</div>
                  <div style={{ flex: 1 }}>
                    <div className="hms-row-between">
                      <span className="hms-item-title">{c.name}</span>
                      <span className="hms-pill-badge">{c.club_id}</span>
                    </div>
                    <p className="hms-item-sub" style={{ margin: '6px 0' }}>{c.mission}</p>
                    <div style={{ fontSize: '11px', color: '#c084fc', fontWeight: 700 }}>
                      👥 {c.members?.length || 0} Core Members • Tap for Dossier
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ATTENDANCE - COMING SOON */}
      {activeTab === 'attendance' && (
        <div className="hms-card" style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '540px', margin: '0 auto' }}>
          <span className="hms-pill-badge">PHASE 2 ROLLOUT • COMING SOON</span>
          <div style={{ fontSize: '50px', margin: '16px 0' }}>📅</div>
          <h3>Hostel Night Attendance</h3>
          <p className="hms-muted">Smart geo-fenced night roll-call synced with the Council of Wardens is currently under phase-2 deployment and coming soon.</p>
        </div>
      )}

      {/* TAB 4: LEAVE PASS - COMING SOON */}
      {activeTab === 'leave' && (
        <div className="hms-card" style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '540px', margin: '0 auto' }}>
          <span className="hms-pill-badge">PHASE 2 ROLLOUT • COMING SOON</span>
          <div style={{ fontSize: '50px', margin: '16px 0' }}>🪪</div>
          <h3>Digital Leave & Gate Outpass</h3>
          <p className="hms-muted">Paperless leave applications with instant Warden approval and main-gate QR code verification will be available soon.</p>
        </div>
      )}

      {/* TAB 5: PROFILE & SELF PASSWORD CHANGE */}
      {activeTab === 'profile' && (
        <div className="hms-grid-2">
          <div className="hms-card" style={{ textAlign: 'center' }}>
            <div className="hms-profile-avatar">{user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
            <h2 style={{ margin: '12px 0 4px 0' }}>{user.full_name}</h2>
            <span className="hms-pill-badge">{user.user_id} • Verified Resident</span>
            <div className="hms-stack" style={{ marginTop: '20px', textAlign: 'left' }}>
              <div className="hms-row-item"><span>🏢 Hostel Bhawan</span><strong>{user.hostel_block}</strong></div>
              <div className="hms-row-item"><span>🚪 Room</span><strong>Room {user.room}</strong></div>
              <div className="hms-row-item"><span>🎓 Department</span><strong>{user.department}</strong></div>
              <div className="hms-row-item"><span>📞 Phone</span><strong>{user.phone}</strong></div>
              <div className="hms-row-item"><span>✉️ Email</span><strong>{user.email}</strong></div>
            </div>
          </div>
          <div className="hms-card">
            <div className="hms-section-label">🔐 Change My Account Password</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Your initial default password is your Date of Birth (<code>DDMMYYYY</code>). Set your own custom password below. If you ever forget it, your Hostel Warden can reset it for you.
            </p>
            <form onSubmit={handleSelfPassChange} className="hms-stack">
              <input type="password" className="hms-input" placeholder="Current Password or Default DOB (DDMMYYYY)" value={oldPass} onChange={(e) => setOldPass(e.target.value)} required />
              <input type="password" className="hms-input" placeholder="Enter New Custom Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">💾 Save Custom Password</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: LODGE NEW COMPLAINT */}
      {showNewModal && (
        <div className="hms-modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>📝 Lodge New Hostel Grievance</h3>
              <button className="hms-close-btn" onClick={() => setShowNewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateComplaint} className="hms-stack">
              <label className="hms-label">Select Maintenance Category</label>
              <div className="hms-cat-grid">
                {COMPLAINT_CATEGORIES.map((cat) => (
                  <div key={cat.id} onClick={() => setCategory(cat.id)} className={`hms-cat-chip ${category === cat.id ? 'active' : ''}`}>
                    <span>{cat.icon}</span><span>{cat.title}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="hms-label">Issue Title / Headline</label>
                <input type="text" className="hms-input" placeholder="e.g. Ceiling fan regulator sparking in Room B-204" value={summary} onChange={(e) => setSummary(e.target.value)} required />
              </div>
              <div>
                <label className="hms-label">Detailed Location & Problem Details</label>
                <textarea rows="3" className="hms-input" placeholder="Provide exact details, availability time, or severity..." value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <button type="submit" disabled={submitting} className="hms-btn-primary">
                {submitting ? 'Submitting...' : '🚀 Submit Grievance'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: STUDENT COMPLAINT DETAILS & VERIFICATION */}
      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedTicket.ticket_id} • {selectedTicket.category}</span>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <h3>{selectedTicket.summary}</h3>
            <p className="hms-muted">{selectedTicket.description}</p>
            <div className="hms-detail-box">
              <div><strong>Current Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status), fontWeight: 800 }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Routed Wing:</strong> {selectedTicket.routed_to}</div>
              <div style={{ marginTop: '6px' }}><strong>Logged On:</strong> {selectedTicket.created_at}</div>
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(74,222,128,0.1)', borderRadius: '8px', color: '#4ade80' }}>
                  <strong>🛠️ Staff Action Remark:</strong> {selectedTicket.staff_remark}
                </div>
              )}
            </div>
            {selectedTicket.status !== 'Completed' && (
              <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(139,92,246,0.12)', borderRadius: '12px', border: '1px solid #8b5cf6' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '10px', textAlign: 'center' }}>
                  Resident Verification: Is this maintenance issue resolved?
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="hms-btn-primary" onClick={() => handleStudentVerify(selectedTicket.ticket_id, true)}>
                    ✅ Yes, Resolved
                  </button>
                  <button className="hms-btn-danger" onClick={() => handleStudentVerify(selectedTicket.ticket_id, false)}>
                    ❌ Not Resolved (Reopen)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: STUDENT EVENT DETAILS, "ARE YOU ATTENDING?" RSVP & FEEDBACK */}
      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">🎪 {selectedEvent.club_id} CHAPTER • {selectedEvent.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>

            {selectedEvent.image_url && (
              <img src={selectedEvent.image_url} alt={selectedEvent.title} className="hms-event-img" />
            )}

            <h3 style={{ margin: '0 0 8px 0', fontSize: '19px' }}>{selectedEvent.title}</h3>
            <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
              <div className="hms-section-label" style={{ marginBottom: '4px' }}>📋 Event Description & Highlights</div>
              <p className="hms-muted" style={{ margin: 0, color: '#e2e8f0' }}>{selectedEvent.description}</p>
            </div>

            <div className="hms-detail-box">
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div>
              <div style={{ marginTop: '4px' }}>👤 <strong>Coordinator:</strong> {selectedEvent.submitted_by}</div>
              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(74,222,128,0.12)', borderRadius: '8px', color: '#4ade80', fontWeight: 800 }}>
                👥 Live Attendance Count: {selectedEvent.rsvps?.length || 0} Students Confirmed Coming
              </div>
            </div>

            {selectedEvent.registration_link && (
              <a href={selectedEvent.registration_link} target="_blank" rel="noreferrer" className="hms-link-btn">
                🔗 Open Official Google Form / Audition Registration Link
              </a>
            )}

            {/* ARE YOU ATTENDING? RSVP SECTION */}
            {selectedEvent.status !== 'Completed' ? (
              <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(139,92,246,0.12)', borderRadius: '12px', border: '1px solid #8b5cf6', textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '8px', color: '#f8fafc' }}>
                  Are you attending this campus event?
                </div>
                <button
                  className="hms-btn-primary"
                  onClick={() => handleRsvp(selectedEvent.event_id)}
                >
                  {selectedEvent.rsvps?.some((r) => r.toUpperCase() === user.user_id.toUpperCase())
                    ? `✅ Yes, You Are Attending! (${selectedEvent.rsvps.length} Going — Tap to Cancel)`
                    : `🎟️ Yes, I Am Attending! (Click to RSVP)`}
                </button>
              </div>
            ) : (
              /* COMPLETED EVENT: AI AUDIT SUMMARY & FEEDBACK FORM */
              <div style={{ marginTop: '16px' }}>
                {selectedEvent.ai_audit && (
                  <div className="hms-detail-box" style={{ borderColor: '#8b5cf6', marginBottom: '14px' }}>
                    <div className="hms-section-label">🤖 AI Post-Event Feedback Audit</div>
                    <div><strong>Total Turnout:</strong> {selectedEvent.ai_audit.total_attendees} | <strong>Avg Rating:</strong> ⭐ {selectedEvent.ai_audit.average_rating}/5.0 ({selectedEvent.ai_audit.sentiment})</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, marginTop: '8px' }}>👍 Key Highlights:</div>
                    <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
                      {selectedEvent.ai_audit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                    <div style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Areas of Improvement:</div>
                    <ul style={{ margin: '4px 0 4px 18px', padding: 0 }}>
                      {selectedEvent.ai_audit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}

                <form onSubmit={(e) => handleFeedbackSubmit(e, selectedEvent.event_id)} className="hms-stack" style={{ background: '#090d16', padding: '14px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <div className="hms-section-label" style={{ margin: 0 }}>⭐ Rate This Completed Event</div>
                  <select className="hms-input" value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                    <option value={5}>⭐⭐⭐⭐⭐ 5 - Outstanding Event</option>
                    <option value={4}>⭐⭐⭐⭐ 4 - Very Good</option>
                    <option value={3}>⭐⭐⭐ 3 - Satisfactory</option>
                    <option value={2}>⭐⭐ 2 - Needs Improvement</option>
                    <option value={1}>⭐ 1 - Poor</option>
                  </select>
                  <textarea rows="2" className="hms-input" placeholder="Write your feedback or suggestions for the organizers..." value={feedbackReview} onChange={(e) => setFeedbackReview(e.target.value)} required />
                  <button type="submit" className="hms-btn-primary">🚀 Submit Feedback to AI Audit</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: STUDENT VIEW CLUB DOSSIER */}
      {selectedClubView && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedClubView(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <span className="hms-pill-badge">OFFICIAL CHAPTER • {selectedClubView.club_id}</span>
              <button className="hms-close-btn" onClick={() => setSelectedClubView(null)}>✕</button>
            </div>
            <h3 style={{ margin: '0 0 6px 0' }}>{selectedClubView.name}</h3>
            <p className="hms-muted">{selectedClubView.mission}</p>
            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div><strong>Faculty Advisor:</strong> {selectedClubView.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Coordinator:</strong> {selectedClubView.head_coordinator}</div>
            </div>
            <div className="hms-section-label">👥 Core Committee Roster ({selectedClubView.members?.length || 0})</div>
            <div className="hms-stack">
              {selectedClubView.members?.map((m, i) => (
                <div key={i} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{m.name}</div>
                    <div className="hms-item-sub">{m.roll} • {m.phone}</div>
                  </div>
                  <span className="hms-pill-badge">{m.position}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('complaints')} className={`hms-bnav-item ${activeTab === 'complaints' ? 'active' : ''}`}><span>💬</span><span>Complaints</span></button>
        <button onClick={() => setActiveTab('eventradar')} className={`hms-bnav-item ${activeTab === 'eventradar' ? 'active' : ''}`}><span>📡</span><span>EventRadar</span></button>
        <button onClick={() => setActiveTab('attendance')} className={`hms-bnav-item ${activeTab === 'attendance' ? 'active' : ''}`}><span>📅</span><span>Attendance</span></button>
        <button onClick={() => setActiveTab('leave')} className={`hms-bnav-item ${activeTab === 'leave' ? 'active' : ''}`}><span>🪪</span><span>Leave</span></button>
        <button onClick={() => setActiveTab('profile')} className={`hms-bnav-item ${activeTab === 'profile' ? 'active' : ''}`}><span>👤</span><span>Profile</span></button>
      </nav>
    </div>
  );
}

// =========================================================
// 3. WARDEN & DEAN PORTAL (Hostels, Grievances, Clubs Hub, Create Club, Bulk Students, PDF, Passwords)
// =========================================================
function WardenPortal({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';
  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [clubSubTab, setClubSubTab] = useState('approvals');
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEventAudit, setSelectedEventAudit] = useState(null);

  // Dean Create Club & Bulk Upload States
  const [clubForm, setClubForm] = useState({ club_id: '', name: '', mission: '', faculty_advisor: '', head_coordinator: '' });
  const [bulkCsvText, setBulkCsvText] = useState('');

  // Student Password Recovery State
  const [studentRollInput, setStudentRollInput] = useState('');
  const [studentNewPassInput, setStudentNewPassInput] = useState('');

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);

  // PDF Report States
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfScope, setPdfScope] = useState(isDean ? 'All' : user.hostel_block);

  const loadWardenData = useCallback(async () => {
    try {
      const [cRes, eRes, sRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/founder/students`)
      ]);
      if (cRes.ok) { const d = await cRes.json(); if (Array.isArray(d)) setClubs(d); }
      if (eRes.ok) { const d = await eRes.json(); if (Array.isArray(d)) setEvents(d); }
      if (sRes.ok) { const d = await sRes.json(); if (Array.isArray(d)) setStudentsList(d); }
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadWardenData(); }, [loadWardenData]);

  const checkAiVenueClash = (candidateEv) => {
    const conflicts = events.filter(
      (other) =>
        other.event_id !== candidateEv.event_id &&
        other.status === 'Approved' &&
        other.date === candidateEv.date &&
        other.venue.toLowerCase() === candidateEv.venue.toLowerCase() &&
        !(candidateEv.end_time <= other.start_time || candidateEv.start_time >= other.end_time)
    );
    if (conflicts.length > 0) {
      return {
        free: false,
        text: `❌ AI Clash Alert: ${conflicts[0].venue} is already booked by ${conflicts[0].club_id} (${conflicts[0].title}) at ${conflicts[0].start_time}-${conflicts[0].end_time}!`
      };
    }
    return {
      free: true,
      text: `✅ AI Clash Check Passed: ${candidateEv.venue} is 100% available on ${candidateEv.date} (${candidateEv.start_time} - ${candidateEv.end_time}).`
    };
  };

  const handleApproveEvent = async (eventId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setEvents(events.map((e) => (e.event_id === eventId ? { ...e, status: action } : e)));
      setStatusMsg(`✅ Event ${eventId} marked as ${action}!`);
    }
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/founder/create-club`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clubForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ ${data.message}`);
        setClubForm({ club_id: '', name: '', mission: '', faculty_advisor: '', head_coordinator: '' });
        loadWardenData();
        setClubSubTab('directory');
      } else setStatusMsg(`❌ ${data.detail || 'Creation failed'}`);
    } catch { setStatusMsg('❌ Server error.'); }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    try {
      const lines = bulkCsvText.trim().split('\n');
      const parsed = [];
      for (let l of lines) {
        const p = l.split(',').map((x) => x.trim());
        if (p.length >= 8) {
          parsed.push({
            user_id: p[0], full_name: p[1], hostel_block: p[2], room: p[3],
            department: p[4], phone: p[5], email: p[6], dob: p[7]
          });
        }
      }
      if (parsed.length === 0) {
        setStatusMsg('❌ Please enter valid CSV lines (8 comma-separated values per line).');
        return;
      }
      const res = await fetch(`${apiUrl}/api/founder/upload-students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ ${data.message}`);
        setBulkCsvText('');
        loadWardenData();
      } else setStatusMsg(`❌ ${data.detail || 'Upload failed'}`);
    } catch { setStatusMsg('❌ CSV error.'); }
  };

  const handleDownloadPDF = () => {
    const query = new URLSearchParams({ institute_id: 'SVNIT', hostel_block: pdfScope, from_date: fromDate, to_date: toDate });
    window.open(`${apiUrl}/api/complaints/export-pdf?${query.toString()}`, '_blank');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: resetTarget, new_password: newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) { setStatusMsg(`✅ ${data.message}`); setResetTarget(null); setNewPassword(''); }
    else setStatusMsg(`❌ ${data.detail || 'Failed'}`);
  };

  const handleWardenResetStudent = async (e) => {
    e.preventDefault();
    if (!studentRollInput.trim() || !studentNewPassInput.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/warden/reset-student-password?warden_id=${user.user_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: studentRollInput.trim().toUpperCase(), new_password: studentNewPassInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ ${data.message}`);
        setStudentRollInput('');
        setStudentNewPassInput('');
      } else setStatusMsg(`❌ ${data.detail || 'Reset failed'}`);
    } catch { setStatusMsg('❌ Server error.'); }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset, y = calYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m); setCalYear(y);
  };

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;
  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const displayedComplaints = selectedHostel ? complaints.filter((c) => c.hostel_block === selectedHostel) : complaints;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {statusMsg && <div className="hms-toast" onClick={() => setStatusMsg(null)}>{statusMsg}</div>}

      <div className="hms-desktop-tabs">
        {isDean && (
          <button className={`hms-dtab ${activeTab === 'hostels' ? 'active' : ''}`} onClick={() => setActiveTab('hostels')}>
            🏢 All Hostels (9)
          </button>
        )}
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>
          💬 Grievances {openCount > 0 && <span className="hms-badge-inline">{openCount}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'clubshub' ? 'active' : ''}`} onClick={() => setActiveTab('clubshub')}>
          ⭐ Clubs Hub & Events {pendingEvents.length > 0 && <span className="hms-badge-inline">{pendingEvents.length}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>
          📥 Bulk Students ({studentsList.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          📥 PDF Report
        </button>
        <button className={`hms-dtab ${activeTab === 'passwords' ? 'active' : ''}`} onClick={() => setActiveTab('passwords')}>
          🔑 Passwords
        </button>
      </div>

      {/* TAB 1: HOSTELS (DEAN) */}
      {isDean && activeTab === 'hostels' && (
        <div className="hms-grid-3">
          {SVNIT_HOSTELS.map((h) => {
            const issues = complaints.filter((c) => c.hostel_block === h.name && c.status !== 'Completed').length;
            return (
              <div key={h.code} className="hms-item-card" onClick={() => { setSelectedHostel(h.name); setActiveTab('complaints'); }}>
                <div className="hms-avatar-circle">{h.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{h.name}</span>
                    <span className="hms-muted-xs">{h.ext}</span>
                  </div>
                  <div className="hms-row-between" style={{ marginTop: '6px' }}>
                    <span className="hms-item-sub">{h.cwId} • {h.wId}</span>
                    <span className="hms-status-pill" style={{ color: issues > 0 ? '#c084fc' : '#94a3b8', borderColor: issues > 0 ? '#8b5cf6' : '#334155' }}>
                      {issues} active
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div>
          {selectedHostel && (
            <div className="hms-row-between" style={{ marginBottom: '14px' }}>
              <span className="hms-pill-badge">🏢 Filtering Hostel: {selectedHostel}</span>
              <button className="hms-btn-ghost-sm" onClick={() => setSelectedHostel(null)}>Show All Hostels</button>
            </div>
          )}
          <div className="hms-grid-2">
            {displayedComplaints.map((c) => (
              <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                <div style={{ flex: 1 }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{c.summary}</span>
                    <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                  </div>
                  <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                  <div className="hms-row-between" style={{ marginTop: '6px' }}>
                    <span className="hms-item-sub">{c.student_name} • {c.hostel_block} (Rm {c.room})</span>
                    <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                      {c.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CLUBS HUB (APPROVALS + DIRECTORY + CREATE NEW CLUB) */}
      {activeTab === 'clubshub' && (
        <div>
          <div className="hms-subtab-group" style={{ marginBottom: '18px' }}>
            <button className={`hms-subtab ${clubSubTab === 'approvals' ? 'active' : ''}`} onClick={() => setClubSubTab('approvals')}>
              ⚡ Event Approvals & Calendar ({pendingEvents.length})
            </button>
            <button className={`hms-subtab ${clubSubTab === 'directory' ? 'active' : ''}`} onClick={() => setClubSubTab('directory')}>
              📁 All Clubs Directory ({clubs.length})
            </button>
            {isDean && (
              <button className={`hms-subtab ${clubSubTab === 'create' ? 'active' : ''}`} onClick={() => setClubSubTab('create')}>
                🎭 + Create New Club
              </button>
            )}
          </div>

          {clubSubTab === 'approvals' && (
            <div className="hms-grid-calendar-layout">
              <div className="hms-card">
                <div className="hms-section-label">⚡ Pending Venue Requisitions & AI Clash Verification</div>
                {pendingEvents.length === 0 ? (
                  <div className="hms-empty-card" style={{ padding: '20px' }}>✅ All club event proposals have been reviewed!</div>
                ) : (
                  <div className="hms-stack">
                    {pendingEvents.map((ev) => {
                      const aiCheck = checkAiVenueClash(ev);
                      return (
                        <div key={ev.event_id} className="hms-card" style={{ background: '#090d16', cursor: 'pointer' }} onClick={() => setSelectedEventAudit(ev)}>
                          <div className="hms-row-between">
                            <span className="hms-item-title">{ev.title}</span>
                            <span className="hms-pill-badge">{ev.club_id}</span>
                          </div>
                          <p className="hms-item-sub" style={{ margin: '6px 0', color: '#e2e8f0' }}>{ev.description}</p>
                          <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time}) • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                          <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: aiCheck.free ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.15)', color: aiCheck.free ? '#4ade80' : '#f87171' }}>
                            🤖 {aiCheck.text}
                          </div>
                          {isDean && (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                              <button className="hms-btn-primary" onClick={() => handleApproveEvent(ev.event_id, 'Approved')}>✓ Approve Venue & Publish</button>
                              <button className="hms-btn-danger" onClick={() => handleApproveEvent(ev.event_id, 'Rejected')}>✕ Reject</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="hms-card">
                <div className="hms-row-between" style={{ marginBottom: '12px' }}>
                  <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
                  <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
                  <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
                </div>
                <div className="hms-cal-grid">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="hms-cal-head">{d}</div>)}
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="hms-cal-day empty" />)}
                  {Array.from({ length: daysNum }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const matched = events.filter((e) => e.date === dateStr);
                    return (
                      <div key={dateStr} className="hms-cal-day">
                        <span className="hms-cal-num">{dayNum}</span>
                        {matched.map((ev) => (
                          <div
                            key={ev.event_id}
                            onClick={() => setSelectedEventAudit(ev)}
                            className="hms-cal-pill"
                            style={{ background: ev.status === 'Approved' ? '#8b5cf6' : ev.status === 'Completed' ? '#475569' : '#fbbf24', color: ev.status === 'Pending Dean Approval' ? '#090d16' : '#fff' }}
                          >
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {clubSubTab === 'directory' && (
            <div className="hms-grid-3">
              {clubs.map((club) => {
                const clubEvents = events.filter((e) => e.club_id.toUpperCase() === club.club_id.toUpperCase());
                return (
                  <div key={club.club_id} className="hms-item-card" onClick={() => setSelectedClub(club)}>
                    <div className="hms-avatar-circle">🏛️</div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{club.name}</span>
                        <span className="hms-pill-badge">{club.club_id}</span>
                      </div>
                      <p className="hms-item-sub" style={{ margin: '6px 0' }}>{club.mission}</p>
                      <div style={{ fontSize: '11px', color: '#c084fc', fontWeight: 700 }}>
                        🎪 {clubEvents.length} Events • 👥 {club.members?.length || 0} Core Members • Tap for Full Dossier
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {clubSubTab === 'create' && isDean && (
            <div className="hms-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="hms-section-label">🎭 Form & Register New Student Club / Chapter</div>
              <p className="hms-muted" style={{ marginBottom: '14px' }}>
                Registering a new club automatically creates its portal login (Default Password: <code>123</code>).
              </p>
              <form onSubmit={handleCreateClub} className="hms-stack">
                <input type="text" className="hms-input" placeholder="Club ID / Login Code (e.g. ROBOTICS, EDC, LIT)" value={clubForm.club_id} onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Full Club Name (e.g. Robotics & Aviation Club)" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Faculty Advisor Name & Department" value={clubForm.faculty_advisor} onChange={(e) => setClubForm({ ...clubForm, faculty_advisor: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Head Student Coordinator Name" value={clubForm.head_coordinator} onChange={(e) => setClubForm({ ...clubForm, head_coordinator: e.target.value })} required />
                <textarea rows="3" className="hms-input" placeholder="Club Mission, Objectives & Scope..." value={clubForm.mission} onChange={(e) => setClubForm({ ...clubForm, mission: e.target.value })} required />
                <button type="submit" className="hms-btn-primary">✨ Create Club & Generate Coordinator Login</button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BULK STUDENT UPLOAD & DIRECTORY */}
      {activeTab === 'students' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <div className="hms-section-label" style={{ margin: 0 }}>📥 Bulk Student Onboarding (CSV)</div>
              <button type="button" className="hms-btn-ghost-sm" onClick={() => setBulkCsvText(SAMPLE_CSV_DATA)}>
                📋 Load Sample CSV
              </button>
            </div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Paste comma-separated lines: <code>RollNo, FullName, Hostel, Room, Department, Phone, Email, DOB(DDMMYYYY)</code>
            </p>
            <form onSubmit={handleBulkUpload} className="hms-stack">
              <textarea rows="6" className="hms-input" placeholder={SAMPLE_CSV_DATA} value={bulkCsvText} onChange={(e) => setBulkCsvText(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">📤 Upload & Register Students</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🎓 Resident Student Directory ({studentsList.length})</div>
            <div className="hms-stack" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {studentsList.map((st) => (
                <div key={st.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{st.full_name} ({st.user_id})</div>
                    <div className="hms-item-sub">🏢 {st.hostel_block} (Rm {st.room}) • {st.department}</div>
                  </div>
                  <span className="hms-pill-badge">DOB: {st.dob}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PDF REPORT */}
      {activeTab === 'reports' && (
        <div className="hms-card" style={{ maxWidth: '540px', margin: '0 auto' }}>
          <h3>📥 Official PDF Grievance Audit Report</h3>
          <div className="hms-stack" style={{ marginTop: '14px' }}>
            {isDean && (
              <div>
                <label className="hms-label">Hostel Scope</label>
                <select className="hms-input" value={pdfScope} onChange={(e) => setPdfScope(e.target.value)}>
                  <option value="All">All Hostels Combined</option>
                  {SVNIT_HOSTELS.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
                </select>
              </div>
            )}
            <div className="hms-grid-2">
              <div><label className="hms-label">From Date</label><input type="date" className="hms-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
              <div><label className="hms-label">To Date</label><input type="date" className="hms-input" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
            </div>
            <button className="hms-btn-primary" onClick={handleDownloadPDF}>🖨️ Generate & Print Official PDF Report</button>
          </div>
        </div>
      )}

      {/* TAB 6: PASSWORDS & RECOVERY */}
      {activeTab === 'passwords' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🔑 Recover / Reset Resident Student Password</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              If a student forgets their custom password, reset it here to a temporary password or their DOB (<code>DDMMYYYY</code>).
            </p>
            <form onSubmit={handleWardenResetStudent} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Student Roll No (e.g. U26CE011)" value={studentRollInput} onChange={(e) => setStudentRollInput(e.target.value)} required />
              <input type="text" className="hms-input" placeholder="New Password or DOB (DDMMYYYY)" value={studentNewPassInput} onChange={(e) => setStudentNewPassInput(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">⚡ Reset Student Password</button>
            </form>
          </div>

          {isDean && (
            <div className="hms-card">
              <div className="hms-section-label">🏢 Reset Warden & Club Credentials</div>
              <div className="hms-stack" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {SVNIT_HOSTELS.map((h) => (
                  <div key={h.code} className="hms-row-item">
                    <span>{h.name}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(h.cwId)}>Reset {h.cwId}</button>
                      <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(h.wId)}>Reset {h.wId}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: FULL CLUB DOSSIER (WITH ROSTER & EVENTS) */}
      {selectedClub && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedClub(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <div>
                <span className="hms-pill-badge">OFFICIAL CHAPTER DOSSIER • {selectedClub.club_id}</span>
                <h3 style={{ margin: '6px 0 0 0' }}>{selectedClub.name}</h3>
              </div>
              <button className="hms-close-btn" onClick={() => setSelectedClub(null)}>✕</button>
            </div>

            <p className="hms-muted">{selectedClub.mission}</p>

            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div><strong>Faculty Advisor:</strong> {selectedClub.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Coordinator:</strong> {selectedClub.head_coordinator}</div>
              {selectedClub.extra_dean_info && (
                <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(139,92,246,0.12)', borderRadius: '8px', color: '#c084fc' }}>
                  <strong>📌 Dean Audit Notes:</strong> {selectedClub.extra_dean_info}
                </div>
              )}
            </div>

            <div className="hms-section-label">👥 Position-Wise Core Member Roster ({selectedClub.members?.length || 0})</div>
            <div className="hms-stack" style={{ marginBottom: '16px' }}>
              {selectedClub.members?.map((m, i) => (
                <div key={i} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{m.name}</div>
                    <div className="hms-item-sub">Roll: {m.roll} • {m.phone}</div>
                  </div>
                  <span className="hms-pill-badge">{m.position}</span>
                </div>
              ))}
            </div>

            <div className="hms-section-label">🎪 Events Organized by {selectedClub.club_id}</div>
            <div className="hms-stack">
              {events.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).map((ev) => (
                <div key={ev.event_id} className="hms-row-item" onClick={() => { setSelectedClub(null); setSelectedEventAudit(ev); }} style={{ cursor: 'pointer' }}>
                  <div>
                    <div className="hms-item-title">{ev.title}</div>
                    <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                  </div>
                  <span className="hms-status-pill" style={{ color: getStatusColor(ev.status), borderColor: getStatusColor(ev.status) }}>
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: FULL EVENT & AI AUDIT DETAILS */}
      {selectedEventAudit && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEventAudit(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedEventAudit.club_id} • {selectedEventAudit.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEventAudit(null)}>✕</button>
            </div>
            {selectedEventAudit.image_url && <img src={selectedEventAudit.image_url} alt="Event" className="hms-event-img" />}
            <h3>{selectedEventAudit.title}</h3>
            <p className="hms-muted">{selectedEventAudit.description}</p>
            <div className="hms-detail-box">
              <div>📍 <strong>Venue:</strong> {selectedEventAudit.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEventAudit.date} ({selectedEventAudit.start_time} - {selectedEventAudit.end_time})</div>
              <div style={{ marginTop: '6px', color: '#4ade80', fontWeight: 800 }}>
                👥 Live Student RSVPs: {selectedEventAudit.rsvps?.length || 0} Attending
              </div>
            </div>
            {selectedEventAudit.ai_audit && (
              <div className="hms-detail-box" style={{ borderColor: '#8b5cf6', marginTop: '12px' }}>
                <div className="hms-section-label">🤖 AI Post-Event Feedback Audit</div>
                <div><strong>Attendees:</strong> {selectedEventAudit.ai_audit.total_attendees} | <strong>Rating:</strong> ⭐ {selectedEventAudit.ai_audit.average_rating}/5.0</div>
                <div style={{ color: '#4ade80', fontWeight: 700, marginTop: '8px' }}>👍 Key Pros:</div>
                <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>{selectedEventAudit.ai_audit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
                <div style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Areas of Improvement:</div>
                <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>{selectedEventAudit.ai_audit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <div><strong>Recommendation:</strong> {selectedEventAudit.ai_audit.recommendation}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: TICKET DETAILS */}
      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedTicket.ticket_id} • {selectedTicket.category}</span>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <h3>{selectedTicket.summary}</h3>
            <p className="hms-muted">{selectedTicket.description}</p>
            <div className="hms-detail-box">
              <div><strong>Resident:</strong> {selectedTicket.student_name} ({selectedTicket.student_id})</div>
              <div style={{ marginTop: '4px' }}><strong>Hostel & Room:</strong> {selectedTicket.hostel_block}, Room {selectedTicket.room}</div>
              <div style={{ marginTop: '4px' }}><strong>Status:</strong> {selectedTicket.status}</div>
              {selectedTicket.staff_remark && <div style={{ marginTop: '6px', color: '#4ade80' }}><strong>Staff Note:</strong> {selectedTicket.staff_remark}</div>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PASSWORD RESET */}
      {resetTarget && (
        <div className="hms-modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>🔐 Reset Password: {resetTarget}</h3>
              <button className="hms-close-btn" onClick={() => setResetTarget(null)}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Enter New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Save New Password</button>
            </form>
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        {isDean && <button onClick={() => setActiveTab('hostels')} className={`hms-bnav-item ${activeTab === 'hostels' ? 'active' : ''}`}><span>🏢</span><span>Hostels</span></button>}
        <button onClick={() => setActiveTab('complaints')} className={`hms-bnav-item ${activeTab === 'complaints' ? 'active' : ''}`}><span>💬</span><span>Grievances</span></button>
        <button onClick={() => setActiveTab('clubshub')} className={`hms-bnav-item ${activeTab === 'clubshub' ? 'active' : ''}`}><span>⭐</span><span>Clubs Hub</span></button>
        <button onClick={() => setActiveTab('students')} className={`hms-bnav-item ${activeTab === 'students' ? 'active' : ''}`}><span>📥</span><span>Students</span></button>
        <button onClick={() => setActiveTab('passwords')} className={`hms-bnav-item ${activeTab === 'passwords' ? 'active' : ''}`}><span>🔑</span><span>Passwords</span></button>
      </nav>
    </div>
  );
}

// =========================================================
// 4. CLUB COORDINATOR PORTAL (100% Full Working Ledger, Member Roster, Proposals & AI Audit)
// =========================================================
function ClubPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState(null);

  const [missionInput, setMissionInput] = useState('');
  const [extraInfoInput, setExtraInfoInput] = useState('');
  const [memberForm, setMemberForm] = useState({ name: '', roll: '', position: '', phone: '' });

  const [eventForm, setEventForm] = useState({
    title: '',
    date: '2026-10-29',
    start_time: '10:00',
    end_time: '13:00',
    venue: 'CRC Auditorium',
    description: '',
    image_url: '',
    registration_link: ''
  });

  const loadClubData = useCallback(async () => {
    try {
      const [cRes, eRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`)
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClubs(cData);
        const myC = cData.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || cData[0];
        if (myC) {
          setMissionInput(myC.mission || '');
          setExtraInfoInput(myC.extra_dean_info || '');
        }
      }
      if (eRes.ok) setEvents(await eRes.json());
    } catch (e) { console.error(e); }
  }, [apiUrl, user.user_id]);

  useEffect(() => { loadClubData(); }, [loadClubData]);

  const handleSaveClubInfo = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/clubs/update-info`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, mission: missionInput, extra_dean_info: extraInfoInput })
    });
    if (res.ok) { setMsg('✅ Club Mission & Dean Dossier updated!'); loadClubData(); }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/clubs/add-member`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, ...memberForm })
    });
    if (res.ok) {
      setMsg(`✅ Added ${memberForm.name} to ${user.user_id} roster!`);
      setMemberForm({ name: '', roll: '', position: '', phone: '' });
      loadClubData();
    }
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/events/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...eventForm, club_id: user.user_id, submitted_by: user.full_name })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setEventForm({ title: '', date: '2026-10-29', start_time: '10:00', end_time: '13:00', venue: 'CRC Auditorium', description: '', image_url: '', registration_link: '' });
      loadClubData();
    } else setMsg(`❌ ${data.detail || 'Error'}`);
  };

  const myClub = clubs.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || clubs[0] || {};
  const myEvents = events.filter((e) => e.club_id.toUpperCase() === (user.user_id || '').toUpperCase());
  const auditedEvents = events.filter((e) => e.ai_audit);

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>⭐ Club Dossier & Roster</button>
        <button className={`hms-dtab ${activeTab === 'proposals' ? 'active' : ''}`} onClick={() => setActiveTab('proposals')}>⚡ Propose Event & Live RSVPs ({myEvents.length})</button>
        <button className={`hms-dtab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>🤖 AI Post-Event Audits</button>
      </div>

      {activeTab === 'ledger' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <span className="hms-pill-badge">OFFICIAL CHAPTER LEDGER • {myClub.club_id}</span>
            <h2 style={{ margin: '8px 0' }}>{myClub.name || user.full_name}</h2>
            <div className="hms-detail-box" style={{ marginBottom: '16px' }}>
              <div><strong>Faculty Advisor:</strong> {myClub.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Coordinator:</strong> {myClub.head_coordinator}</div>
              <div style={{ marginTop: '4px' }}><strong>Events Organized:</strong> {myEvents.length} Events</div>
            </div>
            <form onSubmit={handleSaveClubInfo} className="hms-stack">
              <label className="hms-label">Club Mission & Description</label>
              <textarea rows="2" className="hms-input" value={missionInput} onChange={(e) => setMissionInput(e.target.value)} />
              <label className="hms-label">Additional Dossier Info / Budget Notes for Dean</label>
              <textarea rows="2" className="hms-input" value={extraInfoInput} onChange={(e) => setExtraInfoInput(e.target.value)} />
              <button type="submit" className="hms-btn-primary">💾 Save Club Dossier</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">👥 Position-Wise Member Roster ({myClub.members?.length || 0})</div>
            <div className="hms-stack" style={{ marginBottom: '18px', maxHeight: '240px', overflowY: 'auto' }}>
              {myClub.members?.map((m, idx) => (
                <div key={idx} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{m.name}</div>
                    <div className="hms-item-sub">{m.roll} • {m.phone}</div>
                  </div>
                  <span className="hms-pill-badge">{m.position}</span>
                </div>
              ))}
            </div>

            <div className="hms-section-label">+ Add Core Committee Member</div>
            <form onSubmit={handleAddMember} className="hms-stack">
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Full Name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Roll No (e.g. U24CS012)" value={memberForm.roll} onChange={(e) => setMemberForm({ ...memberForm, roll: e.target.value })} required />
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Position (e.g. Tech Lead)" value={memberForm.position} onChange={(e) => setMemberForm({ ...memberForm, position: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Phone" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">+ Add Member to Roster</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🚀 Propose New Event & Venue Requisition</div>
            <form onSubmit={handleProposeEvent} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Event Title (e.g. Winter CodeFest 2026)" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
              <textarea rows="3" className="hms-input" placeholder="Detailed Event Description, Prizes & Highlights..." value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />
              <input type="url" className="hms-input" placeholder="Poster Image URL (https://...)" value={eventForm.image_url} onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })} />
              <input type="url" className="hms-input" placeholder="Registration / Audition Google Form Link" value={eventForm.registration_link} onChange={(e) => setEventForm({ ...eventForm, registration_link: e.target.value })} />
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <input type="date" className="hms-input" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
                <select className="hms-input" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}>
                  <option value="CRC Auditorium">CRC Auditorium</option>
                  <option value="SAC Amphitheatre">SAC Amphitheatre</option>
                  <option value="CCC Seminar Hall">CCC Seminar Hall</option>
                </select>
              </div>
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <input type="time" className="hms-input" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} required />
                <input type="time" className="hms-input" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">⚡ Run AI Clash Check & Send to Dean</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📊 My Club Events & Live Student RSVPs ({myEvents.length})</div>
            <div className="hms-stack">
              {myEvents.map((ev) => (
                <div key={ev.event_id} className="hms-card" style={{ background: '#090d16' }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{ev.title}</span>
                    <span className="hms-status-pill" style={{ color: getStatusColor(ev.status), borderColor: getStatusColor(ev.status) }}>
                      {ev.status}
                    </span>
                  </div>
                  <p className="hms-item-sub" style={{ margin: '6px 0' }}>{ev.description}</p>
                  <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                  <div style={{ marginTop: '8px', color: '#4ade80', fontWeight: 800, fontSize: '12px' }}>
                    👥 {ev.rsvps?.length || 0} Students Confirmed Attending {ev.rsvps?.length > 0 && `(${ev.rsvps.join(', ')})`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="hms-grid-2">
          {auditedEvents.map((ev) => (
            <div key={ev.event_id} className="hms-card">
              <span className="hms-pill-badge">🤖 AI FEEDBACK AUDIT • {ev.club_id}</span>
              <h3 style={{ margin: '10px 0 4px 0' }}>{ev.title}</h3>
              <p className="hms-muted">📍 {ev.venue} • 📅 {ev.date}</p>
              <div className="hms-detail-box">
                <div>👥 <strong>Total Turnout:</strong> {ev.ai_audit.total_attendees} | ⭐ <strong>Avg Rating:</strong> {ev.ai_audit.average_rating}/5.0 ({ev.ai_audit.sentiment})</div>
                <div style={{ color: '#4ade80', fontWeight: 700, marginTop: '10px' }}>👍 Key Pros:</div>
                <ul style={{ margin: '4px 0 10px 18px', padding: 0 }}>{ev.ai_audit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
                <div style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Areas of Improvement:</div>
                <ul style={{ margin: '4px 0 10px 18px', padding: 0 }}>{ev.ai_audit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <div><strong>Dean Recommendation:</strong> {ev.ai_audit.recommendation}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('ledger')} className={`hms-bnav-item ${activeTab === 'ledger' ? 'active' : ''}`}><span>⭐</span><span>Ledger</span></button>
        <button onClick={() => setActiveTab('proposals')} className={`hms-bnav-item ${activeTab === 'proposals' ? 'active' : ''}`}><span>⚡</span><span>Proposals</span></button>
        <button onClick={() => setActiveTab('audit')} className={`hms-bnav-item ${activeTab === 'audit' ? 'active' : ''}`}><span>🤖</span><span>AI Audit</span></button>
      </nav>
    </div>
  );
}

// =========================================================
// 5. MAINTENANCE STAFF PORTAL (100% Working Resolution Flow)
// =========================================================
function StaffPortal({ user, complaints, apiUrl, onRefresh }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
    });
    if (res.ok) {
      setMsg(`✅ Ticket ${selectedTicket.ticket_id} marked resolved & sent to resident for confirmation!`);
      setRemark('');
      setSelectedTicket(null);
      onRefresh();
    }
  };

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}
      <div className="hms-card">
        <div className="hms-section-label">🛠️ Assigned Maintenance Queue ({user.department} Wing)</div>
        {complaints.length === 0 ? (
          <div className="hms-empty-card">No pending maintenance tickets in your wing.</div>
        ) : (
          <div className="hms-grid-2">
            {complaints.map((c) => (
              <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                <div style={{ flex: 1 }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{c.summary}</span>
                    <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>{c.status}</span>
                  </div>
                  <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                  <div className="hms-item-sub">📍 {c.hostel_block} • Room {c.room} ({c.student_name})</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>🛠️ Resolve {selectedTicket.ticket_id}</h3>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <p className="hms-muted">{selectedTicket.description}</p>
            <form onSubmit={handleResolve} className="hms-stack">
              <textarea rows="3" className="hms-input" placeholder="Enter maintenance action taken / parts replaced..." value={remark} onChange={(e) => setRemark(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">✅ Mark Resolved & Notify Student</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// 6. MAIN APP SHELL & CLEAN LOGIN
// =========================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverProgress, setServerProgress] = useState(0);
  const [complaints, setComplaints] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('hms_user');
      if (saved) setUser(JSON.parse(saved));
    } catch {}
    setAuthReady(true);
  }, []);

  const fetchComplaints = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/api/complaints?role=${user.role}&user_id=${user.user_id}&hostel_block=${user.hostel_block || 'All'}&department=${user.department || ''}`);
      if (res.ok) setComplaints(await res.json());
    } catch (e) { console.error(e); }
  }, [user]);

  useEffect(() => { if (user) fetchComplaints(); }, [user, fetchComplaints]);

  useEffect(() => {
    let t;
    if (loading) {
      setServerProgress(15);
      t = setInterval(() => setServerProgress((p) => (p >= 92 ? p : p + 12)), 350);
    } else setServerProgress(0);
    return () => clearInterval(t);
  }, [loading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userIdInput.trim(), password: passwordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerProgress(100);
        setTimeout(() => {
          setUser(data.user);
          try { localStorage.setItem('hms_user', JSON.stringify(data.user)); } catch {}
          setLoading(false);
        }, 200);
      } else { setLoading(false); setLoginError(data.detail || 'Invalid ID or Password'); }
    } catch { setLoading(false); setLoginError('Cannot reach server. Please wait for Render server to wake up.'); }
  };

  const handleLogout = () => {
    try { localStorage.removeItem('hms_user'); } catch {}
    setUser(null); setUserIdInput(''); setPasswordInput('');
  };

  if (!authReady) return null;

  return (
    <div className="hms-root">
      <style>{ RESPONSIVE_CSS }</style>
      {!user ? (
        <div className="hms-login-wrapper">
          <div className="hms-login-card">
            <div className="hms-logo-pill">HMS</div>
            <h1 className="hms-login-title">Hostel Management System</h1>
            <p className="hms-login-sub">National Institute of Technology</p>
            {loginError && <div className="hms-error-alert">{loginError}</div>}
            {loading ? (
              <div className="hms-waking-box">
                <div className="hms-row-between" style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#cbd5e1' }}>Waking secure server...</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa' }}>{serverProgress}%</span>
                </div>
                <div className="hms-progress-track"><div className="hms-progress-fill" style={{ width: `${serverProgress}%` }} /></div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="hms-stack">
                <input type="text" className="hms-input" placeholder="Position ID / Roll No (e.g. DEAN, FOUNDER, U26CE011, ACM)" value={userIdInput} onChange={(e) => setUserIdInput(e.target.value)} required />
                <div className="hms-pass-wrap">
                  <input type={showPassword ? 'text' : 'password'} className="hms-input" style={{ paddingRight: '46px' }} placeholder="Password (or DOB DDMMYYYY)" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required />
                  <button type="button" className="hms-eye-btn" onClick={() => setShowPassword(!showPassword)}>{showPassword ? '🙈' : '👁️'}</button>
                </div>
                <button type="submit" className="hms-btn-primary">Sign In →</button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          <header className="hms-topbar">
            <div className="hms-topbar-inner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="hms-brand-box">HMS</div>
                <div>
                  <div className="hms-brand-title">Hostel Management System</div>
                  <div className="hms-brand-sub">{user.full_name} • {user.authority_title || user.role}</div>
                </div>
              </div>
              <button className="hms-signout-btn" onClick={handleLogout}>Sign Out</button>
            </div>
          </header>
          <main className="hms-main">
            {user.role === 'Founder' && <FounderPortal apiUrl={API_URL} />}
            {user.role === 'Student' && <StudentPortal user={user} complaints={complaints} apiUrl={API_URL} onRefresh={fetchComplaints} />}
            {(user.role === 'Dean' || user.role === 'Warden') && <WardenPortal user={user} complaints={complaints} apiUrl={API_URL} />}
            {user.role === 'ClubOrganizer' && <ClubPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Staff' && <StaffPortal user={user} complaints={complaints} apiUrl={API_URL} onRefresh={fetchComplaints} />}
          </main>
        </>
      )}
    </div>
  );
}

const RESPONSIVE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #060911; color: #f8fafc; font-family: 'Inter', system-ui, sans-serif; }
  .hms-root { min-height: 100vh; display: flex; flex-direction: column; background: #060911; }
  .hms-topbar { position: sticky; top: 0; z-index: 150; background: rgba(11, 17, 32, 0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b; }
  .hms-topbar-inner { max-width: 1240px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
  .hms-brand-box { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .hms-brand-title { font-size: 16px; font-weight: 800; color: #f8fafc; }
  .hms-brand-sub { font-size: 12px; color: #94a3b8; }
  .hms-signout-btn { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-main { flex: 1; width: 100%; max-width: 1240px; margin: 0 auto; padding: 20px 16px 100px 16px; }
  .hms-container { width: 100%; }
  .hms-login-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at top, #111827 0%, #060911 70%); }
  .hms-login-card { width: 100%; max-width: 420px; background: #0f172a; border: 1px solid #1e293b; border-radius: 24px; padding: 36px 28px; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.65); }
  .hms-logo-pill { display: inline-block; background: rgba(139, 92, 246, 0.18); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); padding: 6px 18px; border-radius: 999px; font-size: 12px; font-weight: 800; margin-bottom: 14px; }
  .hms-login-title { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; color: #f8fafc; }
  .hms-login-sub { margin: 0 0 26px 0; font-size: 13px; color: #94a3b8; }
  .hms-error-alert { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .hms-waking-box { background: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 22px 18px; margin: 10px 0; }
  .hms-progress-track { width: 100%; height: 8px; background: #1e293b; border-radius: 999px; overflow: hidden; }
  .hms-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 999px; transition: width 0.35s ease; }
  .hms-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }
  .hms-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 16px; }
  .hms-grid-calendar-layout { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; align-items: start; }
  .hms-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 20px; }
  .hms-empty-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 44px 20px; text-align: center; color: #94a3b8; }
  .hms-item-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 16px; display: flex; align-items: flex-start; gap: 14px; cursor: pointer; transition: 0.15s; }
  .hms-item-card:hover { border-color: #8b5cf6; transform: translateY(-2px); }
  .hms-avatar-circle { width: 46px; height: 46px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .hms-profile-avatar { width: 76px; height: 76px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .hms-item-title { font-size: 15px; font-weight: 700; color: #f8fafc; }
  .hms-item-sub { font-size: 13px; color: #94a3b8; margin-top: 2px; line-height: 1.4; }
  .hms-muted { font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .hms-muted-xs { font-size: 11px; color: #64748b; }
  .hms-section-label { font-size: 12px; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 12px; }
  .hms-label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
  .hms-pill-badge { display: inline-block; background: rgba(139, 92, 246, 0.16); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35); padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .hms-status-pill { font-size: 11px; font-weight: 700; border: 1px solid; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  .hms-badge-inline { background: #8b5cf6; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
  .hms-stack { display: flex; flex-direction: column; gap: 12px; }
  .hms-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .hms-row-item { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
  .hms-input { width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 14px; outline: none; }
  .hms-input:focus { border-color: #8b5cf6; }
  .hms-pass-wrap { position: relative; width: 100%; }
  .hms-eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 17px; }
  .hms-btn-primary { width: 100%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .hms-btn-primary-sm { background: #8b5cf6; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .hms-btn-danger { width: 100%; background: #ef4444; color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .hms-btn-ghost-sm { background: #1e293b; color: #c084fc; border: 1px solid #334155; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }
  .hms-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .hms-search-box { flex: 1; min-width: 240px; display: flex; align-items: center; gap: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 999px; padding: 10px 16px; }
  .hms-search-box input { background: transparent; border: none; outline: none; color: #f8fafc; font-size: 14px; width: 100%; }
  .hms-hero-banner { background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.15)); border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 20px; padding: 22px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  .hms-subtab-group { display: flex; gap: 8px; background: #090d16; padding: 6px; border-radius: 12px; border: 1px solid #1e293b; flex-wrap: wrap; }
  .hms-subtab { background: transparent; color: #94a3b8; border: none; padding: 9px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .hms-subtab.active { background: #8b5cf6; color: #fff; }
  .hms-chip-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 18px; }
  .hms-campus-chip { background: #0f172a; color: #cbd5e1; border: 1px solid #334155; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .hms-campus-chip.active { background: #8b5cf6; color: #fff; border-color: #8b5cf6; }
  .hms-tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
  .hms-tag { background: #090d16; border: 1px solid #334155; color: #e2e8f0; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }
  .hms-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #1e293b; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
  .hms-cal-head { background: #0f172a; text-align: center; padding: 8px 0; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
  .hms-cal-day { background: #090d16; min-height: 78px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
  .hms-cal-day.empty { opacity: 0.35; }
  .hms-cal-num { font-size: 11px; font-weight: 700; color: #64748b; }
  .hms-cal-pill { font-size: 10px; font-weight: 700; color: #fff; padding: 3px 5px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hms-toast { background: #1e293b; border-left: 4px solid #8b5cf6; padding: 12px 16px; border-radius: 10px; color: #f8fafc; font-size: 13px; font-weight: 600; margin-bottom: 16px; cursor: pointer; }
  .hms-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.78); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 300; }
  .hms-modal-box { background: #0f172a; border: 1px solid #334155; border-radius: 20px; padding: 24px; width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto; }
  .hms-close-btn { background: #1e293b; color: #cbd5e1; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: 800; }
  .hms-detail-box { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 14px; font-size: 13px; color: #cbd5e1; margin-top: 10px; }
  .hms-event-img { width: 100%; height: 185px; object-fit: cover; border-radius: 12px; margin-bottom: 12px; }
  .hms-link-btn { display: block; text-align: center; background: #1e293b; color: #c084fc; border: 1px solid #8b5cf6; padding: 11px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13px; margin-top: 12px; }
  .hms-cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hms-cat-chip { background: #090d16; border: 1.5px solid #1e293b; border-radius: 10px; padding: 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-cat-chip.active { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.15); }
  .hms-desktop-tabs { display: flex; gap: 8px; background: #0f172a; padding: 8px; border-radius: 14px; border: 1px solid #1e293b; margin-bottom: 20px; overflow-x: auto; }
  .hms-dtab { background: transparent; color: #94a3b8; border: none; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .hms-dtab.active { background: #8b5cf6; color: #fff; }
  .hms-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 70px; background: #0b1120; border-top: 1px solid #1e293b; justify-content: space-around; align-items: center; z-index: 200; }
  .hms-bnav-item { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex: 1; }
  .hms-bnav-item span:first-child { font-size: 18px; }
  .hms-bnav-item.active { color: #c084fc; }
  .hms-fab-mobile { display: none; position: fixed; right: 20px; bottom: 86px; width: 54px; height: 54px; border-radius: 16px; background: #8b5cf6; color: #fff; border: none; font-size: 28px; font-weight: 800; cursor: pointer; z-index: 190; }
  @media (max-width: 768px) {
    .hms-desktop-tabs { display: none; }
    .hms-bottom-nav { display: flex; }
    .hms-fab-mobile { display: flex; align-items: center; justify-content: center; }
    .hms-grid-calendar-layout, .hms-grid-2, .hms-grid-3 { grid-template-columns: 1fr; }
  }
`;