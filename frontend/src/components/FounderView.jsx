import React, { useState, useEffect } from 'react';

export default function FounderView({ user, apiUrl }) {
  const [tenants, setTenants] = useState([]);
  const [collegeForm, setCollegeForm] = useState({
    institute_id: '', institute_name: '', dean_user_id: '', dean_password: '', dean_phone: '', dean_email: ''
  });
  const [msg, setMsg] = useState(null);

  const loadTenants = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/founder/tenants`);
      if (res.ok) setTenants(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleOnboard = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/founder/onboard-college?founder_id=${user.user_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(collegeForm)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setCollegeForm({ institute_id: '', institute_name: '', dean_user_id: '', dean_password: '', dean_phone: '', dean_email: '' });
      loadTenants();
    } else {
      setMsg(`❌ ${data.detail || 'Failed to onboard institute'}`);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
      <div style={styles.banner}>
        <h2 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '20px' }}>🌍 HMS SaaS Founder Console</h2>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
          Isolated Platform Owner View — Onboard new NITs/IITs and generate their Master Dean position accounts.
        </p>
      </div>

      {msg && <div style={styles.alert}>{msg}</div>}

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '16px' }}>🏢 Active Onboarded Institutes ({tenants.length})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Tenant Code</th>
                <th style={styles.th}>Institute Name</th>
                <th style={styles.th}>Hostels</th>
                <th style={styles.th}>Active Students</th>
                <th style={styles.th}>Master Dean Position ID</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.institute_id}>
                  <td style={styles.td}><strong style={{ color: '#38bdf8' }}>{t.institute_id}</strong></td>
                  <td style={styles.td}>{t.name}</td>
                  <td style={styles.td}>{t.hostel_count} Hostels</td>
                  <td style={styles.td}>{t.student_count} / 50,000+</td>
                  <td style={styles.td}><code>{t.dean_id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: '20px' }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '16px' }}>🚀 Onboard New College / University</h3>
        <form onSubmit={handleOnboard} style={styles.gridForm}>
          <input type="text" placeholder="Institute Code (e.g. MNIT, IITB)" value={collegeForm.institute_id} onChange={e => setCollegeForm({...collegeForm, institute_id: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Full Institute Name (e.g. MNIT Jaipur)" value={collegeForm.institute_name} onChange={e => setCollegeForm({...collegeForm, institute_name: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Dean Position ID (e.g. DEAN_MNIT)" value={collegeForm.dean_user_id} onChange={e => setCollegeForm({...collegeForm, dean_user_id: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Initial Dean Password" value={collegeForm.dean_password} onChange={e => setCollegeForm({...collegeForm, dean_password: e.target.value})} required style={styles.input} />
          <input type="text" placeholder="Official Dean Office Phone" value={collegeForm.dean_phone} onChange={e => setCollegeForm({...collegeForm, dean_phone: e.target.value})} required style={styles.input} />
          <input type="email" placeholder="Official Dean Email" value={collegeForm.dean_email} onChange={e => setCollegeForm({...collegeForm, dean_email: e.target.value})} required style={styles.input} />
          <button type="submit" style={styles.btn}>+ Provision Institute & Create Dean Portal</button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  banner: { background: '#0f172a', border: '1px solid #1e293b', borderLeft: '4px solid #10b981', borderRadius: '14px', padding: '18px', marginBottom: '18px' },
  alert: { background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', marginBottom: '16px', fontWeight: '600', fontSize: '13px' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  th: { padding: '10px', borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' },
  td: { padding: '12px 10px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0' },
  gridForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' },
  input: { background: '#030712', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: '#fff', fontSize: '13px' },
  btn: { background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontWeight: '700', cursor: 'pointer', gridColumn: '1 / -1', fontSize: '14px' }
};