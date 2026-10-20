import React from 'react';

export default function Header({ user, tenant, onLogout }) {
  const isFounder = user.role === 'PlatformOwner';
  const displayTitle = user.authority_title || user.role;

  const getSubText = () => {
    if (isFounder) return 'Global Multi-Tenant Cloud • Root SaaS Console';
    if (user.role === 'Dean') return `${displayTitle} • All 10 Campus Hostels`;
    if (user.role === 'Warden') return `${displayTitle} • Isolated Hostel Portal`;
    if (user.role === 'DepartmentStaff') return `${displayTitle} • Campus Maintenance`;
    return `${user.hostel_block} • ${user.floor} • Room ${user.room}`;
  };

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.logoBadge}>HMS</div>
        <div>
          <h1 style={styles.instName}>
            {isFounder ? 'HMS Enterprise SaaS Cloud HQ' : tenant?.name || 'SVNIT Surat'}
          </h1>
          <p style={styles.subText}>{getSubText()}</p>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.userBox}>
          <div style={styles.avatar}>{user.user_id.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={styles.userName}>{user.full_name}</div>
            <div style={styles.userMeta}>
              Position ID: <code style={{ color: '#38bdf8', fontWeight: '700' }}>{user.user_id}</code>
            </div>
          </div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Sign Out</button>
      </div>
    </header>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#090d16', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '12px' },
  left: { display: 'flex', alignItems: 'center', gap: '12px' },
  logoBadge: { background: '#2563eb', color: '#fff', fontWeight: '800', fontSize: '15px', padding: '8px 12px', borderRadius: '10px' },
  instName: { margin: 0, fontSize: '15px', fontWeight: '700', color: '#f8fafc' },
  subText: { margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' },
  right: { display: 'flex', alignItems: 'center', gap: '12px' },
  userBox: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#1e293b', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '12px', border: '1px solid #334155' },
  userName: { fontSize: '13px', fontWeight: '600', color: '#f8fafc' },
  userMeta: { fontSize: '11px', color: '#94a3b8' },
  logoutBtn: { background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #7f1d1d', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
};