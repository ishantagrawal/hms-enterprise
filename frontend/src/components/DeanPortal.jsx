import React, { useState, useEffect, useCallback } from 'react';

const SVNIT_HOSTELS = [
  { code: 'CW_GAJJAR', name: 'Gajjar Bhawan', phone: '0261-2201659' },
  { code: 'CW_BHABHA', name: 'Bhabha Bhawan', phone: '0261-2201790' },
  { code: 'CW_MTB', name: 'Mother Teresa Bhawan', phone: '0261-2201967' },
  { code: 'CW_SVB', name: 'Swami Vivekananda Bhawan', phone: '0261-2201657' },
  { code: 'CW_NEHRU', name: 'Nehru Bhawan', phone: '0261-2201703' },
  { code: 'CW_TAGORE', name: 'Tagore Bhawan', phone: '0261-2201707' },
  { code: 'CW_SARABHAI', name: 'Sarabhai Bhawan', phone: '0261-2201793' },
  { code: 'CW_RAMAN', name: 'Raman Bhawan', phone: '0261-2201789' },
  { code: 'CW_ABVB', name: 'Atal Bihari Vajpayee Bhawan', phone: '0261-2201880' }
];

export default function DeanPortal({ apiUrl }) {
  const [activeTab, setActiveTab] = useState('approvals');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [msg, setMsg] = useState(null);

  // Modals for Deep Inspection
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // 1. Simple Club Creation Form (ID, Name, Password only)
  const [clubForm, setClubForm] = useState({ club_id: '', name: '', password: '123' });

  // 2. Unified Central Department = Login Form
  const [deptForm, setDeptForm] = useState({ dept_id: '', name: '', password: '123', icon: '⚡' });

  // 3. Combined Hostel Warden Form
  const [wardenForm, setWardenForm] = useState({
    user_id: 'CW_GAJJAR',
    hostel_block: 'Gajjar Bhawan',
    password: '123',
    phone: '0261-2201659'
  });

  // Calendar State
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9); // October

  // Reports State
  const [reportYear, setReportYear] = useState('2026');
  const [reportClub, setReportClub] = useState('All');
  const [pdfScope, setPdfScope] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadDeanData = useCallback(async () => {
    try {
      const [cRes, eRes, nRes, dRes, compRes, stRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/notices?role=Dean`),
        fetch(`${apiUrl}/api/departments`),
        fetch(`${apiUrl}/api/complaints?role=Dean`),
        fetch(`${apiUrl}/api/warden/students?hostel_block=All`)
      ]);
      if (cRes.ok) setClubs(await cRes.json());
      if (eRes.ok) setEvents(await eRes.json());
      if (nRes.ok) setNotices(await nRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (compRes.ok) setComplaints(await compRes.json());
      if (stRes.ok) {
        const sList = await stRes.json();
        setStudentsCount(Array.isArray(sList) ? sList.length : 0);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl]);

  useEffect(() => { loadDeanData(); }, [loadDeanData]);

  // Strict Time-Only Overlap Check (Does not get confused by custom manual venue names)
  const checkTimeClash = (candidate) => {
    const overlapping = events.filter(
      (other) =>
        other.event_id !== candidate.event_id &&
        (other.status === 'Approved' || other.status === 'Completed') &&
        other.date === candidate.date &&
        !(candidate.end_time <= other.start_time || candidate.start_time >= other.end_time)
    );
    if (overlapping.length > 0) {
      const first = overlapping[0];
      return {
        clash: true,
        text: `⏰ Time Overlap Notice: ${first.club_id}'s "${first.title}" is already approved on ${first.date} (${first.start_time} - ${first.end_time}) at ${first.venue}.`
      };
    }
    return {
      clash: false,
      text: `✅ Time Slot Clear: No other approved event is running on ${candidate.date} between ${candidate.start_time} and ${candidate.end_time}.`
    };
  };

  const handleApproveEvent = async (eventId, action) => {
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
      if (res.ok) {
        setEvents(events.map((e) => (e.event_id === eventId ? { ...e, status: action } : e)));
        setMsg(`✅ Event ${eventId} marked as ${action}!`);
      }
    } catch {
      setMsg('❌ Error updating event.');
    }
  };

  const handleApproveNotice = async (noticeId, action) => {
    try {
      const res = await fetch(`${apiUrl}/api/notices/approve?notice_id=${noticeId}&action=${action}`, { method: 'POST' });
      if (res.ok) {
        setNotices(notices.map((n) => (n.notice_id === noticeId ? { ...n, status: action } : n)));
        setMsg(`✅ Notice ${noticeId} marked as ${action}!`);
      }
    } catch {
      setMsg('❌ Error updating notice.');
    }
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/dean/create-club`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clubForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setClubForm({ club_id: '', name: '', password: '123' });
        loadDeanData();
      } else {
        setMsg(`❌ ${data.detail || 'Could not create club'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const handleCreateCentralDept = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/departments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dept_id: deptForm.dept_id,
          name: deptForm.name,
          password: deptForm.password,
          dept_type: 'Central',
          hostel_block: 'All',
          icon: deptForm.icon
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setDeptForm({ dept_id: '', name: '', password: '123', icon: '⚡' });
        loadDeanData();
      }
    } catch {
      setMsg('❌ Failed to create central department.');
    }
  };

  const handleSaveWarden = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/dean/create-warden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wardenForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
      }
    } catch {
      setMsg('❌ Error saving Warden portal.');
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=DEAN`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: resetTarget, new_password: newPasswordInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ ${data.message}`);
        setResetTarget(null);
        setNewPasswordInput('');
      } else {
        setMsg(`❌ ${data.detail || 'Failed'}`);
      }
    } catch {
      setMsg('❌ Connection error.');
    }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset;
    let y = calYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m);
    setCalYear(y);
  };

  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const pendingNotices = notices.filter((n) => n.status === 'Pending Dean Approval');
  const centralDepts = departments.filter((d) => d.type === 'Central');
  const yearEvents = events.filter((e) => e.date.startsWith(reportYear) && (e.status === 'Approved' || e.status === 'Completed'));

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {/* Top Macro Stats Bar */}
      <div className="hms-grid-3" style={{ marginBottom: '18px' }}>
        <div className="hms-row-item">
          <span>🎓 Total Registered Students</span>
          <strong style={{ color: '#c084fc', fontSize: '16px' }}>{studentsCount}</strong>
        </div>
        <div className="hms-row-item">
          <span>🎭 Active Campus Clubs</span>
          <strong style={{ color: '#4ade80', fontSize: '16px' }}>{clubs.length} Clubs</strong>
        </div>
        <div className="hms-row-item">
          <span>🎪 Approved Events ({reportYear})</span>
          <strong style={{ color: '#38bdf8', fontSize: '16px' }}>{yearEvents.length} Events</strong>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'approvals' ? 'active' : ''}`} onClick={() => setActiveTab('approvals')}>
          ⚡ Approvals & Calendar {(pendingEvents.length + pendingNotices.length) > 0 && <span className="hms-badge-inline">{pendingEvents.length + pendingNotices.length}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'clubs' ? 'active' : ''}`} onClick={() => setActiveTab('clubs')}>
          🎭 Clubs Hub ({clubs.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'central_depts' ? 'active' : ''}`} onClick={() => setActiveTab('central_depts')}>
          🌐 Central Departments ({centralDepts.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'wardens' ? 'active' : ''}`} onClick={() => setActiveTab('wardens')}>
          🏢 Hostel Wardens (9)
        </button>
        <button className={`hms-dtab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          📊 Annual Reports & Print PDF
        </button>
      </div>

      {/* TAB 1: EVENT & NOTICE APPROVALS + INTERACTIVE CALENDAR */}
      {activeTab === 'approvals' && (
        <div className="hms-grid-2">
          <div className="hms-stack">
            <div className="hms-card">
              <div className="hms-section-label">⚡ Pending Club Event Proposals ({pendingEvents.length})</div>
              {pendingEvents.length === 0 ? (
                <div className="hms-empty-card" style={{ padding: '24px' }}>✅ All club event requests have been reviewed!</div>
              ) : (
                <div className="hms-stack">
                  {pendingEvents.map((ev) => {
                    const timeCheck = checkTimeClash(ev);
                    return (
                      <div key={ev.event_id} className="hms-card" style={{ background: '#090d16', cursor: 'pointer' }} onClick={() => setSelectedEvent(ev)}>
                        <div className="hms-row-between">
                          <span className="hms-item-title">{ev.title}</span>
                          <span className="hms-pill-badge">{ev.club_id}</span>
                        </div>
                        <p className="hms-item-sub" style={{ margin: '6px 0', color: '#cbd5e1' }}>{ev.description}</p>
                        <div className="hms-item-sub">📍 Venue: <strong>{ev.venue}</strong> • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                        <div style={{
                          marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                          background: timeCheck.clash ? 'rgba(251,191,36,0.14)' : 'rgba(34,197,94,0.12)',
                          color: timeCheck.clash ? '#fbbf24' : '#4ade80'
                        }}>
                          {timeCheck.text}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                          <button className="hms-btn-primary" onClick={() => handleApproveEvent(ev.event_id, 'Approved')}>✓ Approve Event</button>
                          <button className="hms-btn-danger" onClick={() => handleApproveEvent(ev.event_id, 'Rejected')}>✕ Disapprove</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Club Notices */}
            <div className="hms-card">
              <div className="hms-section-label">📢 Pending Club Notices for Students ({pendingNotices.length})</div>
              {pendingNotices.length === 0 ? (
                <div className="hms-muted">No pending notices awaiting approval.</div>
              ) : (
                <div className="hms-stack">
                  {pendingNotices.map((n) => (
                    <div key={n.notice_id} className="hms-card" style={{ background: '#090d16' }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{n.title}</span>
                        <span className="hms-pill-badge">{n.club_id}</span>
                      </div>
                      <p className="hms-item-sub" style={{ margin: '6px 0' }}>{n.message}</p>
                      <div className="hms-item-sub">🎯 Target: <strong>{n.target_year} • {n.target_branch}</strong></div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                        <button className="hms-btn-primary" onClick={() => handleApproveNotice(n.notice_id, 'Approved')}>✓ Approve Notice</button>
                        <button className="hms-btn-danger" onClick={() => handleApproveNotice(n.notice_id, 'Rejected')}>✕ Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Master Event Calendar */}
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
              <h3 style={{ margin: 0 }}>🗓️ {monthNames[calMonth]} {calYear}</h3>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
            </div>
            <p className="hms-muted-xs" style={{ marginBottom: '10px' }}>Click any event on the calendar to inspect attendance, details, and student feedback.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#1e293b', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} style={{ background: '#0f172a', textAlign: 'center', padding: '8px 0', fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>{d}</div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} style={{ background: '#090d16', minHeight: '76px', opacity: 0.35 }} />
              ))}
              {Array.from({ length: daysNum }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayEvents = events.filter((e) => e.date === dateStr);
                return (
                  <div key={dateStr} style={{ background: '#090d16', minHeight: '76px', padding: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{dayNum}</span>
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.event_id}
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          fontSize: '10px', fontWeight: 700, padding: '3px 5px', borderRadius: '5px', cursor: 'pointer',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          background: ev.status === 'Approved' ? '#8b5cf6' : ev.status === 'Completed' ? '#475569' : '#fbbf24',
                          color: ev.status === 'Pending Dean Approval' ? '#090d16' : '#fff'
                        }}
                      >
                        {ev.club_id}: {ev.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CLUBS DIRECTORY & 1-STEP CLUB CREATION */}
      {activeTab === 'clubs' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🎭 Create New Club Login (ID & Password Only)</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Assign a unique Club Login ID and Password. Once created, the club coordinator logs in and manually fills their mission, faculty advisor, core members, and gallery.
            </p>
            <form onSubmit={handleCreateClub} className="hms-stack">
              <div>
                <label className="hms-label">Unique Club Login ID</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. ROBOTICS, EDC, LIT_CLUB"
                  value={clubForm.club_id}
                  onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="hms-label">Club / Chapter Display Name</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. Robotics & Aviation Society"
                  value={clubForm.name}
                  onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="hms-label">Initial Club Password</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. 123"
                  value={clubForm.password}
                  onChange={(e) => setClubForm({ ...clubForm, password: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="hms-btn-primary">✨ Create Club Account</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏛️ Active Clubs — Click Any Club to Inspect Full Dossier ({clubs.length})</div>
            <div className="hms-stack" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              {clubs.map((c) => {
                const clubEvCount = events.filter((e) => e.club_id.toUpperCase() === c.club_id.toUpperCase()).length;
                return (
                  <div key={c.club_id} className="hms-item-card" onClick={() => setSelectedClub(c)}>
                    <div className="hms-avatar-circle">🎭</div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{c.name}</span>
                        <span className="hms-pill-badge">ID: {c.club_id}</span>
                      </div>
                      <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.mission}</p>
                      <div className="hms-row-between" style={{ marginTop: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#c084fc', fontWeight: 700 }}>
                          👥 {c.members?.length || 0} Members • 🎪 {clubEvCount} Events
                        </span>
                        <button
                          type="button"
                          className="hms-btn-ghost-sm"
                          onClick={(e) => { e.stopPropagation(); setResetTarget(c.club_id); }}
                        >
                          🔑 Reset Pass
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CENTRAL DEPARTMENTS (1-STEP UNIFIED DEPARTMENT = LOGIN) */}
      {activeTab === 'central_depts' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🌐 Create Central Department & Portal Login</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Central departments (like CCC/Internet, Electrical, Night Light, Solar) serve all 9 hostels. Creating a department here immediately adds it to the student complaint form AND creates the department's login account.
            </p>
            <form onSubmit={handleCreateCentralDept} className="hms-stack">
              <div>
                <label className="hms-label">Department Login ID</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. ELECTRICITY, CCC_LAN, NIGHT_LIGHT"
                  value={deptForm.dept_id}
                  onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="hms-label">Department Name (Seen by Students)</label>
                <input
                  type="text"
                  className="hms-input"
                  placeholder="e.g. Solar & Street Lighting"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <div>
                  <label className="hms-label">Login Password</label>
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
                    placeholder="e.g. ⚡"
                    value={deptForm.icon}
                    onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="hms-btn-primary">✨ Create Central Department & Login</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📋 Active Central Departments ({centralDepts.length})</div>
            <div className="hms-stack">
              {centralDepts.map((d) => {
                const openTickets = complaints.filter((c) => c.category.toUpperCase() === d.id.toUpperCase() && c.status !== 'Completed').length;
                return (
                  <div key={d.id} className="hms-row-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '24px' }}>{d.icon}</span>
                      <div>
                        <div className="hms-item-title">{d.title}</div>
                        <div className="hms-item-sub">Login ID: <strong>{d.id}</strong> • {openTickets} Open Complaints</div>
                      </div>
                    </div>
                    <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(d.id)}>🔑 Password</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: HOSTELS & COMBINED WARDEN / CHIEF WARDEN PORTALS */}
      {activeTab === 'wardens' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🏢 Configure Hostel Warden Portal (Warden + Chief Warden)</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Each hostel has a single unified Warden / Chief Warden portal login. Set or update the login ID and password for any Bhawan below.
            </p>
            <form onSubmit={handleSaveWarden} className="hms-stack">
              <div>
                <label className="hms-label">Select SVNIT Hostel Bhawan</label>
                <select
                  className="hms-input"
                  value={wardenForm.hostel_block}
                  onChange={(e) => {
                    const found = SVNIT_HOSTELS.find((h) => h.name === e.target.value);
                    setWardenForm({
                      ...wardenForm,
                      hostel_block: e.target.value,
                      user_id: found ? found.code : 'CW_HOSTEL',
                      phone: found ? found.phone : '0261-2201600'
                    });
                  }}
                >
                  {SVNIT_HOSTELS.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
                </select>
              </div>
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <div>
                  <label className="hms-label">Warden Portal Login ID</label>
                  <input type="text" className="hms-input" value={wardenForm.user_id} onChange={(e) => setWardenForm({ ...wardenForm, user_id: e.target.value })} required />
                </div>
                <div>
                  <label className="hms-label">Portal Password</label>
                  <input type="text" className="hms-input" value={wardenForm.password} onChange={(e) => setWardenForm({ ...wardenForm, password: e.target.value })} required />
                </div>
              </div>
              <button type="submit" className="hms-btn-primary">💾 Save Hostel Warden Credentials</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏢 All 9 SVNIT Hostels Overview</div>
            <div className="hms-stack" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {SVNIT_HOSTELS.map((h) => {
                const hComplaints = complaints.filter((c) => c.hostel_block === h.name && c.status !== 'Completed').length;
                return (
                  <div key={h.code} className="hms-row-item">
                    <div>
                      <div className="hms-item-title">{h.name}</div>
                      <div className="hms-item-sub">Login ID: <strong>{h.code}</strong> • Ext: {h.phone}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="hms-pill-badge">{hComplaints} Open Issues</span>
                      <button className="hms-btn-ghost-sm" onClick={() => setResetTarget(h.code)}>🔑 Reset</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: YEAR-WISE EVENT ANALYTICS & GRIEVANCE PDF PRINTING */}
      {activeTab === 'reports' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🎪 Year-Wise & Club-Wise Event Summary</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              View total events conducted across the academic year and print the official summary report.
            </p>
            <div className="hms-grid-2" style={{ gap: '10px', marginBottom: '14px' }}>
              <div>
                <label className="hms-label">Select Year</label>
                <select className="hms-input" value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                </select>
              </div>
              <div>
                <label className="hms-label">Club Filter</label>
                <select className="hms-input" value={reportClub} onChange={(e) => setReportClub(e.target.value)}>
                  <option value="All">All Clubs Combined</option>
                  {clubs.map((c) => <option key={c.club_id} value={c.club_id}>{c.name} ({c.club_id})</option>)}
                </select>
              </div>
            </div>

            <div className="hms-stack" style={{ marginBottom: '14px' }}>
              {clubs.map((c) => {
                const count = yearEvents.filter((e) => e.club_id.toUpperCase() === c.club_id.toUpperCase()).length;
                return (
                  <div key={c.club_id} className="hms-row-item">
                    <span>{c.name} (<strong>{c.club_id}</strong>)</span>
                    <span className="hms-pill-badge">{count} Events in {reportYear}</span>
                  </div>
                );
              })}
            </div>

            <button
              className="hms-btn-primary"
              onClick={() => window.open(`${apiUrl}/api/unicore/events/export-pdf?year=${reportYear}&club_id=${reportClub}`, '_blank')}
            >
              🖨️ Print Annual Event Summary Report (PDF)
            </button>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📥 Official Hostel Grievance PDF Report</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Total Recorded Complaints: <strong>{complaints.length}</strong> ({complaints.filter((c) => c.status !== 'Completed').length} Open / In-Progress).
            </p>
            <div className="hms-stack">
              <div>
                <label className="hms-label">Hostel Scope</label>
                <select className="hms-input" value={pdfScope} onChange={(e) => setPdfScope(e.target.value)}>
                  <option value="All">All SVNIT Hostels Combined</option>
                  {SVNIT_HOSTELS.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
                </select>
              </div>
              <div className="hms-grid-2" style={{ gap: '10px' }}>
                <div><label className="hms-label">From Date</label><input type="date" className="hms-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                <div><label className="hms-label">To Date</label><input type="date" className="hms-input" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
              </div>
              <button
                className="hms-btn-primary"
                onClick={() => {
                  const q = new URLSearchParams({ hostel_block: pdfScope, from_date: fromDate, to_date: toDate });
                  window.open(`${apiUrl}/api/complaints/export-pdf?${q.toString()}`, '_blank');
                }}
              >
                🖨️ Print Official Grievance Audit PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: FULL CLUB INSPECTION DOSSIER */}
      {selectedClub && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedClub(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <span className="hms-pill-badge">CLUB DOSSIER • {selectedClub.club_id}</span>
              <button className="hms-close-btn" onClick={() => setSelectedClub(null)}>✕</button>
            </div>
            <h3 style={{ margin: '0 0 6px 0' }}>{selectedClub.name}</h3>
            <p className="hms-muted">{selectedClub.mission}</p>
            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div><strong>Faculty Advisor:</strong> {selectedClub.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Coordinator:</strong> {selectedClub.head_coordinator}</div>
              {selectedClub.extra_dean_info && (
                <div style={{ marginTop: '8px', color: '#c084fc' }}>
                  <strong>Club Notes for Dean:</strong> {selectedClub.extra_dean_info}
                </div>
              )}
            </div>

            <div className="hms-section-label">👥 Manually Entered Committee Roster ({selectedClub.members?.length || 0})</div>
            <div className="hms-stack" style={{ marginBottom: '16px' }}>
              {(!selectedClub.members || selectedClub.members.length === 0) ? (
                <div className="hms-muted">No members added by the club yet.</div>
              ) : (
                selectedClub.members.map((m, idx) => (
                  <div key={idx} className="hms-row-item">
                    <div>
                      <div className="hms-item-title">{m.name}</div>
                      <div className="hms-item-sub">Roll: {m.roll} • 📞 {m.phone}</div>
                    </div>
                    <span className="hms-pill-badge">{m.position}</span>
                  </div>
                ))
              )}
            </div>

            <div className="hms-section-label">🎪 Club Events</div>
            <div className="hms-stack">
              {events.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).map((ev) => (
                <div
                  key={ev.event_id}
                  className="hms-row-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setSelectedClub(null); setSelectedEvent(ev); }}
                >
                  <div>
                    <div className="hms-item-title">{ev.title}</div>
                    <div className="hms-item-sub">📍 {ev.venue} • 📅 {ev.date} • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                  </div>
                  <span className="hms-pill-badge">{ev.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EVENT DETAILS, ATTENDANCE & STUDENT FEEDBACK */}
      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <span className="hms-pill-badge">{selectedEvent.club_id} • {selectedEvent.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            {selectedEvent.image_url && <img src={selectedEvent.image_url} alt={selectedEvent.title} className="hms-event-img" />}
            <h3 style={{ margin: '0 0 6px 0' }}>{selectedEvent.title}</h3>
            <p className="hms-muted">{selectedEvent.description}</p>
            <div className="hms-detail-box">
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div>
              <div style={{ marginTop: '6px', color: '#4ade80', fontWeight: 800 }}>
                👥 Students Confirmed Attending (RSVP): {selectedEvent.rsvps?.length || 0} Students
              </div>
            </div>

            {selectedEvent.feedbacks && selectedEvent.feedbacks.length > 0 && (
              <div className="hms-detail-box" style={{ borderColor: '#8b5cf6', marginTop: '12px' }}>
                <div className="hms-section-label">⭐ Post-Event Student Feedback ({selectedEvent.feedbacks.length} Reviews)</div>
                {selectedEvent.ai_audit && (
                  <div style={{ marginBottom: '8px', fontWeight: 700, color: '#fbbf24' }}>
                    Average Rating: ⭐ {selectedEvent.ai_audit.average_rating} / 5.0
                  </div>
                )}
                <div className="hms-stack">
                  {selectedEvent.feedbacks.map((f, i) => (
                    <div key={i} className="hms-row-item">
                      <div>
                        <div className="hms-item-title">{f.student_id}</div>
                        <div className="hms-item-sub">"{f.review}"</div>
                      </div>
                      <span className="hms-pill-badge">⭐ {f.rating}/5</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: PASSWORD RESET */}
      {resetTarget && (
        <div className="hms-modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>🔑 Set New Password for {resetTarget}</h3>
              <button className="hms-close-btn" onClick={() => setResetTarget(null)}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} className="hms-stack">
              <input
                type="text"
                className="hms-input"
                placeholder="Enter new password..."
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">💾 Update Password</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}