import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function StudentView({ user, complaints, apiUrl, onRefresh }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // EventRadar state
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackReview, setFeedbackReview] = useState('');
  const [msg, setMsg] = useState(null);

  // Complaint Form states
  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/unicore/events`)
      .then((res) => res.json())
      .then((data) => setEvents(data))
      .catch(console.error);
  }, [apiUrl]);

  const handleRsvp = async (eventId) => {
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: user.user_id })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: 'success', text: '🎟️ RSVP Confirmed! Seat reserved.' });
        setEvents(events.map(ev => ev.event_id === eventId ? { ...ev, rsvps: data.rsvps } : ev));
        setSelectedEvent(prev => ({ ...prev, rsvps: data.rsvps }));
      } else {
        setMsg({ type: 'error', text: data.detail || 'RSVP failed' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Connection error.' });
    }
  };

  const handleFeedbackSubmit = async (e, eventId) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, student_id: user.user_id, rating: feedbackRating, review: feedbackReview })
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ type: 'success', text: '🤖 Feedback sent to AI Audit engine!' });
        setFeedbackReview('');
        setSelectedEvent(null);
      } else {
        setMsg({ type: 'error', text: data.detail || 'Feedback failed' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Connection error.' });
    }
  };

  const isFeedbackActive = (eventDateStr) => {
    if (!eventDateStr) return false;
    const eventDate = new Date(eventDateStr);
    const today = new Date();
    const diffTime = today - eventDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 1.0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, category, summary, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `✅ Ticket ${data.ticket.ticket_id} registered!` });
        setSummary('');
        setDescription('');
        setShowNewModal(false);
        onRefresh();
      } else {
        setMsg({ type: 'error', text: data.detail || 'Failed' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Server connection error.' });
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
        setSelectedTicket(null);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed' || status === 'Approved') return '#a78bfa';
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

  return (
    <div style={styles.appWrapper}>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hms-anim { animation: fadeSlideUp 0.2s ease-out; }
      `}</style>

      {/* ========================================================= */}
      {/* TAB 1: COMPLAINTS FEED                                    */}
      {/* ========================================================= */}
      {activeTab === 'complaints' && (
        <div className="hms-anim" style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search complaints or ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {msg && (
            <div style={{ ...styles.toast, borderColor: msg.type === 'success' ? '#8b5cf6' : '#ef4444' }} onClick={() => setMsg(null)}>
              {msg.text}
            </div>
          )}

          <div style={styles.listContainer}>
            {filteredComplaints.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '38px', marginBottom: '8px' }}>📭</div>
                <div style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '15px' }}>No Grievances Found</div>
                <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Tap the purple + button below to lodge a hostel complaint.
                </p>
              </div>
            ) : (
              filteredComplaints.map((c) => (
                <div key={c.ticket_id} onClick={() => setSelectedTicket(c)} style={styles.chatRow}>
                  <div style={{...styles.rowAvatar, background: '#1e293b'}}>{getCategoryIcon(c.category)}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.created_at.split(',')[0]}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>{c.ticket_id} • {c.category}</span>
                      <span style={{ ...styles.statusBadge, color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                        {c.status === 'Awaiting Confirmation' ? 'Verify Now' : c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <button onClick={() => setShowNewModal(true)} style={styles.fabBtn} title="Lodge New Complaint">+</button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: EVENTRADAR (GOOGLE CALENDAR MONTH GRID VIEW)       */}
      {/* ========================================================= */}
      {activeTab === 'eventradar' && (
        <div className="hms-anim" style={styles.tabContent}>
          <div style={styles.radarBanner}>
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#c084fc', letterSpacing: '0.8px' }}>SVNIT CAMPUS CALENDAR</div>
            <h2 style={{ margin: '4px 0 2px 0', color: '#f8fafc', fontSize: '18px' }}>📅 EventRadar Month Grid</h2>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>Tap any event badge on the calendar grid to view details, RSVP, or give feedback.</p>
          </div>

          <div style={styles.calGridContainer}>
            <div style={styles.calHeaderRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={styles.calHeaderCell}>{d}</div>
              ))}
            </div>

            <div style={styles.calDaysGrid}>
              {Array.from({ length: 31 }).map((_, index) => {
                const dayNum = index + 1;
                const dayStr = `2026-10-${dayNum < 10 ? '0' + dayNum : dayNum}`;
                const matchedEvents = events.filter(e => e.date === dayStr && (e.status === 'Approved' || e.status === 'Completed'));

                return (
                  <div key={index} style={styles.calCell}>
                    <span style={styles.calCellNum}>{dayNum}</span>
                    {matchedEvents.map(ev => (
                      <div 
                        key={ev.event_id} 
                        onClick={() => setSelectedEvent(ev)} 
                        style={{
                          ...styles.calEventPill,
                          background: ev.status === 'Completed' ? '#334155' : '#8b5cf6'
                        }}
                        title={ev.title}
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

      {/* ========================================================= */}
      {/* TAB 3: HOSTEL NIGHT ATTENDANCE                            */}
      {/* ========================================================= */}
      {activeTab === 'attendance' && (
        <div className="hms-anim" style={styles.comingSoonWrap}>
          <div style={styles.comingSoonBadge}>PHASE 2 ROLLOUT • ACTIVE SYNC</div>
          <div style={styles.bigIconBox}>📅</div>
          <h2 style={styles.csTitle}>Hostel Night Attendance</h2>
          <p style={styles.csSub}>Smart geo-fenced attendance synced with the SVNIT Council of Wardens.</p>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: LEAVE FORM                                         */}
      {/* ========================================================= */}
      {activeTab === 'leave' && (
        <div className="hms-anim" style={styles.comingSoonWrap}>
          <div style={styles.comingSoonBadge}>PHASE 2 ROLLOUT • COMING SOON</div>
          <div style={styles.bigIconBox}>🪪</div>
          <h2 style={styles.csTitle}>Digital Leave & Gate Outpass</h2>
          <p style={styles.csSub}>Paperless leave applications with instant Warden approval and QR code verification.</p>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 5: PROFILE                                            */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <div className="hms-anim" style={styles.tabContent}>
          <div style={styles.profileCard}>
            <div style={styles.profileAvatar}>
              {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <h2 style={{ margin: '12px 0 4px 0', color: '#f8fafc', fontSize: '20px' }}>{user.full_name}</h2>
            <span style={styles.idPill}>{user.user_id} • Verified Resident</span>

            <div style={styles.infoList}>
              <div style={styles.infoRow}><span style={styles.infoLabel}>🏢 Hostel Bhawan</span><span style={styles.infoVal}>{user.hostel_block}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>🚪 Room & Floor</span><span style={styles.infoVal}>Room {user.room} ({user.floor})</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>📞 Phone</span><span style={styles.infoVal}>{user.phone}</span></div>
              <div style={styles.infoRow}><span style={styles.infoLabel}>✉️ Email</span><span style={styles.infoVal}>{user.email}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EVENT DETAILS, RSVP & FEEDBACK WINDOW              */}
      {/* ========================================================= */}
      {selectedEvent && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEvent(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#c084fc', fontWeight: '800', fontSize: '13px' }}>📡 EventRadar Details</span>
              <button onClick={() => setSelectedEvent(null)} style={styles.closeBtn}>✕</button>
            </div>

            {selectedEvent.image_url && (
              <img src={selectedEvent.image_url} alt="Event Cover" style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px' }} />
            )}
            
            <h2 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '20px' }}>{selectedEvent.title}</h2>
            <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '13px' }}>Organized by Chapter: <strong>{selectedEvent.club_id}</strong></p>
            
            {selectedEvent.description && (
              <p style={{ background: '#090d16', padding: '12px', borderRadius: '10px', color: '#cbd5e1', fontSize: '13px', lineHeight: '1.5', border: '1px solid #1e293b' }}>
                {selectedEvent.description}
              </p>
            )}

            <div style={styles.detailBox}>
              <div>📍 <strong>Venue:</strong> {selectedEvent.venue}</div>
              <div style={{ marginTop: '6px' }}>📅 <strong>Date:</strong> {selectedEvent.date}</div>
              <div style={{ marginTop: '6px' }}>⏰ <strong>Time:</strong> {selectedEvent.start_time} - {selectedEvent.end_time}</div>
              <div style={{ marginTop: '6px', color: '#4ade80' }}>
                👥 <strong>{selectedEvent.rsvps?.length || 0} Students</strong> currently attending
              </div>
            </div>

            {selectedEvent.registration_link && selectedEvent.status !== 'Completed' && (
              <div style={{ marginTop: '12px' }}>
                <a href={selectedEvent.registration_link} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', background: '#2563eb', color: '#fff', padding: '12px', borderRadius: '10px', textDecoration: 'none', fontWeight: '700', fontSize: '13px' }}>
                  🔗 Open Official Registration Form
                </a>
              </div>
            )}

            {selectedEvent.status !== 'Completed' && (
              <div style={{ marginTop: '12px' }}>
                <button 
                  onClick={() => handleRsvp(selectedEvent.event_id)} 
                  disabled={selectedEvent.rsvps?.includes(user.user_id)}
                  style={{ 
                    ...styles.primaryBtn, 
                    background: selectedEvent.rsvps?.includes(user.user_id) ? '#1e293b' : '#8b5cf6',
                    color: selectedEvent.rsvps?.includes(user.user_id) ? '#4ade80' : '#fff',
                    cursor: selectedEvent.rsvps?.includes(user.user_id) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {selectedEvent.rsvps?.includes(user.user_id) ? '✅ You are Attending' : "🎟️ I'm Coming / RSVP Now"}
                </button>
              </div>
            )}

            {selectedEvent.status === 'Completed' && isFeedbackActive(selectedEvent.date) && (
              <form onSubmit={(e) => handleFeedbackSubmit(e, selectedEvent.event_id)} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#4ade80' }}>⭐ Post-Event Feedback (Active Window)</div>
                <select value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))} style={styles.input}>
                  <option value={5}>⭐⭐⭐⭐⭐ 5 - Excellent</option>
                  <option value={4}>⭐⭐⭐⭐ 4 - Very Good</option>
                  <option value={3}>⭐⭐⭐ 3 - Good</option>
                  <option value={2}>⭐⭐ 2 - Average</option>
                  <option value={1}>⭐ 1 - Poor</option>
                </select>
                <textarea rows="2" placeholder="Write your review for AI Audit summary..." value={feedbackReview} onChange={(e) => setFeedbackReview(e.target.value)} required style={styles.input} />
                <button type="submit" style={styles.primaryBtn}>Submit Feedback</button>
              </form>
            )}

            {selectedEvent.status === 'Completed' && !isFeedbackActive(selectedEvent.date) && (
              <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                🔒 Feedback window closed (Active only up to 1 day after event date).
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: COMPLAINT DETAILS & VERIFY TICKETS                 */}
      {/* ========================================================= */}
      {selectedTicket && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#c084fc', fontWeight: '800', fontSize: '14px' }}>{selectedTicket.ticket_id} • {selectedTicket.category}</span>
              <button onClick={() => setSelectedTicket(null)} style={styles.closeBtn}>✕</button>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '17px' }}>{selectedTicket.summary}</h3>
            <p style={{ margin: '0 0 14px 0', color: '#cbd5e1', fontSize: '14px' }}>{selectedTicket.description}</p>
            <div style={styles.detailBox}>
              <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status), fontWeight: '700' }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Assigned Wing:</strong> {selectedTicket.routed_to}</div>
              {selectedTicket.staff_remark && <div style={{ marginTop: '6px', color: '#c084fc' }}><strong>Staff Note:</strong> {selectedTicket.staff_remark}</div>}
            </div>
            {selectedTicket.status === 'Awaiting Confirmation' && (
              <div style={styles.verifyBox}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', marginBottom: '10px' }}>Did staff resolve your issue?</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleStudentVerify(selectedTicket.ticket_id, true)} style={styles.yesBtn}>✅ Yes, Completed</button>
                  <button onClick={() => handleStudentVerify(selectedTicket.ticket_id, false)} style={styles.noBtn}>❌ Reopen</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NEW COMPLAINT FORM                                 */}
      {/* ========================================================= */}
      {showNewModal && (
        <div style={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>📝 Lodge New Grievance</h3>
              <button onClick={() => setShowNewModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>Select Maintenance Wing</label>
                <div style={styles.catGrid}>
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <div key={cat.id} onClick={() => setCategory(cat.id)} style={{ ...styles.catChip, borderColor: category === cat.id ? '#8b5cf6' : '#1e293b', background: category === cat.id ? 'rgba(139, 92, 246, 0.15)' : '#090d16' }}>
                      <span>{cat.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>{cat.title}</span>
                    </div>
                  ))}
                </div>
              </div>
              <input type="text" placeholder="Short Summary (e.g. Fan regulator sparking)" value={summary} onChange={(e) => setSummary(e.target.value)} required style={styles.input} />
              <textarea rows="3" placeholder="Describe exact issue details..." value={description} onChange={(e) => setDescription(e.target.value)} required style={styles.input} />
              <button type="submit" disabled={submitting} style={styles.submitBtn}>{submitting ? 'Submitting...' : '🚀 Submit Grievance'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STUDENT BOTTOM NAVIGATION                                 */}
      {/* ========================================================= */}
      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            {actionPendingCount > 0 && <span style={styles.badgeCount}>{actionPendingCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#c084fc' : '#94a3b8' }}>Complaints</span>
        </button>

        <button onClick={() => setActiveTab('eventradar')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'eventradar' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>📡</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'eventradar' ? '#c084fc' : '#94a3b8' }}>EventRadar</span>
        </button>

        <button onClick={() => setActiveTab('attendance')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'attendance' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>📅</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'attendance' ? '#c084fc' : '#94a3b8' }}>Attendance</span>
        </button>

        <button onClick={() => setActiveTab('leave')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'leave' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🪪</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'leave' ? '#c084fc' : '#94a3b8' }}>Leave Form</span>
        </button>

        <button onClick={() => setActiveTab('profile')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'profile' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>👤</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'profile' ? '#c084fc' : '#94a3b8' }}>Profile</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '95px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px 16px' },
  radarBanner: { background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(99, 102, 241, 0.2))', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '16px', padding: '16px', marginBottom: '14px' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', borderRadius: '999px', padding: '10px 16px', marginBottom: '14px' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '14px', width: '100%' },
  toast: { background: '#0f172a', borderLeft: '4px solid', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: '#f8fafc', cursor: 'pointer' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 8px', borderBottom: '1px solid rgba(30, 41, 59, 0.7)', cursor: 'pointer' },
  
  // Google Calendar Month Grid CSS
  calGridContainer: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginTop: '12px' },
  calHeaderRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#1e293b', padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: '800', color: '#94a3b8' },
  calHeaderCell: { textTransform: 'uppercase' },
  calDaysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#1e293b' },
  calCell: { background: '#090d16', minHeight: '85px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' },
  calCellNum: { fontSize: '11px', fontWeight: '700', color: '#64748b' },
  calEventPill: { color: '#fff', fontSize: '10px', fontWeight: '700', padding: '3px 6px', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: '#0f172a', borderRadius: '18px', border: '1px solid #1e293b', marginTop: '12px', color: '#94a3b8' },
  fabBtn: { position: 'fixed', right: '22px', bottom: '88px', width: '56px', height: '56px', borderRadius: '16px', background: '#8b5cf6', color: '#fff', border: 'none', fontSize: '30px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 25px rgba(139, 92, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 },
  comingSoonWrap: { padding: '40px 20px', textAlign: 'center', margin: '16px', background: '#0f172a', borderRadius: '22px', border: '1px solid #1e293b' },
  comingSoonBadge: { display: 'inline-block', background: 'rgba(139, 92, 246, 0.18)', color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.35)', padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', letterSpacing: '0.8px', marginBottom: '16px' },
  bigIconBox: { width: '72px', height: '72px', borderRadius: '22px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 14px auto' },
  csTitle: { color: '#f8fafc', fontSize: '21px', fontWeight: '800', margin: '0 0 8px 0' },
  csSub: { color: '#94a3b8', fontSize: '14px', lineHeight: '1.5', maxWidth: '420px', margin: '0 auto 22px auto' },
  profileCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '22px', padding: '26px 20px', textAlign: 'center' },
  profileAvatar: { width: '72px', height: '72px', borderRadius: '50%', background: '#8b5cf6', color: '#fff', fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' },
  idPill: { display: 'inline-block', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', marginTop: '4px' },
  infoList: { marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' },
  infoRow: { display: 'flex', justifyContent: 'space-between', background: '#090d16', padding: '12px 14px', borderRadius: '12px', border: '1px solid #1e293b', fontSize: '13px' },
  infoLabel: { color: '#94a3b8' },
  infoVal: { color: '#f8fafc', fontWeight: '700' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '22px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1' },
  verifyBox: { marginTop: '14px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid #8b5cf6', borderRadius: '12px', padding: '14px', textAlign: 'center' },
  yesBtn: { flex: 1, background: '#8b5cf6', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' },
  noBtn: { flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' },
  catGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' },
  catChip: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', border: '1.5px solid', cursor: 'pointer' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '52px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '10px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-2px', right: '4px', background: '#8b5cf6', color: '#fff', fontSize: '9px', fontWeight: '800', padding: '1px 5px', borderRadius: '999px' }
};