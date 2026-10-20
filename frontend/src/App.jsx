import React, { useState, useEffect, useCallback } from 'react';

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

// =========================================================
// 1. FOUNDER PORTAL (Campuses, Bulk Students, Create Clubs)
// =========================================================
function FounderPortal({ apiUrl }) {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('SVNIT');
  const [newHostelName, setNewHostelName] = useState('');
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [clubForm, setClubForm] = useState({ club_id: '', name: '', mission: '', faculty_advisor: '', head_coordinator: '' });
  const [msg, setMsg] = useState(null);

  const [founderNewPass, setFounderNewPass] = useState('');
  const [targetUserId, setTargetUserId] = useState('DEAN');
  const [targetNewPass, setTargetNewPass] = useState('');

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/founder/tenants`);
      if (res.ok) {
        const data = await res.json();
        setTenants(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleToggleModule = async (instId, modKey, currentVal) => {
    try {
      const res = await fetch(`${apiUrl}/api/founder/toggle-module`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: instId, module_key: modKey, enabled: !currentVal })
      });
      if (res.ok) { setMsg(`✅ Module updated for ${instId}`); loadTenants(); }
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
      if (res.ok) { setMsg(`🏢 Added '${newHostelName}'`); setNewHostelName(''); loadTenants(); }
    } catch { setMsg('❌ Failed.'); }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    try {
      const lines = bulkCsvText.trim().split('\n');
      const parsed = [];
      for (let l of lines) {
        const p = l.split(',').map(x => x.trim());
        if (p.length >= 8) {
          parsed.push({ user_id: p[0], full_name: p[1], hostel_block: p[2], room: p[3], department: p[4], phone: p[5], email: p[6], dob: p[7] });
        }
      }
      const res = await fetch(`${apiUrl}/api/founder/upload-students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (res.ok && data.success) { setMsg(`✅ ${data.message}`); setBulkCsvText(''); }
      else setMsg(`❌ ${data.detail || 'Failed'}`);
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
      } else setMsg(`❌ ${data.detail || 'Failed'}`);
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
      if (res.ok && data.success) { setMsg('🔒 Founder password updated!'); setFounderNewPass(''); }
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
      if (res.ok && data.success) { setMsg(`✅ Password overridden for ${targetUserId}!`); setTargetNewPass(''); }
    } catch { setMsg('❌ Error.'); }
  };

  const activeNit = tenants.find((t) => t.institute_id === selectedTenantId) || tenants[0] || {};

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-hero-banner">
        <div>
          <span className="hms-pill-badge">👑 MULTI-NIT FOUNDER HQ</span>
          <h2>Cloud Control & Tenant Management</h2>
          <p>Onboard students via CSV, register clubs, and manage campus configurations.</p>
        </div>
        <div className="hms-subtab-group">
          <button className={`hms-subtab ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>🏛️ Campuses</button>
          <button className={`hms-subtab ${activeTab === 'students' ? 'active' : ''}`} onClick={() => setActiveTab('students')}>📥 Bulk Students</button>
          <button className={`hms-subtab ${activeTab === 'clubs' ? 'active' : ''}`} onClick={() => setActiveTab('clubs')}>🎭 Create Club</button>
          <button className={`hms-subtab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>🔐 Security</button>
        </div>
      </div>

      {activeTab === 'tenants' && (
        <>
          <div className="hms-chip-strip">
            {tenants.map(nit => (
              <button key={nit.institute_id} onClick={() => setSelectedTenantId(nit.institute_id)} className={`hms-campus-chip ${selectedTenantId === nit.institute_id ? 'active' : ''}`}>
                🏛️ {nit.institute_id}
              </button>
            ))}
          </div>
          <div className="hms-grid-2">
            <div className="hms-card">
              <h3>{activeNit.name}</h3>
              <p className="hms-muted">📍 {activeNit.city}</p>
              <div className="hms-section-label" style={{ marginTop: '16px' }}>Modules</div>
              <div className="hms-stack">
                {activeNit.modules && Object.entries(activeNit.modules).map(([k, v]) => (
                  <div key={k} className="hms-row-item">
                    <span style={{ textTransform: 'capitalize' }}>{k.replace('_', ' ')}</span>
                    <button onClick={() => handleToggleModule(activeNit.institute_id, k, v)} className={v ? 'hms-btn-primary-sm' : 'hms-btn-ghost-sm'}>
                      {v ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="hms-card">
              <div className="hms-section-label">Hostels ({activeNit.hostels?.length || 0})</div>
              <div className="hms-tag-cloud" style={{ marginBottom: '16px' }}>
                {activeNit.hostels?.map((h, i) => <span key={i} className="hms-tag">🏠 {h}</span>)}
              </div>
              <form onSubmit={handleAddHostel} className="hms-stack">
                <input type="text" className="hms-input" placeholder="New Hostel Name" value={newHostelName} onChange={(e) => setNewHostelName(e.target.value)} />
                <button type="submit" className="hms-btn-primary">+ Add Hostel</button>
              </form>
            </div>
          </div>
        </>
      )}

      {activeTab === 'students' && (
        <div className="hms-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="hms-section-label">📥 Bulk Student Upload (CSV Format)</div>
          <p className="hms-muted" style={{ marginBottom: '14px' }}>
            Format per line: <code>RollNo, FullName, Hostel, Room, Department, Phone, Email, DOB(DDMMYYYY)</code>
          </p>
          <form onSubmit={handleBulkUpload} className="hms-stack">
            <textarea rows="6" className="hms-input" placeholder="U26CE011, Ishant Agrawal, Gajjar Bhawan, B-204, Civil Engineering, +919876543210, u26@nit.ac.in, 10072007" value={bulkCsvText} onChange={(e) => setBulkCsvText(e.target.value)} required />
            <button type="submit" className="hms-btn-primary">📤 Upload & Register Students</button>
          </form>
        </div>
      )}

      {activeTab === 'clubs' && (
        <div className="hms-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="hms-section-label">🎭 Register Student Club / Chapter</div>
          <form onSubmit={handleCreateClub} className="hms-stack">
            <input type="text" className="hms-input" placeholder="Club ID (e.g. ROBOTICS)" value={clubForm.club_id} onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value })} required />
            <input type="text" className="hms-input" placeholder="Club Full Name" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
            <input type="text" className="hms-input" placeholder="Faculty Advisor Name" value={clubForm.faculty_advisor} onChange={(e) => setClubForm({ ...clubForm, faculty_advisor: e.target.value })} required />
            <input type="text" className="hms-input" placeholder="Head Coordinator Name" value={clubForm.head_coordinator} onChange={(e) => setClubForm({ ...clubForm, head_coordinator: e.target.value })} required />
            <textarea rows="2" className="hms-input" placeholder="Club Mission..." value={clubForm.mission} onChange={(e) => setClubForm({ ...clubForm, mission: e.target.value })} required />
            <button type="submit" className="hms-btn-primary">✨ Create Club Chapter</button>
          </form>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🔒 Founder Password</div>
            <form onSubmit={handleChangeFounderPass} className="hms-stack">
              <input type="text" className="hms-input" placeholder="New Founder Password" value={founderNewPass} onChange={(e) => setFounderNewPass(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Update Founder Password</button>
            </form>
          </div>
          <div className="hms-card">
            <div className="hms-section-label">⚡ Override User Password</div>
            <form onSubmit={handleOverrideUserPass} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Target ID (e.g. DEAN, U26CE011)" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} required />
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
// 2. STUDENT PORTAL (Attendance & Leave set to Coming Soon)
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
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events`);
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) setEvents(d); }
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadData(); }, [loadData]);

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
        setMsg(`✅ Grievance ${data.ticket.ticket_id} registered!`);
        setSummary(''); setDescription(''); setShowNewModal(false); onRefresh();
      }
    } catch { setMsg('❌ Failed.'); }
    setSubmitting(false);
  };

  const handleStudentVerify = async (ticketId, satisfied) => {
    const res = await fetch(`${apiUrl}/api/complaints/student-verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, satisfied })
    });
    if (res.ok) { setSelectedTicket(null); onRefresh(); }
  };

  const handleRsvp = async (eventId) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/rsvp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, student_id: user.user_id })
    });
    const data = await res.json();
    if (res.ok) {
      setMsg('🎟️ RSVP Confirmed!');
      setEvents(events.map(ev => ev.event_id === eventId ? { ...ev, rsvps: data.rsvps } : ev));
      setSelectedEvent(prev => prev ? { ...prev, rsvps: data.rsvps } : null);
    }
  };

  const handleFeedbackSubmit = async (e, eventId) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/events/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, student_id: user.user_id, rating: feedbackRating, review: feedbackReview })
    });
    if (res.ok) { setMsg('🤖 Feedback submitted!'); setSelectedEvent(null); loadData(); }
  };

  const handleSelfPassChange = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/student/change-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      if (res.ok && data.success) { setMsg('✅ Password updated!'); setOldPass(''); setNewPass(''); }
      else setMsg(`❌ ${data.detail || 'Failed'}`);
    } catch { setMsg('❌ Error.'); }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset, y = calYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m); setCalYear(y);
  };

  const getCategoryIcon = (cat) => COMPLAINT_CATEGORIES.find(c => c.id === cat)?.icon || '🛠️';
  const getStatusColor = (st) => st === 'Completed' || st === 'Approved' ? '#4ade80' : st === 'Awaiting Confirmation' ? '#38bdf8' : '#fbbf24';

  const filteredComplaints = complaints.filter(c => c.summary.toLowerCase().includes(searchQuery.toLowerCase()) || c.category.toLowerCase().includes(searchQuery.toLowerCase()));
  const actionPending = complaints.filter(c => c.status === 'Awaiting Confirmation').length;
  const studentVisibleEvents = events.filter(e => e.status === 'Approved' || e.status === 'Completed');
  const upcomingEvents = studentVisibleEvents.filter(e => e.status === 'Approved');
  const pastEvents = studentVisibleEvents.filter(e => e.status === 'Completed');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>💬 Complaints {actionPending > 0 && <span className="hms-badge-inline">{actionPending}</span>}</button>
        <button className={`hms-dtab ${activeTab === 'eventradar' ? 'active' : ''}`} onClick={() => setActiveTab('eventradar')}>📡 EventRadar</button>
        <button className={`hms-dtab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>📅 Attendance</button>
        <button className={`hms-dtab ${activeTab === 'leave' ? 'active' : ''}`} onClick={() => setActiveTab('leave')}>🪪 Leave Pass</button>
        <button className={`hms-dtab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>👤 Profile</button>
      </div>

      {activeTab === 'complaints' && (
        <div>
          <div className="hms-toolbar">
            <div className="hms-search-box"><span>🔍</span><input type="text" placeholder="Search complaints..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
            <button className="hms-btn-primary" style={{ width: 'auto' }} onClick={() => setShowNewModal(true)}>+ Lodge New Grievance</button>
          </div>
          {filteredComplaints.length === 0 ? (
            <div className="hms-empty-card"><h3>No Grievances Found</h3></div>
          ) : (
            <div className="hms-grid-2">
              {filteredComplaints.map(c => (
                <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                  <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                  <div style={{ flex: 1 }}>
                    <div className="hms-row-between"><span className="hms-item-title">{c.summary}</span><span className="hms-muted-xs">{c.created_at.split(',')[0]}</span></div>
                    <div className="hms-row-between" style={{ marginTop: '6px' }}>
                      <span className="hms-item-sub">{c.ticket_id} • {c.category}</span>
                      <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>{c.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="hms-fab-mobile" onClick={() => setShowNewModal(true)}>+</button>
        </div>
      )}

      {activeTab === 'eventradar' && (
        <div className="hms-grid-calendar-layout">
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '14px' }}>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
              <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
            </div>
            <div className="hms-cal-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="hms-cal-head">{d}</div>)}
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="hms-cal-day empty" />)}
              {Array.from({ length: daysNum }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const matched = studentVisibleEvents.filter(e => e.date === dateStr);
                return (
                  <div key={dateStr} className="hms-cal-day">
                    <span className="hms-cal-num">{dayNum}</span>
                    {matched.map(ev => (
                      <div key={ev.event_id} onClick={() => setSelectedEvent(ev)} className="hms-cal-pill" style={{ background: ev.status === 'Completed' ? '#334155' : '#8b5cf6' }}>{ev.title}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hms-stack">
            <div className="hms-card">
              <div className="hms-section-label">Upcoming Events ({upcomingEvents.length})</div>
              <div className="hms-stack">
                {upcomingEvents.map(ev => (
                  <div key={ev.event_id} className="hms-item-card" onClick={() => setSelectedEvent(ev)}>
                    <div className="hms-avatar-circle">🎟️</div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-item-title">{ev.title}</div>
                      <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ATTENDANCE - COMING SOON */}
      {activeTab === 'attendance' && (
        <div className="hms-card" style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '540px', margin: '0 auto' }}>
          <span className="hms-pill-badge">PHASE 2 ROLLOUT</span>
          <div style={{ fontSize: '50px', margin: '16px 0' }}>📅</div>
          <h3>Hostel Night Attendance</h3>
          <p className="hms-muted">Smart geo-fenced attendance synced with the Council of Wardens is currently in development and coming soon.</p>
        </div>
      )}

      {/* LEAVE PASS - COMING SOON */}
      {activeTab === 'leave' && (
        <div className="hms-card" style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '540px', margin: '0 auto' }}>
          <span className="hms-pill-badge">PHASE 2 ROLLOUT</span>
          <div style={{ fontSize: '50px', margin: '16px 0' }}>🪪</div>
          <h3>Digital Leave & Gate Outpass</h3>
          <p className="hms-muted">Paperless leave applications with instant Warden approval and QR code verification will be available soon.</p>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="hms-grid-2">
          <div className="hms-card" style={{ textAlign: 'center' }}>
            <div className="hms-profile-avatar">{user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
            <h2 style={{ margin: '12px 0 4px 0' }}>{user.full_name}</h2>
            <span className="hms-pill-badge">{user.user_id} • Verified Resident</span>
            <div className="hms-stack" style={{ marginTop: '20px', textAlign: 'left' }}>
              <div className="hms-row-item"><span>Hostel Bhawan</span><strong>{user.hostel_block}</strong></div>
              <div className="hms-row-item"><span>Room</span><strong>Room {user.room}</strong></div>
              <div className="hms-row-item"><span>Department</span><strong>{user.department}</strong></div>
            </div>
          </div>
          <div className="hms-card">
            <div className="hms-section-label">🔐 Change Account Password</div>
            <form onSubmit={handleSelfPassChange} className="hms-stack">
              <input type="password" className="hms-input" placeholder="Current Password / DOB (DDMMYYYY)" value={oldPass} onChange={e => setOldPass(e.target.value)} required />
              <input type="password" className="hms-input" placeholder="New Custom Password" value={newPass} onChange={e => setNewPass(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Save New Password</button>
            </form>
          </div>
        </div>
      )}

      {showNewModal && (
        <div className="hms-modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="hms-modal-box" onClick={e => e.stopPropagation()}>
            <h3>📝 Lodge New Grievance</h3>
            <form onSubmit={handleCreateComplaint} className="hms-stack" style={{ marginTop: '12px' }}>
              <div className="hms-cat-grid">
                {COMPLAINT_CATEGORIES.map(cat => (
                  <div key={cat.id} onClick={() => setCategory(cat.id)} className={`hms-cat-chip ${category === cat.id ? 'active' : ''}`}>
                    <span>{cat.icon}</span><span>{cat.title}</span>
                  </div>
                ))}
              </div>
              <input type="text" className="hms-input" placeholder="Brief Summary" value={summary} onChange={e => setSummary(e.target.value)} required />
              <textarea rows="3" className="hms-input" placeholder="Description..." value={description} onChange={e => setDescription(e.target.value)} required />
              <button type="submit" disabled={submitting} className="hms-btn-primary">Submit Grievance</button>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={e => e.stopPropagation()}>
            <h3>{selectedEvent.title}</h3>
            <p className="hms-muted">{selectedEvent.description}</p>
            {selectedEvent.status !== 'Completed' ? (
              <button className="hms-btn-primary" onClick={() => handleRsvp(selectedEvent.event_id)}>🎟️ RSVP Now</button>
            ) : (
              <form onSubmit={e => handleFeedbackSubmit(e, selectedEvent.event_id)} className="hms-stack" style={{ marginTop: '10px' }}>
                <select className="hms-input" value={feedbackRating} onChange={e => setFeedbackRating(Number(e.target.value))}>
                  <option value={5}>5 - Excellent</option><option value={4}>4 - Good</option>
                </select>
                <textarea rows="2" className="hms-input" placeholder="Review..." value={feedbackReview} onChange={e => setFeedbackReview(e.target.value)} required />
                <button type="submit" className="hms-btn-primary">Submit Feedback</button>
              </form>
            )}
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
// 3. WARDEN & DEAN PORTAL
// =========================================================
function WardenPortal({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';
  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: resetTarget, new_password: newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) { setStatusMsg(`✅ Password updated for ${resetTarget}`); setResetTarget(null); setNewPassword(''); }
  };

  const displayedComplaints = selectedHostel ? complaints.filter(c => c.hostel_block === selectedHostel) : complaints;

  return (
    <div className="hms-container">
      {statusMsg && <div className="hms-toast" onClick={() => setStatusMsg(null)}>{statusMsg}</div>}
      <div className="hms-desktop-tabs">
        {isDean && <button className={`hms-dtab ${activeTab === 'hostels' ? 'active' : ''}`} onClick={() => setActiveTab('hostels')}>🏢 Hostels</button>}
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>💬 Grievances</button>
        <button className={`hms-dtab ${activeTab === 'passwords' ? 'active' : ''}`} onClick={() => setActiveTab('passwords')}>🔑 Passwords</button>
      </div>

      {isDean && activeTab === 'hostels' && (
        <div className="hms-grid-3">
          {SVNIT_HOSTELS.map(h => (
            <div key={h.code} className="hms-item-card" onClick={() => { setSelectedHostel(h.name); setActiveTab('complaints'); }}>
              <div className="hms-avatar-circle">{h.icon}</div>
              <div><span className="hms-item-title">{h.name}</span><div className="hms-item-sub">{h.cwId}</div></div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'complaints' && (
        <div>
          {selectedHostel && <div style={{ marginBottom: '12px' }}><button className="hms-btn-ghost-sm" onClick={() => setSelectedHostel(null)}>Show All Hostels</button></div>}
          <div className="hms-grid-2">
            {displayedComplaints.map(c => (
              <div key={c.ticket_id} className="hms-item-card">
                <div className="hms-avatar-circle">⚡</div>
                <div><span className="hms-item-title">{c.summary}</span><div className="hms-item-sub">{c.student_name} • {c.hostel_block} (Rm {c.room})</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'passwords' && isDean && (
        <div className="hms-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="hms-section-label">Reset Warden Passwords</div>
          <div className="hms-stack">
            {SVNIT_HOSTELS.map(h => (
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

      {resetTarget && (
        <div className="hms-modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="hms-modal-box" onClick={e => e.stopPropagation()}>
            <h3>Reset Password: {resetTarget}</h3>
            <form onSubmit={handlePasswordReset} className="hms-stack" style={{ marginTop: '12px' }}>
              <input type="text" className="hms-input" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <button type="submit" className="hms-btn-primary">Save New Password</button>
            </form>
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('complaints')} className="hms-bnav-item"><span>💬</span><span>Grievances</span></button>
        <button onClick={() => setActiveTab('passwords')} className="hms-bnav-item"><span>🔑</span><span>Passwords</span></button>
      </nav>
    </div>
  );
}

// =========================================================
// 4. CLUB PORTAL & STAFF PORTAL PLACEHOLDERS
// =========================================================
function ClubPortal({ user, apiUrl }) {
  return <div className="hms-container"><div className="hms-card"><h3>🎭 Club Coordinator Dashboard ({user.user_id})</h3><p className="hms-muted">Manage club members, proposals, and AI audits here.</p></div></div>;
}

function StaffPortal({ user, complaints }) {
  return <div className="hms-container"><div className="hms-card"><h3>🛠️ Maintenance Queue ({user.department})</h3><p className="hms-muted">{complaints.length} tickets assigned.</p></div></div>;
}

// =========================================================
// 5. MAIN APP SHELL & LOGIN
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
      t = setInterval(() => setServerProgress(p => p >= 92 ? p : p + 12), 350);
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
    } catch { setLoading(false); setLoginError('Cannot reach server.'); }
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
                <input type="text" className="hms-input" placeholder="Position ID / Roll No" value={userIdInput} onChange={e => setUserIdInput(e.target.value)} required />
                <div className="hms-pass-wrap">
                  <input type={showPassword ? 'text' : 'password'} className="hms-input" style={{ paddingRight: '46px' }} placeholder="Password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} required />
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
            {user.role === 'Staff' && <StaffPortal user={user} complaints={complaints} />}
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
  .hms-topbar-inner { max-width: 1200px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
  .hms-brand-box { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .hms-brand-title { font-size: 16px; font-weight: 800; color: #f8fafc; }
  .hms-brand-sub { font-size: 12px; color: #94a3b8; }
  .hms-signout-btn { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-main { flex: 1; width: 100%; max-width: 1200px; margin: 0 auto; padding: 20px 16px 100px 16px; }
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
  .hms-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
  .hms-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .hms-grid-calendar-layout { display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px; align-items: start; }
  .hms-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 20px; }
  .hms-empty-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 44px 20px; text-align: center; color: #94a3b8; }
  .hms-item-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 16px; display: flex; align-items: flex-start; gap: 14px; cursor: pointer; transition: 0.15s; }
  .hms-item-card:hover { border-color: #8b5cf6; }
  .hms-avatar-circle { width: 46px; height: 46px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .hms-profile-avatar { width: 76px; height: 76px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
  .hms-item-title { font-size: 15px; font-weight: 700; color: #f8fafc; }
  .hms-item-sub { font-size: 13px; color: #94a3b8; margin-top: 2px; }
  .hms-muted { font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .hms-muted-xs { font-size: 11px; color: #64748b; }
  .hms-section-label { font-size: 12px; font-weight: 800; color: #c084fc; text-transform: uppercase; margin-bottom: 12px; }
  .hms-pill-badge { display: inline-block; background: rgba(139, 92, 246, 0.16); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35); padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .hms-status-pill { font-size: 11px; font-weight: 700; border: 1px solid; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  .hms-badge-inline { background: #8b5cf6; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
  .hms-stack { display: flex; flex-direction: column; gap: 12px; }
  .hms-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .hms-row-item { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
  .hms-input { width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 14px; outline: none; }
  .hms-pass-wrap { position: relative; width: 100%; }
  .hms-eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 17px; }
  .hms-btn-primary { width: 100%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .hms-btn-primary-sm { background: #8b5cf6; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 800; cursor: pointer; }
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
  .hms-cal-day { background: #090d16; min-height: 76px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
  .hms-cal-day.empty { opacity: 0.35; }
  .hms-cal-num { font-size: 11px; font-weight: 700; color: #64748b; }
  .hms-cal-pill { font-size: 10px; font-weight: 700; color: #fff; padding: 3px 5px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hms-toast { background: #1e293b; border-left: 4px solid #8b5cf6; padding: 12px 16px; border-radius: 10px; color: #f8fafc; font-size: 13px; font-weight: 600; margin-bottom: 16px; cursor: pointer; }
  .hms-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.78); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 300; }
  .hms-modal-box { background: #0f172a; border: 1px solid #334155; border-radius: 20px; padding: 24px; width: 100%; max-width: 500px; max-height: 88vh; overflow-y: auto; }
  .hms-desktop-tabs { display: flex; gap: 8px; background: #0f172a; padding: 8px; border-radius: 14px; border: 1px solid #1e293b; margin-bottom: 20px; overflow-x: auto; }
  .hms-dtab { background: transparent; color: #94a3b8; border: none; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .hms-dtab.active { background: #8b5cf6; color: #fff; }
  .hms-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 70px; background: #0b1120; border-top: 1px solid #1e293b; justify-content: space-around; align-items: center; z-index: 200; }
  .hms-bnav-item { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex: 1; }
  .hms-bnav-item span:first-child { font-size: 18px; }
  .hms-bnav-item.active { color: #c084fc; }
  .hms-fab-mobile { display: none; position: fixed; right: 20px; bottom: 86px; width: 54px; height: 54px; border-radius: 16px; background: #8b5cf6; color: #fff; border: none; font-size: 28px; font-weight: 800; cursor: pointer; z-index: 190; }
  .hms-cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hms-cat-chip { background: #090d16; border: 1.5px solid #1e293b; border-radius: 10px; padding: 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-cat-chip.active { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.15); }
  @media (max-width: 768px) {
    .hms-desktop-tabs { display: none; }
    .hms-bottom-nav { display: flex; }
    .hms-fab-mobile { display: flex; align-items: center; justify-content: center; }
    .hms-grid-calendar-layout, .hms-grid-2, .hms-grid-3 { grid-template-columns: 1fr; }
  }
`;