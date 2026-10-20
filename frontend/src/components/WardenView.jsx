import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  // === DEAN CLUBS HUB & EVENT STATE ===
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedEventAudit, setSelectedEventAudit] = useState(null);

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
    fetch(`${apiUrl}/api/unicore/clubs`).then(res => res.json()).then(setClubs).catch(console.error);
    fetch(`${apiUrl}/api/unicore/events`).then(res => res.json()).then(setEvents).catch(console.error);
  }, [apiUrl]);

  const handleApproveEvent = async (eventId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setEvents(events.map(e => e.event_id === eventId ? { ...e, status: action } : e));
      setStatusMsg(`✅ Event marked as ${action}!`);
    }
  };

  const handleDownloadPDF = (scopeOverride) => {
    const targetScope = scopeOverride || pdfScope;
    const query = new URLSearchParams({ institute_id: user.institute_id, hostel_block: targetScope, from_date: fromDate, to_date: toDate });
    window.open(`${apiUrl}/api/complaints/export-pdf?${query.toString()}`, '_blank');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed' || status === 'Approved') return '#22c55e';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    if (status === 'Pending Dean Approval') return '#fbbf24';
    return '#f87171';
  };

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;
  
  // Calendars categorizations
  const pendingEvents = events.filter(e => e.status === 'Pending Dean Approval');
  const upcomingEvents = events.filter(e => e.status === 'Approved');
  const pastEvents = events.filter(e => e.status === 'Completed');
  const pendingEventsCount = pendingEvents.length;

  const renderEventCard = (ev, isPending = false) => (
    <div key={ev.event_id} onClick={() => setSelectedEventAudit(ev)} style={styles.chatRow}>
      <div style={styles.calDateBox}>
        <div style={styles.calMonth}>{new Date(ev.date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
        <div style={styles.calDay}>{new Date(ev.date).getDate()}</div>
      </div>
      <div style={styles.rowCenter}>
        <div style={styles.rowTopLine}>
          <span style={styles.rowTitle}>{ev.title}</span>
          <span style={{ color: getStatusColor(ev.status), fontSize: '11px', fontWeight: '700' }}>{ev.status}</span>
        </div>
        <div style={styles.rowSub}>📍 {ev.venue} • ⏰ {ev.start_time}</div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Club: <strong>{ev.club_id}</strong></div>
        
        {isPending && isDean && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => handleApproveEvent(ev.event_id, 'Approved')} style={styles.approveBtn}>✓ Approve Venue</button>
            <button onClick={() => handleApproveEvent(ev.event_id, 'Rejected')} style={styles.rejectBtn}>✕ Reject</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.appWrapper}>
      {statusMsg && <div style={styles.toast} onClick={() => setStatusMsg(null)}>{statusMsg}</div>}

      {/* TAB 1: HOSTELS */}
      {isDean && activeTab === 'hostels' && (
        <div style={styles.tabContent}>
          <div style={styles.listContainer}>
            {svnitHostels.map((h) => {
              const hostelIssues = complaints.filter((c) => c.hostel_block === h.name && c.status !== 'Completed').length;
              return (
                <div key={h.code} onClick={() => setSelectedHostel(h.name)} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>{h.icon}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{h.name}</span>
                      <span style={styles.rowTime}>{h.ext}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>Portals: {h.cwId} • {h.wId}</span>
                      <span style={{ ...styles.unreadBubble, background: hostelIssues > 0 ? '#22c55e' : '#1e293b', color: hostelIssues > 0 ? '#052e16' : '#94a3b8' }}>
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

      {/* TAB 2: COMPLAINTS */}
      {activeTab === 'complaints' && (
        <div style={styles.tabContent}>
          <div style={styles.listContainer}>
            {complaints.length === 0 ? (
              <div style={styles.emptyState}>No grievances found.</div>
            ) : (
              complaints.map((c) => (
                <div key={c.ticket_id} onClick={() => setSelectedTicket(c)} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>{getCategoryIcon(c.category)}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.created_at.split(',')[0]}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>{c.student_name} • {c.hostel_block} (Rm {c.room})</span>
                      <span style={{ ...styles.statusBadge, color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>{c.status}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DEAN CLUBS & EVENTS CALENDAR HUB */}
      {activeTab === 'clubshub' && (
        <div style={styles.tabContent}>
          
          {/* PENDING APPROVALS SECTION */}
          {pendingEvents.length > 0 && (
            <>
              <div style={styles.sectionHeader}>⚠️ Action Required: Venue Approvals</div>
              <div style={styles.listContainer}>
                {pendingEvents.map(ev => renderEventCard(ev, true))}
              </div>
            </>
          )}

          {/* UPCOMING EVENTS SECTION */}
          <div style={styles.sectionHeader}>📅 Upcoming Approved Schedule</div>
          <div style={styles.listContainer}>
            {upcomingEvents.length === 0 ? (
              <div style={{...styles.emptyState, padding: '20px'}}>No upcoming events.</div>
            ) : (
              upcomingEvents.map(ev => renderEventCard(ev, false))
            )}
          </div>

          {/* COMPLETED EVENTS SECTION */}
          <div style={{...styles.sectionHeader, color: '#94a3b8', marginTop: '20px'}}>⏮️ Past Events & AI Audits</div>
          <div style={styles.listContainer}>
            {pastEvents.length === 0 ? (
              <div style={{...styles.emptyState, padding: '20px'}}>No past events.</div>
            ) : (
              pastEvents.map(ev => renderEventCard(ev, false))
            )}
          </div>

          <div style={{ color: '#4ade80', fontSize: '13px', fontWeight: '800', margin: '30px 0 8px 0', textTransform: 'uppercase' }}>
            ⭐ Master Club Ledgers
          </div>
          <div style={styles.listContainer}>
            {clubs.map((club) => (
              <div key={club.club_id} onClick={() => setSelectedClub(club)} style={styles.chatRow}>
                <div style={styles.rowAvatar}>⭐</div>
                <div style={styles.rowCenter}>
                  <div style={styles.rowTopLine}>
                    <span style={styles.rowTitle}>{club.name}</span>
                    <span style={styles.codePill}>{club.members?.length || 0} Members</span>
                  </div>
                  <div style={styles.rowSub}>{club.mission}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: REPORTS */}
      {activeTab === 'reports' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '17px' }}>📥 Official PDF Grievance Report</h3>
            {isDean && (
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Hostel Scope</label>
                <select value={pdfScope} onChange={(e) => setPdfScope(e.target.value)} style={styles.input}>
                  <option value="All">All SVNIT Hostels Combined</option>
                  {svnitHostels.map((h) => <option key={h.code} value={h.name}>{h.name}</option>)}
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
            <button onClick={() => handleDownloadPDF()} style={styles.primaryBtn}>🖨️ Download & Save PDF</button>
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS */}
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
              <p style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: '13px' }}>ID: {user.user_id}</p>
              <div style={styles.detailBox}><div><strong>Hostel:</strong> {user.hostel_block}</div></div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CLUB MEMBERS ROSTER */}
      {selectedClub && (
        <div style={styles.modalOverlay} onClick={() => setSelectedClub(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px' }}>{selectedClub.name}</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Advisor: {selectedClub.faculty_advisor}</span>
              </div>
              <button onClick={() => setSelectedClub(null)} style={styles.closeBtn}>✕</button>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 12px 0' }}>{selectedClub.mission}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedClub.members?.map((m, i) => (
                <div key={i} style={styles.memberCard}>
                  <div><strong>{m.name}</strong> ({m.roll})</div>
                  <span style={styles.posBadge}>{m.position}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EVENT DETAILS & AI AUDIT */}
      {selectedEventAudit && (
        <div style={styles.modalOverlay} onClick={() => setSelectedEventAudit(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px' }}>
                {selectedEventAudit.ai_audit ? '🤖 Event Audit & Details' : '🎟️ Event Details'}
              </h3>
              <button onClick={() => setSelectedEventAudit(null)} style={styles.closeBtn}>✕</button>
            </div>
            
            {selectedEventAudit.image_url && (
              <img src={selectedEventAudit.image_url} alt="Event" style={{ width: '100%', height: '160px', objectFit: 'cover', borderRadius: '12px', marginBottom: '12px' }} />
            )}

            <h4 style={{ margin: '0 0 8px 0', color: '#38bdf8', fontSize: '18px' }}>{selectedEventAudit.title}</h4>
            <div style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '12px' }}>📍 {selectedEventAudit.venue} • 📅 {selectedEventAudit.date}</div>

            {selectedEventAudit.description && (
              <p style={{ background: '#090d16', padding: '12px', borderRadius: '10px', color: '#cbd5e1', fontSize: '13px', border: '1px solid #1e293b' }}>
                {selectedEventAudit.description}
              </p>
            )}

            {selectedEventAudit.ai_audit && (
              <div style={styles.detailBox}>
                <div style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                  <div>👥 Attendees: <strong>{selectedEventAudit.ai_audit.total_attendees}</strong></div>
                  <div>⭐ Rating: <strong>{selectedEventAudit.ai_audit.average_rating} / 5.0</strong></div>
                </div>
                <div style={{ color: '#4ade80', fontWeight: '700' }}>👍 Key Pros:</div>
                <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>{selectedEventAudit.ai_audit.key_pros.map((p, i) => <li key={i}>{p}</li>)}</ul>
                <div style={{ color: '#f87171', fontWeight: '700' }}>⚠️ Areas of Improvement:</div>
                <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>{selectedEventAudit.ai_audit.key_cons.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <div><strong>Recommendation:</strong> {selectedEventAudit.ai_audit.recommendation}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 3: PASSWORD RESET */}
      {resetTarget && (
        <div style={styles.modalOverlay} onClick={() => setResetTarget(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>🔐 Reset: {resetTarget}</h3>
              <button onClick={() => setResetTarget(null)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Enter New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required style={styles.input} />
              <button type="submit" style={styles.primaryBtn}>Save Password</button>
            </form>
          </div>
        </div>
      )}

      <nav style={styles.bottomNav}>
        {isDean && (
          <button onClick={() => setActiveTab('hostels')} style={styles.navItem}>
            <div style={{ ...styles.iconPill, background: activeTab === 'hostels' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}><span style={{ fontSize: '18px' }}>🏢</span></div>
            <span style={{ ...styles.navLabel, color: activeTab === 'hostels' ? '#f8fafc' : '#94a3b8' }}>Hostels</span>
          </button>
        )}
        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}><span style={{ fontSize: '18px' }}>💬</span>{openCount > 0 && <span style={styles.badgeCount}>{openCount}</span>}</div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#f8fafc' : '#94a3b8' }}>Grievances</span>
        </button>
        <button onClick={() => setActiveTab('clubshub')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clubshub' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}><span style={{ fontSize: '18px' }}>📅</span>{pendingEventsCount > 0 && <span style={styles.badgeCount}>{pendingEventsCount}</span>}</div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clubshub' ? '#f8fafc' : '#94a3b8' }}>Calendar</span>
        </button>
        <button onClick={() => setActiveTab('reports')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'reports' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}><span style={{ fontSize: '18px' }}>📥</span></div>
          <span style={{ ...styles.navLabel, color: activeTab === 'reports' ? '#f8fafc' : '#94a3b8' }}>Reports</span>
        </button>
        <button onClick={() => setActiveTab('settings')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'settings' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}><span style={{ fontSize: '18px' }}>{isDean ? '🔑' : '👤'}</span></div>
          <span style={{ ...styles.navLabel, color: activeTab === 'settings' ? '#f8fafc' : '#94a3b8' }}>{isDean ? 'Settings' : 'Profile'}</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)', cursor: 'pointer' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  calDateBox: { width: '50px', height: '56px', background: '#1e293b', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid #334155', flexShrink: 0 },
  calMonth: { background: '#ef4444', color: '#fff', width: '100%', textAlign: 'center', fontSize: '10px', fontWeight: '800', padding: '2px 0' },
  calDay: { color: '#f8fafc', fontSize: '18px', fontWeight: '800', marginTop: '2px' },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  unreadBubble: { fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  codePill: { background: '#1e293b', color: '#38bdf8', fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px' },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' },
  sectionHeader: { color: '#38bdf8', fontSize: '13px', fontWeight: '800', margin: '10px 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.5px' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1', marginTop: '12px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  keyChip: { background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  approveBtn: { background: '#22c55e', color: '#052e16', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  rejectBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  memberCard: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  posBadge: { fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '999px', fontWeight: '700' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '500px', maxHeight: '82vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-3px', right: '6px', background: '#22c55e', color: '#052e16', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' }
};