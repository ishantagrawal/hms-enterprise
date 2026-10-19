import React, { useState } from 'react';

export default function StaffView({ user, complaints, onRefresh, apiUrl }) {
  const [remarks, setRemarks] = useState({});
  const [msg, setMsg] = useState(null);

  const handleStaffResolve = async (ticketId) => {
    const remark = remarks[ticketId] || 'Issue resolved by department.';
    setMsg(null);
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, staff_remark: remark })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${ticketId} marked resolved! Sent to student for satisfaction confirmation.`);
      onRefresh();
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 32px' }}>
      <div style={styles.card}>
        <h2 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>🛠️ {user.department} Department Queue</h2>
        <p style={{ margin: '0 0 20px 0', color: '#94a3b8', fontSize: '14px' }}>
          Mark issues resolved once fixed. A ticket is officially completed only when the student confirms satisfaction.
        </p>

        {msg && (
          <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: '600', fontSize: '13px' }}>
            {msg}
          </div>
        )}

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Ticket ID</th>
              <th style={styles.th}>Location</th>
              <th style={styles.th}>Student & Contact</th>
              <th style={styles.th}>Issue Details</th>
              <th style={styles.th}>Status & Action</th>
            </tr>
          </thead>
          <tbody>
            {complaints.map((c) => (
              <tr key={c.ticket_id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={styles.td}>
                  <strong>{c.ticket_id}</strong>
                  {c.ccc_ticket_id && <div style={{ fontSize: '11px', color: '#60a5fa' }}>{c.ccc_ticket_id}</div>}
                </td>
                <td style={styles.td}>
                  <strong style={{ color: '#38bdf8' }}>{c.hostel_block}</strong><br />
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{c.floor} • Room {c.room}</span>
                </td>
                <td style={styles.td}>
                  {c.student_name}<br />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>📞 {c.phone}</span>
                </td>
                <td style={styles.td}>
                  <strong>{c.summary}</strong><br />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{c.description}</span>
                </td>
                <td style={styles.td}>
                  {(c.status === 'Open' || c.status === 'Reopened') ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {c.status === 'Reopened' && (
                        <span style={{ color: '#f87171', fontSize: '11px', fontWeight: '700' }}>
                          ⚠️ Reopened by Student (Not Satisfied)
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Action taken note..."
                          value={remarks[c.ticket_id] || ''}
                          onChange={(e) => setRemarks({ ...remarks, [c.ticket_id]: e.target.value })}
                          style={styles.remarkInput}
                        />
                        <button onClick={() => handleStaffResolve(c.ticket_id)} style={styles.resolveBtn}>
                          Mark Resolved
                        </button>
                      </div>
                    </div>
                  ) : c.status === 'Awaiting Confirmation' ? (
                    <span style={{ color: '#60a5fa', fontWeight: '600', fontSize: '13px' }}>
                      ⏳ Waiting for Student Confirmation
                    </span>
                  ) : (
                    <span style={{ color: '#10b981', fontWeight: '600', fontSize: '13px' }}>
                      ✓ Completed ({c.resolved_at})
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {complaints.length === 0 && (
              <tr><td colSpan="5" style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>No tickets in queue for {user.department}.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' },
  td: { padding: '16px 12px', color: '#e2e8f0', fontSize: '14px' },
  remarkInput: { width: '170px', background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px', color: '#fff', fontSize: '12px' },
  resolveBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }
};