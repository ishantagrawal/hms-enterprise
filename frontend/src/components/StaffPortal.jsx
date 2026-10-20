import React, { useState, useEffect, useCallback } from 'react';

const getStatusColor = (status) => {
  if (status === 'Completed') return '#4ade80';
  if (status === 'Awaiting Confirmation') return '#38bdf8';
  return '#fbbf24';
};

export default function StaffPortal({ user, apiUrl }) {
  const [complaints, setComplaints] = useState([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const deptCode = user.department || user.user_id;
  const hostelScope = user.hostel_block || 'All';

  const loadDepartmentQueue = useCallback(async () => {
    try {
      const q = new URLSearchParams({
        role: 'Staff',
        user_id: user.user_id,
        department: deptCode,
        hostel_block: hostelScope
      });
      const res = await fetch(`${apiUrl}/api/complaints?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setComplaints(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.user_id, deptCode, hostelScope]);

  useEffect(() => { loadDepartmentQueue(); }, [loadDepartmentQueue]);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.ticket_id,
          staff_remark: remark
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ Ticket ${selectedTicket.ticket_id} marked resolved! Waiting for student confirmation.`);
        setRemark('');
        setSelectedTicket(null);
        loadDepartmentQueue();
      } else {
        setMsg(`❌ ${data.detail || 'Could not update ticket'}`);
      }
    } catch {
      setMsg('❌ Server connection error.');
    }
  };

  const displayed = filterStatus === 'All'
    ? complaints
    : complaints.filter((c) => c.status === filterStatus);

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-toolbar">
        <div>
          <span className="hms-pill-badge">DEPARTMENT PORTAL • {deptCode}</span>
          <h3 style={{ margin: '6px 0 0 0' }}>{user.full_name} ({hostelScope === 'All' ? 'All SVNIT Hostels' : hostelScope})</h3>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['All', 'Pending', 'Awaiting Confirmation', 'Completed'].map((st) => (
            <button
              key={st}
              className={filterStatus === st ? 'hms-btn-primary-sm' : 'hms-btn-ghost-sm'}
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="hms-empty-card">
          <div style={{ fontSize: '38px', marginBottom: '8px' }}>🛠️</div>
          <h3>No Tickets in Queue</h3>
          <p className="hms-muted">There are currently no {filterStatus.toLowerCase()} tickets for {user.full_name}.</p>
        </div>
      ) : (
        <div className="hms-grid-2">
          {displayed.map((c) => (
            <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
              <div className="hms-avatar-circle">🛠️</div>
              <div style={{ flex: 1 }}>
                <div className="hms-row-between">
                  <span className="hms-item-title">{c.summary}</span>
                  <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                    {c.status}
                  </span>
                </div>
                <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                <div className="hms-row-between" style={{ marginTop: '6px' }}>
                  <span className="hms-item-sub">📍 {c.hostel_block} • Room {c.room} ({c.student_name})</span>
                  <span className="hms-muted-xs">{c.created_at.split(',')[0]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: 3-STAGE TICKET RESOLUTION */}
      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '10px' }}>
              <span className="hms-pill-badge">{selectedTicket.ticket_id} • {selectedTicket.hostel_block} (Rm {selectedTicket.room})</span>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>

            <h3>{selectedTicket.summary}</h3>
            <p className="hms-muted">{selectedTicket.description}</p>

            {/* Simple 3-Stage Lifecycle */}
            <div className="hms-detail-box" style={{ marginBottom: '16px' }}>
              <div><strong>1️⃣ Complaint Lodged:</strong> {selectedTicket.created_at} by {selectedTicket.student_name} ({selectedTicket.student_id})</div>
              <div style={{ marginTop: '6px' }}>
                <strong>2️⃣ Department Action:</strong> {selectedTicket.staff_remark ? `${selectedTicket.staff_remark} (${selectedTicket.resolved_at})` : 'Awaiting resolution'}
              </div>
              <div style={{ marginTop: '6px' }}>
                <strong>3️⃣ Student Verification:</strong> <span style={{ color: getStatusColor(selectedTicket.status), fontWeight: 800 }}>{selectedTicket.status}</span>
              </div>
            </div>

            {selectedTicket.status !== 'Completed' && (
              <form onSubmit={handleResolve} className="hms-stack">
                <label className="hms-label">Action Taken / Resolution Note</label>
                <textarea
                  rows="3"
                  className="hms-input"
                  placeholder="Describe repair completed (e.g. Replaced fan capacitor / fixed tap washer)..."
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  required
                />
                <button type="submit" className="hms-btn-primary">
                  ✅ Mark Resolved & Send to Student for Confirmation
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}