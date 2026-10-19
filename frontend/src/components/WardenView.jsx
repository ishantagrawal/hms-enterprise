import React, { useState } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const [filterCat, setFilterCat] = useState('All');
  const [uploadStatus, setUploadStatus] = useState(null);
  
  // Super Admin Check
  const isSuperAdmin = user.hostel_block === 'All';
  const [wForm, setWForm] = useState({ user_id: '', full_name: '', hostel_block: '', phone: '', email: '' });

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const lines = evt.target.result.split('\n').filter((l) => l.trim().length > 0);
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((s) => s.trim());
        if (cols.length >= 6) {
          parsed.push({
            user_id: cols[0], full_name: cols[1], hostel_block: cols[2], floor: cols[3], room: cols[4], phone: cols[5], email: cols[6] || `${cols[0].toLowerCase()}@svnit.ac.in`
          });
        }
      }
      const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) setUploadStatus(`✅ 1-Click Provisioning Complete! Created ${data.added} student logins.`);
    };
    reader.readAsText(file);
  };

  const handleCreateWarden = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/admin/create-warden?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wForm)
    });
    const data = await res.json();
    if (data.success) {
      setUploadStatus(`✅ ${data.message}`);
      setWForm({ user_id: '', full_name: '', hostel_block: '', phone: '', email: '' });
    }
  };

  const filtered = filterCat === 'All' ? complaints : complaints.filter((c) => c.category === filterCat);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : status === 'Reopened' ? '#f87171' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' }}>
      
      {/* Dynamic Header based on Authority */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#f8fafc' }}>
          {isSuperAdmin ? '🏛️ Campus Command Center (Super Admin)' : `🏢 ${user.hostel_block} Administration`}
        </h2>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
          {isSuperAdmin ? 'Overseeing all campus hostels. Create local wardens below.' : 'Manage your students and oversee localized grievances.'}
        </p>
      </div>

      <div style={styles.statsGrid}>
        {COMPLAINT_CATEGORIES.map((cat) => {
          const pendingCount = complaints.filter((c) => c.category === cat.id && c.status !== 'Completed').length;
          return (
            <div key={cat.id} onClick={() => setFilterCat(cat.id)} style={{ ...styles.statCard, borderColor: filterCat === cat.id ? cat.badgeColor : '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '22px' }}>{cat.icon}</span>
                <span style={{ fontSize: '26px', fontWeight: '800', color: cat.badgeColor }}>{pendingCount}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginTop: '8px' }}>{cat.title}</div>
            </div>
          );
        })}
      </div>

      {/* DYNAMIC CONTROL BAR: Super Admin vs Regular Warden */}
      <div style={styles.controlBox}>
        {isSuperAdmin ? (
          <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '16px' }}>🔐 Provision New Hostel Warden</h3>
            <form onSubmit={handleCreateWarden} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Warden ID (e.g. W02)" value={wForm.user_id} onChange={e => setWForm({...wForm, user_id: e.target.value})} required style={styles.input} />
              <input type="text" placeholder="Full Name" value={wForm.full_name} onChange={e => setWForm({...wForm, full_name: e.target.value})} required style={styles.input} />
              <input type="text" placeholder="Hostel Assigned" value={wForm.hostel_block} onChange={e => setWForm({...wForm, hostel_block: e.target.value})} required style={styles.input} />
              <input type="text" placeholder="Phone" value={wForm.phone} onChange={e => setWForm({...wForm, phone: e.target.value})} required style={styles.input} />
              <button type="submit" style={styles.adminBtn}>Create Warden Account</button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: '#f8fafc', fontSize: '16px' }}>⚡ 1-Click Hostel Student Generator</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>Upload your hostel CSV to generate student logins instantly.</p>
            </div>
            <label style={styles.uploadBtn}>📄 Upload CSV <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} /></label>
          </div>
        )}
        {uploadStatus && <div style={{ color: '#34d399', fontSize: '13px', fontWeight: '600', marginTop: '12px', width: '100%' }}>{uploadStatus}</div>}
      </div>

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc' }}>Master Grievance Register ({filtered.length})</h3>
          {filterCat !== 'All' && <button onClick={() => setFilterCat('All')} style={styles.clearBtn}>Show All Categories</button>}
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Ticket / CCC ID</th>
              <th style={styles.th}>Category & Dept</th>
              <th style={styles.th}>Student & Location</th>
              <th style={styles.th}>Issue Update</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.ticket_id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={styles.td}><strong>{c.ticket_id}</strong>{c.ccc_ticket_id && <div style={{ fontSize: '11px', color: '#60a5fa' }}>{c.ccc_ticket_id}</div>}</td>
                <td style={styles.td}><strong>{c.category}</strong><br /><span style={{ fontSize: '11px', color: '#94a3b8' }}>{c.routed_to}</span></td>
                <td style={styles.td}>{c.student_name}<br /><span style={{ fontSize: '12px', color: '#38bdf8' }}>{c.hostel_block} • {c.floor} • Rm {c.room}</span></td>
                <td style={styles.td}><strong>{c.summary}</strong>{c.staff_remark && <div style={{ fontSize: '11px', color: '#38bdf8', marginTop: '4px' }}>Note: {c.staff_remark}</div>}</td>
                <td style={styles.td}><span style={{ color: getStatusColor(c.status), fontWeight: '700', fontSize: '13px' }}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' },
  statCard: { background: '#0f172a', border: '2px solid', borderRadius: '16px', padding: '18px', cursor: 'pointer' },
  controlBox: { display: 'flex', flexWrap: 'wrap', background: '#0f172a', border: '1px solid #1e293b', borderLeft: '4px solid #a855f7', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px' },
  input: { background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', flex: 1, minWidth: '140px' },
  adminBtn: { background: '#a855f7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' },
  uploadBtn: { background: '#2563eb', color: '#fff', padding: '10px 18px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' },
  clearBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' },
  td: { padding: '14px 12px', color: '#e2e8f0', fontSize: '14px' }
};