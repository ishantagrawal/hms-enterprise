import React, { useState, useEffect, useCallback } from 'react';

export default function DeanPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('events');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [msg, setMsg] = useState(null);

  // Modals for Inspection
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Calendar State
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9); // October

  // 1. Club Quick Creation (Only Username & Password required)
  const [clubAuthForm, setClubAuthForm] = useState({ club_id: '', password: '' });

  // 2. Warden Portal Creation / Password Reset (Combined Warden/Chief Warden per Hostel)
  const [wardenForm, setWardenForm] = useState({ hostel_name: 'Gajjar Bhawan', warden_id: 'CW_GAJJAR', password: '123', ext: '0261-2201659' });

  // 3. Central Department & Central Staff Creation
  const [deptForm, setDeptForm] = useState({ title: '', icon: '⚡' });
  const [staffForm, setStaffForm] = useState({ user_id: '', password: '123', full_name: '', department: 'Electricity', phone: '' });

  // 4. Reports & Print Filters
  const [reportYear, setReportYear] = useState('2026');
  const [reportClub, setReportClub] = useState('All');
  const [pdfHostelScope, setPdfHostelScope] = useState('All');

  const loadDeanData = useCallback(async () => {
    try {
      const [cRes, eRes, nRes, hRes, compRes, stRes, dRes, sfRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/unicore/notices`),
        fetch(`${apiUrl}/api/hostels`),
        fetch(`${apiUrl}/api/complaints?role=Dean`),
        fetch(`${apiUrl}/api/warden/students?hostel_block=All`),
        fetch(`${apiUrl}/api/departments?hostel_block=All`),
        fetch(`${apiUrl}/api/staff?hostel_block=All`)
      ]);
      if (cRes.ok) setClubs(await cRes.json());
      if (eRes.ok) setEvents(await eRes.json());
      if (nRes.ok) setNotices(await nRes.json());
      if (hRes.ok) setHostels(await hRes.json());
      if (compRes.ok) setComplaints(await compRes.json());
      if (stRes.ok) { const s = await stRes.json(); setStudentsCount(Array.isArray(s) ? s.length : 0); }
      if (dRes.ok) setDepartments(await dRes.json());
      if (sfRes.ok) setStaffList(await sfRes.json());
    } catch (e) { console.error(e); }
  }, [apiUrl]);

  useEffect(() => { loadDeanData(); }, [loadDeanData]);

  // Time-Only Clash Detector (Checks if any other event is happening at the same time on the same date)
  const checkTimeOverlap = (candidate) => {
    const overlaps = events.filter(
      (other) =>
        other.event_id !== candidate.event_id &&
        other.status === 'Approved' &&
        other.date === candidate.date &&
        !(candidate.end_time <= other.start_time || candidate.start_time >= other.end_time)
    );
    if (overlaps.length > 0) {
      return {
        clear: false,
        text: `⚠️ Time Overlap Alert: '${overlaps[0].title}' by ${overlaps[0].club_id} (Venue: ${overlaps[0].venue}) is already scheduled at ${overlaps[0].start_time} - ${overlaps[0].end_time} on ${candidate.date}.`
      };
    }
    return {
      clear: true,
      text: `✅ Time Slot Clear: No other approved event overlaps with ${candidate.start_time} - ${candidate.end_time} on ${candidate.date}.`
    };
  };

  const handleApproveEvent = async (eventId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setMsg(`✅ Event ${eventId} marked as ${action}!`);
      loadDeanData();
    }
  };

  const handleApproveNotice = async (noticeId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/notices/approve?notice_id=${noticeId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setMsg(`✅ Notice ${noticeId} marked as ${action}!`);
      loadDeanData();
    }
  };

  const handleCreateClubAccount = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/create-club`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clubAuthForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setClubAuthForm({ club_id: '', password: '' });
      loadDeanData();
    } else setMsg(`❌ ${data.detail || 'Error'}`);
  };

  const handleSaveWardenAccount = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/warden-account`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wardenForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      loadDeanData();
    }
  };

  const handleCreateCentralDept = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/departments/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: deptForm.title, dept_type: 'Central', hostel_block: 'All', icon: deptForm.icon, created_by: 'DEAN' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setDeptForm({ title: '', icon: '⚡' });
      loadDeanData();
    } else setMsg(`❌ ${data.detail || 'Error'}`);
  };

  const handleCreateCentralStaff = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/staff/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...staffForm, hostel_block: 'All' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setStaffForm({ user_id: '', password: '123', full_name: '', department: 'Electricity', phone: '' });
      loadDeanData();
    }
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset, y = calYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCalMonth(m); setCalYear(y);
  };

  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const pendingNotices = notices.filter((n) => n.status === 'Pending Dean Approval');
  const yearFilteredEvents = events.filter((e) => e.date.startsWith(reportYear) && (reportClub === 'All' || e.club_id === reportClub));

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {/* Macro Summary Metrics Bar */}
      <div className="hms-grid-4" style={{ marginBottom: '20px' }}>
        <div className="hms-stat-card">
          <div className="hms-muted-xs">ACTIVE CLUB CHAPTERS</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#c084fc', marginTop: '4px' }}>{clubs.length} Clubs</div>
        </div>
        <div className="hms-stat-card">
          <div className="hms-muted-xs">CAMPUS EVENTS ({calYear})</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#38bdf8', marginTop: '4px' }}>{events.length} Events</div>
        </div>
        <div className="hms-stat-card">
          <div className="hms-muted-xs">RESIDENT STUDENTS</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#4ade80', marginTop: '4px' }}>{studentsCount} Students</div>
        </div>
        <div className="hms-stat-card">
          <div className="hms-muted-xs">TOTAL GRIEVANCES</div>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#fbbf24', marginTop: '4px' }}>{complaints.length} Tickets</div>
        </div>
      </div>

      {/* Desktop Navigation */}
      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>
          ⚡ Approvals & Calendar {(pendingEvents.length + pendingNotices.length) > 0 && <span className="hms-badge-inline">{pendingEvents.length + pendingNotices.length}</span>}
        </button>
        <button className={`hms-dtab ${activeTab === 'clubs' ? 'active' : ''}`} onClick={() => setActiveTab('clubs')}>
          🎭 Clubs & Credentials ({clubs.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'wardens' ? 'active' : ''}`} onClick={() => setActiveTab('wardens')}>
          🏢 Hostel Wardens ({hostels.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'central' ? 'active' : ''}`} onClick={() => setActiveTab('central')}>
          🌐 Central Depts (CCC & Elec)
        </button>
        <button className={`hms-dtab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          🖨️ Annual Audits & Print PDF
        </button>
      </div>

      {/* TAB 1: EVENT & NOTICE APPROVALS + MASTER CALENDAR */}
      {activeTab === 'events' && (
        <div className="hms-grid-calendar-layout">
          <div className="hms-stack">
            <div className="hms-card">
              <div className="hms-section-label">⚡ Club Event Proposals ({pendingEvents.length})</div>
              {pendingEvents.length === 0 ? (
                <div className="hms-empty-card" style={{ padding: '20px' }}>✅ All event proposals reviewed!</div>
              ) : (
                <div className="hms-stack">
                  {pendingEvents.map((ev) => {
                    const timeCheck = checkTimeOverlap(ev);
                    return (
                      <div key={ev.event_id} className="hms-card" style={{ background: '#090d16', cursor: 'pointer' }} onClick={() => setSelectedEvent(ev)}>
                        <div className="hms-row-between">
                          <span className="hms-item-title">{ev.title}</span>
                          <span className="hms-pill-badge">{ev.club_id}</span>
                        </div>
                        <p className="hms-item-sub" style={{ margin: '6px 0', color: '#e2e8f0' }}>{ev.description}</p>
                        <div className="hms-item-sub">📍 Custom Venue: <strong>{ev.venue}</strong> • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                        <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, background: timeCheck.clear ? 'rgba(74, 222, 128, 0.12)' : 'rgba(251, 191, 36, 0.15)', color: timeCheck.clear ? '#4ade80' : '#fbbf24' }}>
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

            {/* Club Notice Approvals */}
            <div className="hms-card">
              <div className="hms-section-label">📢 Pending Student Notices from Clubs ({pendingNotices.length})</div>
              {pendingNotices.length === 0 ? (
                <div className="hms-empty-card" style={{ padding: '18px' }}>✅ No pending club notices.</div>
              ) : (
                <div className="hms-stack">
                  {pendingNotices.map((n) => (
                    <div key={n.notice_id} className="hms-card" style={{ background: '#090d16' }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{n.title}</span>
                        <span className="hms-pill-badge">{n.club_id} • {n.target_branch} ({n.target_year})</span>
                      </div>
                      <p className="hms-item-sub" style={{ margin: '6px 0' }}>{n.message}</p>
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

          {/* Master Campus Calendar */}
          <div className="hms-card">
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(-1)}>◀ Prev</button>
              <h3 style={{ margin: 0 }}>🗓️ {monthNames[calMonth]} {calYear}</h3>
              <button className="hms-btn-ghost-sm" onClick={() => changeMonth(1)}>Next ▶</button>
            </div>
            <p className="hms-muted-xs" style={{ marginBottom: '10px' }}>Click any event on the calendar to inspect attendance, details, or student feedbacks.</p>
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
                        onClick={() => setSelectedEvent(ev)}
                        className="hms-cal-pill"
                        style={{ background: ev.status === 'Completed' ? '#10b981' : ev.status === 'Approved' ? '#8b5cf6' : '#fbbf24', color: ev.status === 'Pending Dean Approval' ? '#090d16' : '#fff' }}
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

      {/* TAB 2: CLUBS CREATION (USERNAME & PASSWORD ONLY) & INSPECTION */}
      {activeTab === 'clubs' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🔑 Create Club Portal / Reset Club Password</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Assign a unique <strong>Club Username</strong> and <strong>Password</strong>. The club coordinator will log in and manually fill their mission, faculty advisor, members, and media gallery.
            </p>
            <form onSubmit={handleCreateClubAccount} className="hms-stack">
              <div>
                <label className="hms-label">Club Username / Login ID</label>
                <input type="text" className="hms-input" placeholder="e.g. ACM, DRISHTI, ROBOTICS,SPARSH" value={clubAuthForm.club_id} onChange={(e) => setClubAuthForm({ ...clubAuthForm, club_id: e.target.value })} required />
              </div>
              <div>
                <label className="hms-label">Club Password</label>
                <input type="text" className="hms-input" placeholder="Assign or reset password (e.g. 123)" value={clubAuthForm.password} onChange={(e) => setClubAuthForm({ ...clubAuthForm, password: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">✨ Create / Update Club Credentials</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏛️ Active Campus Clubs — Click to Inspect Full Dossier ({clubs.length})</div>
            <div className="hms-stack">
              {clubs.map((c) => {
                const cEvents = events.filter((e) => e.club_id.toUpperCase() === c.club_id.toUpperCase());
                return (
                  <div key={c.club_id} className="hms-item-card" onClick={() => setSelectedClub(c)}>
                    <div className="hms-avatar-circle">
                      {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🎭'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="hms-row-between">
                        <span className="hms-item-title">{c.name}</span>
                        <span className="hms-pill-badge">ID: {c.club_id}</span>
                      </div>
                      <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.mission}</p>
                      <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: 700 }}>
                        👥 {c.members?.length || 0} Members • 🎪 {cEvents.length} Events • 📸 {c.gallery?.length || 0} Gallery Items →
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HOSTEL WARDENS (COMBINED WARDEN + CHIEF WARDEN PORTAL PER HOSTEL) */}
      {activeTab === 'wardens' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🏢 Create / Set Hostel Warden Portal Credentials</div>
            <p className="hms-muted" style={{ marginBottom: '14px' }}>
              Each hostel has a unified <strong>Warden & Chief Warden Portal</strong>. Configure or reset the hostel's login ID and password here.
            </p>
            <form onSubmit={handleSaveWardenAccount} className="hms-stack">
              <div>
                <label className="hms-label">Hostel Bhawan Name</label>
                <input type="text" className="hms-input" placeholder="e.g. Gajjar Bhawan" value={wardenForm.hostel_name} onChange={(e) => setWardenForm({ ...wardenForm, hostel_name: e.target.value })} required />
              </div>
              <div>
                <label className="hms-label">Warden Portal Username</label>
                <input type="text" className="hms-input" placeholder="e.g. CW_GAJJAR" value={wardenForm.warden_id} onChange={(e) => setWardenForm({ ...wardenForm, warden_id: e.target.value })} required />
              </div>
              <div>
                <label className="hms-label">Assign / Reset Password</label>
                <input type="text" className="hms-input" placeholder="Enter password" value={wardenForm.password} onChange={(e) => setWardenForm({ ...wardenForm, password: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">💾 Save Warden Portal Credentials</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏢 SVNIT Hostel Warden Portals ({hostels.length})</div>
            <div className="hms-stack">
              {hostels.map((h) => (
                <div key={h.warden_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{h.name}</div>
                    <div className="hms-item-sub">Portal Login ID: <strong>{h.warden_id}</strong> • Office: {h.ext}</div>
                  </div>
                  <button
                    className="hms-btn-ghost-sm"
                    onClick={() => setWardenForm({ hostel_name: h.name, warden_id: h.warden_id, password: '123', ext: h.ext })}
                  >
                    Edit / Reset Password
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CENTRAL DEPARTMENTS & CENTRAL STAFF (CCC / INTERNET & ELECTRICAL) */}
      {activeTab === 'central' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🌐 1. Create Central Complaint Department (All Hostels)</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Central departments (like CCC/Internet, Electrical, Night Light, etc.) are shared across all hostels and immediately appear on student complaint forms.
            </p>
            <form onSubmit={handleCreateCentralDept} className="hms-stack" style={{ marginBottom: '22px' }}>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Department Name (e.g. Solar / Street Light)" value={deptForm.title} onChange={(e) => setDeptForm({ ...deptForm, title: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Emoji Icon (e.g. 💡)" value={deptForm.icon} onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">+ Add Central Department Live</button>
            </form>

            <div className="hms-section-label">🛠️ 2. Create Central Maintenance Staff Login</div>
            <form onSubmit={handleCreateCentralStaff} className="hms-stack">
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Staff Login ID (e.g. STAFF_CCC2)" value={staffForm.user_id} onChange={(e) => setStaffForm({ ...staffForm, user_id: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required />
              </div>
              <input type="text" className="hms-input" placeholder="Staff Full Name" value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} required />
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <select className="hms-input" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}>
                  {departments.filter((d) => d.type === 'Central').map((d) => (
                    <option key={d.id} value={d.id}>{d.icon} {d.title}</option>
                  ))}
                </select>
                <input type="text" className="hms-input" placeholder="Phone Number" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">💾 Create Central Staff Account</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📋 Active Central Departments & Central Staff</div>
            <div className="hms-stack" style={{ marginBottom: '18px' }}>
              {departments.filter((d) => d.type === 'Central').map((d) => (
                <div key={d.id} className="hms-row-item">
                  <span>{d.icon} <strong>{d.title}</strong></span>
                  <span className="hms-pill-badge">Central (All Hostels)</span>
                </div>
              ))}
            </div>
            <div className="hms-section-label">👷 Central Staff Roster</div>
            <div className="hms-stack">
              {staffList.filter((s) => s.hostel_block === 'All').map((s) => (
                <div key={s.user_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{s.full_name} ({s.user_id})</div>
                    <div className="hms-item-sub">Wing: {s.department} • {s.phone}</div>
                  </div>
                  <span className="hms-pill-badge">All Hostels</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: YEAR-WISE EVENT ANALYTICS & PRINTABLE REPORTS */}
      {activeTab === 'reports' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🎪 Year-Wise & Club-Wise Event Audit Report</div>
            <div className="hms-grid-2" style={{ gap: '10px', marginBottom: '14px' }}>
              <div>
                <label className="hms-label">Select Year</label>
                <select className="hms-input" value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                </select>
              </div>
              <div>
                <label className="hms-label">Filter by Club</label>
                <select className="hms-input" value={reportClub} onChange={(e) => setReportClub(e.target.value)}>
                  <option value="All">All Clubs Combined</option>
                  {clubs.map((c) => <option key={c.club_id} value={c.club_id}>{c.name} ({c.club_id})</option>)}
                </select>
              </div>
            </div>

            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
                Total Events in {reportYear}: <span style={{ color: '#c084fc' }}>{yearFilteredEvents.length} Events</span>
              </div>
              {clubs.map((c) => {
                const cnt = events.filter((e) => e.date.startsWith(reportYear) && e.club_id.toUpperCase() === c.club_id.toUpperCase()).length;
                return (
                  <div key={c.club_id} className="hms-row-between" style={{ padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
                    <span>{c.name} ({c.club_id})</span>
                    <strong>{cnt} Events</strong>
                  </div>
                );
              })}
            </div>

            <button
              className="hms-btn-primary"
              onClick={() => window.open(`${apiUrl}/api/unicore/events/export-pdf?year=${reportYear}&club_id=${reportClub}`, '_blank')}
            >
              🖨️ Print Official Year-Wise Club Events Report
            </button>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📥 Hostel Grievance Summary & Printable PDF</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Total Complaints Logged Across Campus: <strong>{complaints.length}</strong>
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label className="hms-label">Select Hostel Scope to Print</label>
              <select className="hms-input" value={pdfHostelScope} onChange={(e) => setPdfHostelScope(e.target.value)}>
                <option value="All">All SVNIT Hostels Combined</option>
                {hostels.map((h) => <option key={h.warden_id} value={h.name}>{h.name}</option>)}
              </select>
            </div>
            <button
              className="hms-btn-primary"
              onClick={() => window.open(`${apiUrl}/api/complaints/export-pdf?hostel_block=${pdfHostelScope}`, '_blank')}
            >
              🖨️ Print Official Grievance PDF Report
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: FULL CLUB INSPECTION DOSSIER */}
      {selectedClub && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedClub(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">CLUB INSPECTION • ID: {selectedClub.club_id}</span>
              <button className="hms-close-btn" onClick={() => setSelectedClub(null)}>✕</button>
            </div>

            <div className="hms-ig-banner" style={{ backgroundImage: `url(${selectedClub.banner_url || 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1000&q=80'})` }}>
              <div className="hms-ig-avatar">
                {selectedClub.avatar_url ? <img src={selectedClub.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : selectedClub.club_id.slice(0, 3)}
              </div>
            </div>

            <h2 style={{ margin: '0 0 4px 0' }}>{selectedClub.name}</h2>
            <div style={{ color: '#c084fc', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{selectedClub.tagline}</div>
            <p className="hms-muted">{selectedClub.mission}</p>

            <div className="hms-detail-box" style={{ marginBottom: '16px' }}>
              <div><strong>Faculty Advisor:</strong> {selectedClub.faculty_advisor}</div>
              <div style={{ marginTop: '4px' }}><strong>Head Member / Coordinator:</strong> {selectedClub.head_coordinator}</div>
              {selectedClub.extra_dean_info && <div style={{ marginTop: '6px', color: '#4ade80' }}><strong>Club Notes:</strong> {selectedClub.extra_dean_info}</div>}
            </div>

            <div className="hms-section-label">👥 Manual Member Roster ({selectedClub.members?.length || 0} Members)</div>
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

            {selectedClub.gallery?.length > 0 && (
              <>
                <div className="hms-section-label">📸 Club Media Gallery ({selectedClub.gallery.length})</div>
                <div className="hms-gallery-grid" style={{ marginBottom: '16px' }}>
                  {selectedClub.gallery.map((g, i) => (
                    <div key={i} className="hms-gallery-item">
                      {g.media_type === 'video' ? <video src={g.media_url} controls /> : <img src={g.media_url} alt={g.caption} />}
                      <div style={{ padding: '8px', fontSize: '11px', color: '#cbd5e1' }}>{g.caption}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: EVENT INSPECTION (ATTENDANCE + STUDENT FEEDBACKS) */}
      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedEvent.club_id} • {selectedEvent.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            {selectedEvent.image_url && <img src={selectedEvent.image_url} alt="" className="hms-event-img" />}
            <h3>{selectedEvent.title}</h3>
            <p className="hms-muted">{selectedEvent.description}</p>

            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div>
              <div style={{ marginTop: '6px', color: '#4ade80', fontWeight: 800 }}>
                👥 Students Confirmed / Attended: {selectedEvent.rsvps?.length || 0} Students
              </div>
            </div>

            <div className="hms-section-label">⭐ Student Post-Event Feedbacks ({selectedEvent.feedbacks?.length || 0})</div>
            {(!selectedEvent.feedbacks || selectedEvent.feedbacks.length === 0) ? (
              <div className="hms-empty-card" style={{ padding: '18px' }}>No student feedbacks submitted yet for this event.</div>
            ) : (
              <div className="hms-stack">
                {selectedEvent.feedbacks.map((fb, idx) => (
                  <div key={idx} className="hms-row-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div className="hms-row-between" style={{ width: '100%' }}>
                      <strong>{fb.student_name} ({fb.student_id})</strong>
                      <span style={{ color: '#fbbf24', fontWeight: 800 }}>{'⭐'.repeat(fb.rating)} ({fb.rating}/5)</span>
                    </div>
                    <div className="hms-item-sub" style={{ color: '#e2e8f0', marginTop: '4px' }}>{fb.review}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('events')} className={`hms-bnav-item ${activeTab === 'events' ? 'active' : ''}`}><span>⚡</span><span>Approvals</span></button>
        <button onClick={() => setActiveTab('clubs')} className={`hms-bnav-item ${activeTab === 'clubs' ? 'active' : ''}`}><span>🎭</span><span>Clubs</span></button>
        <button onClick={() => setActiveTab('wardens')} className={`hms-bnav-item ${activeTab === 'wardens' ? 'active' : ''}`}><span>🏢</span><span>Wardens</span></button>
        <button onClick={() => setActiveTab('central')} className={`hms-bnav-item ${activeTab === 'central' ? 'active' : ''}`}><span>🌐</span><span>Central</span></button>
        <button onClick={() => setActiveTab('reports')} className={`hms-bnav-item ${activeTab === 'reports' ? 'active' : ''}`}><span>🖨️</span><span>Reports</span></button>
      </nav>
    </div>
  );
}