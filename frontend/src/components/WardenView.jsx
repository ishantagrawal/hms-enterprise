import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  const [inspectedHostel, setInspectedHostel] = useState(null);
  const [filterCat, setFilterCat] = useState('All');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [statusMsg, setStatusMsg] = useState(null);

  const [studentCount, setStudentCount] = useState(1);
  const [singleStudent, setSingleStudent] = useState({ user_id: '', full_name: '', floor: '1st Floor', room: '', phone: '' });

  const svnitHostels = [
    { code: 'GAJJAR', name: 'Gajjar Bhawan', cwId: 'CW_GAJJAR', wId: 'W_GAJJAR', ext: '0261-2201659' },
    { code: 'BHABHA', name: 'Bhabha Bhawan', cwId: 'CW_BHABHA', wId: 'W_BHABHA', ext: '0261-2201790' },
    { code: 'MTB', name: 'Mother Teresa Bhawan', cwId: 'CW_MTB', wId: 'W_MTB', ext: '0261-2201967' },
    { code: 'SVB', name: 'Swami Vivekananda Bhawan', cwId: 'CW_SVB', wId: 'W_SVB', ext: '0261-2201657' },
    { code: 'NEHRU', name: 'Nehru Bhawan', cwId: 'CW_NEHRU', wId: 'W_NEHRU', ext: '0261-2201703' },
    { code: 'TAGORE', name: 'Tagore Bhawan', cwId: 'CW_TAGORE', wId: 'W_TAGORE', ext: '0261-2201707' },
    { code: 'SARABHAI', name: 'Sarabhai Bhawan', cwId: 'CW_SARABHAI', wId: 'W_SARABHAI', ext: '0261-2201793' },
    { code: 'RAMAN', name: 'Raman Bhawan', cwId: 'CW_RAMAN', wId: 'W_RAMAN', ext: '0261-2201789' },
    { code: 'ABVB', name: 'Atal Bihari Vajpayee Bhawan', cwId: 'CW_ABVB', wId: 'W_ABVB', ext: '0261-2201880' },
    { code: 'NARMAD', name: 'Narmad Bhawan (Guest House)', cwId: 'CW_NARMAD', wId: 'W_NARMAD', ext: '0261-2201652' }
  ];

  const loadStudentCount = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/warden/students?institute_id=${user.institute_id}&hostel_block=${user.hostel_block}`);
      if (res.ok) {
        const data = await res.json();
        setStudentCount(data.count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadStudentCount();
  }, [user.hostel_block]);

  const handleDownloadPDF = (scopeHostel) => {
    const query = new URLSearchParams({
      institute_id: user.institute_id,
      hostel_block: scopeHostel,
      from_date: fromDate,
      to_date: toDate
    });
    window.open(`${apiUrl}/api/complaints/export-pdf?${query.toString()}`, '_blank');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: resetTarget, new_password: newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setResetTarget(null);
      setNewPassword('');
    } else {
      setStatusMsg(`❌ ${data.detail || 'Error resetting password'}`);
    }
  };

  const handleAddSingleStudent = async (e) => {
    e.preventDefault();
    const payload = [{
      user_id: singleStudent.user_id,
      full_name: singleStudent.full_name,
      hostel_block: user.hostel_block,
      floor: singleStudent.floor,
      room: singleStudent.room,
      phone: singleStudent.phone
    }];
    const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ Onboarded student ${singleStudent.user_id.toUpperCase()} to ${user.hostel_block} (Default Pass: 123)`);
      setSingleStudent({ user_id: '', full_name: '', floor: '1st Floor', room: '', phone: '' });
      loadStudentCount();
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const lines = evt.target.result.split('\n').filter(l => l.trim().length > 0);
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(s => s.trim());
        if (cols.length >= 4) {
          parsed.push({
            user_id: cols[0],
            full_name: cols[1],
            hostel_block: user.hostel_block,
            floor: cols[2] || 'Ground',
            room: cols[3] || 'A-101',
            phone: cols[4] || '9876543210'
          });
        }
      }
      const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ Bulk Onboarded ${data.added} students into ${user.hostel_block}!`);
        loadStudentCount();
      }
    };
    reader.readAsText(file);
  };

  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  // =========================================================================
  // VIEW 1: DEAN CAMPUS-WIDE PORTAL (ONLY FOR DEAN_SW / ADEAN_SW)
  // =========================================================================
  if (isDean) {
    const modalComplaints = inspectedHostel === 'All'
      ? complaints
      : complaints.filter(c => c.hostel_block === inspectedHostel);

    return (
      <div style={styles.container}>
        <div style={styles.topBar}>
          <div>
            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🏛️ Dean (Student Welfare) — Campus Command Portal</h2>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
              Position-Based Hostel Directory • Click "View Complaints" to inspect any hostel's grievance register instantly.
            </p>
          </div>

          <div style={styles.pdfFilterBox}>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={styles.dateInput} title="From Date" />
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={styles.dateInput} title="To Date" />
            <button onClick={() => handleDownloadPDF('All')} style={styles.pdfBtn}>📥 Campus PDF Report</button>
          </div>
        </div>

        {statusMsg && <div style={styles.alert}>{statusMsg}</div>}

        {/* Password Reset Modal for Positions */}
        {resetTarget && (
          <div style={styles.modalOverlay} onClick={() => setResetTarget(null)}>
            <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>🔐 Reset Password for Position: {resetTarget}</h3>
              <p style={{ margin: '0 0 14px 0', color: '#94a3b8', fontSize: '13px' }}>
                When a new faculty member takes charge of this position, reset the position password here.
              </p>
              <form onSubmit={handlePasswordReset} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Enter New Password (e.g. 123 or Gajjar@2026)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  style={{ ...styles.input, flex: 1 }}
                />
                <button type="submit" style={styles.saveBtn}>Update Password</button>
                <button type="button" onClick={() => setResetTarget(null)} style={styles.cancelBtn}>Cancel</button>
              </form>
            </div>
          </div>
        )}

        {/* Instant Inspection Modal */}
        {inspectedHostel && (
          <div style={styles.modalOverlay} onClick={() => setInspectedHostel(null)}>
            <div style={{ ...styles.modalCard, maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '18px' }}>📋 {inspectedHostel} — Grievance Register ({modalComplaints.length})</h3>
                  <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>Direct Hostel Inspection View</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleDownloadPDF(inspectedHostel)} style={styles.pdfBtn}>📥 Export PDF</button>
                  <button onClick={() => setInspectedHostel(null)} style={styles.cancelBtn}>✕ Close</button>
                </div>
              </div>

              {modalComplaints.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>No grievances registered for {inspectedHostel}.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {modalComplaints.map(c => (
                    <div key={c.ticket_id} style={{ ...styles.complaintCard, borderLeft: `4px solid ${getStatusColor(c.status)}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong style={{ color: '#38bdf8', fontSize: '13px' }}>{c.ticket_id} • {c.category}</strong>
                        <span style={{ color: getStatusColor(c.status), fontSize: '12px', fontWeight: '700' }}>{c.status}</span>
                      </div>
                      <div style={{ fontWeight: '700', color: '#f8fafc', marginTop: '6px', fontSize: '14px' }}>{c.summary}</div>
                      <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>{c.description}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                        👤 {c.student_name} ({c.hostel_block} • Rm {c.room}) | 🕒 {c.created_at}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 10 Hostels Position Directory Table */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>🏢 SVNIT 10 Hostels — Position Portals & Live Grievance Count</h3>
            <button onClick={() => setInspectedHostel('All')} style={styles.filterBtn}>🌟 View All Campus Grievances ({complaints.length})</button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Hostel Bhawan</th>
                  <th style={styles.th}>Chief Warden Position ID</th>
                  <th style={styles.th}>Warden Position ID</th>
                  <th style={styles.th}>Office Ext</th>
                  <th style={styles.th}>Active Issues</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {svnitHostels.map((h) => {
                  const activeCount = complaints.filter(c => c.hostel_block === h.name && c.status !== 'Completed').length;
                  return (
                    <tr key={h.code}>
                      <td style={styles.td}><strong>{h.name}</strong></td>
                      <td style={styles.td}>
                        <code style={styles.codeBadge}>{h.cwId}</code>
                        <button onClick={() => setResetTarget(h.cwId)} style={styles.keyBtn} title="Reset Chief Warden Password">🔑</button>
                      </td>
                      <td style={styles.td}>
                        <code style={styles.codeBadge}>{h.wId}</code>
                        <button onClick={() => setResetTarget(h.wId)} style={styles.keyBtn} title="Reset Warden Password">🔑</button>
                      </td>
                      <td style={styles.td}>{h.ext}</td>
                      <td style={styles.td}>
                        <span style={{ color: activeCount > 0 ? '#fbbf24' : '#34d399', fontWeight: '800' }}>{activeCount} Open</span>
                      </td>
                      <td style={styles.td}>
                        <button onClick={() => setInspectedHostel(h.name)} style={styles.inspectDoorBtn}>📋 View Complaints</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: ISOLATED HOSTEL PORTAL (FOR CW_GAJJAR, W_GAJJAR, CW_BHABHA, ETC.)
  // =========================================================================
  const filteredComplaints = filterCat === 'All'
    ? complaints
    : complaints.filter(c => c.category === filterCat);

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <div>
          <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🏢 {user.hostel_block} — Official Administration Portal</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
            Position: <strong style={{ color: '#38bdf8' }}>{user.authority_title}</strong> • Onboarded Residents: <strong style={{ color: '#34d399' }}>{studentCount} / 50,000+ Capacity</strong>
          </p>
        </div>

        <div style={styles.pdfFilterBox}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={styles.dateInput} />
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={styles.dateInput} />
          <button onClick={() => handleDownloadPDF(user.hostel_block)} style={styles.pdfBtn}>
            📥 {user.hostel_block} PDF Report
          </button>
        </div>
      </div>

      {statusMsg && <div style={styles.alert}>{statusMsg}</div>}

      <div style={{ ...styles.card, marginBottom: '20px', borderLeft: '4px solid #3b82f6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '15px' }}>🎓 Onboard Students to {user.hostel_block}</h3>
            <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '12px' }}>Add a student below or upload a CSV (RollNo, Name, Floor, Room, Phone)</p>
          </div>
          <label style={styles.uploadBtn}>
            📄 1-Click Bulk CSV Upload
            <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
          </label>
        </div>

        <form onSubmit={handleAddSingleStudent} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <input type="text" placeholder="Roll No (e.g. U26CE055)" value={singleStudent.user_id} onChange={e => setSingleStudent({...singleStudent, user_id: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Student Full Name" value={singleStudent.full_name} onChange={e => setSingleStudent({...singleStudent, full_name: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Floor (e.g. 2nd Floor)" value={singleStudent.floor} onChange={e => setSingleStudent({...singleStudent, floor: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Room (e.g. B-208)" value={singleStudent.room} onChange={e => setSingleStudent({...singleStudent, room: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Phone Number" value={singleStudent.phone} onChange={e => setSingleStudent({...singleStudent, phone: e.target.value})} required style={styles.input} />
          <button type="submit" style={styles.saveBtn}>+ Add Student</button>
        </form>
      </div>

      <div style={styles.statsGrid}>
        {COMPLAINT_CATEGORIES.map(cat => {
          const count = complaints.filter(c => c.category === cat.id && c.status !== 'Completed').length;
          return (
            <div
              key={cat.id}
              onClick={() => setFilterCat(filterCat === cat.id ? 'All' : cat.id)}
              style={{ ...styles.statCard, borderColor: filterCat === cat.id ? '#38bdf8' : '#1e293b' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>{cat.icon}</span>
                <span style={{ fontSize: '20px', fontWeight: '800', color: cat.badgeColor }}>{count}</span>
              </div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc', marginTop: '6px' }}>{cat.title}</div>
            </div>
          );
        })}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>
            📋 {user.hostel_block} Grievance Register ({filteredComplaints.length})
          </h3>
          {filterCat !== 'All' && (
            <button onClick={() => setFilterCat('All')} style={styles.cancelBtn}>Show All Categories</button>
          )}
        </div>

        {filteredComplaints.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
            No grievances found for {user.hostel_block}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredComplaints.map(c => (
              <div key={c.ticket_id} style={{ ...styles.complaintCard, borderLeft: `4px solid ${getStatusColor(c.status)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <strong style={{ color: '#38bdf8', fontSize: '13px' }}>{c.ticket_id}</strong>
                    <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                    <strong style={{ color: '#f8fafc', fontSize: '13px' }}>{c.category}</strong>
                  </div>
                  <span style={{ color: getStatusColor(c.status), fontWeight: '700', fontSize: '12px' }}>{c.status}</span>
                </div>

                <div style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginTop: '6px' }}>{c.summary}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{c.description}</div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '8px', background: '#090d16', padding: '8px 12px', borderRadius: '8px' }}>
                  👤 <strong>{c.student_name}</strong> ({c.student_id}) • Room <strong>{c.room}</strong> ({c.floor}) • 📞 {c.phone}
                  <div style={{ color: '#64748b', marginTop: '4px' }}>Routed To: {c.routed_to} | Logged: {c.created_at}</div>
                  {c.staff_remark && <div style={{ color: '#38bdf8', marginTop: '4px' }}>💬 Staff Remark: {c.staff_remark}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1240px', margin: '0 auto', padding: '18px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '18px', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' },
  pdfFilterBox: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  dateInput: { background: '#030712', border: '1px solid #334155', color: '#cbd5e1', padding: '8px 10px', borderRadius: '8px', fontSize: '12px' },
  pdfBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '12px' },
  alert: { background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '16px', fontWeight: '600', fontSize: '13px' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '18px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
  td: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#e2e8f0', fontSize: '13px' },
  codeBadge: { background: '#030712', color: '#38bdf8', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '700' },
  keyBtn: { background: 'transparent', border: 'none', cursor: 'pointer', marginLeft: '6px', fontSize: '13px' },
  inspectDoorBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' },
  filterBtn: { background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' },
  uploadBtn: { background: '#10b981', color: '#fff', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  input: { background: '#030712', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  saveBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' },
  cancelBtn: { background: '#334155', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' },
  statCard: { background: '#0f172a', border: '2px solid', borderRadius: '14px', padding: '14px', cursor: 'pointer' },
  complaintCard: { background: '#030712', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' },
  modalCard: { background: '#0f172a', border: '1px solid #3b82f6', borderRadius: '16px', padding: '22px', width: '100%', maxWidth: '520px', boxShadow: '0 25px 50px rgba(0,0,0,0.8)' }
};