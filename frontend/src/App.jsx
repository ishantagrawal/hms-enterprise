import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
// 1. FOUNDER / MULTI-NIT SUPER ADMIN PORTAL
// =========================================================
function FounderPortal({ apiUrl }) {
  const [activeTab, setActiveTab] = useState('tenants');
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('SVNIT');
  const [newHostelName, setNewHostelName] = useState('');
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
    } catch (err) {
      console.error(err);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const handleToggleModule = async (instId, modKey, currentVal) => {
    try {
      const res = await fetch(`${apiUrl}/api/founder/toggle-module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: instId, module_key: modKey, enabled: !currentVal })
      });
      if (res.ok) {
        setMsg(`✅ Module '${modKey.replace('_', ' ')}' ${!currentVal ? 'ENABLED' : 'DISABLED'} for ${instId}`);
        loadTenants();
      }
    } catch {
      setMsg('❌ Failed to update module.');
    }
  };

  const handleAddHostel = async (e) => {
    e.preventDefault();
    if (!newHostelName.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/founder/add-hostel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: selectedTenantId, hostel_name: newHostelName.trim() })
      });
      if (res.ok) {
        setMsg(`🏢 Added '${newHostelName}' to ${selectedTenantId}`);
        setNewHostelName('');
        loadTenants();
      }
    } catch {
      setMsg('❌ Failed to add hostel.');
    }
  };

  const handleChangeFounderPassword = async (e) => {
    e.preventDefault();
    if (!founderNewPass.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=FOUNDER`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: 'FOUNDER', new_password: founderNewPass.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('🔒 Founder Master Password hardened & updated!');
        setFounderNewPass('');
      } else {
        setMsg(`❌ ${data.detail || 'Error'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const handleOverrideUserPassword = async (e) => {
    e.preventDefault();
    if (!targetUserId.trim() || !targetNewPass.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=FOUNDER`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId.trim().toUpperCase(), new_password: targetNewPass.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ Password overridden for '${targetUserId.toUpperCase()}'!`);
        setTargetNewPass('');
      } else {
        setMsg(`❌ ${data.detail || 'Error'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const activeNit = tenants.find((t) => t.institute_id === selectedTenantId) || tenants[0] || {};

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-hero-banner">
        <div>
          <span className="hms-pill-badge">👑 MULTI-NIT FOUNDER HQ</span>
          <h2>National Institute HMS Cloud Control</h2>
          <p>Configure campus modules, onboard hostels, and manage master security credentials across NITs.</p>
        </div>
        <div className="hms-subtab-group">
          <button className={`hms-subtab ${activeTab === 'tenants' ? 'active' : ''}`} onClick={() => setActiveTab('tenants')}>
            🏛️ NIT Campuses ({tenants.length})
          </button>
          <button className={`hms-subtab ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            🔐 Master Security & Passwords
          </button>
        </div>
      </div>

      {activeTab === 'tenants' && (
        <>
          <div className="hms-chip-strip">
            {tenants.map((nit) => (
              <button
                key={nit.institute_id}
                onClick={() => setSelectedTenantId(nit.institute_id)}
                className={`hms-campus-chip ${selectedTenantId === nit.institute_id ? 'active' : ''}`}
              >
                🏛️ {nit.institute_id} — {nit.city.split(',')[0]}
              </button>
            ))}
          </div>

          <div className="hms-grid-2">
            <div className="hms-card">
              <div className="hms-card-header">
                <div>
                  <h3>{activeNit.name}</h3>
                  <p className="hms-muted">📍 {activeNit.city} • Tenant Code: <strong>{activeNit.institute_id}</strong></p>
                </div>
              </div>

              <div className="hms-section-label">⚡ Module Feature Toggles</div>
              <div className="hms-stack">
                {activeNit.modules && Object.entries(activeNit.modules).map(([modKey, isEnabled]) => (
                  <div key={modKey} className="hms-row-item">
                    <div>
                      <div className="hms-item-title" style={{ textTransform: 'capitalize' }}>
                        {modKey.replace('_', ' ')}
                      </div>
                      <div className="hms-item-sub" style={{ color: isEnabled ? '#4ade80' : '#64748b' }}>
                        {isEnabled ? '● Active on Campus' : '○ Disabled'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleModule(activeNit.institute_id, modKey, isEnabled)}
                      className={isEnabled ? 'hms-btn-primary-sm' : 'hms-btn-ghost-sm'}
                    >
                      {isEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="hms-card">
              <div className="hms-section-label">🏢 Configured Hostels ({activeNit.hostels?.length || 0})</div>
              <div className="hms-tag-cloud">
                {activeNit.hostels?.map((h, i) => (
                  <span key={i} className="hms-tag">🏠 {h}</span>
                ))}
              </div>

              <form onSubmit={handleAddHostel} style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="hms-input"
                  placeholder={`Add new hostel to ${activeNit.institute_id}...`}
                  value={newHostelName}
                  onChange={(e) => setNewHostelName(e.target.value)}
                />
                <button type="submit" className="hms-btn-primary" style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  + Add Hostel
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {activeTab === 'security' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">👑 1. Strengthen Founder Master Password</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Protected by strict hierarchy lock. No Dean or Warden can modify your Founder credentials.
            </p>
            <form onSubmit={handleChangeFounderPassword} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Enter new strong password for FOUNDER"
                value={founderNewPass}
                onChange={(e) => setFounderNewPass(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">🔒 Update Founder Password</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🎯 2. Override Any Institutional Role Password</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Instantly reset passwords for any Dean (`DEAN`), Chief Warden (`CW_GAJJAR`), Club (`ACM`), or Student (`U26CE011`).
            </p>
            <form onSubmit={handleOverrideUserPassword} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Target ID (e.g. DEAN, CW_GAJJAR, U26CE011)"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                required
              />
              <input
                type="text"
                className="hms-input"
                placeholder="New Password to Assign"
                value={targetNewPass}
                onChange={(e) => setTargetNewPass(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">⚡ Execute Password Override</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// 2. STUDENT RESIDENT PORTAL
// =========================================================
function StudentPortal({ user, complaints, apiUrl, onRefresh }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState(null);

  // Complaint Form
  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // EventRadar State
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9); // October
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  // Attendance & Leave State
  const [attendanceList, setAttendanceList] = useState([]);
  const [leavesList, setLeavesList] = useState([]);
  const [leaveForm, setLeaveForm] = useState({
    destination: '',
    from_date: '2026-10-24',
    to_date: '2026-10-27',
    reason: '',
    parent_phone: ''
  });

  // Self Password Change State
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const loadStudentData = useCallback(async () => {
    try {
      const [evRes, attRes, lvRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/attendance?role=Student&user_id=${user.user_id}`),
        fetch(`${apiUrl}/api/leaves?role=Student&user_id=${user.user_id}`)
      ]);
      if (evRes.ok) {
        const d = await evRes.json();
        if (Array.isArray(d)) setEvents(d);
      }
      if (attRes.ok) {
        const d = await attRes.json();
        if (Array.isArray(d)) setAttendanceList(d);
      }
      if (lvRes.ok) {
        const d = await lvRes.json();
        if (Array.isArray(d)) setLeavesList(d);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.user_id]);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, category, summary, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ Grievance ${data.ticket.ticket_id} registered!`);
        setSummary('');
        setDescription('');
        setShowNewModal(false);
        onRefresh();
      }
    } catch {
      setMsg('❌ Failed to submit complaint.');
    }
    setSubmitting(false);
  };

  const handleStudentVerify = async (ticketId, satisfied) => {
    try {
      const res = await fetch(`${apiUrl}/api/complaints/student-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, satisfied })
      });
      if (res.ok) {
        setMsg(satisfied ? '✅ Issue marked Completed!' : '🔄 Ticket Reopened!');
        setSelectedTicket(null);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRsvp = async (eventId) => {
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: user.user_id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('🎟️ RSVP Confirmed!');
        setEvents(events.map((ev) => (ev.event_id === eventId ? { ...ev, rsvps: data.rsvps } : ev)));
        setSelectedEvent((prev) => (prev ? { ...prev, rsvps: data.rsvps } : null));
      }
    } catch {
      setMsg('❌ Connection error.');
    }
  };

  const handleFeedbackSubmit = async (e, eventId) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          student_id: user.user_id,
          rating: feedbackRating,
          review: feedbackReview
        })
      });
      if (res.ok) {
        setMsg('🤖 Feedback submitted to AI Audit engine!');
        setFeedbackReview('');
        setSelectedEvent(null);
        loadStudentData();
      }
    } catch {
      setMsg('❌ Failed to submit feedback.');
    }
  };

  const handleMarkAttendance = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`✅ ${data.message}`);
        loadStudentData();
      }
    } catch {
      setMsg('❌ Attendance server error.');
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...leaveForm, student_id: user.user_id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('✅ Leave & Gate Outpass request sent to Warden!');
        setLeaveForm({ destination: '', from_date: '2026-10-24', to_date: '2026-10-27', reason: '', parent_phone: '' });
        loadStudentData();
      }
    } catch {
      setMsg('❌ Could not submit leave application.');
    }
  };

  const handleSelfPasswordChange = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/student/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('✅ Custom password updated successfully!');
        setOldPass('');
        setNewPass('');
      } else {
        setMsg(`❌ ${data.detail || 'Password change failed'}`);
      }
    } catch {
      setMsg('❌ Connection error.');
    }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset;
    let y = calYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m);
    setCalYear(y);
  };

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed' || status === 'Approved') return '#4ade80';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    return '#fbbf24';
  };

  const filteredComplaints = complaints.filter(
    (c) =>
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticket_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const actionPendingCount = complaints.filter((c) => c.status === 'Awaiting Confirmation').length;
  const studentVisibleEvents = events.filter((e) => e.status === 'Approved' || e.status === 'Completed');
  const upcomingEvents = studentVisibleEvents.filter((e) => e.status === 'Approved');
  const pastEvents = studentVisibleEvents.filter((e) => e.status === 'Completed');

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {/* Desktop Top Sub-Navigation */}
      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'complaints' ? 'active' : ''}`} onClick={() => setActiveTab('complaints')}>
          💬 Complaints {actionPendingCount > 0 && <span className="hms-badge-inline">{actionPendingCount}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'eventradar' ? 'active' : ''}`} onClick={() => setActiveTab('eventradar')}>
          📡 EventRadar
        </button>
        <button className={`hms-dtab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
          📅 Night Attendance
        </button>
        <button className={`hms-dtab ${activeTab === 'leave' ? 'active' : ''}`} onClick={() => setActiveTab('leave')}>
          🪪 Leave & Outpass
        </button>
        <button className={`hms-dtab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          👤 Profile & Security
        </button>
      </div>

      {/* TAB 1: COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div>
          <div className="hms-toolbar">
            <div className="hms-search-box">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search complaints by summary, category, or ticket ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="hms-btn-primary" style={{ width: 'auto' }} onClick={() => setShowNewModal(true)}>
              + Lodge New Grievance
            </button>
          </div>

          {filteredComplaints.length === 0 ? (
            <div className="hms-empty-card">
              <div style={{ fontSize: '42px', marginBottom: '8px' }}>📭</div>
              <h3>No Grievances Found</h3>
              <p className="hms-muted">Click "+ Lodge New Grievance" to report a room or hostel maintenance issue.</p>
            </div>
          ) : (
            <div className="hms-grid-2">
              {filteredComplaints.map((c) => (
                <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                  <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hms-row-between">
                      <span className="hms-item-title">{c.summary}</span>
                      <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                    </div>
                    <div className="hms-row-between" style={{ marginTop: '6px' }}>
                      <span className="hms-item-sub">{c.ticket_id} • {c.category}</span>
                      <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                        {c.status === 'Awaiting Confirmation' ? '⚡ Verify Now' : c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="hms-fab-mobile" onClick={() => setShowNewModal(true)} title="Lodge Complaint">+</button>
        </div>
      )}

      {/* TAB 2: EVENTRADAR */}
      {activeTab === 'eventradar' && (
        <div className="hms-grid-calendar-layout">
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '14px' }}>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
              <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
            </div>

            <div className="hms-cal-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="hms-cal-head">{d}</div>
              ))}
              {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                <div key={`empty-${idx}`} className="hms-cal-day empty" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, index) => {
                const dayNum = index + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const matchedEvents = studentVisibleEvents.filter((e) => e.date === dateStr);
                return (
                  <div key={dateStr} className="hms-cal-day">
                    <span className="hms-cal-num">{dayNum}</span>
                    {matchedEvents.map((ev) => (
                      <div
                        key={ev.event_id}
                        onClick={() => setSelectedEvent(ev)}
                        className="hms-cal-pill"
                        style={{ background: ev.status === 'Completed' ? '#334155' : '#8b5cf6' }}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="hms-stack">
            <div className="hms-card">
              <div className="hms-section-label">📅 Upcoming Approved Events ({upcomingEvents.length})</div>
              <div className="hms-stack">
                {upcomingEvents.map((ev) => (
                  <div key={ev.event_id} className="hms-item-card" onClick={() => setSelectedEvent(ev)}>
                    <div className="hms-avatar-circle">🎟️</div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{ev.title}</span>
                        <span className="hms-pill-badge">{ev.club_id}</span>
                      </div>
                      <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time})</div>
                      <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: 700, marginTop: '4px' }}>
                        👥 {ev.rsvps?.length || 0} Students Going • Tap for RSVP & Form
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hms-card">
              <div className="hms-section-label">🏁 Past Completed Events ({pastEvents.length})</div>
              <div className="hms-stack">
                {pastEvents.map((ev) => (
                  <div key={ev.event_id} className="hms-item-card" onClick={() => setSelectedEvent(ev)}>
                    <div className="hms-avatar-circle">⭐</div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-item-title">{ev.title}</div>
                      <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date}</div>
                      <div style={{ fontSize: '11px', color: '#4ade80', fontWeight: 700, marginTop: '4px' }}>
                        Tap to Submit Post-Event Rating & Review
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NIGHT ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="hms-grid-2">
          <div className="hms-card" style={{ textAlign: 'center', padding: '28px 20px' }}>
            <span className="hms-pill-badge">GEO-VERIFIED NIGHT ROLL CALL</span>
            <div style={{ fontSize: '48px', margin: '14px 0' }}>📅</div>
            <h3>Hostel Night Attendance</h3>
            <p className="hms-muted" style={{ marginBottom: '20px' }}>
              Resident: <strong>{user.full_name}</strong> ({user.hostel_block} • Room {user.room})
            </p>
            <button className="hms-btn-primary" onClick={handleMarkAttendance}>
              ✅ Mark My Night Attendance Now
            </button>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📋 My Recent Attendance Logs ({attendanceList.length})</div>
            <div className="hms-stack">
              {attendanceList.map((a) => (
                <div key={a.id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">📅 {a.date}</div>
                    <div className="hms-item-sub">Marked at {a.time} • {a.hostel_block} ({a.room})</div>
                  </div>
                  <span className="hms-status-pill" style={{ color: '#4ade80', borderColor: '#4ade80' }}>
                    {a.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DIGITAL LEAVE & GATE OUTPASS */}
      {activeTab === 'leave' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🪪 Apply for Hostel Leave / Gate Outpass</div>
            <form onSubmit={handleApplyLeave} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Destination Address / City (e.g. Home - Kota)"
                value={leaveForm.destination}
                onChange={(e) => setLeaveForm({ ...leaveForm, destination: e.target.value })}
                required
              />
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <div>
                  <label className="hms-label">From Date</label>
                  <input
                    type="date"
                    className="hms-input"
                    value={leaveForm.from_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, from_date: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="hms-label">To Date</label>
                  <input
                    type="date"
                    className="hms-input"
                    value={leaveForm.to_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, to_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <input
                type="tel"
                className="hms-input"
                placeholder="Parent / Guardian Emergency Phone"
                value={leaveForm.parent_phone}
                onChange={(e) => setLeaveForm({ ...leaveForm, parent_phone: e.target.value })}
                required
              />
              <textarea
                rows="2"
                className="hms-input"
                placeholder="Reason for leave..."
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                required
              />
              <button type="submit" className="hms-btn-primary">🚀 Submit Outpass Request to Warden</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🎫 My Outpass & Leave History ({leavesList.length})</div>
            <div className="hms-stack">
              {leavesList.map((l) => (
                <div key={l.leave_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{l.destination} ({l.leave_id})</div>
                    <div className="hms-item-sub">📅 {l.from_date} to {l.to_date} • {l.reason}</div>
                  </div>
                  <span className="hms-status-pill" style={{ color: getStatusColor(l.status), borderColor: getStatusColor(l.status) }}>
                    {l.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: PROFILE & SELF PASSWORD CHANGE */}
      {activeTab === 'profile' && (
        <div className="hms-grid-2">
          <div className="hms-card" style={{ textAlign: 'center' }}>
            <div className="hms-profile-avatar">
              {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <h2 style={{ margin: '12px 0 4px 0' }}>{user.full_name}</h2>
            <span className="hms-pill-badge">{user.user_id} • Verified Resident</span>

            <div className="hms-stack" style={{ marginTop: '20px', textAlign: 'left' }}>
              <div className="hms-row-item"><span>🏢 Hostel Bhawan</span><strong>{user.hostel_block}</strong></div>
              <div className="hms-row-item"><span>🚪 Room & Floor</span><strong>Room {user.room} ({user.floor})</strong></div>
              <div className="hms-row-item"><span>🎓 Department</span><strong>{user.department}</strong></div>
              <div className="hms-row-item"><span>📞 Phone</span><strong>{user.phone}</strong></div>
              <div className="hms-row-item"><span>✉️ Email</span><strong>{user.email}</strong></div>
            </div>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🔐 Change My Account Password</div>
            <p className="hms-muted" style={{ marginBottom: '16px' }}>
              Set your own custom secret password. If you ever forget it, your Hostel Warden ({user.hostel_block}) can reset it for you.
            </p>
            <form onSubmit={handleSelfPasswordChange} className="hms-stack">
              <div>
                <label className="hms-label">Current Password (or Default DOB: DDMMYYYY)</label>
                <input
                  type="password"
                  className="hms-input"
                  placeholder="Enter current password or DOB"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="hms-label">New Custom Password</label>
                <input
                  type="password"
                  className="hms-input"
                  placeholder="Enter new custom password (min 4 chars)"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="hms-btn-primary">💾 Save My Custom Password</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW COMPLAINT */}
      {showNewModal && (
        <div className="hms-modal-backdrop" onClick={() => setShowNewModal(false)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '14px' }}>
              <h3 style={{ margin: 0 }}>📝 Lodge New Grievance</h3>
              <button className="hms-close-btn" onClick={() => setShowNewModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateComplaint} className="hms-stack">
              <label className="hms-label">Select Maintenance Category</label>
              <div className="hms-cat-grid">
                {COMPLAINT_CATEGORIES.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`hms-cat-chip ${category === cat.id ? 'active' : ''}`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.title}</span>
                  </div>
                ))}
              </div>
              <input
                type="text"
                className="hms-input"
                placeholder="Brief Summary (e.g. Ceiling fan regulator sparking)"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
              />
              <textarea
                rows="3"
                className="hms-input"
                placeholder="Detailed description of the problem..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
              <button type="submit" disabled={submitting} className="hms-btn-primary">
                {submitting ? 'Submitting...' : '🚀 Submit Grievance'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: COMPLAINT DETAILS */}
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
              <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status) }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Assigned Wing:</strong> {selectedTicket.routed_to}</div>
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '6px', color: '#c084fc' }}><strong>Staff Note:</strong> {selectedTicket.staff_remark}</div>
              )}
            </div>
            {selectedTicket.status === 'Awaiting Confirmation' && (
              <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(139,92,246,0.12)', borderRadius: '12px', border: '1px solid #8b5cf6' }}>
                <div style={{ fontWeight: 700, marginBottom: '10px', textAlign: 'center' }}>
                  Has the maintenance staff resolved this issue?
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="hms-btn-primary" onClick={() => handleStudentVerify(selectedTicket.ticket_id, true)}>
                    ✅ Yes, Resolved
                  </button>
                  <button className="hms-btn-danger" onClick={() => handleStudentVerify(selectedTicket.ticket_id, false)}>
                    ❌ Reopen Ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EVENT DETAILS */}
      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">📡 EventRadar • {selectedEvent.club_id}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            {selectedEvent.image_url && (
              <img src={selectedEvent.image_url} alt={selectedEvent.title} className="hms-event-img" />
            )}
            <h3>{selectedEvent.title}</h3>
            <p className="hms-muted">{selectedEvent.description}</p>
            <div className="hms-detail-box">
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div>
              <div style={{ marginTop: '6px', color: '#4ade80', fontWeight: 700 }}>
                👥 {selectedEvent.rsvps?.length || 0} Students Confirmed Attending
              </div>
            </div>

            {selectedEvent.registration_link && (
              <a href={selectedEvent.registration_link} target="_blank" rel="noreferrer" className="hms-link-btn">
                🔗 Open Registration / Audition Google Form
              </a>
            )}

            {selectedEvent.status !== 'Completed' ? (
              <button
                className="hms-btn-primary"
                style={{ marginTop: '12px' }}
                disabled={selectedEvent.rsvps?.includes(user.user_id)}
                onClick={() => handleRsvp(selectedEvent.event_id)}
              >
                {selectedEvent.rsvps?.includes(user.user_id)
                  ? `✅ RSVP Confirmed (${selectedEvent.rsvps.length} Going)`
                  : "🎟️ I'm Coming / RSVP Now"}
              </button>
            ) : (
              <form onSubmit={(e) => handleFeedbackSubmit(e, selectedEvent.event_id)} className="hms-stack" style={{ marginTop: '14px' }}>
                <div className="hms-section-label">⭐ Submit Event Feedback for AI Audit</div>
                <select className="hms-input" value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                  <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                  <option value={4}>⭐⭐⭐⭐ 4 - Very Good</option>
                  <option value={3}>⭐⭐⭐ 3 - Good</option>
                  <option value={2}>⭐⭐ 2 - Fair</option>
                  <option value={1}>⭐ 1 - Poor</option>
                </select>
                <textarea
                  rows="2"
                  className="hms-input"
                  placeholder="Share your review of the event..."
                  value={feedbackReview}
                  onChange={(e) => setFeedbackReview(e.target.value)}
                  required
                />
                <button type="submit" className="hms-btn-primary">Submit Feedback</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('complaints')} className={`hms-bnav-item ${activeTab === 'complaints' ? 'active' : ''}`}>
          <span>💬</span><span>Complaints</span>
        </button>
        <button onClick={() => setActiveTab('eventradar')} className={`hms-bnav-item ${activeTab === 'eventradar' ? 'active' : ''}`}>
          <span>📡</span><span>EventRadar</span>
        </button>
        <button onClick={() => setActiveTab('attendance')} className={`hms-bnav-item ${activeTab === 'attendance' ? 'active' : ''}`}>
          <span>📅</span><span>Attendance</span>
        </button>
        <button onClick={() => setActiveTab('leave')} className={`hms-bnav-item ${activeTab === 'leave' ? 'active' : ''}`}>
          <span>🪪</span><span>Leave Pass</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`hms-bnav-item ${activeTab === 'profile' ? 'active' : ''}`}>
          <span>👤</span><span>Profile</span>
        </button>
      </nav>
    </div>
  );
}

// =========================================================
// 3. DEAN & WARDEN PORTAL
// =========================================================
function WardenPortal({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [clubSubTab, setClubSubTab] = useState('approvals');
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEventAudit, setSelectedEventAudit] = useState(null);

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);

  // Passwords & Student Recovery States
  const [newPassword, setNewPassword] = useState('');
  const [studentRollInput, setStudentRollInput] = useState('');
  const [studentNewPassInput, setStudentNewPassInput] = useState('');

  // PDF Report States
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfScope, setPdfScope] = useState(isDean ? 'All' : user.hostel_block);

  const loadWardenData = useCallback(async () => {
    try {
      const [cRes, eRes, lRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/leaves?role=${user.role}&hostel_block=${user.hostel_block || 'All'}`)
      ]);
      if (cRes.ok) { const d = await cRes.json(); if (Array.isArray(d)) setClubs(d); }
      if (eRes.ok) { const d = await eRes.json(); if (Array.isArray(d)) setEvents(d); }
      if (lRes.ok) { const d = await lRes.json(); if (Array.isArray(d)) setLeaves(d); }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.role, user.hostel_block]);

  useEffect(() => {
    loadWardenData();
  }, [loadWardenData]);

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

  const handleLeaveAction = async (leaveId, status) => {
    const res = await fetch(`${apiUrl}/api/leaves/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leave_id: leaveId, status })
    });
    if (res.ok) {
      setStatusMsg(`✅ Leave ${leaveId} marked as ${status}`);
      loadWardenData();
    }
  };

  const handleDownloadPDF = () => {
    const query = new URLSearchParams({
      institute_id: user.institute_id || 'SVNIT',
      hostel_block: pdfScope,
      from_date: fromDate,
      to_date: toDate
    });
    window.open(`${apiUrl}/api/complaints/export-pdf?${query.toString()}`, '_blank');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: resetTarget, new_password: newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setResetTarget(null);
      setNewPassword('');
    } else {
      setStatusMsg(`❌ ${data.detail || 'Error'}`);
    }
  };

  const handleWardenResetStudent = async (e) => {
    e.preventDefault();
    if (!studentRollInput.trim() || !studentNewPassInput.trim()) return;
    try {
      const res = await fetch(`${apiUrl}/api/warden/reset-student-password?warden_id=${user.user_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_user_id: studentRollInput.trim().toUpperCase(),
          new_password: studentNewPassInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ ${data.message}`);
        setStudentRollInput('');
        setStudentNewPassInput('');
      } else {
        setStatusMsg(`❌ ${data.detail || 'Could not reset password'}`);
      }
    } catch {
      setStatusMsg('❌ Connection error.');
    }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset;
    let y = calYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m);
    setCalYear(y);
  };

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed' || status === 'Approved') return '#4ade80';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    return '#fbbf24';
  };

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;
  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const displayedComplaints = selectedHostel ? complaints.filter((c) => c.hostel_block === selectedHostel) : complaints;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {statusMsg && <div className="hms-toast" onClick={() => setStatusMsg(null)}>{statusMsg}</div>}

      {/* Desktop Navigation */}
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
          ⭐ Clubs & Events {pendingEvents.length > 0 && <span className="hms-badge-inline">{pendingEvents.length}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'leaves' ? 'active' : ''}`} onClick={() => setActiveTab('leaves')}>
          🪪 Leave Approvals
        </button>
        <button className={`hms-dtab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          📥 PDF Audit Report
        </button>
        <button className={`hms-dtab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          🔑 Passwords & Recovery
        </button>
      </div>

      {/* TAB 1: HOSTELS (DEAN) */}
      {isDean && activeTab === 'hostels' && (
        <div className="hms-grid-3">
          {SVNIT_HOSTELS.map((h) => {
            const hostelIssues = complaints.filter((c) => c.hostel_block === h.name && c.status !== 'Completed').length;
            return (
              <div
                key={h.code}
                className="hms-item-card"
                onClick={() => { setSelectedHostel(h.name); setActiveTab('complaints'); }}
              >
                <div className="hms-avatar-circle">{h.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{h.name}</span>
                    <span className="hms-muted-xs">{h.ext}</span>
                  </div>
                  <div className="hms-row-between" style={{ marginTop: '6px' }}>
                    <span className="hms-item-sub">{h.cwId} • {h.wId}</span>
                    <span className="hms-status-pill" style={{ color: hostelIssues > 0 ? '#c084fc' : '#94a3b8', borderColor: hostelIssues > 0 ? '#8b5cf6' : '#334155' }}>
                      {hostelIssues} active
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
          {displayedComplaints.length === 0 ? (
            <div className="hms-empty-card">No grievances found for the selected scope.</div>
          ) : (
            <div className="hms-grid-2">
              {displayedComplaints.map((c) => (
                <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
                  <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
                  <div style={{ flex: 1 }}>
                    <div className="hms-row-between">
                      <span className="hms-item-title">{c.summary}</span>
                      <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                    </div>
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
          )}
        </div>
      )}

      {/* TAB 3: CLUBS HUB */}
      {activeTab === 'clubshub' && (
        <div>
          <div className="hms-subtab-group" style={{ marginBottom: '18px' }}>
            <button className={`hms-subtab ${clubSubTab === 'approvals' ? 'active' : ''}`} onClick={() => setClubSubTab('approvals')}>
              ⚡ Event Approvals & Master Calendar ({pendingEvents.length})
            </button>
            <button className={`hms-subtab ${clubSubTab === 'directory' ? 'active' : ''}`} onClick={() => setClubSubTab('directory')}>
              📁 Official Clubs Directory ({clubs.length})
            </button>
          </div>

          {clubSubTab === 'approvals' && (
            <div className="hms-grid-calendar-layout">
              <div className="hms-card">
                <div className="hms-section-label">⚡ Pending Venue Requisitions & AI Clash Check</div>
                {pendingEvents.length === 0 ? (
                  <div className="hms-empty-card" style={{ padding: '20px' }}>✅ All club event proposals have been reviewed!</div>
                ) : (
                  <div className="hms-stack">
                    {pendingEvents.map((ev) => {
                      const aiCheck = checkAiVenueClash(ev);
                      return (
                        <div key={ev.event_id} className="hms-card" style={{ background: '#090d16' }} onClick={() => setSelectedEventAudit(ev)}>
                          <div className="hms-row-between">
                            <span className="hms-item-title">{ev.title}</span>
                            <span className="hms-pill-badge">{ev.club_id}</span>
                          </div>
                          <div className="hms-item-sub" style={{ marginTop: '4px' }}>
                            📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})
                          </div>
                          <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, background: aiCheck.free ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.15)', color: aiCheck.free ? '#4ade80' : '#f87171' }}>
                            🤖 {aiCheck.text}
                          </div>
                          {isDean && (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                              <button className="hms-btn-primary" onClick={() => handleApproveEvent(ev.event_id, 'Approved')}>
                                ✓ Approve Venue & Publish
                              </button>
                              <button className="hms-btn-danger" onClick={() => handleApproveEvent(ev.event_id, 'Rejected')}>
                                ✕ Reject
                              </button>
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
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="hms-cal-head">{d}</div>
                  ))}
                  {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                    <div key={`empty-${idx}`} className="hms-cal-day empty" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const dayNum = index + 1;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const matchedEvents = events.filter((e) => e.date === dateStr);
                    return (
                      <div key={dateStr} className="hms-cal-day">
                        <span className="hms-cal-num">{dayNum}</span>
                        {matchedEvents.map((ev) => (
                          <div
                            key={ev.event_id}
                            onClick={() => setSelectedEventAudit(ev)}
                            className="hms-cal-pill"
                            style={{ background: ev.status === 'Approved' ? '#8b5cf6' : ev.status === 'Completed' ? '#334155' : '#fbbf24', color: ev.status === 'Pending Dean Approval' ? '#090d16' : '#fff' }}
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
                        🎪 {clubEvents.length} Events • 👥 {club.members?.length || 0} Core Members
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LEAVE APPROVALS */}
      {activeTab === 'leaves' && (
        <div className="hms-card">
          <div className="hms-section-label">🪪 Resident Student Leave & Gate Outpass Requests ({leaves.length})</div>
          <div className="hms-stack">
            {leaves.map((l) => (
              <div key={l.leave_id} className="hms-row-item" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div className="hms-item-title">{l.student_name} ({l.student_id}) • {l.hostel_block} Rm {l.room}</div>
                  <div className="hms-item-sub">📍 Destination: <strong>{l.destination}</strong> • 📅 {l.from_date} to {l.to_date}</div>
                  <div className="hms-item-sub">📝 Reason: {l.reason} • 📞 Parent: {l.parent_phone}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="hms-status-pill" style={{ color: getStatusColor(l.status), borderColor: getStatusColor(l.status) }}>
                    {l.status}
                  </span>
                  {l.status === 'Pending Warden Approval' && (
                    <>
                      <button className="hms-btn-primary-sm" onClick={() => handleLeaveAction(l.leave_id, 'Approved')}>✓ Approve</button>
                      <button className="hms-btn-danger-sm" onClick={() => handleLeaveAction(l.leave_id, 'Rejected')}>✕ Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: PDF REPORT */}
      {activeTab === 'reports' && (
        <div className="hms-card" style={{ maxWidth: '580px', margin: '0 auto' }}>
          <h3>📥 Official PDF Grievance Audit Report</h3>
          <p className="hms-muted" style={{ marginBottom: '16px' }}>Generate a printable institutional audit report filtered by hostel and date range.</p>
          <div className="hms-stack">
            {isDean && (
              <div>
                <label className="hms-label">Hostel Scope</label>
                <select className="hms-input" value={pdfScope} onChange={(e) => setPdfScope(e.target.value)}>
                  <option value="All">All Campus Hostels Combined</option>
                  {SVNIT_HOSTELS.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
                </select>
              </div>
            )}
            <div className="hms-grid-2">
              <div>
                <label className="hms-label">From Date</label>
                <input type="date" className="hms-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className="hms-label">To Date</label>
                <input type="date" className="hms-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <button className="hms-btn-primary" onClick={handleDownloadPDF}>🖨️ Generate & Print Official PDF Report</button>
          </div>
        </div>
      )}

      {/* TAB 6: PASSWORDS & STUDENT RECOVERY */}
      {activeTab === 'settings' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🔑 Recover / Reset Resident Student Password</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              {isDean
                ? 'Dean can reset any student password across all hostels.'
                : `Warden of ${user.hostel_block} can reset passwords for residents who forgot their credentials.`}
            </p>
            <form onSubmit={handleWardenResetStudent} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Student Roll No (e.g. U26CE011)"
                value={studentRollInput}
                onChange={(e) => setStudentRollInput(e.target.value)}
                required
              />
              <input
                type="text"
                className="hms-input"
                placeholder="New Temporary Password (or DOB: DDMMYYYY)"
                value={studentNewPassInput}
                onChange={(e) => setStudentNewPassInput(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">⚡ Reset Student Password</button>
            </form>
          </div>

          {isDean ? (
            <div className="hms-card">
              <div className="hms-section-label">🏢 Reset Hostel Warden Credentials</div>
              <div className="hms-stack">
                {SVNIT_HOSTELS.map((h) => (
                  <div key={h.code} className="hms-row-item">
                    <span className="hms-item-title">{h.name}</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(h.cwId)}>Reset {h.cwId}</button>
                      <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(h.wId)}>Reset {h.wId}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="hms-card">
              <div className="hms-section-label">👤 Warden Authority Profile</div>
              <h3>{user.full_name}</h3>
              <p className="hms-muted">{user.authority_title}</p>
              <div className="hms-detail-box">
                <div><strong>Position ID:</strong> {user.user_id}</div>
                <div style={{ marginTop: '6px' }}><strong>Assigned Bhawan:</strong> {user.hostel_block}</div>
                <div style={{ marginTop: '6px' }}><strong>Office Phone:</strong> {user.phone}</div>
              </div>
            </div>
          )}
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
              <div style={{ marginTop: '4px' }}><strong>Location:</strong> {selectedTicket.hostel_block}, Room {selectedTicket.room}</div>
              <div style={{ marginTop: '4px' }}><strong>Status:</strong> {selectedTicket.status}</div>
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '6px', color: '#4ade80' }}><strong>Staff Resolution Note:</strong> {selectedTicket.staff_remark}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CLUB DOSSIER */}
      {selectedClub && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedClub(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedClub.name}</h3>
                <span className="hms-muted-xs">Faculty Advisor: {selectedClub.faculty_advisor}</span>
              </div>
              <button className="hms-close-btn" onClick={() => setSelectedClub(null)}>✕</button>
            </div>
            <p className="hms-muted">{selectedClub.mission}</p>
            {selectedClub.extra_dean_info && (
              <div className="hms-detail-box" style={{ borderColor: '#8b5cf6', marginBottom: '14px' }}>
                <div className="hms-section-label">📌 Official Club Dossier Note for Dean</div>
                <div>{selectedClub.extra_dean_info}</div>
              </div>
            )}
            <div className="hms-section-label">👥 Core Position Holders</div>
            <div className="hms-stack">
              {selectedClub.members?.map((m, i) => (
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

      {/* MODAL: EVENT & AI AUDIT */}
      {selectedEventAudit && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEventAudit(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedEventAudit.club_id} • {selectedEventAudit.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEventAudit(null)}>✕</button>
            </div>
            {selectedEventAudit.image_url && (
              <img src={selectedEventAudit.image_url} alt="Poster" className="hms-event-img" />
            )}
            <h3>{selectedEventAudit.title}</h3>
            <p className="hms-muted">📍 {selectedEventAudit.venue} • 📅 {selectedEventAudit.date} ({selectedEventAudit.start_time} - {selectedEventAudit.end_time})</p>
            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '13px', marginBottom: '12px' }}>
              👥 Live Student RSVPs: {selectedEventAudit.rsvps?.length || 0} Attending
            </div>
            {selectedEventAudit.ai_audit && (
              <div className="hms-detail-box">
                <div className="hms-section-label">🤖 AI Post-Event Feedback Audit</div>
                <div><strong>Attendees:</strong> {selectedEventAudit.ai_audit.total_attendees} | <strong>Avg Rating:</strong> ⭐ {selectedEventAudit.ai_audit.average_rating}/5.0</div>
                <div style={{ color: '#4ade80', marginTop: '8px', fontWeight: 700 }}>👍 Key Pros:</div>
                <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
                  {selectedEventAudit.ai_audit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <div style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Areas of Improvement:</div>
                <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>
                  {selectedEventAudit.ai_audit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: DEAN WARDEN PASSWORD RESET */}
      {resetTarget && (
        <div className="hms-modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>🔐 Reset Password: {resetTarget}</h3>
              <button className="hms-close-btn" onClick={() => setResetTarget(null)}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Enter New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">Save New Password</button>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="hms-bottom-nav">
        {isDean && (
          <button onClick={() => setActiveTab('hostels')} className={`hms-bnav-item ${activeTab === 'hostels' ? 'active' : ''}`}>
            <span>🏢</span><span>Hostels</span>
          </button>
        )}
        <button onClick={() => setActiveTab('complaints')} className={`hms-bnav-item ${activeTab === 'complaints' ? 'active' : ''}`}>
          <span>💬</span><span>Grievances</span>
        </button>
        <button onClick={() => setActiveTab('clubshub')} className={`hms-bnav-item ${activeTab === 'clubshub' ? 'active' : ''}`}>
          <span>⭐</span><span>Clubs Hub</span>
        </button>
        <button onClick={() => setActiveTab('leaves')} className={`hms-bnav-item ${activeTab === 'leaves' ? 'active' : ''}`}>
          <span>🪪</span><span>Leaves</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`hms-bnav-item ${activeTab === 'settings' ? 'active' : ''}`}>
          <span>🔑</span><span>Passwords</span>
        </button>
      </nav>
    </div>
  );
}

// =========================================================
// 4. CLUB COORDINATOR PORTAL
// =========================================================
function ClubPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [aiAudit, setAiAudit] = useState(null);
  const [msg, setMsg] = useState(null);

  const [extraInfoInput, setExtraInfoInput] = useState('');
  const [missionInput, setMissionInput] = useState('');

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

  const loadData = useCallback(async () => {
    try {
      const [cRes, eRes, aRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/unicore/audit-summary`)
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClubs(cData);
        const found = cData.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || cData[0];
        if (found) {
          setMissionInput(found.mission || '');
          setExtraInfoInput(found.extra_dean_info || '');
        }
      }
      if (eRes.ok) setEvents(await eRes.json());
      if (aRes.ok) setAiAudit(await aRes.json());
    } catch (err) {
      console.error(err);
    }
  }, [apiUrl, user.user_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveClubInfo = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/unicore/clubs/update-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_id: user.user_id, mission: missionInput, extra_dean_info: extraInfoInput })
      });
      if (res.ok) {
        setMsg('✅ Club dossier updated for Dean Portal!');
        loadData();
      }
    } catch {
      setMsg('❌ Failed to update club info.');
    }
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eventForm, club_id: user.user_id, submitted_by: user.full_name })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('✅ Proposal sent to Dean with AI Clash Verification!');
        setEventForm({ title: '', date: '2026-10-29', start_time: '10:00', end_time: '13:00', venue: 'CRC Auditorium', description: '', image_url: '', registration_link: '' });
        loadData();
      } else {
        setMsg(`❌ ${data.detail || 'Venue Clash Detected'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const myClub = clubs.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || clubs[0] || {};
  const myEvents = events.filter((e) => e.club_id.toUpperCase() === (user.user_id || '').toUpperCase());

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>⭐ Club Dossier & Roster</button>
        <button className={`hms-dtab ${activeTab === 'clash' ? 'active' : ''}`} onClick={() => setActiveTab('clash')}>⚡ Venue Proposals & RSVPs</button>
        <button className={`hms-dtab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>🤖 AI Feedback Audit</button>
      </div>

      {activeTab === 'ledger' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <span className="hms-pill-badge">OFFICIAL STUDENT CHAPTER</span>
            <h2 style={{ margin: '8px 0' }}>{myClub.name || user.full_name}</h2>
            <div className="hms-detail-box" style={{ marginBottom: '16px' }}>
              <div><strong>Faculty Advisor:</strong> {myClub.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Coordinator:</strong> {myClub.head_coordinator}</div>
              <div style={{ marginTop: '4px' }}><strong>Events Organized:</strong> {myEvents.length} Events</div>
            </div>
            <form onSubmit={handleSaveClubInfo} className="hms-stack">
              <label className="hms-label">Update Club Mission & Dossier Notes for Dean</label>
              <textarea rows="2" className="hms-input" value={missionInput} onChange={(e) => setMissionInput(e.target.value)} placeholder="Club Mission" />
              <textarea rows="2" className="hms-input" value={extraInfoInput} onChange={(e) => setExtraInfoInput(e.target.value)} placeholder="Budget notes, achievements, equipment requests..." />
              <button type="submit" className="hms-btn-primary">💾 Save Dossier</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">👥 Position-Wise Member Roster ({myClub.members?.length || 0})</div>
            <div className="hms-stack">
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
          </div>
        </div>
      )}

      {activeTab === 'clash' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">+ Submit Event Venue & Rich Media Proposal</div>
            <form onSubmit={handleProposeEvent} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Event Title (e.g. Winter CodeFest 2026)" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
              <textarea rows="3" className="hms-input" placeholder="Full Event Description..." value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />
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
              <button type="submit" className="hms-btn-primary">🚀 Send Venue Request to Dean</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📊 My Club Events & Live RSVPs ({myEvents.length})</div>
            <div className="hms-stack">
              {myEvents.map((ev) => (
                <div key={ev.event_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{ev.title}</div>
                    <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time}-{ev.end_time})</div>
                    <div style={{ fontSize: '12px', color: '#4ade80', fontWeight: 700, marginTop: '4px' }}>
                      👥 {ev.rsvps?.length || 0} Students Confirmed Coming
                    </div>
                  </div>
                  <span className="hms-pill-badge">{ev.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && aiAudit && (
        <div className="hms-card" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <span className="hms-pill-badge">🤖 AI POST-EVENT FEEDBACK AUDIT</span>
          <h3 style={{ margin: '10px 0' }}>{aiAudit.event_title}</h3>
          <div className="hms-detail-box">
            <div>👥 <strong>Total Attendees:</strong> {aiAudit.total_attendees} | ⭐ <strong>Average Rating:</strong> {aiAudit.average_rating} / 5.0</div>
            <div style={{ color: '#4ade80', fontWeight: 700, marginTop: '12px' }}>👍 Key Pros:</div>
            <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>{aiAudit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <div style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Areas of Improvement:</div>
            <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>{aiAudit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <div><strong>Dean Recommendation:</strong> {aiAudit.recommendation}</div>
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('ledger')} className={`hms-bnav-item ${activeTab === 'ledger' ? 'active' : ''}`}><span>⭐</span><span>Ledger</span></button>
        <button onClick={() => setActiveTab('clash')} className={`hms-bnav-item ${activeTab === 'clash' ? 'active' : ''}`}><span>⚡</span><span>Proposals</span></button>
        <button onClick={() => setActiveTab('audit')} className={`hms-bnav-item ${activeTab === 'audit' ? 'active' : ''}`}><span>🤖</span><span>AI Audit</span></button>
      </nav>
    </div>
  );
}

// =========================================================
// 5. MAINTENANCE STAFF PORTAL
// =========================================================
function StaffPortal({ user, complaints, apiUrl, onRefresh }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
    });
    if (res.ok) {
      setMsg(`✅ Ticket ${selectedTicket.ticket_id} marked resolved & sent for student confirmation!`);
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
                <div className="hms-avatar-circle">🛠️</div>
                <div style={{ flex: 1 }}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{c.summary}</span>
                    <span className="hms-pill-badge">{c.status}</span>
                  </div>
                  <div className="hms-item-sub" style={{ marginTop: '6px' }}>
                    📍 {c.hostel_block} • Room {c.room} ({c.student_name})
                  </div>
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
              <h3 style={{ margin: 0 }}>Resolve {selectedTicket.ticket_id}</h3>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <p className="hms-muted">{selectedTicket.description}</p>
            <form onSubmit={handleResolve} className="hms-stack">
              <textarea
                rows="3"
                className="hms-input"
                placeholder="Enter action taken / parts replaced..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">✅ Mark Resolved & Notify Resident</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// 6. MAIN APPLICATION SHELL & CLEAN LOGIN PORTAL
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
    } catch (e) {
      console.warn(e);
    }
    setAuthReady(true);
  }, []);

  const fetchComplaints = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        role: user.role,
        user_id: user.user_id,
        hostel_block: user.hostel_block || 'All',
        department: user.department || ''
      });
      const res = await fetch(`${API_URL}/api/complaints?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComplaints(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchComplaints();
  }, [user, fetchComplaints]);

  useEffect(() => {
    let timer;
    if (loading) {
      setServerProgress(10);
      timer = setInterval(() => {
        setServerProgress((prev) => (prev >= 92 ? prev : prev + Math.floor(Math.random() * 14) + 5));
      }, 380);
    } else {
      setServerProgress(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userIdInput.trim(), password: passwordInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerProgress(100);
        setTimeout(() => {
          setUser(data.user);
          try { localStorage.setItem('hms_user', JSON.stringify(data.user)); } catch {}
          setLoading(false);
        }, 250);
      } else {
        setLoading(false);
        setLoginError(data.detail || 'Invalid ID or Password');
      }
    } catch {
      setLoading(false);
      setLoginError('Cannot reach server. Please wait a moment while Render wakes up the server.');
    }
  };

  const handleLogout = () => {
    try { localStorage.removeItem('hms_user'); } catch {}
    setUser(null);
    setUserIdInput('');
    setPasswordInput('');
    setLoginError(null);
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
                <div className="hms-progress-track">
                  <div className="hms-progress-fill" style={{ width: `${serverProgress}%` }} />
                </div>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="hms-stack">
                <input
                  type="text"
                  className="hms-input"
                  placeholder="Position ID / Roll No"
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  required
                />
                <div className="hms-pass-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="hms-input"
                    style={{ paddingRight: '46px' }}
                    placeholder="Password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="hms-eye-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                <button type="submit" className="hms-btn-primary" style={{ marginTop: '4px' }}>
                  Sign In →
                </button>
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
                  <div className="hms-brand-sub">
                    {user.role === 'Founder'
                      ? `👑 ${user.authority_title}`
                      : user.role === 'Student'
                      ? `${user.full_name} • ${user.hostel_block} (Rm ${user.room})`
                      : `${user.full_name} • ${user.authority_title || user.role}`}
                  </div>
                </div>
              </div>
              <button className="hms-signout-btn" onClick={handleLogout}>Sign Out</button>
            </div>
          </header>

          <main className="hms-main">
            {user.role === 'Founder' && <FounderPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Student' && <StudentPortal user={user} complaints={complaints} apiUrl={API_URL} onRefresh={fetchComplaints} />}
            {(user.role === 'Dean' || user.role === 'Warden') && <WardenPortal user={user} complaints={complaints} apiUrl={API_URL} onRefresh={fetchComplaints} />}
            {user.role === 'ClubOrganizer' && <ClubPortal user={user} apiUrl={API_URL} />}
            {user.role === 'Staff' && <StaffPortal user={user} complaints={complaints} apiUrl={API_URL} onRefresh={fetchComplaints} />}
          </main>
        </>
      )}
    </div>
  );
}

// =========================================================
// 7. PROFESSIONAL RESPONSIVE CSS (MOBILE + TABLET + DESKTOP)
// =========================================================
const RESPONSIVE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #060911; color: #f8fafc; font-family: 'Inter', system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
  .hms-root { min-height: 100vh; display: flex; flex-direction: column; background: #060911; }
  .hms-topbar { position: sticky; top: 0; z-index: 150; background: rgba(11, 17, 32, 0.92); backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b; }
  .hms-topbar-inner { max-width: 1200px; margin: 0 auto; height: 68px; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
  .hms-brand-box { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-weight: 800; font-size: 13px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(139,92,246,0.35); }
  .hms-brand-title { font-size: 16px; font-weight: 800; color: #f8fafc; }
  .hms-brand-sub { font-size: 12px; color: #94a3b8; }
  .hms-signout-btn { background: rgba(239, 68, 68, 0.12); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer; transition: 0.2s; }
  .hms-signout-btn:hover { background: rgba(239, 68, 68, 0.25); }

  .hms-main { flex: 1; width: 100%; max-width: 1200px; margin: 0 auto; padding: 20px 16px 100px 16px; }
  .hms-container { width: 100%; }

  /* Login Page */
  .hms-login-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: radial-gradient(circle at top, #111827 0%, #060911 70%); }
  .hms-login-card { width: 100%; max-width: 420px; background: #0f172a; border: 1px solid #1e293b; border-radius: 24px; padding: 36px 28px; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.65); }
  .hms-logo-pill { display: inline-block; background: rgba(139, 92, 246, 0.18); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.4); padding: 6px 18px; border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; margin-bottom: 14px; }
  .hms-login-title { margin: 0 0 6px 0; font-size: 22px; font-weight: 800; color: #f8fafc; }
  .hms-login-sub { margin: 0 0 26px 0; font-size: 13px; color: #94a3b8; }
  .hms-error-alert { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
  .hms-waking-box { background: #090d16; border: 1px solid #1e293b; border-radius: 14px; padding: 22px 18px; margin: 10px 0; }
  .hms-progress-track { width: 100%; height: 8px; background: #1e293b; border-radius: 999px; overflow: hidden; }
  .hms-progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 999px; transition: width 0.35s ease; }

  /* Grids & Cards */
  .hms-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
  .hms-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .hms-grid-calendar-layout { display: grid; grid-template-columns: 1.25fr 1fr; gap: 20px; align-items: start; }
  .hms-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 20px; }
  .hms-empty-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; padding: 44px 20px; text-align: center; color: #94a3b8; }
  .hms-item-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 16px; display: flex; align-items: flex-start; gap: 14px; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
  .hms-item-card:hover { border-color: #8b5cf6; transform: translateY(-2px); }
  .hms-avatar-circle { width: 46px; height: 46px; border-radius: 50%; background: #1e293b; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .hms-profile-avatar { width: 76px; height: 76px; border-radius: 50%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; font-size: 26px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin: 0 auto; }

  /* Typography & Badges */
  .hms-item-title { font-size: 15px; font-weight: 700; color: #f8fafc; }
  .hms-item-sub { font-size: 13px; color: #94a3b8; margin-top: 2px; }
  .hms-muted { font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .hms-muted-xs { font-size: 11px; color: #64748b; }
  .hms-section-label { font-size: 12px; font-weight: 800; color: #c084fc; text-transform: uppercase; letter-spacing: 0.7px; margin-bottom: 12px; }
  .hms-pill-badge { display: inline-block; background: rgba(139, 92, 246, 0.16); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.35); padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  .hms-status-pill { font-size: 11px; font-weight: 700; border: 1px solid; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
  .hms-badge-inline { background: #8b5cf6; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }

  /* Forms & Buttons */
  .hms-stack { display: flex; flex-direction: column; gap: 12px; }
  .hms-row-between { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .hms-row-item { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
  .hms-input { width: 100%; background: #090d16; border: 1px solid #334155; border-radius: 12px; padding: 12px 14px; color: #f8fafc; font-size: 14px; outline: none; transition: border-color 0.2s; }
  .hms-input:focus { border-color: #8b5cf6; }
  .hms-label { display: block; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px; }
  .hms-pass-wrap { position: relative; width: 100%; }
  .hms-eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 17px; padding: 4px; }
  .hms-btn-primary { width: 100%; background: linear-gradient(135deg, #8b5cf6, #6366f1); color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; transition: opacity 0.2s; }
  .hms-btn-primary:hover { opacity: 0.92; }
  .hms-btn-danger { width: 100%; background: #ef4444; color: #fff; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 800; cursor: pointer; }
  .hms-btn-primary-sm { background: #8b5cf6; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .hms-btn-danger-sm { background: #ef4444; color: #fff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 800; cursor: pointer; }
  .hms-btn-ghost-sm { background: #1e293b; color: #c084fc; border: 1px solid #334155; border-radius: 8px; padding: 7px 12px; font-size: 11px; font-weight: 700; cursor: pointer; }

  /* Toolbar & Search */
  .hms-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
  .hms-search-box { flex: 1; min-width: 240px; display: flex; align-items: center; gap: 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 999px; padding: 10px 16px; }
  .hms-search-box input { background: transparent; border: none; outline: none; color: #f8fafc; font-size: 14px; width: 100%; }

  /* Hero & Tabs */
  .hms-hero-banner { background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.15)); border: 1px solid rgba(139, 92, 246, 0.4); border-radius: 20px; padding: 22px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
  .hms-hero-banner h2 { margin: 6px 0 4px 0; font-size: 20px; }
  .hms-hero-banner p { margin: 0; font-size: 13px; color: #cbd5e1; }
  .hms-subtab-group { display: flex; gap: 8px; background: #090d16; padding: 6px; border-radius: 12px; border: 1px solid #1e293b; flex-wrap: wrap; }
  .hms-subtab { background: transparent; color: #94a3b8; border: none; padding: 9px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .hms-subtab.active { background: #8b5cf6; color: #fff; }
  .hms-chip-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 18px; }
  .hms-campus-chip { background: #0f172a; color: #cbd5e1; border: 1px solid #334155; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
  .hms-campus-chip.active { background: #8b5cf6; color: #fff; border-color: #8b5cf6; }
  .hms-tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
  .hms-tag { background: #090d16; border: 1px solid #334155; color: #e2e8f0; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }

  /* Calendar Grid */
  .hms-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #1e293b; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; }
  .hms-cal-head { background: #0f172a; text-align: center; padding: 8px 0; font-size: 11px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
  .hms-cal-day { background: #090d16; min-height: 76px; padding: 6px; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
  .hms-cal-day.empty { opacity: 0.35; }
  .hms-cal-num { font-size: 11px; font-weight: 700; color: #64748b; }
  .hms-cal-pill { font-size: 10px; font-weight: 700; color: #fff; padding: 3px 5px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Modals & Toasts */
  .hms-toast { background: #1e293b; border-left: 4px solid #8b5cf6; padding: 12px 16px; border-radius: 10px; color: #f8fafc; font-size: 13px; font-weight: 600; margin-bottom: 16px; cursor: pointer; box-shadow: 0 8px 25px rgba(0,0,0,0.4); }
  .hms-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.78); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 300; }
  .hms-modal-box { background: #0f172a; border: 1px solid #334155; border-radius: 20px; padding: 24px; width: 100%; max-width: 500px; max-height: 88vh; overflow-y: auto; }
  .hms-close-btn { background: #1e293b; color: #cbd5e1; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-weight: 800; }
  .hms-detail-box { background: #090d16; border: 1px solid #1e293b; border-radius: 12px; padding: 14px; font-size: 13px; color: #cbd5e1; margin-top: 10px; }
  .hms-event-img { width: 100%; height: 180px; object-fit: cover; border-radius: 12px; margin-bottom: 12px; }
  .hms-link-btn { display: block; text-align: center; background: #1e293b; color: #c084fc; border: 1px solid #8b5cf6; padding: 11px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 13px; margin-top: 12px; }
  .hms-cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .hms-cat-chip { background: #090d16; border: 1.5px solid #1e293b; border-radius: 10px; padding: 10px; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hms-cat-chip.active { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.15); }

  /* Responsive Navigation (Desktop vs Mobile) */
  .hms-desktop-tabs { display: flex; gap: 8px; background: #0f172a; padding: 8px; border-radius: 14px; border: 1px solid #1e293b; margin-bottom: 20px; overflow-x: auto; }
  .hms-dtab { background: transparent; color: #94a3b8; border: none; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; transition: 0.15s; }
  .hms-dtab.active { background: #8b5cf6; color: #fff; }

  .hms-bottom-nav { display: none; position: fixed; bottom: 0; left: 0; right: 0; height: 70px; background: #0b1120; border-top: 1px solid #1e293b; justify-content: space-around; align-items: center; z-index: 200; }
  .hms-bnav-item { background: transparent; border: none; color: #94a3b8; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; cursor: pointer; flex: 1; }
  .hms-bnav-item span:first-child { font-size: 18px; }
  .hms-bnav-item.active { color: #c084fc; }
  .hms-fab-mobile { display: none; position: fixed; right: 20px; bottom: 86px; width: 54px; height: 54px; border-radius: 16px; background: #8b5cf6; color: #fff; border: none; font-size: 28px; font-weight: 800; box-shadow: 0 10px 25px rgba(139,92,246,0.45); cursor: pointer; z-index: 190; }

  @media (max-width: 768px) {
    .hms-desktop-tabs { display: none; }
    .hms-bottom-nav { display: flex; }
    .hms-fab-mobile { display: flex; align-items: center; justify-content: center; }
    .hms-grid-calendar-layout { grid-template-columns: 1fr; }
    .hms-grid-2, .hms-grid-3 { grid-template-columns: 1fr; }
    .hms-topbar-inner { padding: 0 14px; }
  }
`;