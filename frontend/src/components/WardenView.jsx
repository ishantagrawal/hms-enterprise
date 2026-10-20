import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState('All');

  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  # UniCore ERP State
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [aiAudit, setAiAudit] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfScope, setPdfScope] = useState(isDean ? 'All' : user.hostel_block);
  const [statusMsg, setStatusMsg] = useState(null);

  const [studentCount, setStudentCount] = useState(1);
  const [singleStudent, setSingleStudent] = useState({
    user_id: '', full_name: '', floor: '1st Floor', room: '', phone: ''
  });

  const svnitHostels = [
    { code: 'GAJJAR', name: 'Gajjar Bhawan', cwId: 'CW_GAJJAR', wId: 'W_GAJJAR', ext: '0261-2201659', icon: '🏢' },
    { code: 'BHABHA', name: 'Bhabha Bhawan', cwId: 'CW_BHABHA', wId: 'W_BHABHA', ext: '0261-2201790', icon: '🏢' },
    { code: 'MTB', name: 'Mother Teresa Bhawan', cwId: 'CW_MTB', wId: 'W_MTB', ext: '0261-2201967', icon: '🏢' },
    { code: 'SVB', name: 'Swami Vivekananda Bhawan', cwId: 'CW_SVB', wId: 'W_SVB', ext: '0261-2201657', icon: '🏢' },
    { code: 'NEHRU', name: 'Nehru Bhawan', cwId: 'CW_NEHRU', wId: 'W_NEHRU', ext: '0261-2201703', icon: '🏢' },
    { code: 'TAGORE', name: 'Tagore Bhawan', cwId: 'CW_TAGORE', wId: 'W_TAGORE', ext: '0261-2201707', icon: '🏢' },
    { code: 'SARABHAI', name: 'Sarabhai Bhawan', cwId: 'CW_SARABHAI', wId: 'W_SARABHAI', ext: '0261-2201793', icon: '🏢' },
    { code: 'RAMAN', name: 'Raman Bhawan', cwId: 'CW_RAMAN', wId: 'W_RAMAN', ext: '0261-2201789', icon: '🏢' },
    { code: 'ABVB', name: 'Atal Bihari Vajpayee Bhawan', cwId: 'CW_ABVB', wId: 'W_ABVB', ext: '0261-2201880', icon: '🏢' },
    { code: 'NARMAD', name: 'Narmad Bhawan (Guest House)', cwId: 'CW_NARMAD', wId: 'W_NARMAD', ext: '0261-2201652', icon: '🏨' }
  ];

  useEffect(() => {
    fetch(`${apiUrl}/api/unicore/clubs`).then(res => res.json()).then(setClubs).catch(console.error);
    fetch(`${apiUrl}/api/unicore/events`).then(res => res.json()).then(setEvents).catch(console.error);
    fetch(`${apiUrl}/api/unicore/audit-summary`).then(res => res.json()).then(setAiAudit).catch(console.error);
  }, []);

  const handleApproveEvent = async (eventId, action) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=${action}`, { method: 'POST' });
    if (res.ok) {
      setEvents(events.map(e => e.event_id === eventId ? { ...e, status: action } : e));
      setStatusMsg(`✅ Event marked as ${action}!`);
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

  const visibleComplaints = complaints.filter((c) => {
    const matchesCat = filterCat === 'All' || c.category === filterCat;
    const matchesSearch =
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticket_id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;
  const pendingEventsCount = events.filter((e) => e.status === 'Pending Dean Approval').length;

  return (
    <div style={styles.appWrapper}>
      {statusMsg && (
        <div style={styles.toast} onClick={() => setStatusMsg(null)}>
          {statusMsg}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: HOSTELS (DEAN) OR COMPLAINTS (WARDEN)              */}
      {/* ========================================================= */}
      {isDean && activeTab === 'hostels' && (
        <div style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search SVNIT Hostel Bhawan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.listContainer}>
            {svnitHostels.map((h) => {
              const hostelIssues = complaints.filter(
                (c) => c.hostel_block === h.name && c.status !== 'Completed'
              ).length;
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

      {activeTab === 'complaints' && (
        <div style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search ticket ID or student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.listContainer}>
            {visibleComplaints.length === 0 ? (
              <div style={styles.emptyState}>No grievances found.</div>
            ) : (
              visibleComplaints.map((c) => (
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

      {/* ========================================================= */}
      {/* TAB 2: UNICORE ERP — CLASH MATRIX & EVENT APPROVALS        */}
      {/* ========================================================= */}
      {activeTab === 'clash' && (
        <div style={styles.tabContent}>
          <div style={{ color: '#38bdf8', fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>
            ⚡ UniCore Requisition & Clash Matrix (MOD-02)
          </div>

          <div style={styles.listContainer}>
            {events.length === 0 ? (
              <div style={styles.emptyState}>No club event proposals pending.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.event_id} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>🎟️</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{ev.title}</span>
                      <span style={{ color: getStatusColor(ev.status), fontSize: '11px', fontWeight: '700' }}>
                        {ev.status}
                      </span>
                    </div>
                    <div style={styles.rowSub}>
                      📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})
                    </div>
                    {isDean && ev.status === 'Pending Dean Approval' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button onClick={() => handleApproveEvent(ev.event_id, 'Approved')} style={styles.approveBtn}>✓ Approve Venue</button>
                        <button onClick={() => handleApproveEvent(ev.event_id, 'Rejected')} style={styles.rejectBtn}>✕ Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: UNICORE ERP — MASTER CLUB LEDGER (MOD-01)          */}
      {/* ========================================================= */}
      {activeTab === 'clubs' && (
        <div style={styles.tabContent}>
          <div style={{ color: '#4ade80', fontSize: '13px', fontWeight: '700', marginBottom: '10px' }}>
            🏛️ SVNIT Master Club Ledger & Rosters (MOD-01)
          </div>

          <div style={styles.listContainer}>
            {clubs.map((club) => (
              <div key={club.club_id} style={styles.chatRow}>
                <div style={styles.rowAvatar}>⭐</div>
                <div style={styles.rowCenter}>
                  <div style={styles.rowTopLine}>
                    <span style={styles.rowTitle}>{club.name}</span>
                    <span style={styles.codePill}>{club.members_count} Members</span>
                  </div>
                  <div style={styles.rowSub}>{club.mission}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Faculty Advisor: {club.faculty_advisor} | Coord: {club.head_coordinator}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: UNICORE ERP — AI EVENT AUDIT & FEEDBACK (MOD-04)   */}
      {/* ========================================================= */}
      {activeTab === 'audit' && aiAudit && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <div style={{ color: '#38bdf8', fontSize: '12px', fontWeight: '800', marginBottom: '6px' }}>
              🤖 LLM AI EVENT FEEDBACK & AUDIT SUMMARY (MOD-04)
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '16px' }}>{aiAudit.event_title}</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '13px', color: '#cbd5e1' }}>
              <div>👥 Attendees: <strong>{aiAudit.total_attendees}</strong></div>
              <div>⭐ Rating: <strong>{aiAudit.average_rating} / 5.0</strong></div>
            </div>

            <div style={styles.detailBox}>
              <div style={{ color: '#4ade80', fontWeight: '700' }}>👍 Key Pros:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_pros.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ color: '#f87171', fontWeight: '700' }}>⚠️ Areas of Improvement:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_cons.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <div><strong>Dean Recommendation:</strong> {aiAudit.recommendation}</div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FIXED WHATSAPP BOTTOM NAVIGATION BAR                      */}
      {/* ========================================================= */}
      <nav style={styles.bottomNav}>
        {isDean && (
          <button onClick={() => setActiveTab('hostels')} style={styles.navItem}>
            <div style={{ ...styles.iconPill, background: activeTab === 'hostels' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
            </div>
            <span style={{ ...styles.navLabel, color: activeTab === 'hostels' ? '#f8fafc' : '#94a3b8' }}>Hostels</span>
          </button>
        )}

        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            {openCount > 0 && <span style={styles.badgeCount}>{openCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#f8fafc' : '#94a3b8' }}>Grievances</span>
        </button>

        <button onClick={() => setActiveTab('clash')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clash' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            {pendingEventsCount > 0 && <span style={styles.badgeCount}>{pendingEventsCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clash' ? '#f8fafc' : '#94a3b8' }}>Clash Matrix</span>
        </button>

        <button onClick={() => setActiveTab('clubs')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clubs' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⭐</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clubs' ? '#f8fafc' : '#94a3b8' }}>Club Ledger</span>
        </button>

        <button onClick={() => setActiveTab('audit')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'audit' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'audit' ? '#f8fafc' : '#94a3b8' }}>AI Audit</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', borderRadius: '999px', padding: '10px 16px', marginBottom: '12px' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '14px', width: '100%' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  codePill: { background: '#1e293b', color: '#38bdf8', fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px' },
  unreadBubble: { fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1' },
  approveBtn: { background: '#22c55e', color: '#052e16', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  rejectBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: '700', fontSize: '12px', cursor: 'pointer' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-3px', right: '6px', background: '#22c55e', color: '#052e16', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' }
};