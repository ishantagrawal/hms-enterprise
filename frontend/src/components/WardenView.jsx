import React, { useState } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const [filterCat, setFilterCat] = useState('All');
  const [statusMsg, setStatusMsg] = useState(null);

  const isFounder = user.authority_title === 'HMS Platform Founder';
  const isSuperAdmin = user.hostel_block === 'All';

  // Forms
  const [collegeForm, setCollegeForm] = useState({
    institute_id: '', institute_name: '', dean_user_id: '', dean_name: '', dean_password: '', dean_phone: '', dean_email: ''
  });
  const [wForm, setWForm] = useState({
    user_id: '', full_name: '', authority_type: 'Local Warden', hostel_block: '', phone: '', email: '', password: ''
  });
  const [passForm, setPassForm] = useState({ target_user_id: '', new_password: '' });

  const handleOnboardCollege = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/founder/onboard-college?founder_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collegeForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setCollegeForm({ institute_id: '', institute_name: '', dean_user_id: '', dean_name: '', dean_password: '', dean_phone: '', dean_email: '' });
    } else {
      setStatusMsg(`❌ ${data.detail || 'Failed to onboard college'}`);
    }
  };

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
          parsed.push({ user_id: cols[0], full_name: cols[1], hostel_block: cols[2], floor: cols[3], room: cols[4], phone: cols[5], email: cols[6] || `${cols[0]}@svnit.ac.in` });
        }
      }
      const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) setStatusMsg(`✅ 1-Click Provisioning Complete! Created ${data.added} student logins.`);
    };
    reader.readAsText(file);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/admin/create-admin?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setWForm({ user_id: '', full_name: '', authority_type: 'Local Warden', hostel_block: '', phone: '', email: '', password: '' });
    } else {
      setStatusMsg(`❌ ${data.detail || 'Error creating account'}`);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/admin/change-password?admin_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(passForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`🔐 ${data.message}`);
      setPassForm({ target_user_id: '', new_password: '' });
    } else {
      setStatusMsg(`❌ Error: ${data.detail}`);
    }
  };

  const filtered = filterCat === 'All' ? complaints : complaints.filter((c) => c.category === filterCat);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 32px' }}>
      
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: '#f8fafc' }}>
          {isFounder ? '🌍 HMS Enterprise — Founder Multi-College Provisioning' : isSuperAdmin ? `🏛️ ${user.authority_title || 'Campus'} Command Center` : `🏢 ${user.hostel_block} Administration`}
        </h2>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
          {isFounder ? 'Onboard new NITs/IITs and generate Master Dean accounts.' : isSuperAdmin ? 'Create Chief Wardens, Associate Deans, Hostel Wardens & manage security.' : 'Manage your hostel students and localized grievances.'}
        </p>
      </div>

      {/* FOUNDEREXCLUSIVE: ONBOARD NEW COLLEGE & DEAN */}
      {isFounder && (
        <div style={{ ...styles.controlBox, borderLeft: '4px solid #10b981', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#34d399', fontSize: '16px' }}>🚀 Onboard New College / University & Provision Dean (SaaS Root)</h3>
          <form onSubmit={handleOnboardCollege} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            <input type="text" placeholder="College Code (e.g. MNIT, IITB)" value={collegeForm.institute_id} onChange={e => setCollegeForm({...collegeForm, institute_id: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Full College Name (e.g. MNIT Jaipur)" value={collegeForm.institute_name} onChange={e => setCollegeForm({...collegeForm, institute_name: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="New Dean User ID (e.g. DEAN_MNIT)" value={collegeForm.dean_user_id} onChange={e => setCollegeForm({...collegeForm, dean_user_id: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Dean Full Name" value={collegeForm.dean_name} onChange={e => setCollegeForm({...collegeForm, dean_name: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Strong Password (e.g. MnitDean@2026!)" value={collegeForm.dean_password} onChange={e => setCollegeForm({...collegeForm, dean_password: e.target.value})} required style={styles.input} />
            <input type="text" placeholder="Dean Phone" value={collegeForm.dean_phone} onChange={e => setCollegeForm({...collegeForm, dean_phone: e.target.value})} required style={styles.input} />
            <input type="email" placeholder="Dean Official Email" value={collegeForm.dean_email} onChange={e => setCollegeForm({...collegeForm, dean_email: e.target.value})} required style={styles.input} />
            <button type="submit" style={{ ...styles.adminBtn, background: '#10b981' }}>+ Launch College & Create Dean</button>
          </form>
        </div>
      )}

      {isSuperAdmin ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
          <div style={styles.controlBox}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '16px' }}>🛡️ Provision Campus Authority</h3>
            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <select value={wForm.authority_type} onChange={e => setWForm({...wForm, authority_type: e.target.value})} style={styles.input}>
                  <option value="Local Warden">Local Hostel Warden</option>
                  <option value="Chief Warden">Chief Warden (Campus Wide)</option>
                  <option value="Associate Dean">Associate Dean (Campus Wide)</option>
                </select>
                <input type="text" placeholder="User ID (e.g. W02 or CW02)" value={wForm.user_id} onChange={e => setWForm({...wForm, user_id: e.target.value})} required style={styles.input} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" placeholder="Full Name" value={wForm.full_name} onChange={e => setWForm({...wForm, full_name: e.target.value})} required style={styles.input} />
                <input type="text" placeholder="Hostel (e.g. Bhabha Bhawan)" value={wForm.hostel_block} onChange={e => setWForm({...wForm, hostel_block: e.target.value})} disabled={wForm.authority_type !== 'Local Warden'} style={{...styles.input, opacity: wForm.authority_type !== 'Local Warden' ? 0.4 : 1}} />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="text" placeholder="Phone Number" value={wForm.phone} onChange={e => setWForm({...wForm, phone: e.target.value})} required style={styles.input} />
                <input type="text" placeholder="Initial Password (Optional)" value={wForm.password} onChange={e => setWForm({...wForm, password: e.target.value})} style={styles.input} />
              </div>
              <button type="submit" style={styles.adminBtn}>Create Authority Account</button>
            </form>
          </div>

          <div style={{...styles.controlBox, borderLeft: '4px solid #ef4444'}}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '16px' }}>🔐 Override User Password</h3>
            <p style={{ margin: '0 0 12px 0', color: '#94a3b8', fontSize: '12px' }}>Reset password for any Dean, Chief Warden, Assoc. Dean, Warden, or Student.</p>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Target User ID (e.g. CW01, W01, U26CE011)" value={passForm.target_user_id} onChange={e => setPassForm({...passForm, target_user_id: e.target.value})} required style={styles.input} />
              <input type="text" placeholder="New Password (8+ chars & !@#\$ for Super Admins)" value={passForm.new_password} onChange={e => setPassForm({...passForm, new_password: e.target.value})} required style={styles.input} />
              <button type="submit" style={{...styles.adminBtn, background: '#ef4444'}}>Force Password Reset</button>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ ...styles.controlBox, marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', color: '#f8fafc', fontSize: '16px' }}>⚡ 1-Click Hostel Student Generator</h3>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>Upload your hostel CSV to generate student logins instantly.</p>
            </div>
            <label style={styles.uploadBtn}>📄 Upload CSV <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} /></label>
          </div>
        </div>
      )}

      {statusMsg && <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '8px', color: statusMsg.includes('❌') ? '#f87171' : '#34d399', fontSize: '14px', fontWeight: '600', marginBottom: '24px' }}>{statusMsg}</div>}

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 16px 0', color: '#f8fafc' }}>Master Grievance Register ({filtered.length})</h3>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Ticket</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Student & Hostel</th>
              <th style={styles.th}>Issue</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.ticket_id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={styles.td}><strong>{c.ticket_id}</strong></td>
                <td style={styles.td}><strong>{c.category}</strong></td>
                <td style={styles.td}>{c.student_name} <br/><span style={{fontSize:'12px', color:'#38bdf8'}}>{c.hostel_block} • Rm {c.room}</span></td>
                <td style={styles.td}>{c.summary}</td>
                <td style={styles.td}><span style={{ color: getStatusColor(c.status), fontWeight: '700' }}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  controlBox: { background: '#0f172a', border: '1px solid #1e293b', borderLeft: '4px solid #a855f7', borderRadius: '16px', padding: '20px' },
  input: { background: '#090d16', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px', color: '#fff', fontSize: '13px', width: '100%', boxSizing: 'border-box' },
  adminBtn: { background: '#a855f7', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', width: '100%' },
  uploadBtn: { background: '#2563eb', color: '#fff', padding: '10px 18px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '24px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '12px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '12px' },
  td: { padding: '14px 12px', color: '#e2e8f0', fontSize: '14px' }
};