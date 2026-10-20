import React, { useState } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function StudentView({ user, complaints, apiUrl, onRefresh }) {
  const [category, setCategory] = useState('Electricity');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiUrl}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.user_id, category, summary, description })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ type: 'success', text: `🚀 Complaint Registered Successfully! Ticket: ${data.ticket.ticket_id}` });
        setSummary('');
        setDescription('');
        onRefresh();
      } else {
        setMsg({ type: 'error', text: data.detail || 'Failed to submit' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Server connection error.' });
    }
    setSubmitting(false);
  };

  const handleStudentVerify = async (ticketId, satisfied) => {
    try {
      const res = await fetch(`${apiUrl}/api/complaints/student-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, satisfied })
      });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'Completed') return '#34d399';
    if (status === 'Awaiting Confirmation') return '#60a5fa';
    if (status === 'Reopened') return '#f87171';
    return '#fbbf24';
  };

  return (
    <div style={styles.container}>
      
      {/* Welcome Banner */}
      <div style={styles.banner}>
        <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>👋 Welcome, {user.full_name}</h2>
        <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
          {user.hostel_block} • Room {user.room} ({user.floor})
        </p>
      </div>

      {msg && (
        <div style={{ ...styles.alert, background: msg.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderColor: msg.type === 'success' ? '#10b981' : '#ef4444', color: msg.type === 'success' ? '#34d399' : '#f87171' }}>
          {msg.text}
        </div>
      )}

      {/* Lodge Complaint Form */}
      <div style={styles.card}>
        <h3 style={{ margin: '0 0 14px 0', color: '#f8fafc', fontSize: '16px' }}>📝 Lodge New Grievance</h3>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div>
            <label style={styles.label}>Select Category Wing</label>
            <div style={styles.categoryGrid}>
              {COMPLAINT_CATEGORIES.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  style={{
                    ...styles.catCard,
                    borderColor: category === cat.id ? '#3b82f6' : '#1e293b',
                    background: category === cat.id ? 'rgba(59, 130, 246, 0.1)' : '#030712'
                  }}
                >
                  <span style={{ fontSize: '22px' }}>{cat.icon}</span>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>{cat.title}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={styles.label}>Issue Summary</label>
            <input
              type="text"
              placeholder="e.g. LAN Port not working / Fan sparking"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Detailed Description</label>
            <textarea
              rows="3"
              placeholder="Mention exact location, appliance number, or problem details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              style={styles.textarea}
            />
          </div>

          <button type="submit" disabled={submitting} style={styles.submitBtn}>
            {submitting ? 'Submitting to Wing...' : '🚀 Submit Grievance'}
          </button>
        </form>
      </div>

      {/* Live Track Complaints */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#f8fafc', fontSize: '16px' }}>📌 Track Your Grievances ({complaints.length})</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {complaints.length === 0 ? (
            <div style={styles.emptyCard}>No grievances registered yet.</div>
          ) : (
            complaints.map((c) => (
              <div key={c.ticket_id} style={{ ...styles.complaintCard, borderLeft: `4px solid ${getStatusColor(c.status)}` }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: '800', color: '#38bdf8' }}>{c.ticket_id}</span>
                    {c.ccc_ticket_id && <span style={{ fontSize: '11px', background: '#1e293b', color: '#cbd5e1', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>{c.ccc_ticket_id}</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: getStatusColor(c.status), background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '20px' }}>
                    {c.status}
                  </span>
                </div>

                <div style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginTop: '8px' }}>{c.summary}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>{c.description}</div>

                <div style={{ background: '#030712', borderRadius: '8px', padding: '10px', marginTop: '10px', fontSize: '12px', color: '#cbd5e1' }}>
                  <div>🏢 <strong>Routed Wing:</strong> {c.routed_to}</div>
                  {c.staff_remark && <div style={{ marginTop: '4px', color: '#38bdf8' }}>💬 <strong>Staff Note:</strong> {c.staff_remark}</div>}
                  <div style={{ marginTop: '4px', color: '#64748b', fontSize: '11px' }}>🕒 Logged: {c.created_at}</div>
                </div>

                {/* Student Verification Action if Awaiting Confirmation */}
                {c.status === 'Awaiting Confirmation' && (
                  <div style={{ marginTop: '12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#93c5fd', fontWeight: '600' }}>Has this issue been successfully resolved?</p>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button onClick={() => handleStudentVerify(c.ticket_id, true)} style={styles.yesBtn}>✅ Yes, Resolve</button>
                      <button onClick={() => handleStudentVerify(c.ticket_id, false)} style={styles.noBtn}>❌ No, Reopen</button>
                    </div>
                  </div>
                )}

              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

const styles = {
  container: { maxWidth: '800px', margin: '0 auto', padding: '16px' },
  banner: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '16px', marginBottom: '16px' },
  alert: { padding: '12px', borderRadius: '10px', border: '1px solid', fontSize: '13px', fontWeight: '600', marginBottom: '16px' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' },
  label: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  categoryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '14px' },
  catCard: { background: '#030712', border: '2px solid', borderRadius: '12px', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease' },
  input: { width: '100%', background: '#030712', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  textarea: { width: '100%', background: '#030712', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' },
  submitBtn: { width: '100%', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', padding: '14px', fontWeight: '700', cursor: 'pointer', fontSize: '15px', marginTop: '4px' },
  emptyCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '14px', padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '14px' },
  complaintCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
  yesBtn: { background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' },
  noBtn: { background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }
};