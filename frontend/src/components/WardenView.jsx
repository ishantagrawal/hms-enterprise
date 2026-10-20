import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

// Safety fallback so activeTab is never undefined
var activeTab = 'hostels';

export default function WardenView({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [clubSubTab, setClubSubTab] = useState('approvals');
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEventAudit, setSelectedEventAudit] = useState(null);

  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);

  const [newPassword, setNewPassword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfScope, setPdfScope] = useState(isDean ? 'All' : user.hostel_block);
  const [statusMsg, setStatusMsg] = useState(null);

  const svnitHostels = [
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

  useEffect(() => {
    fetch(`${apiUrl}/api/unicore/clubs`)
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setClubs(data))
      .catch(console.error);
    fetch(`${apiUrl}/api/unicore/events`)
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setEvents(data))
      .catch(console.error);
  }, [apiUrl]);

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
      text: `✅ AI Re-Check Passed: ${candidateEv.venue} is 100% free on ${candidateEv.date} (${candidateEv.start_time} - ${candidateEv.end_time}). No other event clashing.`
    };
  };

  const handleApproveEvent = async (eventId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, {
      method: 'POST'
    });
    if (res.ok) {
      setEvents(events.map((e) => (e.event_id === eventId ? { ...e, status: action } : e)));
      setStatusMsg(`✅ Event ${eventId} marked as ${action}!`);
    }
  };

  const handleDownloadPDF = (scopeOverride) => {
    const targetScope = scopeOverride || pdfScope;
    const query = new URLSearchParams({
      institute_id: user.institute_id,
      hostel_block: targetScope,
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

  const changeMonth = (offset) => {
    let newMonth = calMonth + offset;
    let newYear = calYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setCalMonth(newMonth);
    setCalYear(newYear);
  };

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed' || status === 'Approved') return '#a78bfa';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    if (status === 'Pending Dean Approval') return '#fbbf24';
    return '#f87171';
  };

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;
  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const pendingEventsCount = pendingEvents.length;

  const displayedComplaints = selectedHostel
    ? complaints.filter((c) => c.hostel_block === selectedHostel)
    : complaints;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const firstDayOfMonth = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div style={styles.appWrapper}>
      {statusMsg && (
        <div style={styles.toast} onClick={() => setStatusMsg(null)}>
          {statusMsg}
        </div>
      )}

      {isDean && activeTab === 'hostels' && (
        <div style={styles.tabContent}>
          <div style={styles.listContainer}>
            {svnitHostels.map((h) => {
              const hostelIssues = complaints.filter((c) => c.hostel_block === h.name && c.status !== 'Completed').length;
              return (
                <div
                  key={h.code}
                  onClick={() => {
                    setSelectedHostel(h.name);
                    setActiveTab('complaints');
                  }}
                  style={styles.chatRow}
                >
                  <div style={styles.rowAvatar}>{h.icon}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{h.name}</span>
                      <span style={styles.rowTime}>{h.ext}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>Portals: {h.cwId} • {h.wId}</span>
                      <span
                        style={{
                          ...styles.unreadBubble,
                          background: hostelIssues > 0 ? '#8b5cf6' : '#1e293b',
                          color: hostelIssues > 0 ? '#fff' : '#94a3b8'
                        }}
                      >
                        {hostelIssues} active
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'complaints' && (
        <div style={styles.tabContent}>
          {selectedHostel && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#c084fc', fontWeight: '800', fontSize: '13px' }}>
                🏢 Filtering: {selectedHostel}
              </span>
              <button onClick={() => setSelectedHostel(null)} style={styles.keyChip}>Show All Hostels</button>
            </div>
          )}
          <div style={styles.listContainer}>
            {displayedComplaints.length === 0 ? (
              <div style={styles.emptyState}>No grievances found.</div>
            ) : (
              displayedComplaints.map((c) => (
                <div key={c.ticket_id} onClick={() => setSelectedTicket(c)} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>{getCategoryIcon(c.category)}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.created_at.split(',')[0]}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>{c.student_name} • {c.hostel_block} (Rm {c.room})</span>
                      <span style={{ ...styles.statusBadge, color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'clubshub' && (
        <div style={styles.tabContent}>
          <div style={styles.subTabBar}>
            <button
              onClick={() => setClubSubTab('approvals')}
              style={{
                ...styles.subTabBtn,
                background: clubSubTab === 'approvals' ? '#8b5cf6' : 'transparent',
                color: clubSubTab === 'approvals' ? '#fff' : '#94a3b8'
              }}
            >
              ⚡ Event Approvals & Calendar ({pendingEventsCount})
            </button>
            <button
              onClick={() => setClubSubTab('directory')}
              style={{
                ...styles.subTabBtn,
                background: clubSubTab === 'directory' ? '#8b5cf6' : 'transparent',
                color: clubSubTab === 'directory' ? '#fff' : '#94a3b8'
              }}
            >
              📁 All Clubs Info ({clubs.length})
            </button>
          </div>

          {clubSubTab === 'approvals' && (
            <>
              <div style={styles.sectionHeader}>⚡ Venue Requisitions & AI Clash Verification</div>

              {pendingEvents.length === 0 ? (
                <div style={{ ...styles.emptyState, padding: '18px', marginBottom: '16px' }}>
                  ✅ All club event proposals have been reviewed!
                </div>
              ) : (
                pendingEvents.map((ev) => {
                  const aiCheck = checkAiVenueClash(ev);
                  return (
                    <div key={ev.event_id} onClick={() => setSelectedEventAudit(ev)} style={styles.approvalCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#f8fafc', fontWeight: '800', fontSize: '15px' }}>{ev.title}</span>
                        <span style={{ color: '#fbbf24', fontSize: '11px', fontWeight: '800' }}>{ev.status}</span>
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>
                        📍 <strong>{ev.venue}</strong> • 📅 <strong>{ev.date}</strong> ({ev.start_time} - {ev.end_time}) • Club: <strong>{ev.club_id}</strong>
                      </div>
                      <div
                        style={{
                          marginTop: '8px',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '700',
                          background: aiCheck.free ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                          color: aiCheck.free ? '#4ade80' : '#f87171',
                          border: `1px solid ${aiCheck.free ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                        }}
                      >
                        🤖 {aiCheck.text}
                      </div>
                      {isDean && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => handleApproveEvent(ev.event_id, 'Approved')} style={styles.approveBtn}>
                            ✓ Approve Venue & Publish
                          </button>
                          <button onClick={() => handleApproveEvent(ev.event_id, 'Rejected')} style={styles.rejectBtn}>
                            ✕ Reject
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              <div style={{ ...styles.sectionHeader, marginTop: '18px' }}>
                🗓️ Master Campus Event Calendar (All Years)
              </div>

              <div style={styles.calTopBar}>
                <button onClick={() => changeMonth(-1)} style={styles.calNavBtn}>◀ Prev</button>
                <div style={{ color: '#f8fafc', fontWeight: '800', fontSize: '15px' }}>
                  {monthNames[calMonth]} {calYear}
                </div>
                <button onClick={() => changeMonth(1)} style={styles.calNavBtn}>Next ▶</button>
              </div>

              <div style={styles.calGridContainer}>
                <div style={styles.calHeaderRow}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} style={styles.calHeaderCell}>{d}</div>
                  ))}
                </div>

                <div style={styles.calDaysGrid}>
                  {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                    <div key={`empty-${idx}`} style={{ ...styles.calCell, opacity: 0.35 }} />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const dayNum = index + 1;
                    const monthPadded = String(calMonth + 1).padStart(2, '0');
                    const dayPadded = String(dayNum).padStart(2, '0');
                    const dateStr = `${calYear}-${monthPadded}-${dayPadded}`;
                    const matchedEvents = events.filter((e) => e.date === dateStr);

                    return (
                      <div key={dateStr} style={styles.calCell}>
                        <span style={styles.calCellNum}>{dayNum}</span>
                        {matchedEvents.map((ev) => (
                          <div
                            key={ev.event_id}
                            onClick={() => setSelectedEventAudit(ev)}
                            style={{
                              ...styles.calEventPill,
                              background:
                                ev.status === 'Approved'
                                  ? '#8b5cf6'
                                  : ev.status === 'Completed'
                                  ? '#334155'
                                  : '#fbbf24',
                              color: ev.status === 'Pending Dean Approval' ? '#090d16' : '#fff'
                            }}
                            title={`${ev.title} (${ev.status})`}
                          >
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {clubSubTab === 'directory' && (
            <div>
              <div style={styles.sectionHeader}>
                📁 Official SVNIT Student Chapters (Tap any club for full dossier)
              </div>
              <div style={styles.listContainer}>
                {clubs.map((club) => {
                  const clubEvents = events.filter((e) => e.club_id.toUpperCase() === club.club_id.toUpperCase());
                  return (
                    <div key={club.club_id} onClick={() => setSelectedClub(club)} style={styles.chatRow}>
                      <div style={styles.rowAvatar}>🏛️</div>
                      <div style={styles.rowCenter}>
                        <div style={styles.rowTopLine}>
                          <span style={styles.rowTitle}>{club.name}</span>
                          <span style={styles.codePill}>{club.club_id}</span>
                        </div>
                        <div style={styles.rowSub}>{club.mission}</div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', color: '#c084fc', fontWeight: '700' }}>
                          <span>🎪 {clubEvents.length} Events Organized</span>
                          <span>👥 {club.members?.length || 0} Core Members</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '17px' }}>📥 Official PDF Grievance Report</h3>
            {isDean && (
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Hostel Scope</label>
                <select value={pdfScope} onChange={(e) => setPdfScope(e.target.value)} style={styles.input}>
                  <option value="All">All SVNIT Hostels Combined</option>
                  {svnitHostels.map((h) => (
                    <option key={h.code} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ marginBottom: '12px' }}>
              <label style={styles.label}>From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={styles.input} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={styles.input} />
            </div>
            <button onClick={() => handleDownloadPDF()} style={styles.primaryBtn}>🖨️ Download & Print Official PDF</button>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div style={styles.tabContent}>
          {isDean ? (
            <div style={styles.listContainer}>
              {svnitHostels.map((h) => (
                <div key={h.code} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>🔑</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTitle}>{h.name}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button onClick={() => setResetTarget(h.cwId)} style={styles.keyChip}>Reset {h.cwId}</button>
                      <button onClick={() => setResetTarget(h.wId)} style={styles.keyChip}>Reset {h.wId}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.sheetCard}>
              <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>{user.full_name}</h3>
              <p style={{ margin: '0 0 14px 0', color: '#c084fc', fontSize: '13px' }}>ID: {user.user_id}</p>
              <div style={styles.detailBox}>
                <div><strong>Hostel Assigned:</strong> {user.hostel_block}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedClub && (
        <div style={styles.modalOverlay} onClick={() => setSelectedClub(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>{selectedClub.name}</h3>
                <span style={{ fontSize: '12px', color: '#c084fc' }}>
                  Faculty Advisor: {selectedClub.faculty_advisor}
                </span>
              </div>
              <button onClick={() => setSelectedClub(null)} style={styles.closeBtn}>✕</button>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 12px 0' }}>{selectedClub.mission}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={styles.statBox}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#c084fc' }}>
                  {events.filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase()).length}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Events Organized</div>
              </div>
              <div style={styles.statBox}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#4ade80' }}>
                  {selectedClub.members?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>Position Holders</div>
              </div>
            </div>

            {selectedClub.extra_dean_info && (
              <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '12px', padding: '12px', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#c084fc', textTransform: 'uppercase', marginBottom: '4px' }}>
                  📌 Club Dossier & Notes for Dean
                </div>
                <div style={{ fontSize: '13px', color: '#f8fafc', lineHeight: '1.4' }}>
                  {selectedClub.extra_dean_info}
                </div>
              </div>
            )}

            <div style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              👥 Position-Wise Member Details
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {selectedClub.members?.map((m, i) => (
                <div key={i} style={styles.memberCard}>
                  <div>
                    <div style={{ color: '#f8fafc', fontWeight: '700' }}>{m.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Roll: {m.roll} • {m.phone || 'SVNIT'}</div>
                  </div>
                  <span style={styles.posBadge}>{m.position}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '12px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
              📅 Events by {selectedClub.club_id}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {events
                .filter((e) => e.club_id.toUpperCase() === selectedClub.club_id.toUpperCase())
                .map((ev) => (
                  <div key={ev.event_id} style={styles.memberCard}>
                    <div>
                      <div style={{ color: '#f8fafc', fontWeight: '700', fontSize: '13px' }}>{ev.title}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{ev.venue} • {ev.date} • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                    </div>
                    <span style={{ fontSize: '11px', color: getStatusColor(ev.status), fontWeight: '700' }}>{ev.status}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {selectedEventAudit && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEventAudit(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px' }}>
                {selectedEventAudit.ai_audit ? '🤖 Event Details & AI Audit' : '🎟️ Event Requisition Details'}
              </h3>
              <button onClick={() => setSelectedEventAudit(null)} style={styles.closeBtn}>✕</button>
            </div>

            {selectedEventAudit.image_url && (
              <img
                src={selectedEventAudit.image_url}
                alt="Event"
                style={{ width: '100%', height: '165px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px' }}
              />
            )}

            <h4 style={{ margin: '0 0 6px 0', color: '#c084fc', fontSize: '18px' }}>{selectedEventAudit.title}</h4>
            <div style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '10px' }}>
              📍 {selectedEventAudit.venue} • 📅 {selectedEventAudit.date} ({selectedEventAudit.start_time} - {selectedEventAudit.end_time})
            </div>
            <div style={{ color: '#4ade80', fontSize: '13px', fontWeight: '700', marginBottom: '12px' }}>
              👥 Live Student RSVPs: {selectedEventAudit.rsvps?.length || 0} Attending
            </div>

            {selectedEventAudit.description && (
              <p style={{ background: '#090d16', padding: '12px', borderRadius: '10px', color: '#cbd5e1', fontSize: '13px', border: '1px solid #1e293b' }}>
                {selectedEventAudit.description}
              </p>
            )}

            {selectedEventAudit.registration_link && (
              <a
                href={selectedEventAudit.registration_link}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'block', textAlign: 'center', background: '#1e293b', color: '#c084fc', padding: '10px', borderRadius: '8px', textDecoration: 'none', fontWeight: '700', fontSize: '12px', marginTop: '10px' }}
              >
                🔗 View Attached Audition / Google Form Link
              </a>
            )}

            {selectedEventAudit.ai_audit && (
              <div style={styles.detailBox}>
                <div style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                  <div>👥 Attendees: <strong>{selectedEventAudit.ai_audit.total_attendees}</strong></div>
                  <div>⭐ Rating: <strong>{selectedEventAudit.ai_audit.average_rating} / 5.0</strong></div>
                </div>
                <div style={{ color: '#4ade80', fontWeight: '700' }}>👍 Key Pros:</div>
                <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                  {selectedEventAudit.ai_audit.key_pros.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <div style={{ color: '#f87171', fontWeight: '700' }}>⚠️ Areas of Improvement:</div>
                <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                  {selectedEventAudit.ai_audit.key_cons.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
                <div><strong>Recommendation:</strong> {selectedEventAudit.ai_audit.recommendation}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTicket && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>{selectedTicket.ticket_id} • {selectedTicket.category}</h3>
              <button onClick={() => setSelectedTicket(null)} style={styles.closeBtn}>✕</button>
            </div>
            <h4 style={{ margin: '0 0 8px 0', color: '#c084fc' }}>{selectedTicket.summary}</h4>
            <p style={{ color: '#cbd5e1', fontSize: '13px' }}>{selectedTicket.description}</p>
            <div style={styles.detailBox}>
              <div><strong>Resident:</strong> {selectedTicket.student_name} ({selectedTicket.student_id})</div>
              <div style={{ marginTop: '4px' }}><strong>Location:</strong> {selectedTicket.hostel_block}, Room {selectedTicket.room}</div>
              <div style={{ marginTop: '4px' }}><strong>Status:</strong> {selectedTicket.status}</div>
              {selectedTicket.staff_remark && <div style={{ marginTop: '4px', color: '#4ade80' }}><strong>Staff Note:</strong> {selectedTicket.staff_remark}</div>}
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div style={styles.modalOverlay} onClick={() => setResetTarget(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>🔐 Reset Password: {resetTarget}</h3>
              <button onClick={() => setResetTarget(null)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Enter New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>Save New Password</button>
            </form>
          </div>
        </div>
      )}

      <nav style={styles.bottomNav}>
        {isDean && (
          <button onClick={() => setActiveTab('hostels')} style={styles.navItem}>
            <div style={{ ...styles.iconPill, background: activeTab === 'hostels' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
            </div>
            <span style={{ ...styles.navLabel, color: activeTab === 'hostels' ? '#c084fc' : '#94a3b8' }}>Hostels</span>
          </button>
        )}
        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            {openCount > 0 && <span style={styles.badgeCount}>{openCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#c084fc' : '#94a3b8' }}>Grievances</span>
        </button>
        <button onClick={() => setActiveTab('clubshub')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clubshub' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⭐</span>
            {pendingEventsCount > 0 && <span style={styles.badgeCount}>{pendingEventsCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clubshub' ? '#c084fc' : '#94a3b8' }}>Clubs Hub</span>
        </button>
        <button onClick={() => setActiveTab('reports')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'reports' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>📥</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'reports' ? '#c084fc' : '#94a3b8' }}>PDF Report</span>
        </button>
        <button onClick={() => setActiveTab('settings')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'settings' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>{isDean ? '🔑' : '👤'}</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'settings' ? '#c084fc' : '#94a3b8' }}>
            {isDean ? 'Passwords' : 'Profile'}
          </span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #8b5cf6', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  subTabBar: { display: 'flex', gap: '8px', background: '#0f172a', padding: '6px', borderRadius: '12px', border: '1px solid #1e293b', marginBottom: '14px' },
  subTabBtn: { flex: 1, border: 'none', padding: '10px', borderRadius: '8px', fontSize: '12px', fontWeight: '800', cursor: 'pointer' },
  approvalCard: { background: '#0f172a', border: '1px solid #334155', borderRadius: '14px', padding: '14px', marginBottom: '10px', cursor: 'pointer' },
  calTopBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '10px 14px', marginBottom: '10px' },
  calNavBtn: { background: '#1e293b', color: '#c084fc', border: '1px solid #334155', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  calGridContainer: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px' },
  calHeaderRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#1e293b', padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: '800', color: '#94a3b8' },
  calHeaderCell: { textTransform: 'uppercase' },
  calDaysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: '#1e293b' },
  calCell: { background: '#090d16', minHeight: '78px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' },
  calCellNum: { fontSize: '11px', fontWeight: '700', color: '#64748b' },
  calEventPill: { fontSize: '10px', fontWeight: '700', padding: '3px 5px', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sectionHeader: { color: '#c084fc', fontSize: '12px', fontWeight: '800', margin: '6px 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)', cursor: 'pointer' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  unreadBubble: { fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  codePill: { background: '#1e293b', color: '#c084fc', fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px' },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px', background: '#0f172a', borderRadius: '14px', border: '1px solid #1e293b' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1', marginTop: '12px' },
  statBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', textAlign: 'center' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  keyChip: { background: '#1e293b', border: '1px solid #334155', color: '#c084fc', padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  approveBtn: { flex: 1, background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  rejectBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  memberCard: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  posBadge: { fontSize: '11px', background: 'rgba(139, 92, 246, 0.18)', color: '#c084fc', padding: '3px 8px', borderRadius: '999px', fontWeight: '700' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '500px', maxHeight: '85vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-3px', right: '6px', background: '#8b5cf6', color: '#fff', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' }
};