import React, { useState, useEffect } from 'react';

// Safety fallback so activeTab is never undefined
var activeTab = 'ledger';

export default function ClubView({ user, apiUrl }) {
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

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, [apiUrl]);

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
        setMsg('✅ Club dossier & Dean notes updated!');
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
    <div style={styles.appWrapper}>
      {msg && (
        <div style={styles.toast} onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}

      {activeTab === 'ledger' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <div style={styles.badge}>SVNIT OFFICIAL CHAPTER</div>
            <h2 style={{ margin: '8px 0 4px 0', color: '#f8fafc', fontSize: '21px' }}>{myClub.name || user.full_name}</h2>
            <div style={styles.detailBox}>
              <div style={styles.infoRow}><span>Faculty Advisor:</span> <strong>{myClub.faculty_advisor}</strong></div>
              <div style={styles.infoRow}><span>Head Coordinator:</span> <strong>{myClub.head_coordinator}</strong></div>
              <div style={styles.infoRow}><span>Events Organized:</span> <strong style={{ color: '#c084fc' }}>{myEvents.length} Events</strong></div>
              <div style={styles.infoRow}><span>Active Members:</span> <strong style={{ color: '#4ade80' }}>{myClub.members?.length || 0} Core Members</strong></div>
            </div>

            <form onSubmit={handleSaveClubInfo} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={styles.label}>Update Club Mission & Additional Info for Dean</label>
              <textarea
                rows="2"
                value={missionInput}
                onChange={(e) => setMissionInput(e.target.value)}
                placeholder="Club Mission"
                style={styles.input}
              />
              <textarea
                rows="2"
                value={extraInfoInput}
                onChange={(e) => setExtraInfoInput(e.target.value)}
                placeholder="Extra achievements, budget notes, or equipment requests to show Dean..."
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>💾 Save Info for Dean Portal</button>
            </form>
          </div>

          <div style={styles.sectionHeader}>👥 Position-Wise Member Roster</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myClub.members?.map((m, idx) => (
              <div key={idx} style={styles.memberCard}>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: '700' }}>{m.name}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.roll} • {m.phone}</div>
                </div>
                <span style={styles.posBadge}>{m.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'clash' && (
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
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
                style={styles.input}
              />
              <textarea
                rows="3"
                placeholder="Full Event Description (What happens at the event, eligibility, prizes...)"
                value={eventForm.description}
                onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                required
                style={styles.input}
              />
              <input
                type="url"
                placeholder="Previous Year Photo / Poster URL (https://...)"
                value={eventForm.image_url}
                onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })}
                style={styles.input}
              />
              <input
                type="url"
                placeholder="Audition / Registration Google Form Link (Optional)"
                value={eventForm.registration_link}
                onChange={(e) => setEventForm({ ...eventForm, registration_link: e.target.value })}
                style={styles.input}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                  required
                  style={{ ...styles.input, flex: 1 }}
                />
                <select
                  value={eventForm.venue}
                  onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                  style={{ ...styles.input, flex: 1 }}
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
                  style={{ ...styles.input, flex: 1 }}
                />
                <input
                  type="time"
                  value={eventForm.end_time}
                  onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })}
                  required
                  style={{ ...styles.input, flex: 1 }}
                />
              </div>
              <button type="submit" style={styles.primaryBtn}>🚀 Send Venue Request to Dean</button>
            </form>
          </div>

          <div style={styles.sectionHeader}>📊 My Club Events & Live Student RSVPs</div>
          <div style={styles.listContainer}>
            {myEvents.map((ev) => (
              <div key={ev.event_id} style={styles.chatRow}>
                <div style={styles.rowAvatar}>🎟️</div>
                <div style={styles.rowCenter}>
                  <div style={styles.rowTopLine}>
                    <span style={styles.rowTitle}>{ev.title}</span>
                    <span style={{ color: getStatusColor(ev.status), fontSize: '11px', fontWeight: '700' }}>
                      {ev.status}
                    </span>
                  </div>
                  <div style={styles.rowSub}>📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
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
        <div style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <div style={{ color: '#c084fc', fontSize: '12px', fontWeight: '800', marginBottom: '6px' }}>
              🤖 AI POST-EVENT FEEDBACK AUDIT
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '17px' }}>{aiAudit.event_title}</h3>
            <div style={{ display: 'flex', gap: '14px', marginBottom: '12px', fontSize: '13px', color: '#cbd5e1' }}>
              <div>👥 Attendees: <strong>{aiAudit.total_attendees}</strong></div>
              <div>⭐ Rating: <strong>{aiAudit.average_rating} / 5.0</strong></div>
            </div>
            <div style={styles.detailBox}>
              <div style={{ color: '#4ade80', fontWeight: '700' }}>👍 Key Pros:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_pros.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ color: '#f87171', fontWeight: '700' }}>⚠️ Areas of Improvement:</div>
              <ul style={{ margin: '4px 0 10px 20px', padding: 0 }}>
                {aiAudit.key_cons.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
              <div><strong>Dean Recommendation:</strong> {aiAudit.recommendation}</div>
            </div>
          </div>
        </div>
      )}

      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('ledger')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'ledger' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⭐</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'ledger' ? '#c084fc' : '#94a3b8' }}>Club Ledger</span>
        </button>

        <button onClick={() => setActiveTab('clash')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clash' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clash' ? '#c084fc' : '#94a3b8' }}>Proposals & RSVPs</span>
        </button>

        <button onClick={() => setActiveTab('audit')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'audit' ? 'rgba(139, 92, 246, 0.25)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'audit' ? '#c084fc' : '#94a3b8' }}>AI Audit</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
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