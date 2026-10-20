import React, { useState, useEffect } from 'react';

export default function FounderView({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('colleges');
  const [tenants, setTenants] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [msg, setMsg] = useState(null);
  const [collegeForm, setCollegeForm] = useState({
    institute_id: '', institute_name: '', dean_user_id: '', dean_password: '', dean_phone: '', dean_email: ''
  });

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
      setShowAddModal(false);
      loadTenants();
    } else {
      setMsg(`❌ ${data.detail || 'Failed'}`);
    }
  };

  return (
    <div style={styles.appWrapper}>
      {msg && <div style={styles.toast} onClick={() => setMsg(null)}>{msg}</div>}

      {activeTab === 'colleges' && (
        <div style={styles.tabContent}>
          <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: '700', marginBottom: '10px', textTransform: 'uppercase' }}>
            Active University Tenants ({tenants.length})
          </div>

          <div style={styles.listContainer}>
            {tenants.map((t) => (
              <div key={t.institute_id} style={styles.chatRow}>
                <div style={styles.rowAvatar}>🏛️</div>
                <div style={styles.rowCenter}>
                  <div style={styles.rowTopLine}>
                    <span style={styles.rowTitle}>{t.name}</span>
                    <span style={styles.codePill}>{t.institute_id}</span>
                  </div>
                  <div style={styles.rowBottomLine}>
                    <span style={styles.rowSub}>
                      Dean Portal: {t.dean_id} • {t.hostel_count} Hostels
                    </span>
                    <span style={{ color: '#4ade80', fontSize: '11px', fontWeight: '700' }}>
                      {t.student_count} Students
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={() => setShowAddModal(true)} style={styles.fabBtn} title="Onboard New College">
            +
          </button>
        </div>
      )}

      {activeTab === 'profile' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc' }}>HMS Global SaaS Root</h3>
            <p style={{ margin: '0 0 14px 0', color: '#4ade80', fontSize: '13px', fontWeight: '700' }}>
              Founder ID: {user.user_id}
            </p>
            <div style={styles.detailBox}>
              <div><strong>Onboarded Colleges:</strong> {tenants.length}</div>
              <div style={{ marginTop: '6px' }}><strong>Per-College Student Capacity:</strong> 50,000+</div>
              <div style={{ marginTop: '6px' }}><strong>Architecture:</strong> Multi-Tenant Isolated Position ERP</div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px' }}>🚀 Onboard New University</h3>
              <button onClick={() => setShowAddModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleOnboard} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Institute Code (e.g. MNIT, IITB)" value={collegeForm.institute_id} onChange={(e) => setCollegeForm({ ...collegeForm, institute_id: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Full University Name" value={collegeForm.institute_name} onChange={(e) => setCollegeForm({ ...collegeForm, institute_name: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Dean Position ID (e.g. DEAN_MNIT)" value={collegeForm.dean_user_id} onChange={(e) => setCollegeForm({ ...collegeForm, dean_user_id: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Initial Dean Password" value={collegeForm.dean_password} onChange={(e) => setCollegeForm({ ...collegeForm, dean_password: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Dean Office Phone" value={collegeForm.dean_phone} onChange={(e) => setCollegeForm({ ...collegeForm, dean_phone: e.target.value })} required style={styles.input} />
              <input type="email" placeholder="Official Dean Email" value={collegeForm.dean_email} onChange={(e) => setCollegeForm({ ...collegeForm, dean_email: e.target.value })} required style={styles.input} />
              <button type="submit" style={styles.primaryBtn}>+ Launch College & Create Dean</button>
            </form>
          </div>
        </div>
      )}

      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('colleges')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'colleges' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🌍</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'colleges' ? '#f8fafc' : '#94a3b8' }}>Colleges</span>
        </button>

        <button onClick={() => setActiveTab('profile')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'profile' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>👤</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'profile' ? '#f8fafc' : '#94a3b8' }}>SaaS Info</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  codePill: { background: '#1e293b', color: '#38bdf8', fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px' },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  fabBtn: { position: 'fixed', right: '20px', bottom: '88px', width: '56px', height: '56px', borderRadius: '16px', background: '#22c55e', color: '#052e16', border: 'none', fontSize: '30px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 8px 20px rgba(34, 197, 94, 0.4)' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', fontSize: '13px', color: '#cbd5e1' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '460px' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' }
};