import React, { useState, useEffect, useCallback } from 'react';

export default function StaffPortal({ user, apiUrl }) {
  const [page, setPage] = useState('list');
  const [complaints, setComplaints] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const deptCode = user.department || user.user_id;
  const hostelScope = user.hostel_block || 'All';

  const loadQueue = useCallback(async () => {
    try {
      const q = new URLSearchParams({ role: 'Staff', user_id: user.user_id, department: deptCode, hostel_block: hostelScope });
      const res = await fetch(`${apiUrl}/api/complaints?${q.toString()}`);
      if (res.ok) setComplaints(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.user_id, deptCode, hostelScope]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
    });
    if (res.ok) {
      setMsg(`✅ Ticket ${selectedTicket.ticket_id} marked resolved!`);
      setRemark('');
      loadQueue();
      setPage('list');
    }
  };

  return (
    <div className="ptm-page-wrap">
      {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {page === 'list' && (
        <div>
          <div className="ptm-drill-header">
            <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>DEPARTMENT PORTAL • {deptCode}</span>
            <h1 className="ptm-page-title">{user.full_name}</h1>
            <p className="ptm-page-sub">Tap any complaint below to open and mark it resolved</p>
          </div>

          <div className="ptm-card">
            {complaints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#6B7280' }}>No pending complaints in your queue.</div>
            ) : (
              <div className="ptm-list">
                {complaints.map((c) => (
                  <div key={c.ticket_id} className="ptm-list-row" onClick={() => { setSelectedTicket(c); setPage('detail'); }}>
                    <div className="ptm-avatar-pastel">🛠️</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{c.summary}</div>
                      <div className="ptm-list-sub">📍 {c.hostel_block} • Room {c.room} ({c.student_name})</div>
                      <span className="ptm-tag-pill">{c.created_at}</span>
                    </div>
                    <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>{c.status} ›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {page === 'detail' && selectedTicket && (
        <div>
          <div className="ptm-drill-header">
            <button className="ptm-back-btn" onClick={() => setPage('list')}>←</button>
            <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>{selectedTicket.ticket_id}</span>
            <h1 className="ptm-page-title">{selectedTicket.summary}</h1>
          </div>

          <div className="ptm-card">
            <p>{selectedTicket.description}</p>
            <div className="ptm-list" style={{ marginBottom: '16px' }}>
              <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Location</div><div className="ptm-list-sub">{selectedTicket.hostel_block}, Room {selectedTicket.room}</div></div></div>
              <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Resident</div><div className="ptm-list-sub">{selectedTicket.student_name} ({selectedTicket.student_id})</div></div></div>
            </div>

            {selectedTicket.status !== 'Completed' && (
              <form onSubmit={handleResolve} className="ptm-form-stack">
                <label className="ptm-label">Maintenance Action Taken</label>
                <textarea rows="3" className="ptm-input" placeholder="Describe repair completed..." value={remark} onChange={(e) => setRemark(e.target.value)} required />
                <button type="submit" className="ptm-btn-primary">✅ Mark Resolved & Notify Student</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}