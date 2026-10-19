import React, { useState } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function StudentView({ user, complaints, onRefresh, apiUrl }) {
  const [selectedCat, setSelectedCat] = useState(COMPLAINT_CATEGORIES[0]);
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: user.user_id,
          category: selectedCat.id,
          summary,
          description
        })
      });
      const data = await res.json();
      if (data.success) {
        setSummary('');
        setDescription('');
        onRefresh();
        if (data.ccc_sync) {
          setBanner(`✅ Directly Registered with SVNIT CCC Portal! Official CCC Ticket: ${data.ccc_sync.ccc_ticket_id}`);
        } else {
          setBanner(`✅ Complaint Registered (${data.ticket.ticket_id}) & routed to ${selectedCat.department}`);
        }
      }
    } catch {
      setBanner('❌ Could not connect to backend server.');
    }
    setSubmitting(false);
  };

  const handleStudentVerify = async (ticketId, isSatisfied) => {
    await fetch(`${apiUrl}/api/complaints/student-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, satisfied: isSatisfied })
    });
    onRefresh();
  };

  const getBadgeStyle = (status) => {
    if (status === 'Completed') return styles.statusCompleted;
    if (status === 'Awaiting Confirmation') return styles.statusAwaiting;
    if (status === 'Reopened') return styles.statusReopened;
    return styles.statusOpen;
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.sectionTitle}>1. Select Grievance Category (5 Specialized Wings)</h2>
      <div style={styles.catGrid}>
        {COMPLAINT_CATEGORIES.map((cat) => {
          const isSelected = selectedCat.id === cat.id;
          return (
            <div
              key={cat.id}
              onClick={() => setSelectedCat(cat)}
              style={{
                ...styles.catCard,
                borderColor: isSelected ? cat.badgeColor : '#1e293b',
                background: isSelected ? cat.bgGlow : '#0f172a'
              }}
            >
              <div style={styles.catIcon}>{cat.icon}</div>
              <div style={styles.catTitle}>{cat.title}</div>
              <div style={styles.catSub}>{cat.subtitle}</div>
              <div style={{ ...styles.deptTag, color: cat.badgeColor }}>
                → {cat.department}
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.formGrid}>
        {/* Left: Raise Ticket Form */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>
              {selectedCat.icon} File {selectedCat.title} Ticket
            </h3>
            {selectedCat.isExternalSync && (
              <span style={styles.cccBadge}>⚡ Auto-Syncs to SVNIT CCC osTicket</span>
            )}
          </div>

          <div style={styles.autoFillBar}>
            <div><span style={styles.metaLabel}>Hostel:</span> <strong>{user.hostel_block}</strong></div>
            <div><span style={styles.metaLabel}>Floor:</span> <strong>{user.floor}</strong></div>
            <div><span style={styles.metaLabel}>Room:</span> <strong>{user.room}</strong></div>
            <div><span style={styles.metaLabel}>Phone:</span> <strong>{user.phone}</strong></div>
          </div>

          {banner && <div style={styles.banner}>{banner}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={styles.label}>Issue Summary *</label>
              <input
                type="text"
                placeholder={
                  selectedCat.id === "Wi-Fi & Internet" ? "e.g., LAN port dead / Wi-Fi not connecting in room" :
                  selectedCat.id === "Electricity" ? "e.g., Ceiling fan regulator broken" :
                  selectedCat.id === "Water Issue" ? "e.g., 2nd floor water cooler not cooling" :
                  selectedCat.id === "Furniture" ? "e.g., Study table drawer broken" :
                  "e.g., Uncooked chapati / hygiene issue in lunch"
                }
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>Detailed Description *</label>
              <textarea
                placeholder="Describe the issue clearly..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                style={{ ...styles.input, height: '90px', resize: 'none' }}
              />
            </div>

            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Routing Ticket...' : `Register Complaint with ${selectedCat.department}`}
            </button>
          </form>
        </div>

        {/* Right: Student Ticket Tracker & Mutual Handshake Box */}
        <div style={styles.card}>
          <h3 style={{ margin: '0 0 16px 0', color: '#f8fafc', fontSize: '18px' }}>My Tickets & Mutual Verification</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '420px', overflowY: 'auto' }}>
            {complaints.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '14px' }}>No complaints registered yet.</p>
            )}
            {complaints.map((c) => (
              <div key={c.ticket_id} style={styles.ticketItem}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={styles.ticketId}>{c.ticket_id}</span>
                    {c.ccc_ticket_id && <span style={styles.cccRef}>{c.ccc_ticket_id}</span>}
                  </div>
                  <span style={getBadgeStyle(c.status)}>{c.status}</span>
                </div>

                <div style={{ fontWeight: '600', color: '#f1f5f9', marginTop: '8px' }}>
                  [{c.category}] {c.summary}
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{c.description}</div>

                {c.staff_remark && (
                  <div style={styles.remarkBox}>
                    <strong>Department Update:</strong> {c.staff_remark}
                  </div>
                )}

                {c.status === 'Awaiting Confirmation' && (
                  <div style={styles.verifyBox}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0', marginBottom: '8px' }}>
                      🔔 {c.routed_to} marked this resolved. Has your problem been solved?
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => handleStudentVerify(c.ticket_id, true)}
                        style={styles.yesBtn}
                      >
                        ✓ Yes, Satisfied (Complete)
                      </button>
                      <button
                        onClick={() => handleStudentVerify(c.ticket_id, false)}
                        style={styles.noBtn}
                      >
                        ✕ No, Reopen Ticket
                      </button>
                    </div>
                  </div>
                )}

                <div style={styles.ticketFooter}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Logged: {c.created_at}</span>
                  {c.status === 'Completed' && (
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>
                      ✓ Verified by Both ({c.resolved_at})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' },
  sectionTitle: { fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', marginBottom: '14px' },
  catGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '28px' },
  catCard: { padding: '18px', borderRadius: '16px', border: '2px solid', cursor: 'pointer', transition: 'all 0.2s' },
  catIcon: { fontSize: '26px', marginBottom: '10px' },
  catTitle: { fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginBottom: '4px' },
  catSub: { fontSize: '12px', color: '#94a3b8', lineHeight: '1.4', marginBottom: '10px' },
  deptTag: { fontSize: '11px', fontWeight: '600' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' },
  cccBadge: { background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '4px 10px', borderRadius: '100px', fontSize: '11px', fontWeight: '600' },
  autoFillBar: { display: 'flex', flexWrap: 'wrap', gap: '16px', background: '#090d16', padding: '12px 16px', borderRadius: '12px', border: '1px solid #1e293b', marginBottom: '18px', fontSize: '13px', color: '#cbd5e1' },
  metaLabel: { color: '#64748b', marginRight: '4px' },
  banner: { background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '12px 16px', borderRadius: '12px', fontSize: '13px', fontWeight: '600', marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#cbd5e1', marginBottom: '6px' },
  input: { width: '100%', boxSizing: 'border-box', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '14px' },
  submitBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' },
  ticketItem: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px' },
  ticketId: { fontSize: '12px', fontWeight: '700', color: '#94a3b8' },
  cccRef: { fontSize: '11px', background: '#1e3a8a', color: '#93c5fd', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' },
  statusOpen: { fontSize: '11px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '3px 10px', borderRadius: '100px', fontWeight: '600' },
  statusAwaiting: { fontSize: '11px', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '3px 10px', borderRadius: '100px', fontWeight: '600' },
  statusReopened: { fontSize: '11px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '3px 10px', borderRadius: '100px', fontWeight: '700' },
  statusCompleted: { fontSize: '11px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '3px 10px', borderRadius: '100px', fontWeight: '600' },
  remarkBox: { marginTop: '8px', padding: '8px 10px', background: '#0f172a', borderLeft: '3px solid #38bdf8', borderRadius: '6px', fontSize: '12px', color: '#cbd5e1' },
  verifyBox: { marginTop: '12px', padding: '12px', background: 'rgba(37, 99, 235, 0.12)', border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: '10px' },
  yesBtn: { flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' },
  noBtn: { flex: 1, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '8px 12px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' },
  ticketFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #1e293b' }
};