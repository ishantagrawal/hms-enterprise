import React, { useState, useEffect } from 'react';

export default function ClubView({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [aiAudit, setAiAudit] = useState(null);
  const [msg, setMsg] = useState(null);

  // New Event Form State (includes rich media and links)
  const [eventForm, setEventForm] = useState({
    title: '', date: '', start_time: '10:00', end_time: '13:00', venue: 'CRC Auditorium',
    description: '', image_url: '', registration_link: ''
  });

  const loadData = async () => {
    try {
      const cRes = await fetch(`${apiUrl}/api/unicore/clubs`);
      if (cRes.ok) setClubs(await cRes.json());
      
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
        setMsg(`✅ Event proposal submitted to Dean!`);
        setEventForm({ 
          title: '', date: '', start_time: '10:00', end_time: '13:00', venue: 'CRC Auditorium', 
          description: '', image_url: '', registration_link: '' 
        });
        loadData();
        setActiveTab('clash');
      } else {
        setMsg(`❌ ${data.detail || 'Clash detected'}`);
      }
    } catch { 
      setMsg('❌ Server error. Please check backend connection.'); 
    }
  };

  const getStatusColor = (status) => {
    if (status === 'Approved') return '#22c55e';
    if (status === 'Pending Dean Approval') return '#fbbf24';
    return '#ef4444';
  };

  const myClub = clubs.find(c => c.club_id.toLowerCase() === user.user_id.toLowerCase()) || clubs[0] || {};
  const myEvents = events.filter(e => e.club_id.toLowerCase() === (user.user_id || '').toLowerCase());

  return (
    <div style={styles.appWrapper}>
      <style>{`
        @keyframes fadeUp { 
          from { opacity: 0; transform: translateY(10px); } 
          to { opacity: 1; transform: translateY(0); } 
        } 
        .club-anim { animation: fadeUp 0.2s ease-out; }
      `}</style>
      
      {msg && (
        <div style={styles.toast} onClick={() => setMsg(null)}>
          {msg}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: CLUB LEDGER & PROFILE (MOD-01)                     */}
      {/* ========================================================= */}
      {activeTab === 'ledger' && (
        <div className="club-anim" style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <div style={styles.badge}>SVNIT OFFICIAL CHAPTER</div>
            <h2 style={{ margin: '8px 0 4px 0', color: '#f8fafc', fontSize: '22px' }}>{myClub.name || user.full_name}</h2>
            <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '13px' }}>{myClub.mission}</p>
            <div style={styles.detailBox}>
              <div style={styles.infoRow}><span>Faculty Advisor:</span> <strong>{myClub.faculty_advisor || 'Dr. R. K. Gupta'}</strong></div>
              <div style={styles.infoRow}><span>Head Coordinator:</span> <strong>{myClub.head_coordinator || user.full_name}</strong></div>
              <div style={styles.infoRow}><span>Active Members:</span> <strong style={{ color: '#4ade80' }}>{myClub.members?.length || 120} Students</strong></div>
              <div style={styles.infoRow}><span>Chapter ID:</span> <code style={{ color: '#38bdf8' }}>{myClub.club_id || user.user_id}</code></div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: CLASH MATRIX & EVENT REQUISITIONS (MOD-02)         */}
      {/* ========================================================= */}
      {activeTab === 'clash' && (
        <div className="club-anim" style={styles.tabContent}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: '700' }}>⚡ Venue Clash Matrix & Event Requests</span>
          </div>

          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '15px' }}>+ Submit Rich Event Proposal</h3>
            <form onSubmit={handleProposeEvent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <input type="text" placeholder="Event Title (e.g. Hackathon 2026)" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} required style={styles.input} />
              
              <textarea rows="3" placeholder="Detailed Description (What is the event about?)" value={eventForm.description} onChange={e => setEventForm({...eventForm, description: e.target.value})} required style={styles.input} />
              
              <input type="url" placeholder="Cover Image URL (e.g., past year photo link)" value={eventForm.image_url} onChange={e => setEventForm({...eventForm, image_url: e.target.value})} style={styles.input} />
              
              <input type="url" placeholder="Google Form / Audition Link (Optional)" value={eventForm.registration_link} onChange={e => setEventForm({...eventForm, registration_link: e.target.value})} style={styles.input} />
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="date" value={eventForm.date} onChange={e => setEventForm({...eventForm, date: e.target.value})} required style={{...styles.input, flex: 1}} />
                <select value={eventForm.venue} onChange={e => setEventForm({...eventForm, venue: e.target.value})} style={{...styles.input, flex: 1}}>
                  <option value="CRC Auditorium">CRC Auditorium</option>
                  <option value="SAC Amphitheatre">SAC Amphitheatre</option>
                  <option value="CCC Seminar Hall">CCC Seminar Hall</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="time" value={eventForm.start_time} onChange={e => setEventForm({...eventForm, start_time: e.target.value})} required style={{...styles.input, flex: 1}} />
                <input type="time" value={eventForm.end_time} onChange={e => setEventForm({...eventForm, end_time: e.target.value})} required style={{...styles.input, flex: 1}} />
              </div>
              
              <button type="submit" style={styles.primaryBtn}>Submit for Dean Approval (Clash Check)</button>
            </form>
          </div>

          <div style={{ marginTop: '16px', color: '#94a3b8', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
            My Submitted Requisitions
          </div>
          
          <div style={styles.listContainer}>
            {myEvents.length === 0 ? (
              <div style={styles.emptyState}>No event requisitions found.</div>
            ) : (
              myEvents.map(ev => (
                <div key={ev.event_id} style={styles.chatRow}>
                  <div style={styles.rowAvatar}>🎟️</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{ev.title}</span>
                      <span style={{ color: getStatusColor(ev.status), fontSize: '11px', fontWeight: '700' }}>{ev.status}</span>
                    </div>
                    <div style={styles.rowSub}>📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: AI EVENT FEEDBACK AUDIT (MOD-04)                   */}
      {/* ========================================================= */}
      {activeTab === 'audit' && aiAudit && (
        <div className="club-anim" style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <div style={{ color: '#38bdf8', fontSize: '12px', fontWeight: '800', marginBottom: '6px' }}>
              🤖 LLM AI EVENT FEEDBACK & AUDIT SUMMARY
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '16px' }}>{aiAudit.event_title}</h3>
            
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', fontSize: '13px', color: '#cbd5e1' }}>
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
              
              <div style={{ marginTop: '8px' }}><strong>Dean Recommendation:</strong> {aiAudit.recommendation}</div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* WHATSAPP BOTTOM NAVIGATION BAR                            */}
      {/* ========================================================= */}
      <nav style={styles.bottomNav}>
        <button onClick={() => setActiveTab('ledger')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'ledger' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⭐</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'ledger' ? '#f8fafc' : '#94a3b8' }}>Club Ledger</span>
        </button>

        <button onClick={() => setActiveTab('clash')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'clash' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>⚡</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'clash' ? '#f8fafc' : '#94a3b8' }}>Proposals</span>
        </button>

        <button onClick={() => setActiveTab('audit')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'audit' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>🤖</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'audit' ? '#f8fafc' : '#94a3b8' }}>AI Audit</span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  badge: { display: 'inline-block', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '3px 10px', borderRadius: '999px', fontSize: '10px', fontWeight: '800', marginBottom: '8px' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px', marginBottom: '16px' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '14px', fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(30, 41, 59, 0.5)', paddingBottom: '6px' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' }
};