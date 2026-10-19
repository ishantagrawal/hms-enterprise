import React from 'react';

export default function Header({ user, tenant, onLogout }) {
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=1e293b&color=38bdf8&bold=true`;

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <div style={styles.brandBox}>
          <span style={styles.hmsBadge}>HMS</span>
          <span style={styles.divider}>|</span>
          {tenant?.logo_url && (
            <img src={tenant.logo_url} alt={tenant.short_name} style={styles.instituteLogo} />
          )}
          <div>
            <h1 style={styles.instituteName}>{tenant?.name || "HMS Enterprise Portal"}</h1>
            <p style={styles.subText}>
              {user.role === "Student" && `${user.hostel_block} • ${user.floor} • Room ${user.room}`}
              {user.role === "DepartmentStaff" && `Department Portal • ${user.department} Wing`}
              {user.role === "Warden" && `Chief Warden Administration • ${user.hostel_block}`}
            </p>
          </div>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.pilotBadge}>🟢 Phase 1: Grievance Pilot Active</div>
        <div style={styles.userProfile}>
          <img src={avatarUrl} alt="Avatar" style={styles.avatar} />
          <div style={{ textAlign: 'right' }}>
            <div style={styles.userName}>{user.full_name}</div>
            <div style={styles.userRole}>{user.user_id} • {user.role}</div>
          </div>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Sign Out</button>
      </div>
    </header>
  );
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#090d16', borderBottom: '1px solid #1e293b', flexWrap: 'wrap', gap: '16px' },
  left: { display: 'flex', alignItems: 'center' },
  brandBox: { display: 'flex', alignItems: 'center', gap: '14px' },
  hmsBadge: { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', fontWeight: '800', fontSize: '18px', padding: '8px 14px', borderRadius: '10px', letterSpacing: '1px' },
  divider: { color: '#334155', fontSize: '24px', fontWeight: '300' },
  instituteLogo: { width: '42px', height: '42px', objectFit: 'contain', background: '#fff', padding: '4px', borderRadius: '8px' },
  instituteName: { margin: 0, fontSize: '16px', fontWeight: '700', color: '#f8fafc', letterSpacing: '-0.3px' },
  subText: { margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' },
  right: { display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' },
  pilotBadge: { background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '6px 12px', borderRadius: '100px', fontSize: '11px', fontWeight: '600' },
  userProfile: { display: 'flex', alignItems: 'center', gap: '12px' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', border: '1px solid #334155' },
  userName: { fontSize: '14px', fontWeight: '600', color: '#f1f5f9' },
  userRole: { fontSize: '11px', color: '#64748b' },
  logoutBtn: { background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }
};