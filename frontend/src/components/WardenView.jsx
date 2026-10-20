import React, { useState, useRef } from 'react';

export default function WardenView({ user, complaints, apiUrl }) {
  const [selectedHostel, setSelectedHostel] = useState('All');
  const [statusMsg, setStatusMsg] = useState(null);
  const [editWarden, setEditWarden] = useState(null);
  const [wForm, setWForm] = useState({ hostel_block: 'Bhabha Bhawan', chief_warden: '', wardens: '', phone: '' });

  const complaintsRef = useRef(null);

  const handleInspect = (hostelName) => {
    setSelectedHostel(hostelName);
    if (complaintsRef.current) {
      complaintsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Complete SVNIT Council of Wardens (Chief Warden + Wardens per hostel)
  const [hostels, setHostels] = useState([
    { name: "Bhabha Bhawan", chiefWarden: "Dr. Vikram P. Rathod", wardens: "Dr. Rajesh Choudhary, Dr. Regi Philip, Dr. Vishesh P. Gaikwad", phone: "9876543210" },
    { name: "Gajjar Bhawan", chiefWarden: "Dr. Jogender Singh", wardens: "Dr. Basant Kumar Sethi, Dr. Rohit Kumar, Dr. S.K. Sundar", phone: "9876543211" },
    { name: "Mother Teresa Bhawan", chiefWarden: "Dr. Premlata Kumari", wardens: "Dr. Gangireddy Sushnigdha, Dr. Tamizharasi G, Dr. Kirti Inamdar", phone: "9876543212" },
    { name: "Narmad Bhawan (Guest House)", chiefWarden: "Prof. Alka A. Mungray", wardens: "Guest House Caretaker Wing", phone: "1652" },
    { name: "Nehru Bhawan", chiefWarden: "Dr. Deepak Joshi", wardens: "Dr. Raju Prasad Mahto", phone: "1703" },
    { name: "Raman Bhawan", chiefWarden: "Dr. Rohan Rahul Pande", wardens: "Assoc. Warden Faculty Wing", phone: "1789" },
    { name: "Sarabhai Bhawan", chiefWarden: "Dr. Naresh Yarramsetty", wardens: "Dr. Sanjay Tolani", phone: "1793" },
    { name: "Swami Vivekananda Bhawan", chiefWarden: "Dr. G. C. Jadeja", wardens: "Dr. Ram Singar Yadav, Dr. Amit Kumar", phone: "1657" },
    { name: "Tagore Bhawan", chiefWarden: "Dr. Vivek Garg", wardens: "Dr. Neeraj Srivastava", phone: "1707" },
    { name: "Atal Bihari Vajpayee Bhawan", chiefWarden: "Dr. Jitesh T. Chavda", wardens: "Dr. Nitesh Funde", phone: "1880" },
  ]);

  const handleSaveWarden = (e) => {
    e.preventDefault();
    setHostels(hostels.map(h => h.name === wForm.hostel_block ? { ...h, chiefWarden: wForm.chief_warden, wardens: wForm.wardens, phone: wForm.phone } : h));
    setStatusMsg(`✅ Successfully updated Council of Wardens for ${wForm.hostel_block}!`);
    setEditWarden(null);
  };

  const filtered = selectedHostel === 'All' ? complaints : complaints.filter(c => c.hostel_block === selectedHostel);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🏛️ SVNIT Council of Wardens & Hostels Directory</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Complete faculty hierarchy with Chief Wardens & Wardens per hostel.</p>
        </div>
        <button onClick={() => window.open(`${apiUrl}/api/complaints/export-pdf?institute_id=${user.institute_id}&hostel_block=${selectedHostel}`, '_blank')} style={styles.pdfBtn}>
          📥 Download PDF Report ({selectedHostel})
        </button>
      </div>

      {statusMsg && <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '16px', fontWeight: '600' }}>{statusMsg}</div>}

      {/* Edit Warden Modal */}
      {editWarden && (
        <div style={{ background: '#0f172a', border: '2px solid #3b82f6', borderRadius: '16px', padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#60a5fa' }}>✏️ Update Council for {wForm.hostel_block}</h3>
          <form onSubmit={handleSaveWarden} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <input type="text" placeholder="Chief Warden Name" value={wForm.chief_warden} onChange={e => setWForm({...wForm, chief_warden: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Wardens (Comma separated)" value={wForm.wardens} onChange={e => setWForm({...wForm, wardens: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Contact Phone / Ext" value={wForm.phone} onChange={e => setWForm({...wForm, phone: e.target.value})} required style={styles.input} />
            <div style={{ display: 'flex', gap: '10px', gridColumn: '1 / -1' }}>
              <button type="submit" style={styles.saveBtn}>Save Council</button>
              <button type="button" onClick={() => setEditWarden(null)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Hostel Directory Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', marginBottom: '24px', overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '15px' }}>Official Hostel Faculty Directory (Chief Wardens & Wardens)</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hostel Name</th>
              <th style={styles.th}>Chief Warden</th>
              <th style={styles.th}>Associated Wardens</th>
              <th style={styles.th}>Active Issues</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: selectedHostel === 'All' ? '#1e293b' : 'transparent' }}>
              <td style={styles.td}><strong>🌟 All Hostels Combined</strong></td>
              <td style={styles.td} colSpan="2">Dean Office / Council of Wardens (CoW)</td>
              <td style={styles.td}><span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{complaints.filter(c => c.status !== 'Completed').length}</span></td>
              <td style={styles.td}><button onClick={() => handleInspect('All')} style={styles.filterBtn}>View All</button></td>
            </tr>
            {hostels.map((h, i) => {
              const activeCount = complaints.filter(c => c.hostel_block === h.name && c.status !== 'Completed').length;
              return (
                <tr key={i} style={{ background: selectedHostel === h.name ? '#1e293b' : 'transparent' }}>
                  <td style={styles.td}><strong>{h.name}</strong></td>
                  <td style={styles.td}><span style={{ color: '#60a5fa', fontWeight: '600' }}>{h.chiefWarden}</span></td>
                  <td style={styles.td}><span style={{ color: '#cbd5e1', fontSize: '12px' }}>{h.wardens}</span></td>
                  <td style={styles.td}><span style={{ color: activeCount > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold' }}>{activeCount}</span></td>
                  <td style={styles.td}>
                    <button onClick={() => handleInspect(h.name)} style={{...styles.filterBtn, marginRight: '6px'}}>Inspect</button>
                    <button onClick={() => { setWForm({ hostel_block: h.name, chief_warden: h.chiefWarden, wardens: h.wardens, phone: h.phone }); setEditWarden(true); }} style={styles.editBtn}>✏️ Change</button>
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
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Routed to: {c.routed_to} | Logged: {c.created_at}</div>
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