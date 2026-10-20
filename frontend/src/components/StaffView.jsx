import React, { useState } from 'react';

export default function StaffView({ user, complaints, apiUrl, onRefresh }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
    });
    if (res.ok) {
      setRemark('');
      setSelectedTicket(null);
      onRefresh();
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
      <h3 style={{ color: '#c084fc', marginTop: 0 }}>🛠️ Assigned Maintenance Queue ({user.department})</h3>
      {complaints.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#0f172a', borderRadius: '14px', color: '#94a3b8' }}>
          No pending maintenance tickets in your wing.
        </div>
      ) : (
        complaints.map((c) => (
          <div
            key={c.ticket_id}
            onClick={() => setSelectedTicket(c)}
            style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '14px', marginBottom: '10px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: '#f8fafc' }}>{c.summary}</strong>
              <span style={{ color: '#c084fc', fontSize: '12px', fontWeight: '700' }}>{c.status}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              📍 {c.hostel_block} • Room {c.room} ({c.student_name})
            </div>
          </div>
        ))
      )}

      {selectedTicket && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 200 }}
          onClick={() => setSelectedTicket(null)}
        >
          <div
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '18px', padding: '20px', width: '100%', maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Resolve {selectedTicket.ticket_id}</h3>
            <p style={{ color: '#cbd5e1', fontSize: '13px' }}>{selectedTicket.description}</p>
            <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <textarea
                rows="3"
                placeholder="Enter action taken / resolution remark..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required
                style={{ width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', boxSizing: 'border-box' }}
              />
              <button type="submit" style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>
                ✅ Mark Resolved & Ask Student Confirmation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}