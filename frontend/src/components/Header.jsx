import React from 'react';

export default function Header({ user, tenant, onLogout }) {
  const isFounder = user.role === 'PlatformOwner';

  const getHeaderTitle = () => {
    if (isFounder) return 'HMS Cloud HQ';
    if (user.role === 'Dean') return 'SVNIT Dean SW Portal';
    if (user.role === 'Warden') return user.hostel_block;
    if (user.role === 'DepartmentStaff') return user.department;
    return 'SVNIT Hostel ERP';
  };

  const getSubTitle = () => {
    if (isFounder) return 'FOUNDER • Multi-Tenant Root';
    if (user.role === 'Student') return `${user.hostel_block} • Rm ${user.room}`;
    return `${user.user_id} • ${user.authority_title || user.role}`;
  };

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.left}>
          <div style={styles.appBadge}>HMS</div>
          <div style={styles.textWrap}>
            <div style={styles.title}>{getHeaderTitle()}</div>
            <div style={styles.subtitle}>{getSubTitle()}</div>
          </div>
        </div>

        <button onClick={onLogout} style={styles.logoutBtn}>
          Sign Out
        </button>
      </div>
    </header>
  );
}

const styles = {
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    background: '#0b141a',
    borderBottom: '1px solid #1e293b',
    padding: '12px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    WebkitFontSmoothing: 'antialiased'
  },
  inner: {
    maxWidth: '680px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px'
  },
  left: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 },
  appBadge: {
    background: '#22c55e',
    color: '#052e16',
    fontWeight: '900',
    fontSize: '13px',
    padding: '8px 10px',
    borderRadius: '10px',
    letterSpacing: '0.5px',
    flexShrink: 0
  },
  textWrap: { minWidth: 0, flex: 1 },
  title: {
    color: '#f8fafc',
    fontSize: '16px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '12px',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  logoutBtn: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#f87171',
    padding: '6px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: 0
  }
};