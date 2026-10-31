import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';

export default function StaffPortal({ user, apiUrl }) {
  const safeUser = user || {};
  const deptKey = safeUser.department || safeUser.user_id || 'ELECTRICITY';
  const sKey = `staff_complaints_${deptKey}`;

  const [page, setPage] = useState('home');
  const [dataLoading, setDataLoading] = useState(false);
  const [complaints, setComplaints] = useState(() => getCached(sKey) || []);
  const [msg, setMsg] = useState(null);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [staffRemark, setStaffRemark] = useState('');

  const loadStaffData = useCallback(async () => {
    const hasCache = Boolean(getCached(sKey));
    if (!hasCache) setDataLoading(true);

    try {
      const res = await apiFetch(`${apiUrl}/api/portal/bootstrap?role=Staff&user_id=${encodeURIComponent(deptKey)}&hostel_block=All`);
      if (res.ok) {
        const d = await res.json();
        setComplaints(d.complaints || []);
        setCached(sKey, d.complaints || []);
      }
    } catch (e) {
      console.error('Staff bootstrap sync error:', e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, deptKey, sKey]);

  useEffect(() => {
    loadStaffData();
  }, [loadStaffData]);

  const handleResolveTicket = async (ticketId) => {
    const updated = complaints.map((c) =>
      c.ticket_id === ticketId ? { ...c, status: 'Awaiting Confirmation', staff_remark: staffRemark || c.staff_remark } : c
    );
    setComplaints(updated);
    setCached(sKey, updated);
    setMsg(`✅ Ticket ${ticketId} marked as resolved! Student notified for verification.`);
    setStaffRemark('');
    setPage('home');

    try {
      await apiFetch(`${apiUrl}/api/complaints/staff-resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, staff_remark: staffRemark || 'Resolved by maintenance wing' })
      });
      loadStaffData();
    } catch (err) {
      setMsg('❌ Error syncing resolution.');
    }
  };

  const pendingCount = complaints.filter((c) => c.status !== 'Completed').length;

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Staff Home</button>
        <button className={`ptm-side-btn ${page === 'complaints' ? 'active' : ''}`} onClick={() => setPage('complaints')}>🛠️ Assigned Tickets ({complaints.length})</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {dataLoading ? (
          <div className="ptm-wheel-box">
            <div className="ptm-spinner-wheel" />
            <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>Loading Maintenance Portal...</div>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={() => setPage('complaints')}>
                    <div className="ptm-row-between"><span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Pending Tasks</span><span>⚡</span></div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{pendingCount} Tickets</div>
                    <button className="ptm-mini-btn">View Assigned Tasks →</button>
                  </div>
                  <div className="ptm-mini-card" onClick={() => setPage('complaints')}>
                    <div className="ptm-row-between"><span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Total Handled</span><span>📋</span></div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{complaints.length}</div>
                    <button className="ptm-mini-btn">View Ledger →</button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">{safeUser.full_name || deptKey} — Maintenance Dashboard</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('complaints')}><div className="ptm-icon-circle">🛠️{pendingCount > 0 && <span className="ptm-tile-badge">{pendingCount}</span>}</div><span className="ptm-icon-label">Active Tickets</span></button>
                  </div>
                </div>
              </div>
            )}

            {page === 'complaints' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Assigned Maintenance Tickets ({complaints.length})</h1>
                </div>
                <div className="ptm-card">
                  {complaints.length === 0 ? (
                    <div className="ptm-list-sub">No maintenance tickets assigned.</div>
                  ) : (
                    <div className="ptm-list">
                      {complaints.map((c) => (
                        <div key={c.ticket_id} className="ptm-list-row" onClick={() => { setSelectedTicket(c); setPage('ticket_detail'); }}>
                          <div className="ptm-avatar-pastel">🛠️</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{c.summary}</div>
                            <div className="ptm-list-sub">{c.ticket_id} • {c.hostel_block} ({c.wing} Room {c.room}) • {c.student_name}</div>
                            <span className="ptm-tag-pill">📞 {c.phone || c.student_phone || 'N/A'} • {c.created_at}</span>
                          </div>
                          <span className="ptm-status-badge" style={{ background: c.status === 'Completed' ? '#DCFCE7' : '#FEF3C7', color: c.status === 'Completed' ? '#15803D' : '#B45309' }}>
                            {c.status} ›
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'ticket_detail' && selectedTicket && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('complaints')}>←</button>
                  <span className="ptm-tag-pill">{selectedTicket.ticket_id} • {selectedTicket.hostel_block}</span>
                  <h1 className="ptm-page-title">{selectedTicket.summary}</h1>
                </div>
                <div className="ptm-card">
                  <p style={{ marginBottom: '14px' }}>{selectedTicket.description}</p>
                  <div className="ptm-list-sub" style={{ marginBottom: '14px' }}>
                    <strong>Resident:</strong> {selectedTicket.student_name} (Room {selectedTicket.room}, {selectedTicket.wing})<br/>
                    <strong>Contact:</strong> 📞 {selectedTicket.phone || selectedTicket.student_phone || 'N/A'}
                  </div>

                  {selectedTicket.status !== 'Completed' && (
                    <div className="ptm-form-stack">
                      <textarea
                        rows="3"
                        className="ptm-input"
                        placeholder="Add resolution remark for technician/student..."
                        value={staffRemark}
                        onChange={(e) => setStaffRemark(e.target.value)}
                      />
                      <button className="ptm-btn-primary" onClick={() => handleResolveTicket(selectedTicket.ticket_id)}>
                        ✅ Mark Resolved (Ask Student to Verify)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        <button className={`ptm-bnav-btn ${page === 'complaints' ? 'active' : ''}`} onClick={() => setPage('complaints')}><span>🛠️</span><span>Tickets</span></button>
      </nav>
    </div>
  );
}