import React, { useState, useEffect, useCallback } from 'react';

const COMPLAINT_CATEGORIES = [
  { id: 'Electricity', title: 'Electricity', icon: '⚡' },
  { id: 'Plumbing', title: 'Plumbing', icon: '🚰' },
  { id: 'LAN / Wi-Fi', title: 'LAN / Wi-Fi', icon: '🌐' },
  { id: 'Carpentry', title: 'Carpentry', icon: '🪚' },
  { id: 'Water Cooler', title: 'RO / Water Cooler', icon: '💧' },
  { id: 'Mess & Hygiene', title: 'Cleaning & Hygiene', icon: '🧹' }
];

const getCategoryIcon = (catName) => {
  const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
  return found ? found.icon : '🛠️';
};

const getStatusColor = (status) => {
  if (status === 'Completed') return '#4ade80';
  if (status === 'Awaiting Confirmation') return '#38bdf8';
  return '#fbbf24';
};

export default function StaffPortal({ user, apiUrl }) {
  const [complaints, setComplaints] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);

  const loadStaffComplaints = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        role: 'Staff',
        user_id: user.user_id,
        department: user.department || 'Electricity'
      });
      const res = await fetch(`${apiUrl}/api/complaints?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setComplaints(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.user_id, user.department]);

  useEffect(() => {
    loadStaffComplaints();
  }, [loadStaffComplaints]);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    try {
      const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg(`✅ Ticket ${selectedTicket.ticket_id} resolved and sent to student for confirmation!`);
        setRemark('');
        setSelectedTicket(null);
        loadStaffComplaints();
      } else {
        setMsg(`❌ ${data.detail || 'Resolution failed'}`);
      }
    } catch {
      setMsg('❌ Connection error.');
    }
  };

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      <div className="hms-desktop-tabs">
        <button className="hms-dtab active">
          🛠️ Assigned Maintenance Queue ({user.department} Wing) — {complaints.length} Tickets
        </button>
      </div>

      {complaints.length === 0 ? (
        <div className="hms-empty-card">
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🛠️</div>
          <h3>No Pending Maintenance Tickets</h3>
          <p className="hms-muted">All grievances assigned to the {user.department} department have been resolved.</p>
        </div>
      ) : (
        <div className="hms-grid-2">
          {complaints.map((c) => (
            <div key={c.ticket_id} className="hms-item-card" onClick={() => setSelectedTicket(c)}>
              <div className="hms-avatar-circle">{getCategoryIcon(c.category)}</div>
              <div style={{ flex: 1 }}>
                <div className="hms-row-between">
                  <span className="hms-item-title">{c.summary}</span>
                  <span className="hms-status-pill" style={{ color: getStatusColor(c.status), borderColor: getStatusColor(c.status) }}>
                    {c.status}
                  </span>
                </div>
                <p className="hms-item-sub" style={{ margin: '4px 0' }}>{c.description}</p>
                <div className="hms-item-sub">
                  📍 {c.hostel_block} • Room {c.room} ({c.student_name})
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTicket && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedTicket(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">{selectedTicket.ticket_id} • {selectedTicket.category}</span>
              <button className="hms-close-btn" onClick={() => setSelectedTicket(null)}>✕</button>
            </div>
            <h3>{selectedTicket.summary}</h3>
            <p className="hms-muted">{selectedTicket.description}</p>
            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div><strong>Resident:</strong> {selectedTicket.student_name} ({selectedTicket.student_id})</div>
              <div style={{ marginTop: '4px' }}><strong>Location:</strong> {selectedTicket.hostel_block}, Room {selectedTicket.room}</div>
            </div>
            <form onSubmit={handleResolve} className="hms-stack">
              <label className="hms-label">Enter Maintenance Action / Parts Replaced</label>
              <textarea
                rows="3"
                className="hms-input"
                placeholder="e.g. Replaced faulty capacitor and tested switch..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required
              />
              <button type="submit" className="hms-btn-primary">
                ✅ Mark Resolved & Send for Student Verification
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}