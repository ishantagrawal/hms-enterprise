import React, { useState } from 'react';

export default function StaffView({ user, complaints, apiUrl, onRefresh }) {
  const [remarks, setRemarks] = useState({});
  const [msg, setMsg] = useState(null);

  const handleResolve = async (ticketId) => {
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId, staff_remark: remarks[ticketId] || 'Issue resolved by technical team.' })
    });
    if (res.ok) {
      setMsg(`✅ Ticket ${ticketId} marked resolved! Sent to student for confirmation.`);
      onRefresh();
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '18px' }}>
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '18px', marginBottom: '18px' }}>
        <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🛠️ {user.full_name} Portal</h2>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
          Assigned Maintenance Category: <strong style={{ color: '#38bdf8' }}>{user.department}</strong> ({complaints.length} Tickets)
        </p>
      </div>

      {msg && <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '16px', fontWeight: '600', fontSize: '13px' }}>{msg}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {complaints.length === 0 ? (
          <div style={{ background: '#0f172a', padding: '30px', borderRadius: '14px', textAlign: 'center', color: '#64748b' }}>
            No pending grievances for {user.department}.
          </div>
        ) : (
          complaints.map(c => (
            <div key={c.ticket_id} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong style={{ color: '#38bdf8', fontSize: '14px' }}>{c.ticket_id} • {c.hostel_block} (Room {c.room})</strong>
                <span style={{ color: '#fbbf24', fontWeight: '700', fontSize: '12px' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginTop: '6px' }}>{c.summary}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{c.description}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                Student: {c.student_name} ({c.phone}) • Logged: {c.created_at}
              </div>

              {c.status !== 'Completed' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Enter resolution remark (e.g. Replaced switch / Reset port)..."
                    value={remarks[c.ticket_id] || ''}
                    onChange={e => setRemarks({ ...remarks, [c.ticket_id]: e.target.value })}
                    style={{ flex: 1, background: '#030712', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px' }}
                  />
                  <button
                    onClick={() => handleResolve(c.ticket_id)}
                    style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
                  >
                    ✓ Mark Resolved
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}