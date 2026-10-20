import React, { useState, useEffect, useCallback } from 'react';
import StudentView from './components/StudentView';
import WardenView from './components/WardenView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// =========================================================
// CLUB COORDINATOR PORTAL
// =========================================================
function ClubView({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [aiAudit, setAiAudit] = useState(null);
  const [msg, setMsg] = useState(null);

  const [extraInfoInput, setExtraInfoInput] = useState('');
  const [missionInput, setMissionInput] = useState('');

  const [eventForm, setEventForm] = useState({
    title: '',
    date: '2026-10-29',
    start_time: '10:00',
    end_time: '13:00',
    venue: 'CRC Auditorium',
    description: '',
    image_url: '',
    registration_link: ''
  });

  const loadData = useCallback(async () => {
    try {
      const cRes = await fetch(`${apiUrl}/api/unicore/clubs`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClubs(cData);
        const found = cData.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || cData[0];
        if (found) {
          setMissionInput(found.mission || '');
          setExtraInfoInput(found.extra_dean_info || '');
        }
      }
      const eRes = await fetch(`${apiUrl}/api/unicore/events`);
      if (eRes.ok) setEvents(await eRes.json());
      const aRes = await fetch(`${apiUrl}/api/unicore/audit-summary`);
      if (aRes.ok) setAiAudit(await aRes.json());
    } catch (err) {
      console.error(err);
    }
  }, [apiUrl, user.user_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveClubInfo = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiUrl}/api/unicore/clubs/update-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          club_id: user.user_id,
          mission: missionInput,
          extra_dean_info: extraInfoInput
        })
      });
      if (res.ok) {
        setMsg('✅ Club dossier updated successfully!');
        loadData();
      }
    } catch {
      setMsg('❌ Failed to update club info.');
    }
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/unicore/events/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventForm,
          club_id: user.user_id,
          submitted_by: user.full_name
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg('✅ Event proposal sent to Dean with AI Clash Verification!');
        setEventForm({
          title: '',
          date: '2026-10-29',
          start_time: '10:00',
          end_time: '13:00',
          venue: 'CRC Auditorium',
          description: '',
          image_url: '',
          registration_link: ''
        });
        loadData();
      } else {
        setMsg(`❌ ${data.detail || 'Venue Clash Detected'}`);
      }
    } catch {
      setMsg('❌ Server error.');
    }
  };

  const getStatusColor = (status) => {
    if (status === 'Approved') return '#a78bfa';
    if (status === 'Pending Dean Approval') return '#fbbf24';
    return '#ef4444';
  };

  const myClub = clubs.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || clubs[0] || {};
  const myEvents = events.filter((e) => e.club_id.toUpperCase() === (user.user_id || '').toUpperCase());

  return (
    <div style={clubStyles.appWrapper}>
      {msg && (
        <div style={clubStyles.toast} onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}

      {activeTab === 'ledger' && (
        <div style={clubStyles.tabContent}>
          <div style={clubStyles.sheetCard}>
            <div style={clubStyles.badge}>SVNIT OFFICIAL CHAPTER</div>
            <h2 style={{ margin: '8px 0 4px 0', color: '#f8fafc', fontSize: '21px' }}>{myClub.name || user.full_name}</h2>
            <div style={clubStyles.detailBox}>
              <div style={clubStyles.infoRow}><span>Faculty Advisor:</span> <strong>{myClub.faculty_advisor}</strong></div>
              <div style={clubStyles.infoRow}><span>Head Coordinator:</span> <strong>{myClub.head_coordinator}</strong></div>
              <div style={clubStyles.infoRow}><span>Events Organized:</span> <strong style={{ color: '#c084fc' }}>{myEvents.length} Events</strong></div>
              <div style={clubStyles.infoRow}><span>Active Members:</span> <strong style={{ color: '#4ade80' }}>{myClub.members?.length || 0} Core Members</strong></div>
            </div>

            <form onSubmit={handleSaveClubInfo} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={clubStyles.label}>Update Club Mission & Additional Info for Dean</label>
              <textarea
                rows="2"
                value={missionInput}
                onChange={(e) => setMissionInput(e.target.value)}
                placeholder="Club Mission"
                style={clubStyles.input}
              />
              <textarea
                rows="2"
                value={extraInfoInput}
                onChange={(e) => setExtraInfoInput(e.target.value)}
                placeholder="Extra achievements, budget notes, or equipment requests..."
                style={clubStyles.input}
              />
              <button type="submit" style={clubStyles.primaryBtn}>💾 Save Info</button>
            </form>
          </div>

          <div style={clubStyles.sectionHeader}>👥 Position-Wise Member Roster</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myClub.members?.map((m, idx) => (
              <div key={idx} style={clubStyles.memberCard}>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: '700' }}>{m.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.roll} • {m.phone}</div>
                </div>
                <span style={clubStyles.posBadge}>{m.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'clash' && (
        <div style={clubStyles.tabContent}>
          <div style={clubStyles.sheetCard}>
            <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '16px' }}>
              + Submit Event Venue & Rich Media Proposal
            </h3>
            <form onSubmit={handleProposeEvent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                placeholder="Event Title (e.g. Winter CodeFest 2026)"
                value={eventForm.title}
                onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                required
                style={clubStyles.input}
              />
              <textarea
                rows="3"
                placeholder="Full Event Description..."
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                required
                style={clubStyles.input}
              />
              <input
                type="url"
                placeholder="Poster Image URL (https://...)"
                value={eventForm.image_url}
                onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })}
                style={clubStyles.input}
              />
              <input
                type="url"
                placeholder="Audition / Registration Google Form Link"
                value={eventForm.registration_link}
                onChange={(e) => setEventForm({ ...eventForm, registration_link: e.target.value })}
                style={clubStyles.input}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                  required
                  style={{ ...clubStyles.input, flex: 1 }}
                />
                <select
                  value={eventForm.venue}
                  onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                  style={{ ...clubStyles.input, flex: 1 }}
                >
                  <option value="CRC Auditorium">CRC Auditorium</option>
                  <option value="SAC Amphitheatre">SAC Amphitheatre</option>
                  <option value="CCC Seminar Hall">CCC Seminar Hall</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="time"
                  value={eventForm.start_time}
                  onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })}
                  required
                  style={{ ...clubStyles.input, flex: 1 }}
                />
                <input
                  type="time"
                  value={eventForm.end_time}
                  onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })}
                  required
                  style={{ ...clubStyles.input, flex: 1 }}
                />
              </div>
              <button type="submit" style={clubStyles.primaryBtn}>🚀 Send Venue Request to Dean</button>
            </form>
          </div>

          <div style={clubStyles.sectionHeader}>📊 My Club Events & RSVPs</div>
          <div style={clubStyles.listContainer}>
            {myEvents.map((ev) => (
              <div key={ev.event_id} style={clubStyles.chatRow}>
                <div style={clubStyles.rowAvatar}>🎟️</div>
                <div style={clubStyles.rowCenter}>
                  <div style={clubStyles.rowTopLine}>
                    <span style={clubStyles.rowTitle}>{ev.title}</span>
                    <span style={{ color: getStatusColor(ev.status), fontSize: '11px', fontWeight: '700' }}>
                      {ev.status}
                    </span>
                  </div>
                  <div style={clubStyles.rowSub}>📍 {ev.venue} • 📅 {ev.date}</div>
                  <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px', fontWeight: '800' }}>
                    👥 {ev.rsvps?.length || 0} Students Confirmed Coming
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'audit' && aiAudit && (
        <div style={clubStyles.tabContent}>
          <div style={clubStyles.sheetCard}>
            <div style={{ color: '#c084fc', fontSize: '12px', fontWeight: '800', marginBottom: '6px' }}>
              🤖 AI POST-EVENT FEEDBACK AUDIT
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '17px' }}>{aiAudit.event_title}</h3>
            <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', fontSize: '13px', color: '#cbd5e1' }}>
              <div>👥 Attendees: <strong>{aiAudit.total_attendees}</strong></div>
              <div>⭐ Rating: <strong>{aiAudit.average_rating} / 5.0</strong></div>
            </div>
            <div style={clubStyles.detailBox}>
              <div style={{ color: '#4ade80', fontWeight: '700' }}>👍 Key Pros:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_pros?.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ color: '#f87171', fontWeight: '700' }}>⚠️ Areas of Improvement:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_cons?.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <div><strong>Dean Recommendation:</strong> {aiAudit.recommendation}</div>
            </div>
          </div>
        </div>
      )}

      <nav style={clubStyles.bottomNav}>
        <button onClick={() => setActiveTab('ledger')} style={clubStyles.navItem}>
          <div style={{ ...clubStyles.iconPill, background: activeTab === 'ledger' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⭐</span>
          </div>
          <span style={{ ...clubStyles.navLabel, color: activeTab === 'ledger' ? '#c084fc' : '#94a3b8' }}>Club Ledger</span>
        </button>

        <button onClick={() => setActiveTab('clash')} style={clubStyles.navItem}>
          <div style={{ ...clubStyles.iconPill, background: activeTab === 'clash' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
          </div>
          <span style={{ ...clubStyles.navLabel, color: activeTab === 'clash' ? '#c084fc' : '#94a3b8' }}>Proposals & RSVPs</span>
        </button>

        <button onClick={() => setActiveTab('audit')} style={clubStyles.navItem}>
          <div style={{ ...clubStyles.iconPill, background: activeTab === 'audit' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
          </div>
          <span style={{ ...clubStyles.navLabel, color: activeTab === 'audit' ? '#c084fc' : '#94a3b8' }}>AI Audit</span>
        </button>
      </nav>
    </div>
  );
}

// =========================================================
// STAFF MAINTENANCE PORTAL
// =========================================================
function StaffView({ user, complaints, apiUrl, onRefresh }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [remark, setRemark] = useState('');

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    const res = await fetch(`${apiUrl}/api/complaints/staff-resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: selectedTicket.ticket_id, staff_remark: remark })
    });
    if (res.ok) {
      setRemark('');
      setSelectedTicket(null);
      onRefresh();
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
      <h3 style={{ color: '#c084fc', marginTop: 0 }}>🛠️ Assigned Maintenance Queue ({user.department})</h3>
      {complaints.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#0f172a', borderRadius: '14px', color: '#94a3b8' }}>
          No pending maintenance tickets in your wing.
        </div>
      ) : (
        complaints.map((c) => (
          <div
            key={c.ticket_id}
            onClick={() => setSelectedTicket(c)}
            style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '14px', marginBottom: '10px', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ color: '#f8fafc' }}>{c.summary}</strong>
              <span style={{ color: '#c084fc', fontSize: '12px', fontWeight: '700' }}>{c.status}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
              📍 {c.hostel_block} • Room {c.room} ({c.student_name})
            </div>
          </div>
        ))
      )}

      {selectedTicket && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 200 }}
          onClick={() => setSelectedTicket(null)}
        >
          <div
            style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '18px', padding: '20px', width: '100%', maxWidth: '440px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Resolve {selectedTicket.ticket_id}</h3>
            <p style={{ color: '#cbd5e1', fontSize: '13px' }}>{selectedTicket.description}</p>
            <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <textarea
                rows="3"
                placeholder="Enter action taken..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                required
                style={{ width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', boxSizing: 'border-box' }}
              />
              <button type="submit" style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>
                ✅ Mark Resolved
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================
// MAIN APP ENTRY & CLEAN LOGIN PORTAL (WITH WAKING SERVER BAR)
// =========================================================
export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('hms_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverProgress, setServerProgress] = useState(0);
  const [complaints, setComplaints] = useState([]);

  const fetchComplaints = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({
        role: user.role,
        user_id: user.user_id,
        hostel_block: user.hostel_block || 'All',
        department: user.department || ''
      });
      const res = await fetch(`${API_URL}/api/complaints?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setComplaints(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load complaints:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  // Handle server waking progress bar simulation
  useEffect(() => {
    let timer;
    if (loading) {
      setServerProgress(12);
      timer = setInterval(() => {
        setServerProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + Math.floor(Math.random() * 15) + 5;
        });
      }, 400);
    } else {
      setServerProgress(0);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userIdInput.trim(),
          password: passwordInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setServerProgress(100);
        setTimeout(() => {
          setUser(data.user);
          localStorage.setItem('hms_user', JSON.stringify(data.user));
          setLoading(false);
        }, 300);
      } else {
        setLoading(false);
        setLoginError(data.detail || 'Invalid ID or Password');
      }
    } catch {
      setLoading(false);
      setLoginError('Cannot reach server. Please wait for server to wake up.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hms_user');
    setUser(null);
    setUserIdInput('');
    setPasswordInput('');
    setLoginError(null);
  };

  if (!user) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginCard}>
          <div style={styles.logoBadge}>HMS</div>
          <h1 style={styles.loginTitle}>Hostel Management System</h1>
          <p style={styles.loginSub}>SVNIT Campus Portal</p>

          {loginError && <div style={styles.errorBox}>{loginError}</div>}

          {loading ? (
            <div style={styles.wakingBox}>
              <div style={styles.wakingTop}>
                <span style={styles.wakingText}>Waking secure server...</span>
                <span style={styles.wakingPct}>{serverProgress}%</span>
              </div>
              <div style={styles.progressBarTrack}>
                <div style={{ ...styles.progressBarFill, width: `${serverProgress}%` }} />
              </div>
            </div>
          ) : (
            <form onSubmit={handleLogin} style={styles.form}>
              <input
                type="text"
                placeholder="Position ID / Roll No (e.g., DEAN, U26CE011)"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                required
                style={styles.input}
              />
              <div style={styles.passwordWrap}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                  style={{ ...styles.input, paddingRight: '45px', marginBottom: 0 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  title="Show / Hide Password"
                >
                  {showPassword ? '👁️‍🗨️' : '👁️'}
                </button>
              </div>
              <button type="submit" style={styles.loginBtn}>
                Sign In →
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          <div style={styles.appAvatar}>HMS</div>
          <div>
            <div style={styles.headerTitle}>SVNIT Hostel Management System</div>
            <div style={styles.headerSub}>
              {user.role === 'Student'
                ? `${user.hostel_block} • Rm ${user.room}`
                : `${user.authority_title || user.role}`}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} style={styles.signOutBtn}>Sign Out</button>
      </header>

      <main>
        {user.role === 'Student' && (
          <StudentView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
        {(user.role === 'Dean' || user.role === 'Warden') && (
          <WardenView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
        {user.role === 'ClubOrganizer' && (
          <ClubView
            user={user}
            apiUrl={API_URL}
          />
        )}
        {user.role === 'Staff' && (
          <StaffView
            user={user}
            complaints={complaints}
            apiUrl={API_URL}
            onRefresh={fetchComplaints}
          />
        )}
      </main>
    </div>
  );
}

const clubStyles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #8b5cf6', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  badge: { display: 'inline-block', background: 'rgba(139, 92, 246, 0.18)', color: '#c084fc', padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', marginBottom: '8px' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '18px', marginBottom: '16px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(30, 41, 59, 0.5)', paddingBottom: '6px' },
  sectionHeader: { color: '#c084fc', fontSize: '12px', fontWeight: '800', margin: '12px 0 8px 0', textTransform: 'uppercase' },
  memberCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' },
  posBadge: { fontSize: '11px', background: 'rgba(139, 92, 246, 0.18)', color: '#c084fc', padding: '3px 9px', borderRadius: '999px', fontWeight: '700' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)' },
  rowAvatar: { width: '46px', height: '46px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  label: { fontSize: '11px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' }
};

const styles = {
  appShell: { minHeight: '100vh', background: '#060911', color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' },
  topHeader: {
    position: 'sticky', top: 0, zIndex: 150, height: '66px',
    background: '#0b1120', borderBottom: '1px solid #1e293b',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', maxWidth: '680px', margin: '0 auto'
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  appAvatar: {
    width: '42px', height: '42px', borderRadius: '12px',
    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff', fontWeight: '800', fontSize: '13px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  headerTitle: { fontSize: '16px', fontWeight: '800', color: '#f8fafc' },
  headerSub: { fontSize: '12px', color: '#94a3b8' },
  signOutBtn: {
    background: 'rgba(239, 68, 68, 0.12)', color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '999px',
    padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
  },
  loginPage: {
    minHeight: '100vh', background: '#060911', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '16px',
    fontFamily: 'Inter, system-ui, sans-serif'
  },
  loginCard: {
    width: '100%', maxWidth: '420px', background: '#0f172a',
    border: '1px solid #1e293b', borderRadius: '22px', padding: '32px 24px',
    textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
  },
  logoBadge: {
    display: 'inline-block', background: 'rgba(139, 92, 246, 0.18)',
    color: '#c084fc', border: '1px solid rgba(139, 92, 246, 0.4)',
    padding: '6px 16px', borderRadius: '999px', fontSize: '12px',
    fontWeight: '800', letterSpacing: '1px', marginBottom: '12px'
  },
  loginTitle: { margin: '0 0 4px 0', color: '#f8fafc', fontSize: '21px', fontWeight: '800' },
  loginSub: { margin: '0 0 24px 0', color: '#94a3b8', fontSize: '13px' },
  errorBox: {
    background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)',
    color: '#f87171', padding: '12px', borderRadius: '12px',
    fontSize: '13px', fontWeight: '600', marginBottom: '16px'
  },
  form: { display: 'flex', flexDirection: 'column', gap: '14px' },
  input: {
    width: '100%', background: '#090d16', border: '1px solid #334155',
    borderRadius: '12px', padding: '13px 14px', color: '#f8fafc',
    fontSize: '14px', boxSizing: 'border-box', outline: 'none', marginBottom: '12px'
  },
  passwordWrap: { position: 'relative', width: '100%' },
  eyeBtn: {
    position: 'absolute', right: '12px', top: '38%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', padding: 0
  },
  loginBtn: {
    width: '100%', background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
    color: '#fff', border: 'none', borderRadius: '12px', padding: '14px',
    fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '4px'
  },
  wakingBox: {
    background: '#090d16', border: '1px solid #1e293b', borderRadius: '14px',
    padding: '20px 16px', textAlign: 'left', margin: '10px 0'
  },
  wakingTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  wakingText: { fontSize: '13px', fontWeight: '700', color: '#cbd5e1' },
  wakingPct: { fontSize: '13px', fontWeight: '800', color: '#c084fc' },
  progressBarTrack: { width: '100%', height: '8px', background: '#1e293b', borderRadius: '999px', overflow: 'hidden' },
  progressBarFill: { height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #38bdf8)', borderRadius: '999px', transition: 'width 0.3s ease' }
};