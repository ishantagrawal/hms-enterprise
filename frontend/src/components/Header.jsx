import React from 'react';

export default function Header({ user, tenant, onLogout }) {
  const isFounder = user.role === 'PlatformOwner' || user.user_id === 'FOUNDER';
  const displayTitle = user.authority_title || user.role;

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.logoBadge}>HMS</div>
        <div>
          <h1 style={styles.instName}>{isFounder ? 'HMS Enterprise Global SaaS HQ' : tenant?.name}</h1>
          <p style={styles.subText}>{isFounder ? 'Platform Owner • Multi-Tenant Control Center' : `${displayTitle} • ${user.hostel_block}`}</p>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.userBox}>
          <div style={styles.avatar}>
            {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={styles.userName}>{user.full_name}</div>
            <div style={styles.userMeta}>{user.user_id} • <span style={{ color: '#38bdf8', fontWeight: '600' }}>{displayTitle}</span></div>
          </div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Sign Out</button>
      </div>
    </header>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: '#090d16', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '16px', fontFamily: 'system-ui, -apple-system, sans-serif', WebkitFontSmoothing: 'antialiased' },
  left: { display: 'flex', alignItems: 'center', gap: '14px' },
  logoBadge: { background: '#2563eb', color: '#fff', fontWeight: '800', fontSize: '16px', padding: '8px 12px', borderRadius: '10px' },
  instName: { margin: 0, fontSize: '16px', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.2px' },
  subText: { margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' },
  right: { display: 'flex', alignItems: 'center', gap: '16px' },
  userBox: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#1e293b', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px' },
  userName: { fontSize: '14px', fontWeight: '600', color: '#f8fafc' },
  userMeta: { fontSize: '11px', color: '#94a3b8' },
  logoutBtn: { background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
};