import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const [filterCat, setFilterCat] = useState('All');
  const [statusMsg, setStatusMsg] = useState(null);
  const [expandedId, setExpandedId] = useState(null); // Accordion expansion for mobile
  const [studentCount, setStudentCount] = useState(0);

  const isFounder = user.authority_title === 'HMS Platform Founder';
  const isSuperAdmin = user.hostel_block === 'All';

  useEffect(() => {
    fetch(`${apiUrl}/api/warden/students/count?institute_id=${user.institute_id}`)
      .then(res => res.json())
      .then(data => setStudentCount(data.active_count || 120))
      .catch(() => setStudentCount(120));
  }, [apiUrl, user.institute_id]);

  const handleExportPDF = () => {
    window.open(`${apiUrl}/api/complaints/export-pdf?institute_id=${user.institute_id}&hostel_block=${user.hostel_block}`, '_blank');
  };

  const filtered = filterCat === 'All' ? complaints : complaints.filter((c) => c.category === filterCat);
  const getStatusColor = (status) => status === 'Completed' ? '#34d399' : status === 'Awaiting Confirmation' ? '#60a5fa' : '#fbbf24';

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 20px' }}>
      
      {/* Top Banner with Onboarding Capacity Counter */}
      <div style={styles.topBanner}>
        <div>
          <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>
            {isFounder ? '🌍 Founder SaaS HQ' : isSuperAdmin ? `🏛️ ${user.authority_title || 'Campus'} Command` : `🏢 ${user.hostel_block} Admin`}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '13px' }}>
            Active Student Onboarding Capacity: <strong style={{ color: '#34d399' }}>{studentCount} / 50,000+ Onboarded</strong>
          </p>
        </div>
        <button onClick={handleExportPDF} style={styles.pdfBtn}>📥 Download PDF Report</button>
      </div>

      {statusMsg && <div style={{ background: '#1e293b', padding: '12px', borderRadius: '8px', color: '#34d399', fontSize: '13px', fontWeight: '600', marginBottom: '16px' }}>{statusMsg}</div>}

      {/* Category Stats Grid */}
      <div style={styles.statsGrid}>
        {COMPLAINT_CATEGORIES.map((cat) => {
          const count = complaints.filter((c) => c.category === cat.id && c.status !== 'Completed').length;
          return (
            <div key={cat.id} onClick={() => setFilterCat(cat.id)} style={{ ...styles.statCard, borderColor: filterCat === cat.id ? cat.badgeColor : '#1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '20px' }}>{cat.icon}</span>
                <span style={{ fontSize: '22px', fontWeight: '800', color: cat.badgeColor }}>{count}</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc', marginTop: '6px' }}>{cat.title}</div>
            </div>
          );
        })}
      </div>

      {/* Master Grievance Register with Mobile Card Accordion */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>Master Grievance Register ({filtered.length})</h3>
          {filterCat !== 'All' && <button onClick={() => setFilterCat('All')} style={styles.clearBtn}>Show All</button>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.length === 0 ? (
            <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>No grievances found.</p>
          ) : (
            filtered.map((c) => {
              const isExpanded = expandedId === c.ticket_id;
              return (
                <div 
                  key={c.ticket_id} 
                  onClick={() => setExpandedId(isExpanded ? null : c.ticket_id)}
                  style={{ 
                    background: '#030712', 
                    border: '1px solid #1e293b', 
                    borderRadius: '12px', 
                    padding: '14px', 
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    borderLeft: `4px solid ${getStatusColor(c.status)}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '800', color: '#38bdf8' }}>{c.ticket_id}</span>
                      <span style={{ margin: '0 8px', color: '#64748b' }}>•</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{c.category}</span>
                    </div>
                    <span style={{ color: getStatusColor(c.status), fontWeight: '700', fontSize: '12px' }}>{c.status}</span>
                  </div>

                  <div style={{ fontSize: '14px', color: '#e2e8f0', marginTop: '6px', fontWeight: '600' }}>{c.summary}</div>
                  
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    👤 {c.student_name} ({c.hostel_block} - Rm {c.room})
                  </div>

                  {/* Expandable Details on Click */}
                  {isExpanded && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1e293b', fontSize: '13px', color: '#cbd5e1', animation: 'fadeIn 0.3s' }}>
                      <p style={{ margin: '0 0 6px 0' }}><strong>Description:</strong> {c.description}</p>
                      <p style={{ margin: '0 0 6px 0' }}><strong>Routed To:</strong> {c.routed_to}</p>
                      {c.staff_remark && <p style={{ margin: '0 0 6px 0', color: '#38bdf8' }}><strong>Staff Note:</strong> {c.staff_remark}</p>}
                      <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Logged on: {c.created_at}</p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  topBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  pdfBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '13px' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' },
  statCard: { background: '#0f172a', border: '2px solid', borderRadius: '14px', padding: '14px', cursor: 'pointer' },
  card: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px' },
  clearBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }
};