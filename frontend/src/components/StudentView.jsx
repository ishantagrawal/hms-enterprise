import React, { useState, useEffect, useCallback } from 'react';

const COMPLAINT_CATEGORIES = [
  { id: 'Electricity', title: 'Electricity', icon: '⚡' },
  { id: 'Plumbing', title: 'Plumbing', icon: '🚰' },
  { id: 'LAN / Wi-Fi', title: 'LAN / Wi-Fi', icon: '🌐' },
  { id: 'Carpentry', title: 'Carpentry', icon: '🪚' },
  { id: 'Water Cooler', title: 'RO / Water Cooler', icon: '💧' },
  { id: 'Mess & Hygiene', title: 'Cleaning & Hygiene', icon: '🧹' }
];

const getCategoryIcon = (catName) => {
  const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
  return found ? found.icon : '🛠️';
};

const getStatusColor = (status) => {
  if (status === 'Completed' || status === 'Approved') return '#4ade80';
  if (status === 'Awaiting Confirmation') return '#38bdf8';
  if (status === 'Pending' || status === 'In Progress') return '#fbbf24';
  return '#f87171';
};

export default function StudentPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [complaints, setComplaints] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [msg, setMsg] = useState(null);

  // New Complaint Form
  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Events & EventRadar States
  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedClubView, setSelectedClubView] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');

  // Password Change State
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  const loadStudentData = useCallback(async () => {
    try {
      const [cRes, dRes, eRes, clRes] = await Promise.all([
        fetch(`${apiUrl}/api/complaints?role=Student&user_id=${user.user_id}`),
        fetch(`${apiUrl}/api/departments`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/unicore/clubs`)
      ]);
      if (cRes.ok) setComplaints(await cRes.json());
      if (dRes.ok) setDepartments(await dRes.json());
      if (eRes.ok) setEvents(await eRes.json());
      if (clRes.ok) setClubs(await clRes.json());
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
        setMsg(`✅ Grievance registered & routed to ${data.ticket.routed_to}!`);
        setSummary('');
        setDescription('');
        setShowNewModal(false);
        loadStudentData();
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
        setMsg(satisfied ? '✅ Issue verified & closed successfully!' : '🔄 Ticket reopened for maintenance re-check!');
        setSelectedTicket(null);
        loadStudentData();
      }
    } catch {
      setMsg('❌ Verification error.');
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
        setMsg(data.message);
        setEvents((prev) => prev.map((ev) => (ev.event_id === eventId ? { ...ev, rsvps: data.rsvps } : ev)));
        setSelectedEvent((prev) => (prev && prev.event_id === eventId ? { ...prev, rsvps: data.rsvps } : prev));
      }
    } catch {
      setMsg('❌ Failed to update RSVP.');
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
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('🤖 Thank you! Feedback added to AI Audit engine.');
        setFeedbackReview('');
        setSelectedEvent(data.event);
        loadStudentData();
      }
    } catch {
      setMsg('❌ Failed to submit feedback.');
    }
  };

  const handleSelfPassChange = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/student/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, old_password: oldPass, new_password: newPass })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('✅ Custom password saved successfully!');
        setOldPass('');
        setNewPass('');
      } else {
        setMsg(`❌ ${data.detail || 'Password change failed'}`);
      }
    } catch {
      setMsg('❌ Connection error.');
    }
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
          🪪 Leave Pass
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
          <div className="hms-grid-2">
            <div className="hms-card">
              <div className="hms-section-label">🎟️ Upcoming Campus Events ({upcomingEvents.length})</div>
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
                            {isGoing ? '✓ You Are Going' : 'View Details →'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="hms-card">
              <div className="hms-section-label">⭐ Past Events — AI Feedback & Audits ({completedEvents.length})</div>
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
                          ⭐ Rating: {ev.ai_audit?.average_rating || 4.9}/5.0
                        </span>
                        <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Tap to Rate & View AI Audit →</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🏛️ Explore Official Student Clubs ({clubs.length})</div>
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
          <p className="hms-muted">Smart geo-fenced night roll-call synced with the Council of Wardens is currently under phase-2 deployment.</p>
        </div>
      )}

      {/* TAB 4: LEAVE PASS - COMING SOON */}
      {activeTab === 'leave' && (
        <div className="hms-card" style={{ textAlign: 'center', padding: '50px 20px', maxWidth: '540px', margin: '0 auto' }}>
          <span className="hms-pill-badge">PHASE 2 ROLLOUT • COMING SOON</span>
          <div style={{ fontSize: '50px', margin: '16px 0' }}>🪪</div>
          <h3>Digital Leave & Gate Outpass</h3>
          <p className="hms-muted">Paperless leave applications with instant Warden approval and main-gate QR verification will be available soon.</p>
        </div>
      )}

      {/* TAB 5: PROFILE & SECURITY */}
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
              Your default password is your Date of Birth (<code>DDMMYYYY</code>). Set your custom password below.
            </p>
            <form onSubmit={handleSelfPassChange} className="hms-stack">
              <input type="password" className="hms-input" placeholder="Current Password or DOB (DDMMYYYY)" value={oldPass} onChange={(e) => setOldPass(e.target.value)} required />
              <input type="password" className="hms-input" placeholder="New Custom Password" value={newPass} onChange={(e) => setNewPass(e.target.value)} required />
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
              <select className="hms-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.icon} {d.title}</option>
                ))}
              </select>
              <div>
                <label className="hms-label">Issue Headline / Summary</label>
                <input type="text" className="hms-input" placeholder="e.g. Ceiling fan regulator sparking in B-204" value={summary} onChange={(e) => setSummary(e.target.value)} required />
              </div>
              <div>
                <label className="hms-label">Detailed Problem Description</label>
                <textarea rows="3" className="hms-input" placeholder="Provide exact room details or severity..." value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <button type="submit" disabled={submitting} className="hms-btn-primary">
                {submitting ? 'Submitting...' : '🚀 Submit Grievance'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TICKET DETAILS & VERIFICATION */}
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
              <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status), fontWeight: 800 }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Routed Wing:</strong> {selectedTicket.routed_to}</div>
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(74,222,128,0.1)', borderRadius: '8px', color: '#4ade80' }}>
                  <strong>🛠️ Staff Remark:</strong> {selectedTicket.staff_remark}
                </div>
              )}
            </div>
            {selectedTicket.status !== 'Completed' && (
              <div style={{ marginTop: '16px', padding: '14px', background: 'rgba(139,92,246,0.12)', borderRadius: '12px', border: '1px solid #8b5cf6' }}>
                <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '10px', textAlign: 'center' }}>
                  Is this maintenance issue successfully resolved?
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

      {/* MODAL: EVENT DETAILS, RSVP & FEEDBACK */}
      {selectedEvent && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEvent(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">🎪 {selectedEvent.club_id} CHAPTER • {selectedEvent.status}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>

            {selectedEvent.image_url && <img src={selectedEvent.image_url} alt="Poster" className="hms-event-img" />}

            <h3 style={{ margin: '0 0 8px 0', fontSize: '19px' }}>{selectedEvent.title}</h3>
            <p className="hms-muted">{selectedEvent.description}</p>
            <div className="hms-detail-box">
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '4px' }}>📅 <strong>Date & Time:</strong> {selectedEvent.date} ({selectedEvent.start_time} - {selectedEvent.end_time})</div>
              <div style={{ marginTop: '6px', color: '#4ade80', fontWeight: 800 }}>
                👥 Live Attendance Count: {selectedEvent.rsvps?.length || 0} Students Confirmed Coming
              </div>
            </div>

            {selectedEvent.registration_link && (
              <a href={selectedEvent.registration_link} target="_blank" rel="noreferrer" className="hms-link-btn">
                🔗 Open Google Form Registration Link
              </a>
            )}

            {selectedEvent.status !== 'Completed' ? (
              <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(139,92,246,0.12)', borderRadius: '12px', border: '1px solid #8b5cf6', textAlign: 'center' }}>
                <button className="hms-btn-primary" onClick={() => handleRsvp(selectedEvent.event_id)}>
                  {selectedEvent.rsvps?.some((r) => r.toUpperCase() === user.user_id.toUpperCase())
                    ? `✅ You Are Attending! (${selectedEvent.rsvps.length} Going — Tap to Cancel)`
                    : '🎟️ Yes, I Am Attending (RSVP Now)'}
                </button>
              </div>
            ) : (
              <div style={{ marginTop: '16px' }}>
                {selectedEvent.ai_audit && (
                  <div className="hms-detail-box" style={{ borderColor: '#8b5cf6', marginBottom: '14px' }}>
                    <div className="hms-section-label">🤖 AI Feedback Audit</div>
                    <div><strong>Turnout:</strong> {selectedEvent.ai_audit.total_attendees} | <strong>Rating:</strong> ⭐ {selectedEvent.ai_audit.average_rating}/5.0</div>
                    <div style={{ color: '#4ade80', fontWeight: 700, marginTop: '8px' }}>👍 Highlights:</div>
                    <ul style={{ margin: '4px 0 8px 18px', padding: 0 }}>{selectedEvent.ai_audit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                <form onSubmit={(e) => handleFeedbackSubmit(e, selectedEvent.event_id)} className="hms-stack" style={{ background: '#090d16', padding: '14px', borderRadius: '12px', border: '1px solid #334155' }}>
                  <div className="hms-section-label" style={{ margin: 0 }}>⭐ Submit Event Rating & Review</div>
                  <select className="hms-input" value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                    <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                    <option value={4}>⭐⭐⭐⭐ 4 - Very Good</option>
                    <option value={3}>⭐⭐⭐ 3 - Good</option>
                    <option value={2}>⭐⭐ 2 - Fair</option>
                    <option value={1}>⭐ 1 - Poor</option>
                  </select>
                  <textarea rows="2" className="hms-input" placeholder="Write your feedback..." value={feedbackReview} onChange={(e) => setFeedbackReview(e.target.value)} required />
                  <button type="submit" className="hms-btn-primary">Submit Feedback</button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: CLUB DOSSIER */}
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
        <button onClick={() => setActiveTab('complaints')} className="hms-bnav-item"><span>💬</span><span>Complaints</span></button>
        <button onClick={() => setActiveTab('eventradar')} className="hms-bnav-item"><span>📡</span><span>Events</span></button>
        <button onClick={() => setActiveTab('profile')} className="hms-bnav-item"><span>👤</span><span>Profile</span></button>
      </nav>
    </div>
  );
}