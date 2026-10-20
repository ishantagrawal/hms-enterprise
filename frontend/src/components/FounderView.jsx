import React, { useState } from 'react';

export default function FounderView({ user, apiUrl }) {
  const [collegeForm, setCollegeForm] = useState({
    institute_id: '', institute_name: '', dean_user_id: '', dean_name: '', dean_password: '', dean_phone: '', dean_email: ''
  });
  const [msg, setMsg] = useState(null);

  const handleOnboard = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/founder/onboard-college?founder_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collegeForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setCollegeForm({ institute_id: '', institute_name: '', dean_user_id: '', dean_name: '', dean_password: '', dean_phone: '', dean_email: '' });
    } else {
      setMsg(`❌ ${data.detail || 'Failed'}`);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>🌍 Global SaaS Founder Command Center</h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>Onboard new universities and provision Master Dean accounts.</p>
      </div>

      {msg && <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '20px', fontWeight: '600' }}>{msg}</div>}

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#f8fafc' }}>+ Onboard New College Tenant</h3>
        <form onSubmit={handleOnboard} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
          <input type="text" placeholder="College Code (e.g. MNIT)" value={collegeForm.institute_id} onChange={e => setCollegeForm({...collegeForm, institute_id: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Full College Name (e.g. MNIT Jaipur)" value={collegeForm.institute_name} onChange={e => setCollegeForm({...collegeForm, institute_name: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Dean User ID (e.g. DEAN_MNIT)" value={collegeForm.dean_user_id} onChange={e => setCollegeForm({...collegeForm, dean_user_id: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Dean Full Name" value={collegeForm.dean_name} onChange={e => setCollegeForm({...collegeForm, dean_name: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Strong Password (!@#\$)" value={collegeForm.dean_password} onChange={e => setCollegeForm({...collegeForm, dean_password: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Dean Phone" value={collegeForm.dean_phone} onChange={e => setCollegeForm({...collegeForm, dean_phone: e.target.value})} required style={styles.input} />
          <input type="email" placeholder="Dean Email" value={collegeForm.dean_email} onChange={e => setCollegeForm({...collegeForm, dean_email: e.target.value})} required style={styles.input} />
          <button type="submit" style={styles.btn}>🚀 Launch College & Create Dean</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  input: { background: '#030712', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px' },
  btn: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontWeight: '700', cursor: 'pointer', gridColumn: '1 / -1' }
};