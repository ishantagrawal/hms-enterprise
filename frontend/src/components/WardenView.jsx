import React, { useState, useEffect } from 'react';
import { COMPLAINT_CATEGORIES } from '../config/categories';

export default function WardenView({ user, complaints, apiUrl }) {
  const isDean = user.role === 'Dean' || user.hostel_block === 'All';

  // Default tab: 'hostels' for Dean, 'complaints' for Hostel Warden
  const [activeTab, setActiveTab] = useState(isDean ? 'hostels' : 'complaints');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState('All');

  // Modals / Bottom Sheets
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);

  // Forms & States
  const [newPassword, setNewPassword] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfScope, setPdfScope] = useState(isDean ? 'All' : user.hostel_block);
  const [statusMsg, setStatusMsg] = useState(null);

  // Student Onboarding State
  const [studentCount, setStudentCount] = useState(1);
  const [singleStudent, setSingleStudent] = useState({
    user_id: '', full_name: '', floor: '1st Floor', room: '', phone: ''
  });

  const svnitHostels = [
    { code: 'GAJJAR', name: 'Gajjar Bhawan', cwId: 'CW_GAJJAR', wId: 'W_GAJJAR', ext: '0261-2201659', icon: '🏢' },
    { code: 'BHABHA', name: 'Bhabha Bhawan', cwId: 'CW_BHABHA', wId: 'W_BHABHA', ext: '0261-2201790', icon: '🏢' },
    { code: 'MTB', name: 'Mother Teresa Bhawan', cwId: 'CW_MTB', wId: 'W_MTB', ext: '0261-2201967', icon: '🏢' },
    { code: 'SVB', name: 'Swami Vivekananda Bhawan', cwId: 'CW_SVB', wId: 'W_SVB', ext: '0261-2201657', icon: '🏢' },
    { code: 'NEHRU', name: 'Nehru Bhawan', cwId: 'CW_NEHRU', wId: 'W_NEHRU', ext: '0261-2201703', icon: '🏢' },
    { code: 'TAGORE', name: 'Tagore Bhawan', cwId: 'CW_TAGORE', wId: 'W_TAGORE', ext: '0261-2201707', icon: '🏢' },
    { code: 'SARABHAI', name: 'Sarabhai Bhawan', cwId: 'CW_SARABHAI', wId: 'W_SARABHAI', ext: '0261-2201793', icon: '🏢' },
    { code: 'RAMAN', name: 'Raman Bhawan', cwId: 'CW_RAMAN', wId: 'W_RAMAN', ext: '0261-2201789', icon: '🏢' },
    { code: 'ABVB', name: 'Atal Bihari Vajpayee Bhawan', cwId: 'CW_ABVB', wId: 'W_ABVB', ext: '0261-2201880', icon: '🏢' },
    { code: 'NARMAD', name: 'Narmad Bhawan (Guest House)', cwId: 'CW_NARMAD', wId: 'W_NARMAD', ext: '0261-2201652', icon: '🏨' }
  ];

  const loadStudentCount = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/warden/students?institute_id=${user.institute_id}&hostel_block=${user.hostel_block}`);
      if (res.ok) {
        const data = await res.json();
        setStudentCount(data.count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadStudentCount();
  }, [user.hostel_block]);

  const handleDownloadPDF = (scopeOverride) => {
    const targetScope = scopeOverride || pdfScope;
    const query = new URLSearchParams({
      institute_id: user.institute_id,
      hostel_block: targetScope,
      from_date: fromDate,
      to_date: toDate
    });
    window.open(`${apiUrl}/api/complaints/export-pdf?${query.toString()}`, '_blank');
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/dean/reset-password?admin_id=${user.user_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: resetTarget, new_password: newPassword })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ ${data.message}`);
      setResetTarget(null);
      setNewPassword('');
    } else {
      setStatusMsg(`❌ ${data.detail || 'Error resetting password'}`);
    }
  };

  const handleAddSingleStudent = async (e) => {
    e.preventDefault();
    const payload = [{
      user_id: singleStudent.user_id,
      full_name: singleStudent.full_name,
      hostel_block: user.hostel_block,
      floor: singleStudent.floor,
      room: singleStudent.room,
      phone: singleStudent.phone
    }];
    const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setStatusMsg(`✅ Onboarded ${singleStudent.user_id.toUpperCase()} (Pass: 123)`);
      setSingleStudent({ user_id: '', full_name: '', floor: '1st Floor', room: '', phone: '' });
      setShowAddStudentModal(false);
      loadStudentCount();
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const lines = evt.target.result.split('\n').filter((l) => l.trim().length > 0);
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((s) => s.trim());
        if (cols.length >= 4) {
          parsed.push({
            user_id: cols[0],
            full_name: cols[1],
            hostel_block: user.hostel_block,
            floor: cols[2] || 'Ground',
            room: cols[3] || 'A-101',
            phone: cols[4] || '9876543210'
          });
        }
      }
      const res = await fetch(`${apiUrl}/api/warden/bulk-upload?institute_id=${user.institute_id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg(`✅ Bulk Onboarded ${data.added} students into ${user.hostel_block}!`);
        loadStudentCount();
      }
    };
    reader.readAsText(file);
  };

  const getCategoryIcon = (catName) => {
    const found = COMPLAINT_CATEGORIES.find((c) => c.id === catName);
    return found ? found.icon : '🛠️';
  };

  const getStatusColor = (status) => {
    if (status === 'Completed') return '#22c55e';
    if (status === 'Awaiting Confirmation') return '#38bdf8';
    if (status === 'Reopened') return '#f87171';
    return '#fbbf24';
  };

  const visibleComplaints = complaints.filter((c) => {
    const matchesCat = filterCat === 'All' || c.category === filterCat;
    const matchesSearch =
      c.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.ticket_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.hostel_block.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const openCount = complaints.filter((c) => c.status !== 'Completed').length;

  return (
    <div style={styles.appWrapper}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wa-anim { animation: fadeUp 0.2s ease-out; }
      `}</style>

      {statusMsg && (
        <div style={styles.toast} onClick={() => setStatusMsg(null)}>
          {statusMsg}
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: HOSTELS LIST (DEAN ONLY — WHATSAPP CHAT LIST OF 10 HOSTELS)  */}
      {/* ================================================================= */}
      {isDean && activeTab === 'hostels' && (
        <div className="wa-anim" style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search SVNIT Hostel Bhawan or Position ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.listContainer}>
            {svnitHostels
              .filter(
                (h) =>
                  h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  h.cwId.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((h) => {
                const hostelIssues = complaints.filter(
                  (c) => c.hostel_block === h.name && c.status !== 'Completed'
                ).length;
                return (
                  <div
                    key={h.code}
                    onClick={() => setSelectedHostel(h.name)}
                    style={styles.chatRow}
                  >
                    <div style={styles.rowAvatar}>{h.icon}</div>
                    <div style={styles.rowCenter}>
                      <div style={styles.rowTopLine}>
                        <span style={styles.rowTitle}>{h.name}</span>
                        <span style={styles.rowTime}>{h.ext}</span>
                      </div>
                      <div style={styles.rowBottomLine}>
                        <span style={styles.rowSub}>
                          Portals: {h.cwId} • {h.wId}
                        </span>
                        <span
                          style={{
                            ...styles.unreadBubble,
                            background: hostelIssues > 0 ? '#22c55e' : '#1e293b',
                            color: hostelIssues > 0 ? '#052e16' : '#94a3b8'
                          }}
                        >
                          {hostelIssues} active
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: COMPLAINTS FEED (WHATSAPP STYLE FOR BOTH DEAN & WARDEN)      */}
      {/* ================================================================= */}
      {activeTab === 'complaints' && (
        <div className="wa-anim" style={styles.tabContent}>
          <div style={styles.searchWrap}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search ticket ID, student name or issue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {/* Horizontal Category Filter Pills (WhatsApp "All / Unread / Groups" style) */}
          <div style={styles.pillBar}>
            <button
              onClick={() => setFilterCat('All')}
              style={{
                ...styles.filterPill,
                background: filterCat === 'All' ? 'rgba(34, 197, 94, 0.2)' : '#1e293b',
                color: filterCat === 'All' ? '#4ade80' : '#94a3b8'
              }}
            >
              All ({complaints.length})
            </button>
            {COMPLAINT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCat(cat.id)}
                style={{
                  ...styles.filterPill,
                  background: filterCat === cat.id ? 'rgba(34, 197, 94, 0.2)' : '#1e293b',
                  color: filterCat === cat.id ? '#4ade80' : '#94a3b8'
                }}
              >
                {cat.icon} {cat.id}
              </button>
            ))}
          </div>

          <div style={styles.listContainer}>
            {visibleComplaints.length === 0 ? (
              <div style={styles.emptyState}>No grievances match your filter.</div>
            ) : (
              visibleComplaints.map((c) => (
                <div
                  key={c.ticket_id}
                  onClick={() => setSelectedTicket(c)}
                  style={styles.chatRow}
                >
                  <div style={styles.rowAvatar}>{getCategoryIcon(c.category)}</div>
                  <div style={styles.rowCenter}>
                    <div style={styles.rowTopLine}>
                      <span style={styles.rowTitle}>{c.summary}</span>
                      <span style={styles.rowTime}>{c.created_at.split(',')[0]}</span>
                    </div>
                    <div style={styles.rowBottomLine}>
                      <span style={styles.rowSub}>
                        {c.student_name} • {c.hostel_block} (Rm {c.room})
                      </span>
                      <span
                        style={{
                          ...styles.statusBadge,
                          color: getStatusColor(c.status),
                          borderColor: getStatusColor(c.status)
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: STUDENTS ONBOARDING (HOSTEL WARDEN ONLY)                     */}
      {/* ================================================================= */}
      {!isDean && activeTab === 'students' && (
        <div className="wa-anim" style={styles.tabContent}>
          <div style={styles.capacityCard}>
            <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '700' }}>
              {user.hostel_block.toUpperCase()} RESIDENT CAPACITY
            </div>
            <div style={{ fontSize: '26px', fontWeight: '800', color: '#4ade80', margin: '6px 0' }}>
              {studentCount} <span style={{ fontSize: '14px', color: '#94a3b8' }}>/ 50,000+ Ready</span>
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#cbd5e1' }}>
              Upload a hostel Excel/CSV sheet to create student logins in 1 click (Default Pass: 123).
            </p>
            <label style={styles.csvBtn}>
              📄 Upload Hostel Student CSV
              <input type="file" accept=".csv" onChange={handleCSVUpload} style={{ display: 'none' }} />
            </label>
          </div>

          <button onClick={() => setShowAddStudentModal(true)} style={styles.fabBtn} title="Add Student">
            +
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: PDF AUDIT REPORTS (BOTH DEAN & WARDEN)                       */}
      {/* ================================================================= */}
      {activeTab === 'reports' && (
        <div className="wa-anim" style={styles.tabContent}>
          <div style={styles.sheetCard}>
            <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '18px' }}>
              📥 Official PDF Grievance Report
            </h3>
            <p style={{ margin: '0 0 16px 0', color: '#94a3b8', fontSize: '13px' }}>
              Select a date range to print or save the official SVNIT grievance register as PDF.
            </p>

            {isDean && (
              <div style={{ marginBottom: '12px' }}>
                <label style={styles.label}>Select Hostel Bhawan Scope</label>
                <select
                  value={pdfScope}
                  onChange={(e) => setPdfScope(e.target.value)}
                  style={styles.input}
                >
                  <option value="All">All 10 SVNIT Hostels Combined</option>
                  {svnitHostels.map((h) => (
                    <option key={h.code} value={h.name}>{h.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '12px' }}>
              <label style={styles.label}>From Date (Optional)</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={styles.label}>To Date (Optional)</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={styles.input}
              />
            </div>

            <button onClick={() => handleDownloadPDF()} style={styles.primaryBtn}>
              🖨️ Generate & Save PDF Report
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* TAB: SECURITY / PASSWORDS (DEAN) OR PROFILE (WARDEN)              */}
      {/* ================================================================= */}
      {activeTab === 'settings' && (
        <div className="wa-anim" style={styles.tabContent}>
          {isDean ? (
            <div>
              <div style={{ marginBottom: '12px', color: '#94a3b8', fontSize: '13px' }}>
                Tap any Position ID below to reset its password when faculty roles rotate:
              </div>
              <div style={styles.listContainer}>
                {svnitHostels.map((h) => (
                  <div key={h.code} style={styles.chatRow}>
                    <div style={styles.rowAvatar}>🔑</div>
                    <div style={styles.rowCenter}>
                      <div style={styles.rowTopLine}>
                        <span style={styles.rowTitle}>{h.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <button onClick={() => setResetTarget(h.cwId)} style={styles.keyChip}>
                          Reset {h.cwId}
                        </button>
                        <button onClick={() => setResetTarget(h.wId)} style={styles.keyChip}>
                          Reset {h.wId}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={styles.sheetCard}>
              <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc' }}>{user.full_name}</h3>
              <p style={{ margin: '0 0 14px 0', color: '#38bdf8', fontSize: '13px', fontWeight: '700' }}>
                Position ID: {user.user_id}
              </p>
              <div style={styles.detailBox}>
                <div><strong>Assigned Hostel:</strong> {user.hostel_block}</div>
                <div style={{ marginTop: '6px' }}><strong>Official Email:</strong> {user.email}</div>
                <div style={{ marginTop: '6px' }}><strong>Office Phone:</strong> {user.phone}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 1: DEAN TAPS A HOSTEL -> OPENS ITS COMPLAINTS SHEET         */}
      {/* ================================================================= */}
      {selectedHostel && (
        <div style={styles.modalOverlay} onClick={() => setSelectedHostel(null)}>
          <div className="wa-anim" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '17px' }}>{selectedHostel}</h3>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Hostel Grievance Sheet</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleDownloadPDF(selectedHostel)} style={styles.smallPdfBtn}>
                  📥 PDF
                </button>
                <button onClick={() => setSelectedHostel(null)} style={styles.closeBtn}>✕</button>
              </div>
            </div>

            {complaints.filter((c) => c.hostel_block === selectedHostel).length === 0 ? (
              <div style={styles.emptyState}>No grievances reported in {selectedHostel}.</div>
            ) : (
              complaints
                .filter((c) => c.hostel_block === selectedHostel)
                .map((c) => (
                  <div
                    key={c.ticket_id}
                    onClick={() => {
                      setSelectedHostel(null);
                      setSelectedTicket(c);
                    }}
                    style={styles.chatRow}
                  >
                    <div style={styles.rowAvatar}>{getCategoryIcon(c.category)}</div>
                    <div style={styles.rowCenter}>
                      <div style={styles.rowTopLine}>
                        <span style={styles.rowTitle}>{c.summary}</span>
                        <span style={{ color: getStatusColor(c.status), fontSize: '11px', fontWeight: '700' }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={styles.rowSub}>
                        {c.ticket_id} • {c.student_name} (Rm {c.room})
                      </div>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: TICKET FULL DETAILS POPUP                                */}
      {/* ================================================================= */}
      {selectedTicket && (
        <div style={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div className="wa-anim" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '14px' }}>
                {selectedTicket.ticket_id} • {selectedTicket.category}
              </span>
              <button onClick={() => setSelectedTicket(null)} style={styles.closeBtn}>✕</button>
            </div>

            <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '17px' }}>
              {selectedTicket.summary}
            </h3>
            <p style={{ margin: '0 0 14px 0', color: '#cbd5e1', fontSize: '14px' }}>
              {selectedTicket.description}
            </p>

            <div style={styles.detailBox}>
              <div><strong>Status:</strong> <span style={{ color: getStatusColor(selectedTicket.status) }}>{selectedTicket.status}</span></div>
              <div style={{ marginTop: '6px' }}><strong>Student:</strong> {selectedTicket.student_name} ({selectedTicket.student_id})</div>
              <div style={{ marginTop: '6px' }}><strong>Location:</strong> {selectedTicket.hostel_block} • {selectedTicket.floor} • Rm {selectedTicket.room}</div>
              <div style={{ marginTop: '6px' }}><strong>Phone:</strong> {selectedTicket.phone}</div>
              <div style={{ marginTop: '6px' }}><strong>Routed Wing:</strong> {selectedTicket.routed_to}</div>
              {selectedTicket.staff_remark && (
                <div style={{ marginTop: '6px', color: '#38bdf8' }}>
                  <strong>Staff Remark:</strong> {selectedTicket.staff_remark}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: PASSWORD RESET POPUP (DEAN)                              */}
      {/* ================================================================= */}
      {resetTarget && (
        <div style={styles.modalOverlay} onClick={() => setResetTarget(null)}>
          <div className="wa-anim" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>
                🔐 Reset Password: {resetTarget}
              </h3>
              <button onClick={() => setResetTarget(null)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                placeholder="Enter New Password for Position"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={styles.input}
              />
              <button type="submit" style={styles.primaryBtn}>Save New Password</button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 4: ADD SINGLE STUDENT POPUP (WARDEN)                        */}
      {/* ================================================================= */}
      {showAddStudentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddStudentModal(false)}>
          <div className="wa-anim" style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '16px' }}>
                🎓 Add Student to {user.hostel_block}
              </h3>
              <button onClick={() => setShowAddStudentModal(false)} style={styles.closeBtn}>✕</button>
            </div>
            <form onSubmit={handleAddSingleStudent} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input type="text" placeholder="Roll No (e.g. U26CE055)" value={singleStudent.user_id} onChange={(e) => setSingleStudent({ ...singleStudent, user_id: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Student Full Name" value={singleStudent.full_name} onChange={(e) => setSingleStudent({ ...singleStudent, full_name: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Floor (e.g. 2nd Floor)" value={singleStudent.floor} onChange={(e) => setSingleStudent({ ...singleStudent, floor: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Room No (e.g. B-208)" value={singleStudent.room} onChange={(e) => setSingleStudent({ ...singleStudent, room: e.target.value })} required style={styles.input} />
              <input type="text" placeholder="Phone Number" value={singleStudent.phone} onChange={(e) => setSingleStudent({ ...singleStudent, phone: e.target.value })} required style={styles.input} />
              <button type="submit" style={styles.primaryBtn}>+ Create Student Login</button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* FIXED WHATSAPP BOTTOM NAVIGATION BAR                              */}
      {/* ================================================================= */}
      <nav style={styles.bottomNav}>
        {isDean ? (
          <button onClick={() => setActiveTab('hostels')} style={styles.navItem}>
            <div style={{ ...styles.iconPill, background: activeTab === 'hostels' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
            </div>
            <span style={{ ...styles.navLabel, color: activeTab === 'hostels' ? '#f8fafc' : '#94a3b8' }}>Hostels</span>
          </button>
        ) : null}

        <button onClick={() => setActiveTab('complaints')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'complaints' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>💬</span>
            {openCount > 0 && <span style={styles.badgeCount}>{openCount}</span>}
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'complaints' ? '#f8fafc' : '#94a3b8' }}>Complaints</span>
        </button>

        {!isDean && (
          <button onClick={() => setActiveTab('students')} style={styles.navItem}>
            <div style={{ ...styles.iconPill, background: activeTab === 'students' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
              <span style={{ fontSize: '18px' }}>🎓</span>
            </div>
            <span style={{ ...styles.navLabel, color: activeTab === 'students' ? '#f8fafc' : '#94a3b8' }}>Students</span>
          </button>
        )}

        <button onClick={() => setActiveTab('reports')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'reports' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>📥</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'reports' ? '#f8fafc' : '#94a3b8' }}>PDF Report</span>
        </button>

        <button onClick={() => setActiveTab('settings')} style={styles.navItem}>
          <div style={{ ...styles.iconPill, background: activeTab === 'settings' ? 'rgba(34, 197, 94, 0.2)' : 'transparent' }}>
            <span style={{ fontSize: '18px' }}>{isDean ? '🔑' : '👤'}</span>
          </div>
          <span style={{ ...styles.navLabel, color: activeTab === 'settings' ? '#f8fafc' : '#94a3b8' }}>
            {isDean ? 'Passwords' : 'Profile'}
          </span>
        </button>
      </nav>
    </div>
  );
}

const styles = {
  appWrapper: { maxWidth: '680px', margin: '0 auto', paddingBottom: '90px', minHeight: 'calc(100vh - 70px)' },
  tabContent: { padding: '12px 14px' },
  toast: { margin: '10px 14px 0 14px', background: '#1e293b', borderLeft: '4px solid #22c55e', padding: '12px', borderRadius: '10px', color: '#f8fafc', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', borderRadius: '999px', padding: '10px 16px', marginBottom: '12px' },
  searchInput: { background: 'transparent', border: 'none', outline: 'none', color: '#f8fafc', fontSize: '14px', width: '100%' },
  pillBar: { display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '6px' },
  filterPill: { border: 'none', padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  listContainer: { display: 'flex', flexDirection: 'column' },
  chatRow: { display: 'flex', alignItems: 'center', gap: '14px', padding: '13px 6px', borderBottom: '1px solid rgba(30, 41, 59, 0.65)', cursor: 'pointer' },
  rowAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '21px', flexShrink: 0 },
  rowCenter: { flex: 1, minWidth: 0 },
  rowTopLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  rowTitle: { color: '#f8fafc', fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowTime: { color: '#94a3b8', fontSize: '11px', flexShrink: 0 },
  rowBottomLine: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  rowSub: { color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  unreadBubble: { fontSize: '11px', fontWeight: '800', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  statusBadge: { fontSize: '10px', fontWeight: '700', border: '1px solid', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '14px' },
  capacityCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '22px', textAlign: 'center', marginTop: '10px' },
  csvBtn: { display: 'inline-block', background: '#22c55e', color: '#052e16', padding: '12px 20px', borderRadius: '12px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  sheetCard: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: '18px', padding: '20px', marginTop: '8px' },
  label: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' },
  input: { width: '100%', background: '#090d16', border: '1px solid #334155', borderRadius: '10px', padding: '12px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { width: '100%', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '10px', padding: '13px', fontWeight: '800', fontSize: '14px', cursor: 'pointer' },
  keyChip: { background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '5px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' },
  fabBtn: { position: 'fixed', right: '20px', bottom: '88px', width: '56px', height: '56px', borderRadius: '16px', background: '#22c55e', color: '#052e16', border: 'none', fontSize: '30px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 8px 20px rgba(34, 197, 94, 0.4)' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '16px' },
  modalSheet: { background: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '20px', width: '100%', maxWidth: '500px', maxHeight: '82vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #1e293b' },
  smallPdfBtn: { background: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '700', cursor: 'pointer' },
  closeBtn: { background: '#1e293b', color: '#cbd5e1', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700' },
  detailBox: { background: '#090d16', border: '1px solid #1e293b', borderRadius: '12px', padding: '12px', fontSize: '13px', color: '#cbd5e1' },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px', background: '#0b141a', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-around', alignItems: 'center', zIndex: 100 },
  navItem: { background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', flex: 1 },
  iconPill: { position: 'relative', width: '56px', height: '30px', borderRadius: '999px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: '11px', fontWeight: '600' },
  badgeCount: { position: 'absolute', top: '-3px', right: '6px', background: '#22c55e', color: '#052e16', fontSize: '10px', fontWeight: '800', padding: '1px 6px', borderRadius: '999px' }
};