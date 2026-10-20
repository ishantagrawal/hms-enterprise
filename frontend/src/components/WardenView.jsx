import React, { useState, useRef } from 'react';

export default function WardenView({ user, complaints, apiUrl }) {
  const [selectedHostel, setSelectedHostel] = useState('All');
  const [statusMsg, setStatusMsg] = useState(null);
  const [editWarden, setEditWarden] = useState(null);
  
  // Form with User ID and Password fields
  const [wForm, setWForm] = useState({ user_id: 'W_ROHIT', full_name: '', hostel_block: 'Gajjar Bhawan', phone: '', email: '', authority_title: 'Warden', password: '123' });

  const complaintsRef = useRef(null);

  const handleInspect = (hostelName) => {
    setSelectedHostel(hostelName);
    if (complaintsRef.current) {
      complaintsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const [hostels, setHostels] = useState([
    { name: "Bhabha Bhawan", userId: "W_BHABHA", chiefWarden: "Dr. Vikram P. Rathod", wardens: "Dr. Rajesh Choudhary", phone: "9876543210" },
    { name: "Gajjar Bhawan", userId: "W_ROHIT", chiefWarden: "Dr. Jogender Singh", wardens: "Dr. Rohit Kumar, Dr. S.K. Sundar", phone: "9876543211" },
    { name: "Mother Teresa Bhawan", userId: "W_MTB", chiefWarden: "Dr. Premlata Kumari", wardens: "Dr. Kirti Inamdar", phone: "9876543212" },
    { name: "Narmad Bhawan (Guest House)", userId: "W_NARMAD", chiefWarden: "Prof. Alka A. Mungray", wardens: "Guest House Wing", phone: "1652" },
    { name: "Nehru Bhawan", userId: "W_NEHRU", chiefWarden: "Dr. Deepak Joshi", wardens: "Dr. Raju Prasad Mahto", phone: "1703" },
    { name: "Raman Bhawan", userId: "W_RAMAN", chiefWarden: "Dr. Rohan Rahul Pande", wardens: "Assoc. Faculty", phone: "1789" },
    { name: "Sarabhai Bhawan", userId: "W_SARABHAI", chiefWarden: "Dr. Naresh Yarramsetty", wardens: "Dr. Sanjay Tolani", phone: "1793" },
    { name: "Swami Vivekananda Bhawan", userId: "W_SVB", chiefWarden: "Dr. G. C. Jadeja", wardens: "Dr. Amit Kumar", phone: "1657" },
    { name: "Tagore Bhawan", userId: "W_TAGORE", chiefWarden: "Dr. Vivek Garg", wardens: "Dr. Neeraj Srivastava", phone: "1707" },
    { name: "Atal Bihari Vajpayee Bhawan", userId: "W_ATAL", chiefWarden: "Dr. Jitesh T. Chavda", wardens: "Dr. Nitesh Funde", phone: "1880" },
  ]);

  const handleSaveWarden = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/admin/update-warden?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setHostels(hostels.map(h => h.name === wForm.hostel_block ? { ...h, userId: wForm.user_id, chiefWarden: wForm.full_name, phone: wForm.phone } : h));
      setEditWarden(null);
    } else {
      setStatusMsg(`❌ Error updating warden`);
    }
  };

  const filtered = selectedHostel === 'All' ? complaints : complaints.filter(c => c.hostel_block === selectedHostel);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🏛️ SVNIT Council of Wardens & Hostels Directory</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Manage hostel faculties and login credentials securely.</p>
        </div>
        <button onClick={() => window.open(`${apiUrl}/api/complaints/export-pdf?institute_id=${user.institute_id}&hostel_block=${selectedHostel}`, '_blank')} style={styles.pdfBtn}>
          📥 Download PDF Report ({selectedHostel})
        </button>
      </div>

      {statusMsg && <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '16px', fontWeight: '600' }}>{statusMsg}</div>}

      {/* Edit Warden Modal with User ID & Password */}
      {editWarden && (
        <div style={{ background: '#0f172a', border: '2px solid #3b82f6', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#60a5fa' }}>✏️ Update Warden Credentials for {wForm.hostel_block}</h3>
          <form onSubmit={handleSaveWarden} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <input type="text" placeholder="Login User ID (e.g. W_ROHIT)" value={wForm.user_id} onChange={e => setWForm({...wForm, user_id: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Warden Full Name" value={wForm.full_name} onChange={e => setWForm({...wForm, full_name: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Login Password" value={wForm.password} onChange={e => setWForm({...wForm, password: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Phone / Ext" value={wForm.phone} onChange={e => setWForm({...wForm, phone: e.target.value})} required style={styles.input} />
            <input type="email" placeholder="Email" value={wForm.email} onChange={e => setWForm({...wForm, email: e.target.value})} required style={styles.input} />
            <div style={{ display: 'flex', gap: '10px', gridColumn: '1 / -1' }}>
              <button type="submit" style={styles.saveBtn}>Save Login & Warden Info</button>
              <button type="button" onClick={() => setEditWarden(null)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Hostel Directory Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', marginBottom: '24px', overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '15px' }}>Official Hostel Faculty Directory</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hostel Name</th>
              <th style={styles.th}>Login ID & Chief Warden</th>
              <th style={styles.th}>Associated Wardens</th>
              <th style={styles.th}>Active Issues</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: selectedHostel === 'All' ? '#1e293b' : 'transparent' }}>
              <td style={styles.td}><strong>🌟 All Hostels Combined</strong></td>
              <td style={styles.td} colSpan="2">Dean Office / Council of Wardens</td>
              <td style={styles.td}><span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{complaints.filter(c => c.status !== 'Completed').length}</span></td>
              <td style={styles.td}><button onClick={() => handleInspect('All')} style={styles.filterBtn}>View All</button></td>
            </tr>
            {hostels.map((h, i) => {
              const activeCount = complaints.filter(c => c.hostel_block === h.name && c.status !== 'Completed').length;
              return (
                <tr key={i} style={{ background: selectedHostel === h.name ? '#1e293b' : 'transparent' }}>
                  <td style={styles.td}><strong>{h.name}</strong></td>
                  <td style={styles.td}><code style={{ color: '#38bdf8', background: '#030712', padding: '2px 6px', borderRadius: '4px' }}>{h.userId}</code> <br/><span style={{ color: '#60a5fa', fontWeight: '600' }}>{h.chiefWarden}</span></td>
                  <td style={styles.td}><span style={{ color: '#cbd5e1', fontSize: '12px' }}>{h.wardens}</span></td>
                  <td style={styles.td}><span style={{ color: activeCount > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold' }}>{activeCount}</span></td>
                  <td style={styles.td}>
                    <button onClick={() => handleInspect(h.name)} style={{...styles.filterBtn, marginRight: '6px'}}>Inspect</button>
                    <button onClick={() => { setWForm({ hostel_block: h.name, user_id: h.userId, full_name: h.chiefWarden, phone: h.phone, email: '', authority_title: 'Warden', password: '123' }); setEditWarden(true); }} style={styles.editBtn}>✏️ Credentials</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Complaints Section */}
      <div ref={complaintsRef} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', scrollMarginTop: '20px' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '15px' }}>
          Grievance Register — <span style={{ color: '#38bdf8' }}>{selectedHostel}</span> ({filtered.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No active grievances for {selectedHostel}.</p>
          ) : (
            filtered.map((c) => (
              <div key={c.ticket_id} style={{ background: '#030712', border: '1px solid #1e293b', borderLeft: `4px solid ${getStatusColor(c.status)}`, borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#38bdf8' }}>{c.ticket_id}</span>
                    <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{c.category}</span>
                  </div>
                  <span style={{ color: getStatusColor(c.status), fontWeight: '700', fontSize: '12px' }}>{c.status}</span>
                </div>
                <div style={{ fontSize: '14px', color: '#e2e8f0', marginTop: '6px', fontWeight: '600' }}>{c.summary}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>👤 {c.student_name} ({c.hostel_block} • Rm {c.room})</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' -> Routed to: {c.routed_to} | Logged: {c.created_at}</div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

const styles = {
  pdfBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' },
  td: { padding: '12px', color: '#e2e8f0', fontSize: '13px', borderBottom: '1px solid #1e293b' },
  filterBtn: { background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' },
  editBtn: { background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid #3b82f6', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' },
  input: { background: '#030712', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  saveBtn: { background: '#10b981', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' },
  cancelBtn: { background: '#334155', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }
};