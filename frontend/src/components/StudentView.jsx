import React, { useState } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function StudentView({ user, complaints, apiUrl, onRefresh }) {
  const [activeTab, setActiveTab] = useState('complaints');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

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
        setMsg({ type: 'error', text: data.detail || 'Failed to submit complaint' });
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
    if (status === 'Completed') return '#22c55e';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    if (status === 'Reopened') return '#f87171';
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
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hms-animate { animation: fadeSlideUp 0.22s ease-out; }
        .hms-row:active { background: #1e293b !important; }
      `}</style>

      {/* ========================================================= */}
      {/* TAB 1: COMPLAINTS (WHATSAPP-STYLE FEED + FLOATING + BTN)  */}
      {/* ========================================================= */}
      {activeTab === 'complaints' && (
        <div className="hms-animate" style={styles.tabContent}>
          {/* Top Search Bar */}
          <div style={styles.searchWrap}>
            <span style={{ color: '#94a3b8', fontSize: '15px' }}>🔍</span>
            <input
              type="text"
              placeholder="Search complaints, wing or ticket ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {msg && (
            <div style={{ ...styles.toast, borderColor: msg.type === 'success' ? '#22c55e' : '#ef4444' }}>
              {msg.text}
            </div>
          )}

          {/* Complaints List (WhatsApp Chat Row Style) */}
          <div style={styles.listContainer}>
            {filteredComplaints.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '38px', marginBottom: '8px' }}>📭</div>
                <div style={{ color: '#e2e8f0', fontWeight: '700', fontSize: '15px' }}>No Grievances Found</div>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0 0' }}>
                  Tap the green + button below to lodge a new hostel complaint.
                </p>
              </div>
            ) : (
              filteredComplaints.map((c) => (
                <div
                  key={c.ticket_id}
                  className="hms-row"
                  onClick={() => setSelectedTicket(c)}
                  style={styles.chatRow}
                >
                  {/* Left Avatar Icon */}
                  <div style={styles.rowAvatar}>{getCategoryIcon(c.category)}</div>

                  {/* Center Title & Subtitle */}
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.created_at.split(',')[0]}</span>
                    </div>

                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>
                        {c.ticket_id} • {c.category}
                      </span>
                      <span
                        style={{
                          ...styles.statusBadge,
                          color: getStatusColor(c.status),
                          borderColor: getStatusColor(c.status)
                        }}
                      >
                        {c.status === 'Awaiting Confirmation' ? 'Verify Now' : c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Floating + Action Button (Bottom Right) */}
          <button
            onClick={() => setShowNewModal(true)}
            style={styles.fabBtn}
            title="Lodge New Complaint"
          >
            +
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: ATTENDANCE (COMING SOON)                           */}
      {/* ========================================================= */}
      {activeTab === 'attendance' && (
        <div className="hms-animate" style={styles.comingSoonWrap}>
          <div style={styles.comingSoonBadge}>PHASE 2 ROLLOUT • COMING SOON</div>
          <div style={styles.bigIconBox}>📅</div>
          <h2 style={styles.csTitle}>Hostel Night Attendance</h2>
          <p style={styles.csSub}>
            Smart geo-fenced and biometric hostel attendance synced directly with the SVNIT Council of Wardens.
          </p>

          <div style={styles.featureList}>
            <div style={styles.featureItem}>✅ Daily Night Roll-Call Status (9:30 PM - 10:30 PM)</div>
            <div style={styles.featureItem}>📊 Monthly Presence Percentage & Audit Log</div>
            <div style={styles.featureItem}>🔔 Instant Warden & Parent Absence Alerts</div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: LEAVE FORM / OUTPASS (COMING SOON)                 */}
      {/* ========================================================= */}
      {activeTab === 'leave' && (
        <div className="hms-animate" style={styles.comingSoonWrap}>
          <div style={styles.comingSoonBadge}>PHASE 2 ROLLOUT • COMING SOON</div>
          <div style={styles.bigIconBox}>🪪</div>
          <h2 style={styles.csTitle}>Digital Leave & Gate Outpass</h2>
          <p style={styles.csSub}>
            Paperless hostel leave applications with instant Warden approval and QR code verification at the SVNIT main gate.
          </p>

          <div style={styles.featureList}>
            <div style={styles.featureItem}>📝 1-Tap Weekend & Vacation Leave Form</div>
            <div style={styles.featureItem}>📲 Automated Parent Consent Notification</div>
            <div style={styles.featureItem}>🔳 QR Digital Gate Pass for Campus Security</div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: STUDENT PROFILE                                    */}
      {/* ========================================================= */}
      {activeTab === 'profile' && (
        <div className="hms-animate" style={styles.tabContent}>
          <div style={styles.profileCard}>
            <div style={styles.profileAvatar}>
              {user.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <h2 style={{ margin: '12px 0 4px 0', color: '#f8fafc', fontSize: '20px' }}>{user.full_name}</h2>
            <span style={styles.idPill}>{user.user_id} • Verified Resident</span>

            <div style={styles.infoList}>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>🏢 Hostel Bhawan</span>
                <span style={styles.infoVal}>{user.hostel_block}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>🚪 Room & Floor</span>
                <span style={styles.infoVal}>
                  Room {user.room} ({user.floor})
                </span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>📞 Registered Phone</span>
                <span style={styles.infoVal}>{user.phone}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>✉️ Institute Email</span>
                <span style={styles.infoVal}>{user.email}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>🛡️ Total Complaints Logged</span>
                <span style={styles.infoVal}>{complaints.length} Tickets</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP 1: CLICKED COMPLAINT DETAILS MODAL                  */}
      {/* ========================================================= */}
      {selectedTicket && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div className="hms-animate" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '14px' }}>
                {selectedTicket.ticket_id} • {selectedTicket.category}
              </span>
              <button onClick={() => setSelectedTicket(null)} style={styles.closeBtn}>✕</button>
            </div>

            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '17px' }}>{selectedTicket.summary}</h3>
            <p style={{ margin: '0 0 14px 0', color: '#cbd5e1', fontSize: '14px', lineHeight: '1.5' }}>
              {selectedTicket.description}
            </p>

            <div style={styles.detailBox}>
              <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status), fontWeight: '700' }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Assigned Wing:</strong> {selectedTicket.routed_to}</div>
              {selectedTicket.ccc_ticket_id && (
                <div style={{ marginTop: '6px' }}><strong>CCC osTicket ID:</strong> {selectedTicket.ccc_ticket_id}</div>
              )}
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '6px', color: '#38bdf8' }}>
                  <strong>Staff Note:</strong> {selectedTicket.staff_remark}
                </div>
              )}
              <div style={{ marginTop: '6px', color: '#64748b', fontSize: '12px' }}>
                Logged on: {selectedTicket.created_at}
              </div>
            </div>

            {selectedTicket.status === 'Awaiting Confirmation' && (
              <div style={styles.verifyBox}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', marginBottom: '10px' }}>
                  Did the maintenance staff resolve your issue?
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleStudentVerify(selectedTicket.ticket_id, true)}
                    style={styles.yesBtn}
                  >
                    ✅ Yes, Mark Completed
                  </button>
                  <button
                    onClick={() => handleStudentVerify(selectedTicket.ticket_id, false)}
                    style={styles.noBtn}
                  >
                    ❌ No, Reopen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* POPUP 2: NEW COMPLAINT FORM MODAL                         */}
      {/* ========================================================= */}
      {showNewModal && (
        <div style={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
          <div className="hms-animate" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>📝 Lodge New Grievance</h3>
              <button onClick={() => setShowNewModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={styles.label}>Select Maintenance Wing</label>
                <div style={styles.catGrid}>
                  {COMPLAINT_CATEGORIES.map((cat) => (
                    <div
                      key={cat.id}
                      onClick={() => setCategory(cat.id)}
                      style={{
                        ...styles.catChip,
                        borderColor: category === cat.id ? '#22c55e' : '#1e293b',
                        background: category === cat.id ? 'rgba(34, 197, 94, 0.12)' : '#090d16'
                      }}
                    >
                      <span>{cat.icon}</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>{cat.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <input
                type="text"
                placeholder="Short Summary (e.g. Fan regulator sparking / LAN down)"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                style={styles.input}
              />

              <textarea
                rows="3"
                placeholder="Describe exact issue details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                style={styles.input}
              />

              <button type="submit" disabled={submitting} style={styles.submitBtn}>
                {submitting ? 'Submitting...' : '🚀 Submit Grievance'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FIXED WHATSAPP-STYLE BOTTOM NAVIGATION BAR                */}
      {/* ========================================================= */}
      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '19px' }}>💬</span>
            {actionPendingCount > 0 && <span style={styles.badgeCount}>{actionPendingCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#f8fafc' : '#94a3b8', fontWeight: activeTab === 'complaints' ? '700' : '500' }}>
            Complaints
          </span>
        </button>

        <button onClick={() => setActiveTab('attendance')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'attendance' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '19px' }}>📅</span>
            <span style={styles.greenDot}></span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'attendance' ? '#f8fafc' : '#94a3b8', fontWeight: activeTab === 'attendance' ? '700' : '500' }}>
            Attendance
          </span>
        </button>

        <button onClick={() => setActiveTab('leave')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'leave' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '19px' }}>🪪</span>
            <span style={styles.greenDot}></span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'leave' ? '#f8fafc' : '#94a3b8', fontWeight: activeTab === 'leave' ? '700' : '500' }}>
            Leave Form
          </span>
        </button>

        <button onClick={() => setActiveTab('profile')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'profile' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '19px' }}>👤</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'profile' ? '#f8fafc' : '#94a3b8', fontWeight: activeTab === 'profile' ? '700' : '500' }}>
            Profile
          </span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '95px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px 16px' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', borderRadius: '999px', padding: '10px 16px', marginBottom: '14px' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '14px', width: '100%' },
  toast: { background: '#0f172a', borderLeft: '4px solid', padding: '12px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: '#f8fafc' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 8px', borderBottom: '1px solid rgba(30, 41, 59, 0.7)', cursor: 'pointer', borderRadius: '12px', transition: 'background 0.15s ease' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '50px 20px', background: '#0f172a', borderRadius: '18px', border: '1px solid #1e293b', marginTop: '12px' },
  fabBtn: { position: 'fixed', right: '22px', bottom: '88px', width: '56px', height: '56px', borderRadius: '16px', background: '#22c55e', color: '#052e16', border: 'none', fontSize: '30px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 25px rgba(34, 197, 94, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 },
  comingSoonWrap: { padding: '40px 20px', textAlign: 'center', margin: '16px', background: '#0f172a', borderRadius: '22px', border: '1px solid #1e293b' },
  comingSoonBadge: { display: 'inline-block', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '5px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: '800', letterSpacing: '0.8px', marginBottom: '16px' },
  bigIconBox: { width: '72px', height: '72px', borderRadius: '22px', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', margin: '0 auto 14px auto' },
  csTitle: { color: '#f8fafc', fontSize: '21px', fontWeight: '800', margin: '0 0 8px 0' },
  csSub: { color: '#94a3b8', fontSize: '14px', lineHeight: '1.5', maxWidth: '420px', margin: '0 auto 22px auto' },
  featureList: { display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left', maxWidth: '380px', margin: '0 auto' },
  featureItem: { background: '#090d16', border: '1px solid #1e293b', padding: '12px 14px', borderRadius: '12px', fontSize: '13px', color: '#cbd5e1', fontWeight: '600' },
  profileCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '22px', padding: '26px 20px', textAlign: 'center' },
  profileAvatar: { width: '72px', height: '72px', borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '24px', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' },
  idPill: { display: 'inline-block', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', marginTop: '4px' },
  infoList: { marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' },
  infoRow: { display: 'flex', justifyContent: 'space-between', background: '#090d16', padding: '12px 14px', borderRadius: '12px', border: '1px solid #1e293b', fontSize: '13px' },
  infoLabel: { color: '#94a3b8' },
  infoVal: { color: '#f8fafc', fontWeight: '700' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '72px', background: '#0b111e', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)' },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '58px', height: '32px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' },
  navLabel: { fontSize: '11px' },
  badgeCount: { position: 'absolute', top: '-2px', right: '8px', background: '#22c55e', color: '#052e16', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' },
  greenDot: { position: 'absolute', top: '4px', right: '14px', width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '22px', width: '100%', maxWidth: '480px', maxHeight: '85vh', overflowY: 'auto' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', fontSize: '13px', color: '#cbd5e1' },
  verifyBox: { marginTop: '14px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #38bdf8', borderRadius: '12px', padding: '14px', textAlign: 'center' },
  yesBtn: { flex: 1, background: '#22c55e', color: '#052e16', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '12px' },
  noBtn: { flex: 1, background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' },
  catGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' },
  catChip: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', border: '1.5px solid', cursor: 'pointer' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  submitBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' }
};