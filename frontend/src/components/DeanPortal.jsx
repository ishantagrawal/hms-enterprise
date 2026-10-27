import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

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
  const [page, setPage] = useState('home');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [studentsCount, setStudentsCount] = useState(0);
  const [msg, setMsg] = useState(null);

  const [selectedClub, setSelectedClub] = useState(null);
  const [clubSubView, setClubSubView] = useState('hub');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [previousPage, setPreviousPage] = useState('home');

  const [clubForm, setClubForm] = useState({ club_id: '', name: '', email: '' });
  const [deptForm, setDeptForm] = useState({ dept_id: '', name: '', email: '', icon: '⚡' });
  const [wardenForm, setWardenForm] = useState({ user_id: 'CW_GAJJAR', hostel_block: 'Gajjar Bhawan', email: '', phone: '0261-2201659' });

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);
  const [selectedDateStr, setSelectedDateStr] = useState('2026-10-25');

  const [reportYear, setReportYear] = useState('2026');
  const [reportClub, setReportClub] = useState('All');
  const [pdfScope, setPdfScope] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadDeanData = useCallback(async () => {
    try {
      const [cRes, eRes, nRes, dRes, compRes, stRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/unicore/clubs`),
        apiFetch(`${apiUrl}/api/unicore/events`),
        apiFetch(`${apiUrl}/api/notices?role=Dean`),
        apiFetch(`${apiUrl}/api/departments`),
        apiFetch(`${apiUrl}/api/complaints?role=Dean`),
        apiFetch(`${apiUrl}/api/warden/students?hostel_block=All`)
      ]);
      if (cRes.ok) setClubs(await cRes.json());
      if (eRes.ok) setEvents(await eRes.json());
      if (nRes.ok) setNotices(await nRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (compRes.ok) setComplaints(await compRes.json());
      if (stRes.ok) {
        const s = await stRes.json();
        setStudentsCount(Array.isArray(s) ? s.length : 0);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl]);

  useEffect(() => { loadDeanData(); }, [loadDeanData]);

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
        text: `⏰ Time Overlap: ${first.club_id}'s "${first.title}" is scheduled on ${first.date} (${first.start_time} - ${first.end_time}) at ${first.venue}.`
      };
    }
    return {
      clash: false,
      text: `✅ Time Slot Clear on ${candidate.date} (${candidate.start_time} - ${candidate.end_time}).`
    };
  };

  const handleApproveEvent = async (eventId, action) => {
    const res = await apiFetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setMsg(`✅ Event ${eventId} marked as ${action}!`);
      loadDeanData();
      setPage(previousPage);
    }
  };

  const handleApproveNotice = async (noticeId, action) => {
    const res = await apiFetch(`${apiUrl}/api/notices/approve?notice_id=${noticeId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setMsg(`✅ Notice marked as ${action}!`);
      loadDeanData();
      setPage('notice_approvals');
    }
  };

  const handleCreateClub = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/dean/create-club`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clubForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setClubForm({ club_id: '', name: '', email: '' });
      loadDeanData();
      setPage('clubs_list');
    } else {
      setMsg(`❌ ${data.detail || 'Error'}`);
    }
  };

  const handleCreateCentralDept = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/departments/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...deptForm, dept_type: 'Central', hostel_block: 'All' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setDeptForm({ dept_id: '', name: '', email: '', icon: '⚡' });
      loadDeanData();
    } else setMsg(`❌ ${data.detail || 'Could not save department.'}`);
  };

  const handleSaveWarden = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/dean/create-warden`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wardenForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
    } else {
      setMsg(`❌ ${data.detail || 'Could not save warden account.'}`);
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

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  const openEventPage = (ev, fromPage) => {
    setSelectedEvent(ev);
    setPreviousPage(fromPage);
    setPage('event_detail');
  };

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span>🏠 Dashboard Home</span>
        </button>
        <button className={`ptm-side-btn ${page === 'clubs_list' || page === 'club_detail' ? 'active' : ''}`} onClick={() => setPage('clubs_list')}>
          <span>🎭 Clubs Directory</span>
          <span>{clubs.length}</span>
        </button>
        <button className={`ptm-side-btn ${page === 'event_approvals' ? 'active' : ''}`} onClick={() => setPage('event_approvals')}>
          <span>⚡ Approve Events</span>
          {pendingEvents.length > 0 && <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>{pendingEvents.length}</span>}
        </button>
        <button className={`ptm-side-btn ${page === 'notice_approvals' ? 'active' : ''}`} onClick={() => setPage('notice_approvals')}>
          <span>📢 Approve Notices</span>
          {pendingNotices.length > 0 && <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>{pendingNotices.length}</span>}
        </button>
        <button className={`ptm-side-btn ${page === 'calendar' ? 'active' : ''}`} onClick={() => setPage('calendar')}>
          <span>🗓️ Event Calendar</span>
        </button>
        <button className={`ptm-side-btn ${page === 'create_club' ? 'active' : ''}`} onClick={() => setPage('create_club')}>
          <span>➕ Create New Club</span>
        </button>
        <button className={`ptm-side-btn ${page === 'central_depts' ? 'active' : ''}`} onClick={() => setPage('central_depts')}>
          <span>🌐 Central Departments</span>
        </button>
        <button className={`ptm-side-btn ${page === 'wardens' ? 'active' : ''}`} onClick={() => setPage('wardens')}>
          <span>🏢 Hostel Wardens</span>
        </button>
        <button className={`ptm-side-btn ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}>
          <span>🖨️ Reports & Print PDF</span>
        </button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {page === 'home' && (
          <div>
            <div className="ptm-mini-grid">
              <div className="ptm-mini-card" onClick={() => setPage('clubs_list')}>
                <div className="ptm-row-between">
                  <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Active Clubs</span>
                  <span>🎭</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{clubs.length}</div>
                <button className="ptm-mini-btn">Explore Clubs →</button>
              </div>

              <div className="ptm-mini-card" onClick={() => setPage('event_approvals')}>
                <div className="ptm-row-between">
                  <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Pending Approvals</span>
                  <span>⚡</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                  {pendingEvents.length + pendingNotices.length}
                </div>
                <button className="ptm-mini-btn">Review Requests →</button>
              </div>

              <div className="ptm-mini-card" onClick={() => setPage('reports')}>
                <div className="ptm-row-between">
                  <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Hostel Residents</span>
                  <span>🎓</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827', marginTop: '4px' }}>{studentsCount}</div>
                <button className="ptm-mini-btn">Audit Reports →</button>
              </div>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Clubs & Campus Events</div>
              <div className="ptm-icon-grid">
                <button className="ptm-icon-tile" onClick={() => setPage('clubs_list')}>
                  <div className="ptm-icon-circle">🎭</div>
                  <span className="ptm-icon-label">All Clubs Directory</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('event_approvals')}>
                  <div className="ptm-icon-circle">
                    ⚡
                    {pendingEvents.length > 0 && <span className="ptm-tile-badge">{pendingEvents.length}</span>}
                  </div>
                  <span className="ptm-icon-label">Approve Events</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('notice_approvals')}>
                  <div className="ptm-icon-circle">
                    📢
                    {pendingNotices.length > 0 && <span className="ptm-tile-badge">{pendingNotices.length}</span>}
                  </div>
                  <span className="ptm-icon-label">Approve Notices</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('calendar')}>
                  <div className="ptm-icon-circle">🗓️</div>
                  <span className="ptm-icon-label">Event Calendar</span>
                </button>
              </div>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Administration & Hostels</div>
              <div className="ptm-icon-grid">
                <button className="ptm-icon-tile" onClick={() => setPage('create_club')}>
                  <div className="ptm-icon-circle light">➕</div>
                  <span className="ptm-icon-label">Create Club Login</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('central_depts')}>
                  <div className="ptm-icon-circle light">🌐</div>
                  <span className="ptm-icon-label">Central Wings</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('wardens')}>
                  <div className="ptm-icon-circle light">🏢</div>
                  <span className="ptm-icon-label">Hostel Wardens</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('reports')}>
                  <div className="ptm-icon-circle light">🖨️</div>
                  <span className="ptm-icon-label">Print PDF Reports</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {page === 'clubs_list' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <div className="ptm-row-between">
                <h1 className="ptm-page-title">Official Student Clubs</h1>
                <button className="ptm-btn-secondary" onClick={() => setPage('create_club')}>+ Create New Club</button>
              </div>
              <p className="ptm-page-sub">Tap any club to open its dedicated portal (Upcoming Events, Completed Events, Members & Info)</p>
            </div>

            <div className="ptm-card">
              {clubs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>
                  No clubs registered yet. Tap "+ Create New Club" to create a club login.
                </div>
              ) : (
                <div className="ptm-list">
                  {clubs.map((c) => {
                    const cEvents = events.filter((e) => e.club_id.toUpperCase() === c.club_id.toUpperCase());
                    return (
                      <div
                        key={c.club_id}
                        className="ptm-list-row"
                        onClick={() => {
                          setSelectedClub(c);
                          setClubSubView('hub');
                          setPage('club_detail');
                        }}
                      >
                        <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>
                          {c.club_id.slice(0, 2)}
                        </div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{c.name}</div>
                          <div className="ptm-list-sub">Advisor: {c.faculty_advisor} • Head: {c.head_coordinator}</div>
                          <span className="ptm-tag-pill">👥 {c.members?.length || 0} Members • 🎪 {cEvents.length} Events</span>
                        </div>
                        <span style={{ color: '#002970', fontWeight: 800, fontSize: '18px' }}>›</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'club_detail' && selectedClub && (
          <div>
            <div className="ptm-drill-header">
              <button
                className="ptm-back-btn"
                onClick={() => {
                  if (clubSubView !== 'hub') setClubSubView('hub');
                  else setPage('clubs_list');
                }}
              >
                ←
              </button>
              <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>CLUB ID: {selectedClub.club_id}</span>
              <h1 className="ptm-page-title">{selectedClub.name}</h1>
              <p className="ptm-page-sub">{selectedClub.mission}</p>
            </div>

            {clubSubView === 'hub' && (
              <>
                <div className="ptm-card">
                  <div className="ptm-section-title">Explore {selectedClub.club_id} Sections</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('info')}>
                      <div className="ptm-icon-circle">ℹ️</div>
                      <span className="ptm-icon-label">Club Info & Advisor</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('members')}>
                      <div className="ptm-icon-circle">👥</div>
                      <span className="ptm-icon-label">Committee ({selectedClub.members?.length || 0})</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('upcoming')}>
                      <div className="ptm-icon-circle">🎪</div>
                      <span className="ptm-icon-label">Upcoming Events</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('completed')}>
                      <div className="ptm-icon-circle">⭐</div>
                      <span className="ptm-icon-label">Completed & Reviews</span>
                    </button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">All Events by {selectedClub.club_id}</div>
                  <div className="ptm-list">
                    {events.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).length === 0 ? (
                      <div className="ptm-list-sub">No events proposed by this club yet.</div>
                    ) : (
                      events
                        .filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase())
                        .map((ev) => (
                          <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'club_detail')}>
                            <div className="ptm-avatar-pastel">🎪</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{ev.title}</div>
                              <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                              <span className="ptm-tag-pill">👥 {ev.rsvps?.length || 0} RSVPs • Budget: {ev.budget || 'N/A'}</span>
                            </div>
                            <span className="ptm-status-badge" style={{ background: ev.status === 'Approved' ? '#DCFCE7' : '#FEF3C7', color: ev.status === 'Approved' ? '#15803D' : '#B45309' }}>
                              {ev.status}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </>
            )}

            {clubSubView === 'info' && (
              <div className="ptm-card">
                <div className="ptm-section-title">Club Information & Dean Notes</div>
                <div className="ptm-list">
                  <div className="ptm-list-row">
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">Faculty Advisor</div>
                      <div className="ptm-list-sub">{selectedClub.faculty_advisor}</div>
                    </div>
                  </div>
                  <div className="ptm-list-row">
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">Head Student Coordinator</div>
                      <div className="ptm-list-sub">{selectedClub.head_coordinator}</div>
                    </div>
                  </div>
                  <div className="ptm-list-row">
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">Additional Notes for Dean</div>
                      <div className="ptm-list-sub">{selectedClub.extra_dean_info || 'No additional notes submitted.'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {clubSubView === 'members' && (
              <div className="ptm-card">
                <div className="ptm-section-title">Committee Members ({selectedClub.members?.length || 0})</div>
                {(!selectedClub.members || selectedClub.members.length === 0) ? (
                  <div className="ptm-list-sub">No members added by the club yet.</div>
                ) : (
                  <div className="ptm-list">
                    {selectedClub.members.map((m, idx) => (
                      <div key={idx} className="ptm-list-row">
                        <div className="ptm-avatar-pastel" style={{ background: '#EDE9FE', color: '#6D28D9' }}>
                          {(m.name || 'MB').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{m.name}</div>
                          <div className="ptm-list-sub">Roll No: {m.roll} {m.phone && `• 📞 ${m.phone}`}</div>
                        </div>
                        <span className="ptm-status-badge" style={{ background: '#E0F2FE', color: '#002970' }}>
                          {m.position}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {clubSubView === 'upcoming' && (
              <div className="ptm-card">
                <div className="ptm-section-title">Upcoming Events</div>
                <div className="ptm-list">
                  {events
                    .filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase() && e.status !== 'Completed')
                    .map((ev) => (
                      <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'club_detail')}>
                        <div className="ptm-avatar-pastel">🎪</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{ev.title}</div>
                          <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date}</div>
                        </div>
                        <span className="ptm-status-badge" style={{ background: '#E0F2FE', color: '#002970' }}>{ev.status}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {clubSubView === 'completed' && (
              <div className="ptm-card">
                <div className="ptm-section-title">Completed Events & Student Feedback</div>
                <div className="ptm-list">
                  {events
                    .filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase() && e.status === 'Completed')
                    .map((ev) => (
                      <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'club_detail')}>
                        <div className="ptm-avatar-pastel">🏁</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{ev.title}</div>
                          <div className="ptm-list-sub">👥 {ev.rsvps?.length || 0} Attended • ⭐ {ev.ai_audit?.average_rating || '5.0'}/5</div>
                        </div>
                        <span>›</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'event_detail' && selectedEvent && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage(previousPage)}>←</button>
              <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>
                {selectedEvent.club_id} • {selectedEvent.status}
              </span>
              <h1 className="ptm-page-title">{selectedEvent.title}</h1>
              <p className="ptm-page-sub">Submitted by {selectedEvent.submitted_by}</p>
            </div>

            {selectedEvent.image_url && (
              <div className="ptm-card" style={{ padding: '10px' }}>
                <img src={selectedEvent.image_url} alt={selectedEvent.title} style={{ width: '100%', maxHeight: '280px', objectFit: 'cover', borderRadius: '14px' }} />
              </div>
            )}

            <div className="ptm-card">
              <div className="ptm-section-title">Event Requisition Dossier</div>
              <p style={{ color: '#374151', marginBottom: '16px' }}>{selectedEvent.description}</p>

              {(() => {
                const clashInfo = checkTimeClash(selectedEvent);
                return (
                  <div style={{
                    padding: '12px 14px', borderRadius: '12px', marginBottom: '16px', fontWeight: 700, fontSize: '13px',
                    background: clashInfo.clash ? '#FEF3C7' : '#DCFCE7',
                    color: clashInfo.clash ? '#B45309' : '#15803D'
                  }}>
                    {clashInfo.text}
                  </div>
                );
              })()}

              <div className="ptm-list">
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">📍 Venue</div><div className="ptm-list-sub">{selectedEvent.venue}</div></div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">📅 Date & Timing</div><div className="ptm-list-sub">{selectedEvent.date} ({selectedEvent.start_time} to {selectedEvent.end_time})</div></div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">💰 Estimated Budget & Funding</div><div className="ptm-list-sub">Budget: {selectedEvent.budget || 'N/A'} • Source: {selectedEvent.funding_source || 'N/A'}</div></div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">🎙️ Chief Guest / Speakers</div><div className="ptm-list-sub">{selectedEvent.chief_guest || 'None specified'}</div></div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">👥 Expected Crowd & Live RSVPs</div><div className="ptm-list-sub">Expected: {selectedEvent.expected_attendance || 'N/A'} • Confirmed Student RSVPs: {selectedEvent.rsvps?.length || 0}</div></div>
                </div>
                <div className="ptm-list-row">
                  <div className="ptm-list-main"><div className="ptm-list-title">🛠️ Logistics & Permissions Needed</div><div className="ptm-list-sub">{selectedEvent.logistics_needs || 'Standard'}</div></div>
                </div>

                {selectedEvent.custom_fields && selectedEvent.custom_fields.map((cf, i) => (
                  <div key={i} className="ptm-list-row">
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">📌 {cf.label}</div>
                      <div className="ptm-list-sub">{cf.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedEvent.status === 'Pending Dean Approval' && (
                <div className="ptm-grid-2" style={{ marginTop: '18px' }}>
                  <button className="ptm-btn-primary" onClick={() => handleApproveEvent(selectedEvent.event_id, 'Approved')}>
                    ✓ Approve Event Proposal
                  </button>
                  <button className="ptm-btn-danger" onClick={() => handleApproveEvent(selectedEvent.event_id, 'Rejected')}>
                    ✕ Disapprove Request
                  </button>
                </div>
              )}
            </div>

            {selectedEvent.feedbacks && selectedEvent.feedbacks.length > 0 && (
              <div className="ptm-card">
                <div className="ptm-section-title">Student Feedback & Ratings ({selectedEvent.feedbacks.length})</div>
                <div className="ptm-list">
                  {selectedEvent.feedbacks.map((f, i) => (
                    <div key={i} className="ptm-list-row">
                      <div className="ptm-avatar-pastel">⭐</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{f.student_id}</div>
                        <div className="ptm-list-sub">"{f.review}"</div>
                      </div>
                      <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>{f.rating}/5</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {page === 'event_approvals' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Pending Event Proposals</h1>
              <p className="ptm-page-sub">Tap any event proposal to inspect its budget, chief guest, logistics, and approve/disapprove</p>
            </div>
            <div className="ptm-card">
              {pendingEvents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#6B7280' }}>✅ All club event requests have been reviewed!</div>
              ) : (
                <div className="ptm-list">
                  {pendingEvents.map((ev) => (
                    <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'event_approvals')}>
                      <div className="ptm-avatar-pastel" style={{ background: '#FEF3C7', color: '#B45309' }}>⚡</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{ev.title}</div>
                        <div className="ptm-list-sub">Club: <strong>{ev.club_id}</strong> • 📍 {ev.venue} • 📅 {ev.date}</div>
                        <span className="ptm-tag-pill">💰 Budget: {ev.budget || 'N/A'} • Tap to Review Dossier</span>
                      </div>
                      <span>›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'notice_approvals' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Club Notice Board Approvals</h1>
            </div>
            <div className="ptm-card">
              {pendingNotices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#6B7280' }}>✅ No pending notices waiting for approval.</div>
              ) : (
                <div className="ptm-list">
                  {pendingNotices.map((n) => (
                    <div key={n.notice_id} className="ptm-card" style={{ background: '#F8FAFC' }}>
                      <div className="ptm-row-between">
                        <span className="ptm-list-title">{n.title}</span>
                        <span className="ptm-tag-pill">{n.club_id}</span>
                      </div>
                      <p className="ptm-list-sub" style={{ margin: '8px 0' }}>{n.message}</p>
                      <div className="ptm-list-sub">🎯 Target: <strong>{n.target_year} • {n.target_branch}</strong></div>
                      {n.custom_fields && n.custom_fields.map((cf, i) => (
                        <div key={i} className="ptm-list-sub" style={{ marginTop: '4px' }}>📌 <strong>{cf.label}:</strong> {cf.value}</div>
                      ))}
                      <div className="ptm-grid-2" style={{ marginTop: '12px' }}>
                        <button className="ptm-btn-primary" onClick={() => handleApproveNotice(n.notice_id, 'Approved')}>✓ Approve Notice</button>
                        <button className="ptm-btn-danger" onClick={() => handleApproveNotice(n.notice_id, 'Rejected')}>✕ Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'calendar' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Campus Event Calendar</h1>
              <p className="ptm-page-sub">Tap any date to view events scheduled on that day</p>
            </div>

            <div className="ptm-card">
              <div className="ptm-row-between" style={{ marginBottom: '14px' }}>
                <button className="ptm-btn-secondary" onClick={() => changeMonth(-1)}>◀ Prev</button>
                <h3 style={{ margin: 0, fontSize: '18px' }}>{monthNames[calMonth]} {calYear}</h3>
                <button className="ptm-btn-secondary" onClick={() => changeMonth(1)}>Next ▶</button>
              </div>

              <div className="ptm-cal-grid">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="ptm-cal-weekday">{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} className="ptm-cal-cell empty" />
                ))}
                {Array.from({ length: daysNum }).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayEvents = events.filter((e) => e.date === dateStr);
                  return (
                    <div
                      key={dateStr}
                      className={`ptm-cal-cell ${selectedDateStr === dateStr ? 'selected' : ''}`}
                      onClick={() => setSelectedDateStr(dateStr)}
                    >
                      <span className="ptm-cal-daynum">{dayNum}</span>
                      {dayEvents.length > 0 && (
                        <div className="ptm-cal-event-chip">
                          {dayEvents.length === 1 ? dayEvents[0].title : `${dayEvents.length} Events`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Events on {selectedDateStr}</div>
              {events.filter((e) => e.date === selectedDateStr).length === 0 ? (
                <div className="ptm-list-sub">No events scheduled on this date.</div>
              ) : (
                <div className="ptm-list">
                  {events.filter((e) => e.date === selectedDateStr).map((ev) => (
                    <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'calendar')}>
                      <div className="ptm-avatar-pastel">🎪</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{ev.title}</div>
                        <div className="ptm-list-sub">{ev.club_id} • 📍 {ev.venue} ({ev.start_time} - {ev.end_time})</div>
                      </div>
                      <span className="ptm-status-badge" style={{ background: '#E0F2FE', color: '#002970' }}>{ev.status} ›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'create_club' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Create Club Portal Login</h1>
              <p className="ptm-page-sub">Assign a unique account ID and the club representative's official SVNIT Google email.</p>
            </div>
            <div className="ptm-card">
              <form onSubmit={handleCreateClub} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Club Login ID (e.g. ACM, DRISHTI, CHRD)</label>
                  <input type="text" className="ptm-input" placeholder="Enter Club ID" value={clubForm.club_id} onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value })} required />
                </div>
                <div>
                  <label className="ptm-label">Official Club Name</label>
                  <input type="text" className="ptm-input" placeholder="e.g. DRISHTI Robotics & Innovation Club" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
                </div>
                <div>
                  <label className="ptm-label">Official Google email</label>
                  <input type="email" className="ptm-input" placeholder="representative@svnit.ac.in" value={clubForm.email} onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })} required />
                </div>
                <button type="submit" className="ptm-btn-primary">Create Google-Enabled Club Account</button>
              </form>
            </div>
          </div>
        )}

        {page === 'central_depts' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Central Maintenance Wings</h1>
              <p className="ptm-page-sub">Shared across all 9 hostels (e.g. CCC/Internet, Electrical, Solar/Street Lights)</p>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Create or Configure a Central Department</div>
              <form onSubmit={handleCreateCentralDept} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Department ID</label>
                    <input type="text" className="ptm-input" placeholder="e.g. SOLAR_LIGHT" value={deptForm.dept_id} onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Department Display Name</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Solar & Street Lighting" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Staff official Google email</label>
                    <input type="email" className="ptm-input" placeholder="staff@svnit.ac.in" value={deptForm.email} onChange={(e) => setDeptForm({ ...deptForm, email: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Emoji Icon</label>
                    <input type="text" className="ptm-input" value={deptForm.icon} onChange={(e) => setDeptForm({ ...deptForm, icon: e.target.value })} required />
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary">Save Central Department Google Access</button>
              </form>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Active Central Departments ({centralDepts.length})</div>
              <div className="ptm-list">
                {centralDepts.map((d) => (
                  <div key={d.id} className="ptm-list-row">
                    <div className="ptm-avatar-pastel">{d.icon}</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{d.title}</div>
                      <div className="ptm-list-sub">Department ID: <strong>{d.id}</strong> • Google account: {d.login_email || 'Not configured'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 'wardens' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Hostel Warden Google Access</h1>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Configure a Warden's Official Google Email</div>
              <form onSubmit={handleSaveWarden} className="ptm-form-stack">
                <label className="ptm-label">Warden account
                  <select className="ptm-input" value={wardenForm.user_id} onChange={(event) => {
                    const selected = SVNIT_HOSTELS.find((hostel) => hostel.code === event.target.value);
                    setWardenForm({ ...wardenForm, user_id: selected.code, hostel_block: selected.name, phone: selected.phone, email: '' });
                  }}>
                    {SVNIT_HOSTELS.map((hostel) => <option key={hostel.code} value={hostel.code}>{hostel.name}</option>)}
                  </select>
                </label>
                <label className="ptm-label">Official Google email
                  <input type="email" className="ptm-input" placeholder="warden@svnit.ac.in" value={wardenForm.email} onChange={(event) => setWardenForm({ ...wardenForm, email: event.target.value })} required />
                </label>
                <button type="submit" className="ptm-btn-primary">Save Warden Google Access</button>
              </form>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">All 9 SVNIT Hostel Warden Accounts</div>
              <div className="ptm-list">
                {SVNIT_HOSTELS.map((h) => (
                  <div key={h.code} className="ptm-list-row" onClick={() => setWardenForm({ ...wardenForm, user_id: h.code, hostel_block: h.name, phone: h.phone, email: '' })}>
                    <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>🏢</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{h.name}</div>
                      <div className="ptm-list-sub">Login ID: <strong>{h.code}</strong> • Office: {h.phone}</div>
                    </div>
                    <span className="ptm-tag-pill">Configure</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 'reports' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Annual Reports & PDF Export</h1>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">1. Print Annual Club Events Report</div>
              <div className="ptm-grid-2" style={{ marginBottom: '14px' }}>
                <div>
                  <label className="ptm-label">Academic Year</label>
                  <select className="ptm-input" value={reportYear} onChange={(e) => setReportYear(e.target.value)}>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                  </select>
                </div>
                <div>
                  <label className="ptm-label">Club Filter</label>
                  <select className="ptm-input" value={reportClub} onChange={(e) => setReportClub(e.target.value)}>
                    <option value="All">All Clubs Combined</option>
                    {clubs.map((c) => <option key={c.club_id} value={c.club_id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button className="ptm-btn-primary" onClick={() => window.open(`${apiUrl}/api/unicore/events/export-pdf?year=${reportYear}&club_id=${reportClub}`, '_blank')}>
                🖨️ Download / Print Events PDF Report
              </button>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">2. Print Hostel Grievance Audit Report</div>
              <div className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Hostel Scope</label>
                  <select className="ptm-input" value={pdfScope} onChange={(e) => setPdfScope(e.target.value)}>
                    <option value="All">All SVNIT Hostels Combined</option>
                    {SVNIT_HOSTELS.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
                  </select>
                </div>
                <div className="ptm-grid-2">
                  <div><label className="ptm-label">From Date</label><input type="date" className="ptm-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
                  <div><label className="ptm-label">To Date</label><input type="date" className="ptm-input" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
                </div>
                <button
                  className="ptm-btn-primary"
                  onClick={() => {
                    const q = new URLSearchParams({ hostel_block: pdfScope, from_date: fromDate, to_date: toDate });
                    window.open(`${apiUrl}/api/complaints/export-pdf?${q.toString()}`, '_blank');
                  }}
                >
                  🖨️ Download / Print Grievance PDF Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span>🏠</span><span>Home</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'clubs_list' || page === 'club_detail' ? 'active' : ''}`} onClick={() => setPage('clubs_list')}>
          <span>🎭</span><span>Clubs</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'event_approvals' ? 'active' : ''}`} onClick={() => setPage('event_approvals')}>
          <span>⚡</span><span>Approvals</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'calendar' ? 'active' : ''}`} onClick={() => setPage('calendar')}>
          <span>🗓️</span><span>Calendar</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}>
          <span>🖨️</span><span>Reports</span>
        </button>
      </nav>
    </div>
  );
}