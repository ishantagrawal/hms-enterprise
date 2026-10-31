import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';

export default function StudentPortal({ user, apiUrl }) {
  const safeUser = user || {};
  const cKey = `complaints_${safeUser.user_id}`;
  const dKey = `departments_${safeUser.hostel_block}`;

  const [page, setPage] = useState('home');
  const [dataLoading, setDataLoading] = useState(false);
  const [complaints, setComplaints] = useState(() => getCached(cKey) || []);
  const [departments, setDepartments] = useState(() => getCached(dKey) || []);
  const [events, setEvents] = useState(() => getCached('events') || []);
  const [clubs, setClubs] = useState(() => getCached('clubs') || []);
  const [notices, setNotices] = useState(() => getCached('notices') || []);
  const [ads, setAds] = useState(() => getCached('ads') || []);
  const [adIdx, setAdIdx] = useState(0);
  const [msg, setMsg] = useState(null);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedClub, setSelectedClub] = useState(null);
  const [clubSubView, setClubSubView] = useState('hub');
  const [selectedNotice, setSelectedNotice] = useState(null);

  const [category, setCategory] = useState('ELECTRICITY');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);
  const [selectedDateStr, setSelectedDateStr] = useState('2026-10-28');

  const isDayScholar = (safeUser.hostel_block || '').toLowerCase() === 'day scholar';

  // Unified single-call bootstrap loader replacing 6 parallel requests
  const loadStudentData = useCallback(async () => {
    const hasCache = Boolean(getCached(cKey) || getCached('events'));
    if (!hasCache) {
      setDataLoading(true);
    }

    try {
      const res = await apiFetch(
        `${apiUrl}/api/portal/bootstrap?role=Student&user_id=${encodeURIComponent(safeUser.user_id || '')}&hostel_block=${encodeURIComponent(safeUser.hostel_block || 'All')}`
      );

      if (res.ok) {
        const d = await res.json();
        
        const fetchedComplaints = d.complaints || [];
        setComplaints(fetchedComplaints);
        setCached(cKey, fetchedComplaints);

        const fetchedDepts = d.departments || [];
        setDepartments(fetchedDepts);
        setCached(dKey, fetchedDepts);
        if (fetchedDepts.length > 0 && !category) setCategory(fetchedDepts[0].id);

        const fetchedEvents = d.events || [];
        setEvents(fetchedEvents);
        setCached('events', fetchedEvents);

        const fetchedClubs = d.clubs || [];
        setClubs(fetchedClubs);
        setCached('clubs', fetchedClubs);

        const fetchedNotices = d.notices || [];
        setNotices(fetchedNotices);
        setCached('notices', fetchedNotices);

        const fetchedAds = d.ads || [];
        setAds(fetchedAds);
        setCached('ads', fetchedAds);
      }
    } catch (e) {
      console.error('Student bootstrap sync error:', e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, safeUser.user_id, safeUser.hostel_block, cKey, dKey, category]);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setAdIdx((i) => (i + 1) % ads.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [ads.length]);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const tempTicket = {
      ticket_id: `TKT-${Math.floor(Math.random() * 900 + 100)}`,
      summary,
      description,
      status: 'Pending',
      routed_to: category,
      created_at: 'Just now',
      wing: safeUser.wing || '',
      room: safeUser.room || ''
    };

    const updated = [tempTicket, ...complaints];
    setComplaints(updated);
    setCached(cKey, updated);
    const savedSummary = summary;
    const savedDesc = description;
    setSummary('');
    setDescription('');
    setMsg('✅ Grievance submitted!');
    setPage('my_complaints');
    setSubmitting(false);

    try {
      await apiFetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: safeUser.user_id,
          category,
          summary: savedSummary,
          description: savedDesc
        })
      });
      loadStudentData();
    } catch (err) {
      setMsg('❌ Network error syncing complaint.');
    }
  };

  const handleDeleteComplaint = async (ticketId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this duplicate or accidental complaint?')) return;

    const updated = complaints.filter((c) => c.ticket_id !== ticketId);
    setComplaints(updated);
    setCached(cKey, updated);
    setMsg('🗑️ Complaint deleted!');

    try {
      await apiFetch(`${apiUrl}/api/complaints/delete?ticket_id=${encodeURIComponent(ticketId)}`, {
        method: 'POST'
      });
      loadStudentData();
    } catch (err) {
      setMsg('❌ Could not sync deletion.');
      loadStudentData();
    }
  };

  const handleVerify = async (ticketId, satisfied) => {
    const nextStatus = satisfied ? 'Completed' : 'Reopened';
    const updated = complaints.map((c) =>
      c.ticket_id === ticketId ? { ...c, status: nextStatus } : c
    );
    setComplaints(updated);
    setCached(cKey, updated);
    setMsg(satisfied ? '✅ Marked Resolved & Closed!' : '🔄 Reopened for maintenance!');
    setPage('my_complaints');

    try {
      await apiFetch(`${apiUrl}/api/complaints/student-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, satisfied })
      });
      loadStudentData();
    } catch (err) {
      setMsg('❌ Error syncing verification.');
    }
  };

  const handleRsvp = async (eventId) => {
    const currentRsvps = selectedEvent?.rsvps || [];
    const alreadyIn = currentRsvps.includes(safeUser.user_id);
    const nextRsvps = alreadyIn
      ? currentRsvps.filter((id) => id !== safeUser.user_id)
      : [...currentRsvps, safeUser.user_id];

    const updatedEvent = { ...selectedEvent, rsvps: nextRsvps };
    setSelectedEvent(updatedEvent);
    const updatedList = events.map((ev) => (ev.event_id === eventId ? updatedEvent : ev));
    setEvents(updatedList);
    setCached('events', updatedList);
    setMsg(alreadyIn ? 'RSVP Cancelled' : '🎟️ RSVP Confirmed!');

    try {
      await apiFetch(`${apiUrl}/api/unicore/events/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: safeUser.user_id })
      });
      loadStudentData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFeedback = async (e, eventId) => {
    e.preventDefault();
    setMsg('⭐ Review submitted!');
    const revText = feedbackReview;
    setFeedbackReview('');

    try {
      const res = await apiFetch(`${apiUrl}/api/unicore/events/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          student_id: safeUser.user_id,
          rating: feedbackRating,
          review: revText
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedEvent(data.event);
        loadStudentData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const visibleEvents = events.filter((e) => e.status === 'Approved' || e.status === 'Completed');
  const actionNeeded = complaints.filter((c) => c.status === 'Awaiting Confirmation').length;
  const activeAd = ads.length > 0 ? ads[adIdx % ads.length] : null;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Student Home</button>
        {!isDayScholar && (
          <>
            <button className={`ptm-side-btn ${page === 'new_complaint' ? 'active' : ''}`} onClick={() => setPage('new_complaint')}>➕ Lodge Grievance</button>
            <button className={`ptm-side-btn ${page === 'my_complaints' ? 'active' : ''}`} onClick={() => setPage('my_complaints')}>💬 My Grievances ({complaints.length})</button>
          </>
        )}
        <button className={`ptm-side-btn ${page === 'clubs_list' ? 'active' : ''}`} onClick={() => setPage('clubs_list')}>🎭 Campus Clubs ({clubs.length})</button>
        <button className={`ptm-side-btn ${page === 'events_list' ? 'active' : ''}`} onClick={() => setPage('events_list')}>🎪 EventRadar ({visibleEvents.length})</button>
        <button className={`ptm-side-btn ${page === 'calendar' ? 'active' : ''}`} onClick={() => setPage('calendar')}>🗓️ Event Calendar</button>
        <button className={`ptm-side-btn ${page === 'notices' ? 'active' : ''}`} onClick={() => setPage('notices')}>📢 Notice Board ({notices.length})</button>
        <button className={`ptm-side-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>👤 My Profile</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {dataLoading ? (
          <div className="ptm-wheel-box">
            <div className="ptm-spinner-wheel" />
            <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>
              Loading your student portal...
            </div>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={() => setPage('profile')}>
                    <div className="ptm-row-between">
                      <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6B7280' }}>
                        {isDayScholar ? 'Day Scholar' : safeUser.hostel_block}
                      </span>
                      <span>{isDayScholar ? '🎒' : '🏠'}</span>
                    </div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>
                      {isDayScholar ? 'Non-Hosteller' : `Room ${safeUser.room}`}
                    </div>
                    <button className="ptm-mini-btn">{safeUser.year || 'Resident'} • {safeUser.user_id}</button>
                  </div>

                  {!isDayScholar && (
                    <div className="ptm-mini-card" onClick={() => setPage('my_complaints')}>
                      <div className="ptm-row-between">
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6B7280' }}>My Grievances</span>
                        <span>🛠️</span>
                      </div>
                      <div style={{ fontSize: '19px', fontWeight: 800, color: '#111827', marginTop: '4px' }}>{complaints.length} Tickets</div>
                      <button className="ptm-mini-btn">
                        {actionNeeded > 0 ? `⚡ ${actionNeeded} Verify Now` : 'Check Status →'}
                      </button>
                    </div>
                  )}
                </div>

                {activeAd && (
                  <div className="ptm-promo-banner" style={{ background: activeAd.bg_gradient || 'linear-gradient(135deg, #002970 0%, #0284C7 100%)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="ptm-promo-tag">{activeAd.sponsor_tag}</span>
                      <h3 className="ptm-promo-title">{activeAd.title}</h3>
                      <p className="ptm-promo-sub">{activeAd.subtitle}</p>
                    </div>
                    <div className="ptm-promo-right">
                      {activeAd.badge_text && (
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#E0F2FE' }}>{activeAd.badge_text}</div>
                      )}
                      <a href={activeAd.target_url} target="_blank" rel="noreferrer" className="ptm-promo-cta">
                        {activeAd.cta_text || 'Apply Now →'}
                      </a>
                    </div>
                  </div>
                )}

                {!isDayScholar && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Hostel & Maintenance Services</div>
                    <div className="ptm-icon-grid">
                      <button className="ptm-icon-tile" onClick={() => setPage('new_complaint')}>
                        <div className="ptm-icon-circle">➕</div>
                        <span className="ptm-icon-label">Lodge Grievance</span>
                      </button>
                      <button className="ptm-icon-tile" onClick={() => setPage('my_complaints')}>
                        <div className="ptm-icon-circle">
                          💬
                          {actionNeeded > 0 && <span className="ptm-tile-badge">{actionNeeded}</span>}
                        </div>
                        <span className="ptm-icon-label">Track Status</span>
                      </button>
                      <button className="ptm-icon-tile" onClick={() => setPage('coming_soon')}>
                        <div className="ptm-icon-circle light">📅</div>
                        <span className="ptm-icon-label">Attendance</span>
                      </button>
                      <button className="ptm-icon-tile" onClick={() => setPage('coming_soon')}>
                        <div className="ptm-icon-circle light">🪪</div>
                        <span className="ptm-icon-label">Leave Pass</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="ptm-card">
                  <div className="ptm-section-title">Campus Life, Clubs & Notice Board</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('events_list')}>
                      <div className="ptm-icon-circle">🎪</div>
                      <span className="ptm-icon-label">Upcoming Events</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('clubs_list')}>
                      <div className="ptm-icon-circle">🎭</div>
                      <span className="ptm-icon-label">Student Clubs ({clubs.length})</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('notices')}>
                      <div className="ptm-icon-circle">
                        📢
                        {notices.length > 0 && <span className="ptm-tile-badge">{notices.length}</span>}
                      </div>
                      <span className="ptm-icon-label">Notice Board</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('calendar')}>
                      <div className="ptm-icon-circle">🗓️</div>
                      <span className="ptm-icon-label">Event Calendar</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isDayScholar && page === 'new_complaint' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Lodge Hostel Grievance</h1>
                  <p className="ptm-page-sub">{safeUser.hostel_block} • {safeUser.wing} • Room {safeUser.room}</p>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleCreateComplaint} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Select Maintenance Department</label>
                      <select className="ptm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.title}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="ptm-label">Short Issue Title</label>
                      <input type="text" className="ptm-input" placeholder="e.g. Ceiling fan regulator not working" value={summary} onChange={(e) => setSummary(e.target.value)} required />
                    </div>
                    <div>
                      <label className="ptm-label">Detailed Description</label>
                      <textarea rows="3" className="ptm-input" placeholder="Describe the issue and preferred time..." value={description} onChange={(e) => setDescription(e.target.value)} required />
                    </div>
                    <button type="submit" className="ptm-btn-primary" disabled={submitting}>
                      {submitting ? 'Submitting Grievance...' : 'Submit Grievance'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {!isDayScholar && page === 'my_complaints' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <div className="ptm-row-between">
                    <h1 className="ptm-page-title">My Grievances</h1>
                    <button className="ptm-btn-secondary" onClick={() => setPage('new_complaint')}>+ New</button>
                  </div>
                </div>
                <div className="ptm-card">
                  {complaints.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: '#6B7280' }}>No complaints logged yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {complaints.map((c) => (
                        <div key={c.ticket_id} className="ptm-list-row" onClick={() => { setSelectedTicket(c); setPage('ticket_detail'); }}>
                          <div className="ptm-avatar-pastel">🛠️</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{c.summary}</div>
                            <div className="ptm-list-sub">{c.ticket_id} • {c.routed_to}</div>
                            <span className="ptm-tag-pill">{c.created_at}</span>
                          </div>
                          {c.status === 'Pending' && (
                            <button
                              type="button"
                              className="ptm-btn-danger"
                              style={{ width: 'auto', padding: '6px 12px', fontSize: '11px', marginRight: '6px' }}
                              onClick={(e) => handleDeleteComplaint(c.ticket_id, e)}
                            >
                              🗑️ Delete
                            </button>
                          )}
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
                  <button className="ptm-back-btn" onClick={() => setPage('my_complaints')}>←</button>
                  <span className="ptm-tag-pill">{selectedTicket.ticket_id}</span>
                  <h1 className="ptm-page-title">{selectedTicket.summary}</h1>
                </div>
                <div className="ptm-card">
                  <p>{selectedTicket.description}</p>
                  <div className="ptm-list">
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">1️⃣ Complaint Registered</div><div className="ptm-list-sub">{selectedTicket.created_at} • Routed to {selectedTicket.routed_to}</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">2️⃣ Staff Action Remark</div><div className="ptm-list-sub">{selectedTicket.staff_remark || 'Assigned to maintenance wing'}</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">3️⃣ Current Status</div><div className="ptm-list-sub">{selectedTicket.status}</div></div></div>
                  </div>
                  {selectedTicket.status !== 'Completed' && (
                    <div className="ptm-grid-2" style={{ marginTop: '16px' }}>
                      <button className="ptm-btn-primary" onClick={() => handleVerify(selectedTicket.ticket_id, true)}>
                        ✅ Yes, Issue is Resolved
                      </button>
                      <button className="ptm-btn-danger" onClick={() => handleVerify(selectedTicket.ticket_id, false)}>
                        ❌ Not Resolved (Reopen)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'clubs_list' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Official SVNIT Clubs & Chapters</h1>
                </div>
                <div className="ptm-card">
                  {clubs.length === 0 ? (
                    <div className="ptm-list-sub">No clubs registered yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {clubs.map((c) => (
                        <div key={c.club_id} className="ptm-list-row" onClick={() => { setSelectedClub(c); setClubSubView('hub'); setPage('club_detail'); }}>
                          <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>{c.club_id.slice(0, 2)}</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{c.name}</div>
                            <div className="ptm-list-sub">{c.mission}</div>
                            <span className="ptm-tag-pill">Faculty Advisor: {c.faculty_advisor}</span>
                          </div>
                          <span>›</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'club_detail' && selectedClub && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => clubSubView !== 'hub' ? setClubSubView('hub') : setPage('clubs_list')}>←</button>
                  <h1 className="ptm-page-title">{selectedClub.name}</h1>
                  <p className="ptm-page-sub">{selectedClub.mission}</p>
                </div>
                <div className="ptm-card">
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('hub')}><div className="ptm-icon-circle">🎪</div><span className="ptm-icon-label">Club Events</span></button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('members')}><div className="ptm-icon-circle">👥</div><span className="ptm-icon-label">Members ({selectedClub.members?.length || 0})</span></button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('gallery')}><div className="ptm-icon-circle">📸</div><span className="ptm-icon-label">Gallery Links</span></button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('info')}><div className="ptm-icon-circle">ℹ️</div><span className="ptm-icon-label">Club Info</span></button>
                  </div>
                </div>

                {clubSubView === 'hub' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Events by {selectedClub.club_id}</div>
                    <div className="ptm-list">
                      {visibleEvents.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).length === 0 ? (
                        <div className="ptm-list-sub">No events published by this club yet.</div>
                      ) : (
                        visibleEvents.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).map((ev) => (
                          <div key={ev.event_id} className="ptm-list-row" onClick={() => { setSelectedEvent(ev); setPage('event_detail'); }}>
                            <div className="ptm-avatar-pastel">🎪</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{ev.title}</div>
                              <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date}</div>
                            </div>
                            <span>›</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {clubSubView === 'members' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Committee Members</div>
                    <div className="ptm-list">
                      {selectedClub.members?.map((m, i) => (
                        <div key={i} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">{(m.name || 'MB').slice(0, 2)}</div>
                          <div className="ptm-list-main"><div className="ptm-list-title">{m.name}</div><div className="ptm-list-sub">{m.roll}</div></div>
                          <span className="ptm-tag-pill">{m.position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {clubSubView === 'gallery' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Club Media & Drive Links</div>
                    <div className="ptm-list">
                      {selectedClub.gallery?.map((g, i) => (
                        <div key={i} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">📸</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{g.caption}</div>
                            <div className="ptm-list-sub">{g.timestamp}</div>
                          </div>
                          <a href={g.media_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ textDecoration: 'none' }}>
                            Open Link ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {clubSubView === 'info' && (
                  <div className="ptm-card">
                    <div className="ptm-list-title">Faculty Advisor: {selectedClub.faculty_advisor}</div>
                    <div className="ptm-list-sub" style={{ marginTop: '6px' }}>Head Coordinator: {selectedClub.head_coordinator}</div>
                    {selectedClub.extra_dean_info && (
                      <div className="ptm-list-sub" style={{ marginTop: '6px' }}>Highlights: {selectedClub.extra_dean_info}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {page === 'events_list' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">EventRadar — Campus Events</h1>
                </div>
                <div className="ptm-card">
                  {visibleEvents.length === 0 ? (
                    <div className="ptm-list-sub">No upcoming events right now.</div>
                  ) : (
                    <div className="ptm-list">
                      {visibleEvents.map((ev) => (
                        <div key={ev.event_id} className="ptm-list-row" onClick={() => { setSelectedEvent(ev); setPage('event_detail'); }}>
                          <div className="ptm-avatar-pastel">🎪</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{ev.title}</div>
                            <div className="ptm-list-sub">{ev.club_id} • 📍 {ev.venue} • 📅 {ev.date}</div>
                            <span className="ptm-tag-pill">👥 {ev.rsvps?.length || 0} Attending</span>
                          </div>
                          <span>›</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'event_detail' && selectedEvent && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('events_list')}>←</button>
                  <span className="ptm-tag-pill">{selectedEvent.club_id}</span>
                  <h1 className="ptm-page-title">{selectedEvent.title}</h1>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Important Event Information</div>
                  <p style={{ whiteSpace: 'pre-line', color: '#1F2937', marginBottom: '16px' }}>{selectedEvent.description}</p>
                  <div className="ptm-list">
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">📍 Venue & Timing</div><div className="ptm-list-sub">{selectedEvent.venue} • {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">👥 Confirmed Student Attendance</div><div className="ptm-list-sub">{selectedEvent.rsvps?.length || 0} Students Attending</div></div></div>
                  </div>

                  <div className="ptm-form-stack" style={{ marginTop: '14px' }}>
                    {selectedEvent.image_url && (
                      <a href={selectedEvent.image_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                        🖼️ View Event Poster / Google Drive Attachment ↗
                      </a>
                    )}
                    {selectedEvent.registration_link && (
                      <a href={selectedEvent.registration_link} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                        📝 Open Registration / Google Form ↗
                      </a>
                    )}
                  </div>

                  {selectedEvent.status !== 'Completed' ? (
                    <button className="ptm-btn-primary" style={{ marginTop: '14px' }} onClick={() => handleRsvp(selectedEvent.event_id)}>
                      {selectedEvent.rsvps?.includes(safeUser.user_id) ? '✅ You Are Attending (Tap to Cancel)' : '🎟️ Yes, I Am Attending (RSVP)'}
                    </button>
                  ) : (
                    <form onSubmit={(e) => handleFeedback(e, selectedEvent.event_id)} className="ptm-form-stack" style={{ marginTop: '16px' }}>
                      <div className="ptm-section-title">Rate This Completed Event</div>
                      <select className="ptm-input" value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                        <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                        <option value={4}>⭐⭐⭐⭐ 4 - Very Good</option>
                        <option value={3}>⭐⭐⭐ 3 - Good</option>
                      </select>
                      <textarea rows="2" className="ptm-input" placeholder="Write your review..." value={feedbackReview} onChange={(e) => setFeedbackReview(e.target.value)} required />
                      <button type="submit" className="ptm-btn-primary">Submit Feedback</button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {page === 'notices' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Campus Notice Board</h1>
                </div>
                <div className="ptm-card">
                  {notices.length === 0 ? (
                    <div className="ptm-list-sub">No official notices published yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {notices.map((n) => (
                        <div key={n.notice_id} className="ptm-list-row" onClick={() => { setSelectedNotice(n); setPage('notice_detail'); }}>
                          <div className="ptm-avatar-pastel">📢</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{n.title}</div>
                            <div className="ptm-list-sub">{n.club_id} • For: {n.target_year} ({n.target_branch})</div>
                          </div>
                          <span>›</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'notice_detail' && selectedNotice && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('notices')}>←</button>
                  <span className="ptm-tag-pill">{selectedNotice.club_id} • {selectedNotice.created_at}</span>
                  <h1 className="ptm-page-title">{selectedNotice.title}</h1>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Important Notice Details</div>
                  <p style={{ whiteSpace: 'pre-line', color: '#1F2937', marginBottom: '14px' }}>{selectedNotice.message}</p>
                  <div className="ptm-list-sub" style={{ marginBottom: '16px' }}>
                    🎯 <strong>Target Audience:</strong> {selectedNotice.target_year} • {selectedNotice.target_branch}
                  </div>

                  <div className="ptm-form-stack">
                    {selectedNotice.image_url && (
                      <a href={selectedNotice.image_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                        🖼️ View Attached Poster / Google Drive Image ↗
                      </a>
                    )}
                    {selectedNotice.registration_link && (
                      <a href={selectedNotice.registration_link} target="_blank" rel="noreferrer" className="ptm-btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                        🔗 Open Official Form / Registration Link ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {page === 'calendar' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Event Calendar</h1>
                </div>
                <div className="ptm-card">
                  <div className="ptm-row-between" style={{ marginBottom: '14px' }}>
                    <button className="ptm-btn-secondary" onClick={() => setCalMonth((m) => (m === 0 ? 11 : m - 1))}>◀</button>
                    <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
                    <button className="ptm-btn-secondary" onClick={() => setCalMonth((m) => (m === 11 ? 0 : m + 1))}>▶</button>
                  </div>
                  <div className="ptm-cal-grid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="ptm-cal-weekday">{d}</div>)}
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="ptm-cal-cell empty" />)}
                    {Array.from({ length: daysNum }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayEvents = visibleEvents.filter((e) => e.date === dateStr);
                      return (
                        <div key={dateStr} className={`ptm-cal-cell ${selectedDateStr === dateStr ? 'selected' : ''}`} onClick={() => setSelectedDateStr(dateStr)}>
                          <span className="ptm-cal-daynum">{dayNum}</span>
                          {dayEvents.length > 0 && <div className="ptm-cal-event-chip">{dayEvents[0].title}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Events on {selectedDateStr}</div>
                  {visibleEvents.filter((e) => e.date === selectedDateStr).length === 0 ? (
                    <div className="ptm-list-sub">No events on this date.</div>
                  ) : (
                    visibleEvents.filter((e) => e.date === selectedDateStr).map((ev) => (
                      <div key={ev.event_id} className="ptm-list-row" onClick={() => { setSelectedEvent(ev); setPage('event_detail'); }}>
                        <div className="ptm-avatar-pastel">🎪</div>
                        <div className="ptm-list-main"><div className="ptm-list-title">{ev.title}</div><div className="ptm-list-sub">📍 {ev.venue}</div></div>
                        <span>›</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {page === 'profile' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">My Resident Profile</h1>
                </div>
                <div className="ptm-card">
                  <div className="ptm-list">
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Full Name & Roll No</div><div className="ptm-list-sub">{safeUser.full_name} ({safeUser.user_id})</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Resident Status</div><div className="ptm-list-sub">{isDayScholar ? 'Day Scholar (Non-Hosteller)' : `${safeUser.hostel_block}, ${safeUser.wing}, Room ${safeUser.room}`}</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Department & Year</div><div className="ptm-list-sub">{safeUser.department} • {safeUser.year || 'Resident'}</div></div></div>
                    <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Mobile</div><div className="ptm-list-sub">{safeUser.phone || 'Not provided'}</div></div></div>
                  </div>
                </div>
              </div>
            )}

            {page === 'coming_soon' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Phase 2 Module</h1>
                </div>
                <div className="ptm-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <h3>Coming Soon After 30-Day Pilot</h3>
                  <p className="ptm-list-sub">Digital Night Attendance & Gate Outpass will be enabled in Phase 2.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        {!isDayScholar && <button className={`ptm-bnav-btn ${page === 'my_complaints' ? 'active' : ''}`} onClick={() => setPage('my_complaints')}><span>💬</span><span>Grievances</span></button>}
        <button className={`ptm-bnav-btn ${page === 'events_list' ? 'active' : ''}`} onClick={() => setPage('events_list')}><span>🎪</span><span>Events</span></button>
        <button className={`ptm-bnav-btn ${page === 'notices' ? 'active' : ''}`} onClick={() => setPage('notices')}><span>📢</span><span>Notices</span></button>
        <button className={`ptm-bnav-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}><span>👤</span><span>Profile</span></button>
      </nav>
    </div>
  );
}