import React, { useState } from 'react';

export default function StaffView({ user, complaints, apiUrl, onRefresh }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const pendingList = complaints.filter(
    (c) => c.status === 'Open' || c.status === 'Reopened'
  );
  const resolvedList = complaints.filter(
    (c) => c.status === 'Awaiting Confirmation' || c.status === 'Completed'
  );

  const currentList = (activeTab === 'pending' ? pendingList : resolvedList).filter(
    (c) =>
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.hostel_block.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticket_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: selectedTicket.ticket_id,
        staff_remark: remark || 'Issue resolved by department technician.'
      })
    });
    if (res.ok) {
      setMsg(`✅ ${selectedTicket.ticket_id} marked resolved!`);
      setRemark('');
      setSelectedTicket(null);
      onRefresh();
    }
  };

  return (
    <div style={styles.appWrapper}>
      {msg && (
        <div style={styles.toast} onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}

      {(activeTab === 'pending' || activeTab === 'resolved') && (
        <div style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder={`Search ${user.department} tickets or room...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.listContainer}>
            {currentList.length === 0 ? (
              <div style={styles.emptyState}>
                No {activeTab} tickets in {user.department}.
              </div>
            ) : (
              currentList.map((c) => (
                <div
                  key={c.ticket_id}
                  onClick={() => {
                    setSelectedTicket(c);
                    setRemark(c.staff_remark || '');
                  }}
                  style={styles.chatRow}
                >
                  <div style={styles.rowAvatar}>🛠️</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.hostel_block}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>
                        Rm {c.room} ({c.floor}) • {c.student_name}
                      </span>
                      <span style={styles.statusPill}>{c.status}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>{user.full_name}</h3>
            <p style={{ margin: '0 0 14px 0', color: '#4ade80', fontSize: '13px', fontWeight: '700' }}>
              Assigned Wing: {user.department}
            </p>
            <div style={styles.detailBox}>
              <div><strong>Position ID:</strong> {user.user_id}</div>
              <div style={{ marginTop: '6px' }}><strong>Pending Tasks:</strong> {pendingList.length}</div>
              <div style={{ marginTop: '6px' }}><strong>Resolved Tasks:</strong> {resolvedList.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tapped Ticket Action Sheet */}
      {selectedTicket && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '14px' }}>
                {selectedTicket.ticket_id} • {selectedTicket.hostel_block}
              </span>
              <button onClick={() => setSelectedTicket(null)} style={styles.closeBtn}>✕</button>
            </div>

            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '17px' }}>
              {selectedTicket.summary}
            </h3>
            <p style={{ margin: '0 0 14px 0', color: '#cbd5e1', fontSize: '14px' }}>
              {selectedTicket.description}
            </p>

            <div style={styles.detailBox}>
              <div><strong>Location:</strong> {selectedTicket.hostel_block} • {selectedTicket.floor} • Room {selectedTicket.room}</div>
              <div style={{ marginTop: '6px' }}><strong>Student:</strong> {selectedTicket.student_name} (📞 {selectedTicket.phone})</div>
            </div>

            {selectedTicket.status !== 'Completed' && (
              <form onSubmit={handleResolve} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Enter resolution note (e.g. Replaced capacitor / Fixed port)..."
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  required
                  style={styles.input}
                />
                <button type="submit" style={styles.primaryBtn}>
                  ✓ Mark Resolved & Notify Student
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation */}
      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('pending')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'pending' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
            {pendingList.length > 0 && <span style={styles.badgeCount}>{pendingList.length}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'pending' ? '#f8fafc' : '#94a3b8' }}>Pending</span>
        </button>

        <button onClick={() => setActiveTab('resolved')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'resolved' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>✅</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'resolved' ? '#f8fafc' : '#94a3b8' }}>Resolved</span>
        </button>

        <button onClick={() => setActiveTab('profile')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'profile' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>👤</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'profile' ? '#f8fafc' : '#94a3b8' }}>Profile</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '12px 14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', borderRadius: '999px', padding: '10px 16px', marginBottom: '12px' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '14px', width: '100%' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)', cursor: 'pointer' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#38bdf8', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusPill: { fontSize: '10px', fontWeight: '700', color: '#fbbf24', border: '1px solid #fbbf24', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px', marginTop: '8px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', fontSize: '13px', color: '#cbd5e1' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '480px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-3px', right: '6px', background: '#22c55e', color: '#052e16', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' }
};