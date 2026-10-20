import React from 'react';

export default function Header({ user, tenant, onLogout }) {
  const displayTitle = user.authority_title || user.role;

  const getSubHeader = () => {
    if (user.role === 'PlatformOwner') return 'Global Multi-Tenant Founder Console • All Institutes';
    if (user.role === 'Student') return `${user.hostel_block} • ${user.floor} • Room ${user.room}`;
    if (user.role === 'DepartmentStaff') return `${user.department} Maintenance Wing`;
    if (user.hostel_block === 'All') return `${displayTitle} Office • Campus-Wide Command`;
    return `${displayTitle} Administration • ${user.hostel_block}`;
  };

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.logoBadge}>HMS</div>
        {tenant?.logo_url && (
          <img src={tenant.logo_url} alt="Institute Logo" style={styles.instLogo} />
        )}
        <div>
          <h1 style={styles.instName}>
            {user.role === 'PlatformOwner' ? 'HMS Enterprise Cloud (SaaS Root)' : tenant?.name}
          </h1>
          <p style={styles.subText}>{getSubHeader()}</p>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.pilotBadge}>
          <span style={styles.dot}></span>
          {user.role === 'PlatformOwner' ? 'Root SaaS Engine Active' : 'Phase 1: Grievance Pilot Active'}
        </div>

        <div style={styles.userBox}>
          <div style={styles.avatar}>
            {user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={styles.userName}>{user.full_name}</div>
            <div style={styles.userMeta}>
              {user.user_id} • <span style={{ color: '#38bdf8', fontWeight: '600' }}>{displayTitle}</span>
            </div>
          </div>
        </div>

        <button onClick={onLogout} style={styles.logoutBtn}>Sign Out</button>
      </div>
    </header>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#090d16', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '16px' },
  left: { display: 'flex', alignItems: 'center', gap: '14px' },
  logoBadge: { background: '#2563eb', color: '#fff', fontWeight: '800', fontSize: '18px', padding: '8px 14px', borderRadius: '10px', letterSpacing: '1px' },
  instLogo: { width: '40px', height: '40px', borderRadius: '8px', background: '#fff', padding: '3px', objectFit: 'contain' },
  instName: { margin: 0, fontSize: '17px', fontWeight: '700', color: '#f8fafc' },
  subText: { margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' },
  right: { display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' },
  pilotBadge: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600' },
  dot: { width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' },
  userBox: { display: 'flex', alignItems: 'center', gap: '10px' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#1e293b', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', border: '1px solid #334155' },
  userName: { fontSize: '14px', fontWeight: '600', color: '#f8fafc' },
  userMeta: { fontSize: '11px', color: '#94a3b8' },
  logoutBtn: { background: 'transparent', border: '1px solid #7f1d1d', color: '#f87171', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }
};