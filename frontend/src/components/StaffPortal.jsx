import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { downloadComplaintRegister } from '../registerPdf';

export default function StaffPortal({ user, apiUrl }) {
  const [page, setPage] = useState('list');
  const [dataLoading, setDataLoading] = useState(true);
  const [complaints, setComplaints] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');
  const [msg, setMsg] = useState(null);
  const [wingFilter, setWingFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const deptCode = user.department || user.user_id;
  const hostelScope = user.hostel_block || 'All';

  const loadQueue = useCallback(async () => {
    try {
      const q = new URLSearchParams({ role: 'Staff', user_id: user.user_id, department: deptCode, hostel_block: hostelScope, wing: wingFilter, category: categoryFilter });
      const res = await apiFetch(`${apiUrl}/api/complaints?${q.toString()}`);
      if (res.ok) setComplaints(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, user.user_id, deptCode, hostelScope, wingFilter, categoryFilter]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await apiFetch(`${apiUrl}/api/complaints/staff-resolve`, {
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

  const handleDownloadRegister = async () => {
    try {
      await downloadComplaintRegister({
        title: `${user.full_name} Complaint Register`,
        hostel: hostelScope,
        wing: wingFilter || 'All Wings',
        category: categoryFilter || 'All Categories',
        complaints
      });
    } catch (error) {
      setMsg(`❌ ${error.message || 'Could not generate the complaint register PDF.'}`);
    }
  };

  return (
    <div className="ptm-page-wrap">
      {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {dataLoading ? (
        <div className="ptm-wheel-box">
          <div className="ptm-spinner-wheel" />
          <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>
            Loading {user.full_name} Queue...
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
            Fetching assigned hostel maintenance tickets...
          </div>
        </div>
      ) : (
        <>
          {page === 'list' && (
            <div>
              <div className="ptm-drill-header">
                <span className="ptm-tag-pill" style={{ width: 'fit-content' }}>DEPARTMENT PORTAL • {deptCode}</span>
                <h1 className="ptm-page-title">{user.full_name}</h1>
                <p className="ptm-page-sub">Tap any complaint below to open and mark it resolved</p>
              </div>

              <div className="ptm-card">
                <div className="ptm-grid-2">
                  <label className="ptm-label">Wing
                    <select className="ptm-input" value={wingFilter} onChange={(event) => setWingFilter(event.target.value)}>
                      <option value="">All Wings</option>
                      {'ABCDEFGH'.split('').map((letter) => <option key={letter} value={`Wing ${letter}`}>Wing {letter}</option>)}
                    </select>
                  </label>
                  <label className="ptm-label">Category
                    <select className="ptm-input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                      <option value="">All Assigned Categories</option>
                      <option value={deptCode}>{user.full_name}</option>
                    </select>
                  </label>
                </div>
                <button type="button" className="ptm-btn-primary" style={{ marginTop: '12px' }} onClick={handleDownloadRegister}>
                  Download Register PDF ({complaints.length})
                </button>
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
                          <div className="ptm-list-sub">📍 {c.hostel_block} • {c.wing || 'Wing not assigned'} • Room {c.room} ({c.student_name})</div>
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
                  <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Location</div><div className="ptm-list-sub">{selectedTicket.hostel_block}, {selectedTicket.wing ? `${selectedTicket.wing}, ` : ''}Room {selectedTicket.room}</div></div></div>
                  <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Resident</div><div className="ptm-list-sub">{selectedTicket.student_name} ({selectedTicket.student_id}){selectedTicket.phone ? ` • 📞 ${selectedTicket.phone}` : ''}</div></div></div>
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
        </>
      )}
    </div>
  );
}