import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';
import EventChatRoom from './EventChatRoom';

export default function StudentPortal({ user, apiUrl, onUserUpdate }) {
  const safeUser = user || {};
  const cKey = `complaints_${safeUser.user_id}`;
  const dKey = `departments_${safeUser.hostel_block}`;

  const [page, setPage] = useState('home');
  const [dataLoading, setDataLoading] = useState(false);
  const [complaints, setComplaints] = useState(() => getCached(cKey) || []);
  const complaintsRef = useRef(complaints);
  const complaintVersionRef = useRef(0);
  const [departments, setDepartments] = useState(() => getCached(dKey) || []);
  const [events, setEvents] = useState(() => getCached('events') || []);
  const eventsRef = useRef(events);
  const eventVersionRef = useRef(0);
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
  const [deletingTicketId, setDeletingTicketId] = useState(null);
  const [ticketActionId, setTicketActionId] = useState(null);
  const [rsvpPending, setRsvpPending] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [profileRequests, setProfileRequests] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileDraft, setProfileDraft] = useState({
    room: safeUser.room || '',
    wing: safeUser.wing || 'Wing A',
    phone: safeUser.phone || ''
  });
  const openProfile = () => {
    if (page === 'profile') return;
    setProfileLoading(true);
    setProfileError('');
    setPage('profile');
  };

  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  const updateComplaints = useCallback((updater, isMutation = false) => {
    const next = updater(complaintsRef.current);
    complaintsRef.current = next;
    if (isMutation) complaintVersionRef.current += 1;
    setComplaints(next);
    setCached(cKey, next);
    return next;
  }, [cKey]);

  const updateEvents = useCallback((updater, isMutation = false) => {
    const next = updater(eventsRef.current);
    eventsRef.current = next;
    if (isMutation) eventVersionRef.current += 1;
    setEvents(next);
    setCached('events', next);
    return next;
  }, []);

  const isDayScholar = (safeUser.hostel_block || '').toLowerCase() === 'day scholar';

  // Unified single-call bootstrap loader replacing 6 parallel requests
  const loadStudentData = useCallback(async () => {
    const complaintVersion = complaintVersionRef.current;
    const eventVersion = eventVersionRef.current;
    const hasCache = Boolean(getCached(cKey) || getCached('events'));
    if (!hasCache) {
      setDataLoading(true);
    }
    setSyncError('');

    try {
      const res = await apiFetch(
        `${apiUrl}/api/portal/bootstrap?role=Student&user_id=${encodeURIComponent(safeUser.user_id || '')}&hostel_block=${encodeURIComponent(safeUser.hostel_block || 'All')}`
      );

      if (res.ok) {
        const d = await res.json();

        const fetchedComplaints = d.complaints || [];
        if (complaintVersion === complaintVersionRef.current) {
          updateComplaints(() => fetchedComplaints);
        }

        const fetchedDepts = d.departments || [];
        setDepartments(fetchedDepts);
        setCached(dKey, fetchedDepts);
        if (fetchedDepts.length > 0) {
          setCategory((current) => fetchedDepts.some((department) => department.id === current)
            ? current
            : fetchedDepts[0].id);
        }

        const fetchedEvents = d.events || [];
        if (eventVersion === eventVersionRef.current) {
          updateEvents(() => fetchedEvents);
        }

        const fetchedClubs = d.clubs || [];
        setClubs(fetchedClubs);
        setCached('clubs', fetchedClubs);

        const fetchedNotices = d.notices || [];
        setNotices(fetchedNotices);
        setCached('notices', fetchedNotices);

        const fetchedAds = d.ads || [];
        setAds(fetchedAds);
        setCached('ads', fetchedAds);
      } else {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Portal sync failed (${res.status}).`);
      }
    } catch (error) {
      console.error('Student bootstrap sync error:', error);
      setSyncError('Could not refresh campus data. You can keep using saved information and retry.');
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, safeUser.user_id, safeUser.hostel_block, cKey, dKey, updateComplaints, updateEvents]);

  useEffect(() => {
    const timer = window.setTimeout(loadStudentData, 0);
    return () => window.clearTimeout(timer);
  }, [loadStudentData]);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = setInterval(() => {
      setAdIdx((i) => (i + 1) % ads.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [ads.length]);

  useEffect(() => {
    if (page !== 'profile') return undefined;
    let active = true;
    apiFetch(`${apiUrl}/api/profile/requests`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || 'Could not load profile change requests.');
        if (!active) return;
        setProfileRequests(data.requests || []);
        if (data.profile) {
          setProfileDraft({
            room: data.profile.room || '',
            wing: data.profile.wing || 'Wing A',
            phone: data.profile.phone || ''
          });
          onUserUpdate?.(data.profile);
        }
      })
      .catch((error) => {
        if (active) setProfileError(error.message || 'Could not load profile change requests.');
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => { active = false; };
  }, [apiUrl, page, safeUser.user_id, onUserUpdate]);

  const handleProfileRequest = async (e) => {
    e.preventDefault();
    if (profileSubmitting) return;
    setProfileSubmitting(true);
    setProfileError('');
    try {
      const payload = { phone: profileDraft.phone };
      if (!isDayScholar) {
        payload.room = profileDraft.room;
        payload.wing = profileDraft.wing;
      }
      const res = await apiFetch(`${apiUrl}/api/profile/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not submit your profile change request.');
      setProfileRequests((current) => [data.request, ...current]);
      setMsg('Profile change request sent to your warden.');
    } catch (error) {
      setProfileError(error.message || 'Could not submit your profile change request.');
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    if (submitting) return;
    const savedSummary = summary.trim();
    const savedDesc = description.trim();
    if (!savedSummary || !savedDesc) {
      setMsg('Enter an issue title and description before submitting.');
      return;
    }

    setSubmitting(true);

    const draftId = `draft-${Date.now()}`;
    const draftTicket = {
      ticket_id: draftId,
      summary: savedSummary,
      description: savedDesc,
      status: 'Pending',
      routed_to: category,
      created_at: 'Sending…',
      wing: safeUser.wing || '',
      room: safeUser.room || '',
      syncing: true
    };

    updateComplaints((current) => [draftTicket, ...current], true);
    setSummary('');
    setDescription('');
    setPage('my_complaints');

    try {
      const res = await apiFetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: safeUser.user_id,
          category,
          summary: savedSummary,
          description: savedDesc
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.ticket?.ticket_id) {
        throw new Error(data.detail || 'Could not submit your grievance.');
      }

      updateComplaints((current) => current.map((ticket) => ticket.ticket_id === draftId
        ? { ...ticket, ...data.ticket, created_at: data.ticket.created_at || 'Just now', syncing: false }
        : ticket));
      setMsg('Grievance submitted successfully.');
    } catch (error) {
      updateComplaints((current) => current.filter((ticket) => ticket.ticket_id !== draftId));
      setSummary(savedSummary);
      setDescription(savedDesc);
      setPage('new_complaint');
      setMsg(error.message || 'Could not submit your grievance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComplaint = async (ticketId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this duplicate or accidental complaint?')) return;

    const ticket = complaintsRef.current.find((complaint) => complaint.ticket_id === ticketId);
    if (!ticket) return;
    const originalIndex = complaintsRef.current.indexOf(ticket);
    updateComplaints((current) => current.filter((complaint) => complaint.ticket_id !== ticketId), true);
    setDeletingTicketId(ticketId);

    try {
      const res = await apiFetch(`${apiUrl}/api/complaints/delete?ticket_id=${encodeURIComponent(ticketId)}`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not delete this complaint.');
      setMsg('Complaint deleted.');
    } catch (error) {
      updateComplaints((current) => {
        const restored = [...current];
        restored.splice(Math.min(originalIndex, restored.length), 0, ticket);
        return restored;
      }, true);
      setMsg(error.message || 'Could not delete this complaint. Please try again.');
    } finally {
      setDeletingTicketId(null);
    }
  };

  const handleVerify = async (ticketId, satisfied) => {
    const nextStatus = satisfied ? 'Completed' : 'Reopened';
    const existing = complaintsRef.current.find((ticket) => ticket.ticket_id === ticketId);
    if (!existing || ticketActionId) return;
    updateComplaints((current) => current.map((ticket) =>
      ticket.ticket_id === ticketId ? { ...ticket, status: nextStatus } : ticket
    ), true);
    setSelectedTicket((current) => current?.ticket_id === ticketId ? { ...current, status: nextStatus } : current);
    setTicketActionId(ticketId);

    try {
      const res = await apiFetch(`${apiUrl}/api/complaints/student-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, satisfied })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not update this complaint.');
      setMsg(satisfied ? 'Marked resolved and closed.' : 'Reopened for maintenance.');
      setPage('my_complaints');
    } catch (error) {
      updateComplaints((current) => current.map((ticket) =>
        ticket.ticket_id === ticketId ? existing : ticket
      ), true);
      setSelectedTicket((current) => current?.ticket_id === ticketId ? existing : current);
      setMsg(error.message || 'Could not update this complaint. Please try again.');
    } finally {
      setTicketActionId(null);
    }
  };

  const handleRsvp = async (eventId) => {
    if (rsvpPending) return;
    const event = eventsRef.current.find((item) => item.event_id === eventId) || selectedEvent;
    const currentRsvps = event?.rsvps || [];
    const alreadyIn = currentRsvps.includes(safeUser.user_id);
    const nextRsvps = alreadyIn
      ? currentRsvps.filter((id) => id !== safeUser.user_id)
      : [...currentRsvps, safeUser.user_id];

    const updatedEvent = { ...event, rsvps: nextRsvps };
    setSelectedEvent(updatedEvent);
    updateEvents((current) => current.map((item) => item.event_id === eventId ? updatedEvent : item), true);
    setRsvpPending(true);

    try {
      const res = await apiFetch(`${apiUrl}/api/unicore/events/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: safeUser.user_id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not update your RSVP.');
      const confirmedEvent = { ...updatedEvent, rsvps: data.rsvps || nextRsvps };
      setSelectedEvent(confirmedEvent);
      updateEvents((current) => current.map((item) => item.event_id === eventId ? confirmedEvent : item));
      setMsg(data.message || (alreadyIn ? 'RSVP cancelled.' : 'RSVP confirmed.'));
    } catch (error) {
      setSelectedEvent(event);
      updateEvents((current) => current.map((item) => item.event_id === eventId ? event : item));
      setMsg(error.message || 'Could not update your RSVP. Please try again.');
    } finally {
      setRsvpPending(false);
    }
  };

  const handleFeedback = async (e, eventId) => {
    e.preventDefault();
    if (feedbackSubmitting) return;
    const revText = feedbackReview;
    setFeedbackSubmitting(true);

    try {
      const res = await apiFetch(`${apiUrl}/api/unicore/events/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          rating: feedbackRating,
          review: revText
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not submit your review.');
      const reviewedEvent = { ...data.event, feedback_submitted: true };
      setSelectedEvent(reviewedEvent);
      updateEvents((current) => current.map((item) => item.event_id === eventId ? reviewedEvent : item), true);
      setFeedbackReview('');
      setMsg('Review submitted.');
    } catch (error) {
      setMsg(error.message || 'Could not submit your review. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const visibleEvents = useMemo(
    () => events.filter((event) => event.status === 'Approved' || event.status === 'Completed'),
    [events]
  );
  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    visibleEvents.forEach((event) => {
      const dayEvents = grouped.get(event.date) || [];
      dayEvents.push(event);
      grouped.set(event.date, dayEvents);
    });
    return grouped;
  }, [visibleEvents]);
  const selectedDateEvents = eventsByDate.get(selectedDateStr) || [];
  const actionNeeded = useMemo(
    () => complaints.filter((complaint) => complaint.status === 'Awaiting Confirmation').length,
    [complaints]
  );
  const activeAd = ads.length > 0 ? ads[adIdx % ads.length] : null;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();
  const changeMonth = (offset) => {
    const nextMonth = new Date(calYear, calMonth + offset, 1);
    setCalYear(nextMonth.getFullYear());
    setCalMonth(nextMonth.getMonth());
  };

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
        <button className={`ptm-side-btn ${page === 'profile' ? 'active' : ''}`} onClick={openProfile}>👤 My Profile</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}
        {dataLoading && (
          <div className="ptm-sync-note" role="status">Syncing campus updates…</div>
        )}
        {syncError && (
          <div className="ptm-sync-note error" role="status">
            <span>{syncError}</span>
            <button type="button" className="ptm-sync-retry" onClick={loadStudentData}>Retry</button>
          </div>
        )}
        <>
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={openProfile}>
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
                          {c.syncing ? (
                            <span className="ptm-status-badge" role="status">Sending…</span>
                          ) : c.status === 'Pending' && (
                            <button
                              type="button"
                              className="ptm-btn-danger"
                              style={{ width: 'auto', padding: '6px 12px', fontSize: '11px', marginRight: '6px' }}
                              onClick={(e) => handleDeleteComplaint(c.ticket_id, e)}
                              disabled={deletingTicketId === c.ticket_id || submitting}
                            >
                              {deletingTicketId === c.ticket_id ? 'Deleting…' : '🗑️ Delete'}
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
                      <button className="ptm-btn-primary" onClick={() => handleVerify(selectedTicket.ticket_id, true)} disabled={ticketActionId === selectedTicket.ticket_id}>
                        {ticketActionId === selectedTicket.ticket_id ? 'Updating…' : '✅ Yes, Issue is Resolved'}
                      </button>
                      <button className="ptm-btn-danger" onClick={() => handleVerify(selectedTicket.ticket_id, false)} disabled={ticketActionId === selectedTicket.ticket_id}>
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

                  <div className="ptm-card ptm-event-action-card">
                    <div className="ptm-section-title">Event community</div>
                    <p className="ptm-list-sub">Talk with students attending this event in its live chat room.</p>
                    <button type="button" className="ptm-btn-primary" style={{ marginTop: '12px' }} onClick={() => setPage('event_chat')}>
                      💬 Open event chat
                    </button>
                  </div>

                  {selectedEvent.photo_albums?.length > 0 && (
                    <div className="ptm-card">
                      <div className="ptm-section-title">📸 Event photos</div>
                      <div className="ptm-list">
                        {selectedEvent.photo_albums.map((album) => (
                          <div key={album.album_id} className="ptm-list-row">
                            <div className="ptm-avatar-pastel">📷</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{album.caption}</div>
                              <div className="ptm-list-sub">Shared by the event organizers</div>
                            </div>
                            <a href={album.album_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ textDecoration: 'none' }}>
                              View album ↗
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEvent.status !== 'Completed' ? (
                    <button className="ptm-btn-primary" style={{ marginTop: '14px' }} onClick={() => handleRsvp(selectedEvent.event_id)} disabled={rsvpPending}>
                      {rsvpPending ? 'Updating RSVP…' : selectedEvent.rsvps?.includes(safeUser.user_id) ? '✅ You Are Attending (Tap to Cancel)' : '🎟️ Yes, I Am Attending (RSVP)'}
                    </button>
                  ) : selectedEvent.feedback_submitted ? (
                    <div className="ptm-sync-note" role="status">Thanks — your feedback was submitted anonymously.</div>
                  ) : (
                    <form onSubmit={(e) => handleFeedback(e, selectedEvent.event_id)} className="ptm-form-stack" style={{ marginTop: '16px' }}>
                      <div>
                        <div className="ptm-section-title">Share feedback anonymously</div>
                        <p className="ptm-list-sub">Tell the organizers what worked and what they can improve.</p>
                      </div>
                      <select className="ptm-input" value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                        <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                        <option value={4}>⭐⭐⭐⭐ 4 - Very good</option>
                        <option value={3}>⭐⭐⭐ 3 - Good</option>
                        <option value={2}>⭐⭐ 2 - Needs improvement</option>
                        <option value={1}>⭐ 1 - Poor</option>
                      </select>
                      <textarea rows="3" maxLength={2000} className="ptm-input" placeholder="What went well? What could be improved next time?" value={feedbackReview} onChange={(e) => setFeedbackReview(e.target.value)} required />
                      <button type="submit" className="ptm-btn-primary" disabled={feedbackSubmitting}>
                        {feedbackSubmitting ? 'Submitting…' : 'Submit Feedback'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {page === 'event_chat' && selectedEvent && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('event_detail')}>←</button>
                  <h1 className="ptm-page-title">{selectedEvent.title} Chat</h1>
                  <p className="ptm-page-sub">A separate live chat room for this event.</p>
                </div>
                <div className="ptm-card">
                  <EventChatRoom event={selectedEvent} apiUrl={apiUrl} user={safeUser} />
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
                    <button className="ptm-btn-secondary" aria-label="Previous month" onClick={() => changeMonth(-1)}>◀</button>
                    <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
                    <button className="ptm-btn-secondary" aria-label="Next month" onClick={() => changeMonth(1)}>▶</button>
                  </div>
                  <div className="ptm-cal-grid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="ptm-cal-weekday">{d}</div>)}
                    {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="ptm-cal-cell empty" />)}
                    {Array.from({ length: daysNum }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayEvents = eventsByDate.get(dateStr) || [];
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
                  {selectedDateEvents.length === 0 ? (
                    <div className="ptm-list-sub">No events on this date.</div>
                  ) : (
                    selectedDateEvents.map((ev) => (
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
                <div className="ptm-card">
                  <div className="ptm-section-title">Request a profile correction</div>
                  <p className="ptm-list-sub" style={{ marginBottom: '14px' }}>
                    Room, wing, and mobile number changes are sent to your hostel warden for approval. Your current details stay active until approved.
                  </p>
                  {profileError && <div className="ptm-alert-error" role="alert">{profileError}</div>}
                  {profileLoading ? (
                    <div className="ptm-list-sub">Loading your request history…</div>
                  ) : (
                    <>
                      <form onSubmit={handleProfileRequest} className="ptm-form-stack">
                        {!isDayScholar && (
                          <div className="ptm-grid-2">
                            <label className="ptm-label">Wing
                              <select className="ptm-input" value={profileDraft.wing} onChange={(e) => setProfileDraft((current) => ({ ...current, wing: e.target.value }))} required>
                                {'ABCDEFGH'.split('').map((letter) => <option key={letter} value={`Wing ${letter}`}>Wing {letter}</option>)}
                              </select>
                            </label>
                            <label className="ptm-label">Room number
                              <input className="ptm-input" value={profileDraft.room} onChange={(e) => setProfileDraft((current) => ({ ...current, room: e.target.value }))} maxLength={20} required />
                            </label>
                          </div>
                        )}
                        <label className="ptm-label">Mobile number
                          <input className="ptm-input" type="tel" autoComplete="tel" value={profileDraft.phone} onChange={(e) => setProfileDraft((current) => ({ ...current, phone: e.target.value }))} required />
                        </label>
                        <button type="submit" className="ptm-btn-primary" disabled={profileSubmitting || profileRequests.some((item) => item.status === 'Pending')}>
                          {profileSubmitting ? 'Sending request…' : profileRequests.some((item) => item.status === 'Pending') ? 'Request pending warden approval' : 'Send request to warden'}
                        </button>
                      </form>
                      <div className="ptm-section-title" style={{ marginTop: '20px' }}>Request history</div>
                      {profileRequests.length === 0 ? (
                        <div className="ptm-list-sub">No profile change requests yet.</div>
                      ) : (
                        <div className="ptm-list">
                          {profileRequests.map((item) => (
                            <div className="ptm-list-row" key={item.request_id}>
                              <div className="ptm-list-main">
                                <div className="ptm-list-title">{item.status} · {new Date(item.created_at).toLocaleDateString()}</div>
                                <div className="ptm-list-sub">
                                  {Object.entries(item.requested_changes || {}).map(([field, value]) => `${field}: ${value}`).join(' · ')}
                                </div>
                                {item.review_remark && <div className="ptm-list-sub">Warden note: {item.review_remark}</div>}
                              </div>
                              <span className="ptm-status-badge">{item.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
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
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        {!isDayScholar && <button className={`ptm-bnav-btn ${page === 'my_complaints' ? 'active' : ''}`} onClick={() => setPage('my_complaints')}><span>💬</span><span>Grievances</span></button>}
        <button className={`ptm-bnav-btn ${page === 'events_list' ? 'active' : ''}`} onClick={() => setPage('events_list')}><span>🎪</span><span>Events</span></button>
        <button className={`ptm-bnav-btn ${page === 'notices' ? 'active' : ''}`} onClick={() => setPage('notices')}><span>📢</span><span>Notices</span></button>
        <button className={`ptm-bnav-btn ${page === 'profile' ? 'active' : ''}`} onClick={openProfile}><span>👤</span><span>Profile</span></button>
      </nav>
    </div>
  );
}