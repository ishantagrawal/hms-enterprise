import React, { useState } from 'react';

export default function WardenView({ user, complaints, apiUrl }) {
  const [selectedHostel, setSelectedHostel] = useState('All');
  const [statusMsg, setStatusMsg] = useState(null);

  // Predefined Hostels for SVNIT (Expandable to 10+)
  const hostels = [
    { name: "Gajjar Bhawan", warden: "Dr. R. Patel", phone: "9876543210", activeIssues: complaints.filter(c => c.hostel_block === 'Gajjar Bhawan' && c.status !== 'Completed').length },
    { name: "Bhabha Bhawan", warden: "Dr. S. Kumar", phone: "9876543220", activeIssues: complaints.filter(c => c.hostel_block === 'Bhabha Bhawan' && c.status !== 'Completed').length },
    { name: "Swami Vivekananda Bhawan", warden: "Dr. M. Sharma", phone: "9876543221", activeIssues: 0 },
    { name: "Mother Teresa Bhawan", warden: "Dr. A. Verma", phone: "9876543222", activeIssues: 0 },
  ];

  const filtered = selectedHostel === 'All' ? complaints : complaints.filter(c => c.hostel_block === selectedHostel);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>🏛️ Campus Hostel Matrix & Warden Directory</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>Click any hostel below to inspect localized complaints instantly.</p>
        </div>
        <button onClick={() => window.open(`${apiUrl}/api/complaints/export-pdf?institute_id=${user.institute_id}&hostel_block=${selectedHostel}`, '_blank')} style={styles.pdfBtn}>
          📥 Download PDF ({selectedHostel})
        </button>
      </div>

      {/* Hostel Directory Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', marginBottom: '24px', overflowX: 'auto' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '15px' }}>Hostel Blocks & Assigned Wardens</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Hostel Block</th>
              <th style={styles.th}>Warden In-Charge</th>
              <th style={styles.th}>Contact</th>
              <th style={styles.th}>Active Issues</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: selectedHostel === 'All' ? '#1e293b' : 'transparent', cursor: 'pointer' }} onClick={() => setSelectedHostel('All')}>
              <td style={styles.td}><strong>🌟 All Campus Hostels</strong></td>
              <td style={styles.td}>Dean Office / Chief Warden</td>
              <td style={styles.td}>9876543222</td>
              <td style={styles.td}><span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{complaints.filter(c => c.status !== 'Completed').length}</span></td>
              <td style={styles.td}><button style={styles.filterBtn}>View All</button></td>
            </tr>
            {hostels.map((h, i) => (
              <tr key={i} style={{ background: selectedHostel === h.name ? '#1e293b' : 'transparent', cursor: 'pointer' }} onClick={() => setSelectedHostel(h.name)}>
                <td style={styles.td}><strong>{h.name}</strong></td>
                <td style={styles.td}>{h.warden}</td>
                <td style={styles.td}>{h.phone}</td>
                <td style={styles.td}><span style={{ color: h.activeIssues > 0 ? '#fbbf24' : '#34d399', fontWeight: 'bold' }}>{h.activeIssues}</span></td>
                <td style={styles.td}><button style={styles.filterBtn}>Inspect Hostel</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Complaints for Selected Hostel */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '15px' }}>
          Grievance Register — <span style={{ color: '#38bdf8' }}>{selectedHostel}</span> ({filtered.length})
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No grievances found for {selectedHostel}.</p>
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
  filterBtn: { background: '#1e293b', color: '#38bdf8', border: '1px solid #334155', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }
};