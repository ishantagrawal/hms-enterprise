import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';
import StaffAccountAccess from './StaffAccountAccess';
import { GridCardSkeleton } from './SkeletonLoader';
import usePortalBackNavigation from '../hooks/usePortalBackNavigation';

export default function DeanPortal({ apiUrl, user }) {
  const [page, setPage] = useState('home');
  usePortalBackNavigation(page, setPage);
  const [dataLoading, setDataLoading] = useState(false);

  // Instant Persistent Cache Initialization
  const [clubs, setClubs] = useState(() => getCached('dean_clubs') || []);
  const [events, setEvents] = useState(() => getCached('dean_events') || []);
  const [notices, setNotices] = useState(() => getCached('dean_notices') || []);
  const [departments, setDepartments] = useState(() => getCached('dean_depts') || []);
  const [complaints, setComplaints] = useState(() => getCached('dean_complaints') || []);
  const [students, setStudents] = useState(() => getCached('dean_all_students') || []);
  const [studentsCount, setStudentsCount] = useState(() => getCached('dean_student_count') || 0);
  const [hostels, setHostels] = useState([]);
  const [gateSecurityStaff, setGateSecurityStaff] = useState([]);
  const [hostelForm, setHostelForm] = useState({ name: '', wings: 'Wing A, Wing B, Wing C, Wing D' });
  const [msg, setMsg] = useState(null);

  // Drill-down states
  const [selectedClub, setSelectedClub] = useState(null);
  const [clubSubView, setClubSubView] = useState('hub');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [previousPage, setPreviousPage] = useState('home');
  const [clubSearch, setClubSearch] = useState('');

  // Forms for Creating Clubs, Central Wings & Updating Wardens
  const [clubForm, setClubForm] = useState({
    club_id: '',
    name: '',
    email: '',
    faculty_advisor: '',
    head_coordinator: '',
    mission: ''
  });
  const [deptForm, setDeptForm] = useState({
    dept_id: '',
    name: '',
    email: '',
    icon: '⚡'
  });
  const [wardenForm, setWardenForm] = useState({
    user_id: '',
    hostel_id: '',
    hostel_block: '',
    email: '',
    phone: ''
  });
  const [gateSecurityForm, setGateSecurityForm] = useState({
    user_id: '',
    full_name: '',
    email: '',
    phone: ''
  });

  // Interactive Event Calendar states
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(9);
  const [selectedDateStr, setSelectedDateStr] = useState('2026-10-28');

  // Reports & Print PDF Generator states
  const [reportYear, setReportYear] = useState('2026');
  const [reportClub, setReportClub] = useState('All');
  const [pdfScope, setPdfScope] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Background SWR Data Loader (Zero Spinner if Cache Exists)
  const loadDeanData = useCallback(async () => {
    const hasCache = Boolean(getCached('dean_clubs') || getCached('dean_events'));
    if (!hasCache) {
      setDataLoading(true);
    }

    try {
      const [res, hostelRes, gateSecurityRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/portal/bootstrap?role=Dean&user_id=DEAN&hostel_block=All`),
        apiFetch(`${apiUrl}/api/dean/hostels`),
        apiFetch(`${apiUrl}/api/dean/gate-security`)
      ]);
      if (hostelRes.ok) setHostels(await hostelRes.json());
      if (gateSecurityRes.ok) setGateSecurityStaff(await gateSecurityRes.json());
      if (res.ok) {
        const d = await res.json();
        setClubs(d.clubs || []);
        setCached('dean_clubs', d.clubs || []);
        setCached('clubs', d.clubs || []);
        
        setEvents(d.events || []);
        setCached('dean_events', d.events || []);
        setCached('events', d.events || []);

        setNotices(d.notices || []);
        setCached('dean_notices', d.notices || []);

        setDepartments(d.departments || []);
        setCached('dean_depts', d.departments || []);

        setComplaints(d.complaints || []);
        setCached('dean_complaints', d.complaints || []);

        const stArr = d.students || [];
        setStudents(stArr);
        setStudentsCount(stArr.length);
        setCached('dean_all_students', stArr);
        setCached('dean_student_count', stArr.length);
      }
    } catch (e) {
      console.error('Dean background sync error:', e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadDeanData();
  }, [loadDeanData]);

  // 1. Optimistic Event Approval / Disapproval (0ms UI Response)
  const handleApproveEvent = async (eventId, action) => {
    const updated = events.map((ev) =>
      ev.event_id === eventId ? { ...ev, status: action } : ev
    );
    setEvents(updated);
    setCached('dean_events', updated);
    setCached('events', updated);
    if (selectedEvent && selectedEvent.event_id === eventId) {
      setSelectedEvent({ ...selectedEvent, status: action });
    }
    setMsg(`✅ Event Proposal marked as ${action}!`);
    setPage(previousPage || 'event_approvals');

    try {
      await apiFetch(
        `${apiUrl}/api/unicore/events/approve?event_id=${encodeURIComponent(eventId)}&action=${encodeURIComponent(action)}`,
        { method: 'POST' }
      );
      loadDeanData();
    } catch (err) {
      setMsg('❌ Network error syncing event approval.');
      loadDeanData();
    }
  };

  // 2. Optimistic Event Deletion (0ms UI Response)
  const handleDeleteEvent = async (eventId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this event from the portal?')) return;

    const updated = events.filter((ev) => ev.event_id !== eventId);
    setEvents(updated);
    setCached('dean_events', updated);
    setCached('events', updated);
    setMsg('🗑️ Event permanently deleted!');
    if (page === 'event_detail') {
      setPage(previousPage || 'home');
    }

    try {
      await apiFetch(`${apiUrl}/api/unicore/events/delete?event_id=${encodeURIComponent(eventId)}`, {
        method: 'POST'
      });
      loadDeanData();
    } catch (err) {
      setMsg('❌ Error syncing event deletion.');
      loadDeanData();
    }
  };

  // 3. Optimistic Notice Approval / Disapproval (0ms UI Response)
  const handleApproveNotice = async (noticeId, action) => {
    const updated = notices.map((n) =>
      n.notice_id === noticeId ? { ...n, status: action } : n
    );
    setNotices(updated);
    setCached('dean_notices', updated);
    setCached('notices', updated);
    if (selectedNotice && selectedNotice.notice_id === noticeId) {
      setSelectedNotice({ ...selectedNotice, status: action });
    }
    setMsg(`✅ Notice marked as ${action}!`);
    if (page === 'notice_detail') {
      setPage('notice_approvals');
    }

    try {
      await apiFetch(
        `${apiUrl}/api/notices/approve?notice_id=${encodeURIComponent(noticeId)}&action=${encodeURIComponent(action)}`,
        { method: 'POST' }
      );
      loadDeanData();
    } catch (err) {
      setMsg('❌ Error syncing notice status.');
      loadDeanData();
    }
  };

  // 4. Optimistic Notice Deletion
  const handleDeleteNotice = async (noticeId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Permanently delete this notice from the Campus Notice Board?')) return;

    const updated = notices.filter((n) => n.notice_id !== noticeId);
    setNotices(updated);
    setCached('dean_notices', updated);
    setCached('notices', updated);
    setMsg('🗑️ Notice deleted!');
    if (page === 'notice_detail') {
      setPage('notice_approvals');
    }

    try {
      await apiFetch(`${apiUrl}/api/notices/delete?notice_id=${encodeURIComponent(noticeId)}`, {
        method: 'POST'
      });
      loadDeanData();
    } catch (err) {
      console.error(err);
      loadDeanData();
    }
  };

  // 5. Optimistic Club Creation
  const handleCreateClub = async (e) => {
    e.preventDefault();
    const newClubObj = {
      club_id: clubForm.club_id.trim().toUpperCase(),
      name: clubForm.name.trim(),
      email: clubForm.email.trim(),
      faculty_advisor: clubForm.faculty_advisor.trim() || 'Assigned by Dean SW Office',
      head_coordinator: clubForm.head_coordinator.trim() || 'Student Convener',
      mission: clubForm.mission.trim() || 'Official Student Activity Center (SAC) Chapter at SVNIT Surat',
      members: [],
      gallery: []
    };

    const updated = [...clubs, newClubObj];
    setClubs(updated);
    setCached('dean_clubs', updated);
    setCached('clubs', updated);
    setMsg(`✅ Club "${newClubObj.name}" created. Set its password under Staff account access.`);
    setClubForm({ club_id: '', name: '', email: '', faculty_advisor: '', head_coordinator: '', mission: '' });
    setPage('clubs_list');

    try {
      await apiFetch(`${apiUrl}/api/dean/create-club`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClubObj)
      });
      loadDeanData();
    } catch (err) {
      setMsg('❌ Error syncing new club.');
      loadDeanData();
    }
  };

  // 6. Optimistic Central Maintenance Department Creation
  const handleCreateCentralDept = async (e) => {
    e.preventDefault();
    const newD = {
      id: deptForm.dept_id.trim().toUpperCase(),
      name: deptForm.name.trim(),
      title: deptForm.name.trim(),
      email: deptForm.email ? deptForm.email.trim() : '',
      icon: deptForm.icon || '⚡',
      type: 'Central',
      hostel_block: 'All'
    };

    const updated = [...departments, newD];
    setDepartments(updated);
    setCached('dean_depts', updated);
    setMsg(`✅ Central Maintenance Wing "${newD.title}" added!`);
    setDeptForm({ dept_id: '', name: '', email: '', icon: '⚡' });

    try {
      await apiFetch(`${apiUrl}/api/departments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dept_id: newD.id,
          name: newD.name,
          dept_type: 'Central',
          hostel_block: 'All',
          icon: newD.icon,
          email: newD.email
        })
      });
      loadDeanData();
    } catch (err) {
      console.error(err);
      loadDeanData();
    }
  };

  // 7. Update Hostel Warden Contact / Assignment
  const handleUpdateWarden = async (e) => {
    e.preventDefault();
    if (!wardenForm.hostel_block) return;
    try {
      const res = await apiFetch(`${apiUrl}/api/dean/create-warden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wardenForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not save this warden.');
      setMsg(`Warden account saved for ${wardenForm.hostel_block}.`);
      loadDeanData();
    } catch (err) {
      setMsg(err.message || 'Could not save this warden.');
    }
  };

  const handleSaveGateSecurity = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${apiUrl}/api/dean/gate-security`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gateSecurityForm)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not save this security account.');
      setMsg(data.message);
      setGateSecurityForm({ user_id: '', full_name: '', email: '', phone: '' });
      loadDeanData();
    } catch (error) {
      setMsg(error.message || 'Could not save this security account.');
    }
  };

  const handleSaveHostel = async (e) => {
    e.preventDefault();
    const wings = hostelForm.wings.split(',').map((wing) => wing.trim()).filter(Boolean);
    try {
      const res = await apiFetch(`${apiUrl}/api/dean/hostels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hostelForm.name, wings })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not save this hostel.');
      setMsg(`Hostel configuration saved for ${data.name}.`);
      setHostelForm({ name: '', wings: 'Wing A, Wing B, Wing C, Wing D' });
      loadDeanData();
    } catch (err) {
      setMsg(err.message || 'Could not save this hostel.');
    }
  };

  // Automated Time-Slot & Venue Clash Detector
  const checkTimeClash = (candidate) => {
    if (!candidate) return { clash: false, text: '' };
    const overlapping = events.filter(
      (other) =>
        other.event_id !== candidate.event_id &&
        (other.status === 'Approved' || other.status === 'Completed') &&
        other.date === candidate.date &&
        !(candidate.end_time <= other.start_time || candidate.start_time >= other.end_time)
    );
    if (overlapping.length > 0) {
      const first = overlapping[0];
      return {
        clash: true,
        text: `⏰ Time Overlap Alert: ${first.club_id}'s "${first.title}" is already scheduled on ${first.date} (${first.start_time} - ${first.end_time}) at ${first.venue}.`
      };
    }
    return {
      clash: false,
      text: `✅ Time Slot Clear on ${candidate.date} (${candidate.start_time} - ${candidate.end_time}).`
    };
  };

  const changeMonth = (offset) => {
    let m = calMonth + offset;
    let y = calYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setCalMonth(m);
    setCalYear(y);
  };

  const openEventPage = (ev, fromPage) => {
    setSelectedEvent(ev);
    setPreviousPage(fromPage);
    setPage('event_detail');
  };

  // Print-Ready Landscape PDF Audit Generator
  const handleGenerateAuditPdf = () => {
    const filteredEvents = events.filter((ev) => {
      const matchYear = !reportYear || reportYear === 'All' || (ev.date || '').startsWith(reportYear);
      const matchClub = reportClub === 'All' || (ev.club_id || '').toUpperCase() === reportClub.toUpperCase();
      const matchFrom = !fromDate || (ev.date || '') >= fromDate;
      const matchTo = !toDate || (ev.date || '') <= toDate;
      return matchYear && matchClub && matchFrom && matchTo;
    });

    const win = window.open('', '_blank');
    if (!win) return;

    const eventRows = filteredEvents
      .map(
        (ev) => `
        <tr>
          <td><strong>${ev.event_id || '-'}</strong><br/><small>${ev.date || '-'}</small></td>
          <td><strong>${ev.club_id}</strong></td>
          <td><strong>${ev.title}</strong><br/><small>${ev.description ? ev.description.slice(0, 90) + '...' : ''}</small></td>
          <td>${ev.venue || '-'}<br/><small>${ev.start_time || ''} - ${ev.end_time || ''}</small></td>
          <td>${ev.budget || 'Institute / Self'}</td>
          <td>${ev.rsvps?.length || 0} RSVPs</td>
          <td><strong>${ev.status}</strong></td>
        </tr>`
      )
      .join('');

    const complaintRows = complaints
      .slice(0, 100)
      .map(
        (c) => `
        <tr>
          <td><strong>${c.ticket_id}</strong><br/><small>${c.created_at || ''}</small></td>
          <td>${c.hostel_block || '-'}<br/><small>${c.wing || ''} ${c.room || ''}</small></td>
          <td>${c.student_name || c.student_id || '-'}</td>
          <td>${c.routed_to || c.category || '-'}</td>
          <td><strong>${c.summary}</strong><br/><small>${c.staff_remark || 'Assigned'}</small></td>
          <td><strong>${c.status}</strong></td>
        </tr>`
      )
      .join('');

    win.document.write(`
      <html>
        <head>
          <title>SVNIT Dean Student Welfare — Official Audit Report</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #111827; }
            .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #002970; padding-bottom: 8px; margin-bottom: 14px; }
            h1 { margin: 0; font-size: 18px; color: #002970; }
            h3 { margin: 16px 0 6px 0; font-size: 14px; color: #002970; }
            p { margin: 2px 0; font-size: 11px; color: #4B5563; }
            table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 16px; }
            th, td { border: 1px solid #CBD5E1; padding: 6px 8px; text-align: left; vertical-align: top; }
            th { background: #F1F5F9; color: #002970; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <h1>SVNIT SURAT — OFFICE OF THE DEAN STUDENT WELFARE</h1>
              <p>Official SAC Club Events, Hostel Grievance & Resident Audit Report • Generated via svnitcampus.in</p>
            </div>
            <div style="text-align:right;">
              <p><strong>Scope:</strong> ${pdfScope} | <strong>Club Filter:</strong> ${reportClub} | <strong>Year:</strong> ${reportYear}</p>
              <p><strong>Active Clubs:</strong> ${clubs.length} | <strong>Hostel Residents:</strong> ${studentsCount} | <strong>Total Tickets:</strong> ${complaints.length}</p>
            </div>
          </div>

          ${
            pdfScope === 'All' || pdfScope === 'Events'
              ? `
              <h3>1. SAC Club Events & Requisitions (${filteredEvents.length} Records)</h3>
              <table>
                <thead>
                  <tr>
                    <th>Event ID / Date</th>
                    <th>Club</th>
                    <th>Event Title & Summary</th>
                    <th>Venue & Time</th>
                    <th>Budget / Source</th>
                    <th>Attendance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${eventRows || '<tr><td colspan="7">No events match the selected filters.</td></tr>'}</tbody>
              </table>`
              : ''
          }

          ${
            pdfScope === 'All' || pdfScope === 'Grievances'
              ? `
              <h3>2. Campus-Wide Hostel Maintenance Grievances (${complaints.length} Total)</h3>
              <table>
                <thead>
                  <tr>
                    <th>Ticket / Date</th>
                    <th>Bhawan / Room</th>
                    <th>Resident</th>
                    <th>Routed Wing</th>
                    <th>Issue Summary & Remark</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${complaintRows || '<tr><td colspan="6">No complaints logged.</td></tr>'}</tbody>
              </table>`
              : ''
          }
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const pendingEvents = events.filter((e) => e.status === 'Pending Dean Approval');
  const pendingNotices = notices.filter((n) => n.status === 'Pending Dean Approval');
  const centralDepts = departments.filter((d) => d.type === 'Central');

  const filteredClubs = clubs.filter((c) => {
    const q = clubSearch.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.club_id || '').toLowerCase().includes(q) ||
      (c.faculty_advisor || '').toLowerCase().includes(q)
    );
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysNum = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className="ptm-shell-layout">
      {/* Desktop Left Sidebar */}
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span>🏠 Dashboard Home</span>
        </button>
        <button className={`ptm-side-btn ${page === 'clubs_list' || page === 'club_detail' ? 'active' : ''}`} onClick={() => setPage('clubs_list')}>
          <span>🎭 Clubs Directory</span>
          <span>{clubs.length}</span>
        </button>
        <button className={`ptm-side-btn ${page === 'event_approvals' ? 'active' : ''}`} onClick={() => setPage('event_approvals')}>
          <span>⚡ Approve Events</span>
          {pendingEvents.length > 0 && (
            <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>
              {pendingEvents.length}
            </span>
          )}
        </button>
        <button className={`ptm-side-btn ${page === 'notice_approvals' || page === 'notice_detail' ? 'active' : ''}`} onClick={() => setPage('notice_approvals')}>
          <span>📢 Approve Notices</span>
          {pendingNotices.length > 0 && (
            <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>
              {pendingNotices.length}
            </span>
          )}
        </button>
        <button className={`ptm-side-btn ${page === 'calendar' ? 'active' : ''}`} onClick={() => setPage('calendar')}>
          <span>🗓️ Event Calendar</span>
        </button>
        <button className={`ptm-side-btn ${page === 'create_club' ? 'active' : ''}`} onClick={() => setPage('create_club')}>
          <span>➕ Create New Club</span>
        </button>
        <button className={`ptm-side-btn ${page === 'central_depts' ? 'active' : ''}`} onClick={() => setPage('central_depts')}>
          <span>🌐 Central Departments</span>
        </button>
        <button className={`ptm-side-btn ${page === 'wardens' ? 'active' : ''}`} onClick={() => setPage('wardens')}>
          <span>🏢 Hostel Wardens</span>
        </button>
        <button className={`ptm-side-btn ${page === 'staff_accounts' ? 'active' : ''}`} onClick={() => setPage('staff_accounts')}>
          <span>🔐 Staff account access</span>
        </button>
        <button className={`ptm-side-btn ${page === 'gate_security' ? 'active' : ''}`} onClick={() => setPage('gate_security')}>
          <span>🛂 Gate Security</span>
        </button>
        <button className={`ptm-side-btn ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}>
          <span>🖨️ Reports & Print PDF</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="ptm-page-wrap">
        {msg && (
          <div className="ptm-toast" onClick={() => setMsg(null)}>
            {msg}
          </div>
        )}

        {dataLoading ? (
          <GridCardSkeleton count={4} />
        ) : (
          <>
            {/* ==========================================
                1. DEAN DASHBOARD HOME
                ========================================== */}
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={() => setPage('clubs_list')}>
                    <div className="ptm-row-between">
                      <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Official SVNIT Clubs</span>
                      <span>🎭</span>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{clubs.length}</div>
                    <button className="ptm-mini-btn">Explore Clubs →</button>
                  </div>

                  <div className="ptm-mini-card" onClick={() => setPage('event_approvals')}>
                    <div className="ptm-row-between">
                      <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Pending Approvals</span>
                      <span>⚡</span>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                      {pendingEvents.length + pendingNotices.length}
                    </div>
                    <button className="ptm-mini-btn">Review Requests →</button>
                  </div>

                  <div className="ptm-mini-card" onClick={() => setPage('reports')}>
                    <div className="ptm-row-between">
                      <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Hostel Residents</span>
                      <span>🎓</span>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 800, color: '#111827', marginTop: '4px' }}>{studentsCount}</div>
                    <button className="ptm-mini-btn">Audit Reports →</button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Clubs & Campus Events</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('clubs_list')}>
                      <div className="ptm-icon-circle">🎭</div>
                      <span className="ptm-icon-label">All Clubs Directory</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('event_approvals')}>
                      <div className="ptm-icon-circle">
                        ⚡
                        {pendingEvents.length > 0 && <span className="ptm-tile-badge">{pendingEvents.length}</span>}
                      </div>
                      <span className="ptm-icon-label">Approve Events</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('notice_approvals')}>
                      <div className="ptm-icon-circle">
                        📢
                        {pendingNotices.length > 0 && <span className="ptm-tile-badge">{pendingNotices.length}</span>}
                      </div>
                      <span className="ptm-icon-label">Approve Notices</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('calendar')}>
                      <div className="ptm-icon-circle">🗓️</div>
                      <span className="ptm-icon-label">Event Calendar</span>
                    </button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Administration & Hostels</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('create_club')}>
                      <div className="ptm-icon-circle">➕</div>
                      <span className="ptm-icon-label">Create New Club</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('central_depts')}>
                      <div className="ptm-icon-circle">🌐</div>
                      <span className="ptm-icon-label">Central Departments</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('wardens')}>
                      <div className="ptm-icon-circle">🏢</div>
                      <span className="ptm-icon-label">Hostel Wardens</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('staff_accounts')}>
                      <div className="ptm-icon-circle">🔐</div>
                      <span className="ptm-icon-label">Staff passwords</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('gate_security')}>
                      <div className="ptm-icon-circle">🛂</div>
                      <span className="ptm-icon-label">Gate Security</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setPage('reports')}>
                      <div className="ptm-icon-circle">🖨️</div>
                      <span className="ptm-icon-label">Reports & Print PDF</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                2. OFFICIAL CLUBS DIRECTORY & DRILL-DOWN
                ========================================== */}
            {page === 'clubs_list' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <div className="ptm-row-between">
                    <h1 className="ptm-page-title">Official Student Clubs ({clubs.length})</h1>
                    <button className="ptm-btn-secondary" onClick={() => setPage('create_club')}>+ Add Club</button>
                  </div>
                </div>

                <div className="ptm-card">
                  <input
                    type="text"
                    className="ptm-input"
                    placeholder="🔍 Search club by name, code, or faculty advisor..."
                    value={clubSearch}
                    onChange={(e) => setClubSearch(e.target.value)}
                    style={{ marginBottom: '14px', borderRadius: '999px' }}
                  />

                  <div className="ptm-list">
                    {filteredClubs.map((c) => (
                      <div
                        key={c.club_id}
                        className="ptm-list-row"
                        onClick={() => {
                          setSelectedClub(c);
                          setClubSubView('hub');
                          setPage('club_detail');
                        }}
                      >
                        <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>
                          {(c.club_id || 'CL').slice(0, 2)}
                        </div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{c.name} ({c.club_id})</div>
                          <div className="ptm-list-sub">{c.mission}</div>
                          <span className="ptm-tag-pill">Faculty Advisor: {c.faculty_advisor || 'SAC'}</span>
                        </div>
                        <span>›</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                3. SINGLE CLUB HUB (EVENTS, MEMBERS, GALLERY, INFO)
                ========================================== */}
            {page === 'club_detail' && selectedClub && (
              <div>
                <div className="ptm-drill-header">
                  <button
                    className="ptm-back-btn"
                    onClick={() => (clubSubView !== 'hub' ? setClubSubView('hub') : setPage('clubs_list'))}
                  >
                    ←
                  </button>
                  <span className="ptm-tag-pill">{selectedClub.club_id} • OFFICIAL SAC CHAPTER</span>
                  <h1 className="ptm-page-title">{selectedClub.name}</h1>
                  <p className="ptm-page-sub">{selectedClub.mission}</p>
                </div>

                <div className="ptm-card">
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('hub')}>
                      <div className="ptm-icon-circle">🎪</div>
                      <span className="ptm-icon-label">Club Events</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('members')}>
                      <div className="ptm-icon-circle">👥</div>
                      <span className="ptm-icon-label">Committee ({selectedClub.members?.length || 0})</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('gallery')}>
                      <div className="ptm-icon-circle">📸</div>
                      <span className="ptm-icon-label">Media Links ({selectedClub.gallery?.length || 0})</span>
                    </button>
                    <button className="ptm-icon-tile" onClick={() => setClubSubView('info')}>
                      <div className="ptm-icon-circle">ℹ️</div>
                      <span className="ptm-icon-label">Advisor & Info</span>
                    </button>
                  </div>
                </div>

                {clubSubView === 'hub' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">All Events Submitted by {selectedClub.club_id}</div>
                    <div className="ptm-list">
                      {events.filter((e) => (e.club_id || '').toUpperCase() === selectedClub.club_id.toUpperCase()).length === 0 ? (
                        <div className="ptm-list-sub">No events submitted by this club yet.</div>
                      ) : (
                        events
                          .filter((e) => (e.club_id || '').toUpperCase() === selectedClub.club_id.toUpperCase())
                          .map((ev) => (
                            <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'club_detail')}>
                              <div className="ptm-avatar-pastel">🎪</div>
                              <div className="ptm-list-main">
                                <div className="ptm-list-title">{ev.title}</div>
                                <div className="ptm-list-sub">
                                  📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})
                                </div>
                                <span className="ptm-tag-pill">👥 {ev.rsvps?.length || 0} RSVPs</span>
                              </div>
                              <span
                                className="ptm-status-badge"
                                style={{
                                  background: ev.status === 'Approved' ? '#DCFCE7' : '#FEF3C7',
                                  color: ev.status === 'Approved' ? '#15803D' : '#B45309'
                                }}
                              >
                                {ev.status} ›
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </div>
                )}

                {clubSubView === 'members' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Student Committee Members</div>
                    {(!selectedClub.members || selectedClub.members.length === 0) ? (
                      <div className="ptm-list-sub">No committee members listed yet.</div>
                    ) : (
                      <div className="ptm-list">
                        {selectedClub.members.map((m, idx) => (
                          <div key={idx} className="ptm-list-row">
                            <div className="ptm-avatar-pastel">{(m.name || 'MB').slice(0, 2)}</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{m.name}</div>
                              <div className="ptm-list-sub">Roll No: {m.roll}</div>
                            </div>
                            <span className="ptm-tag-pill">{m.position}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {clubSubView === 'gallery' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Club Media & Google Drive Archives</div>
                    {(!selectedClub.gallery || selectedClub.gallery.length === 0) ? (
                      <div className="ptm-list-sub">No media links uploaded yet.</div>
                    ) : (
                      <div className="ptm-list">
                        {selectedClub.gallery.map((g, idx) => (
                          <div key={idx} className="ptm-list-row">
                            <div className="ptm-avatar-pastel">📸</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{g.caption}</div>
                              <div className="ptm-list-sub">{g.timestamp}</div>
                            </div>
                            <a
                              href={g.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="ptm-btn-secondary"
                              style={{ textDecoration: 'none', width: 'auto', padding: '6px 12px' }}
                            >
                              Open Drive ↗
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {clubSubView === 'info' && (
                  <div className="ptm-card">
                    <div className="ptm-section-title">Governance & Faculty Oversight</div>
                    <div className="ptm-list">
                      <div className="ptm-list-row">
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">Faculty Advisor</div>
                          <div className="ptm-list-sub">{selectedClub.faculty_advisor || 'Assigned by Dean SW'}</div>
                        </div>
                      </div>
                      <div className="ptm-list-row">
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">Student Head Coordinator</div>
                          <div className="ptm-list-sub">{selectedClub.head_coordinator || 'Club Secretary'}</div>
                        </div>
                      </div>
                      {selectedClub.extra_dean_info && (
                        <div className="ptm-list-row">
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">Additional Notes for Dean SW</div>
                            <div className="ptm-list-sub">{selectedClub.extra_dean_info}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
                4. APPROVE EVENTS QUEUE
                ========================================== */}
            {page === 'event_approvals' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Pending Event Requisitions ({pendingEvents.length})</h1>
                  <p className="ptm-page-sub">Click any event to inspect its full requisition dossier and automated time-clash audit.</p>
                </div>

                <div className="ptm-card">
                  {pendingEvents.length === 0 ? (
                    <div className="ptm-list-sub" style={{ textAlign: 'center', padding: '24px' }}>
                      ✅ All pending club event proposals have been reviewed!
                    </div>
                  ) : (
                    <div className="ptm-list">
                      {pendingEvents.map((ev) => {
                        const audit = checkTimeClash(ev);
                        return (
                          <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'event_approvals')}>
                            <div className="ptm-avatar-pastel">⚡</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{ev.title}</div>
                              <div className="ptm-list-sub">
                                <strong>{ev.club_id}</strong> • 📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})
                              </div>
                              <span
                                className="ptm-tag-pill"
                                style={{
                                  background: audit.clash ? '#FEF3C7' : '#DCFCE7',
                                  color: audit.clash ? '#92400E' : '#166534'
                                }}
                              >
                                {audit.clash ? '⏰ Time Overlap Detected' : '✅ Slot Clear'}
                              </span>
                            </div>
                            <span className="ptm-status-badge" style={{ background: '#FEF3C7', color: '#B45309' }}>
                              Open Dossier ›
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Recently Approved / Active Campus Events</div>
                  <div className="ptm-list">
                    {events
                      .filter((e) => e.status !== 'Pending Dean Approval')
                      .map((ev) => (
                        <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'event_approvals')}>
                          <div className="ptm-avatar-pastel">🎪</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{ev.title}</div>
                            <div className="ptm-list-sub">
                              {ev.club_id} • 📍 {ev.venue} • 📅 {ev.date} • 👥 {ev.rsvps?.length || 0} Attending
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ptm-btn-danger"
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '11px', marginRight: '8px' }}
                            onClick={(e) => handleDeleteEvent(ev.event_id, e)}
                          >
                            🗑️ Delete
                          </button>
                          <span
                            className="ptm-status-badge"
                            style={{
                              background: ev.status === 'Approved' ? '#DCFCE7' : '#FEE2E2',
                              color: ev.status === 'Approved' ? '#15803D' : '#B91C1C'
                            }}
                          >
                            {ev.status} ›
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                5. FULL EVENT REQUISITION DOSSIER (DARPAN VIEW)
                ========================================== */}
            {page === 'event_detail' && selectedEvent && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage(previousPage || 'event_approvals')}>←</button>
                  <span className="ptm-tag-pill">{selectedEvent.event_id} • {selectedEvent.status}</span>
                  <h1 className="ptm-page-title">{selectedEvent.title}</h1>
                  <p className="ptm-page-sub">Submitted by {selectedEvent.club_id}</p>
                </div>

                {selectedEvent.image_url && (
                  <div className="ptm-card" style={{ padding: '12px', overflow: 'hidden' }}>
                    <img
                      src={selectedEvent.image_url}
                      alt={selectedEvent.title}
                      style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', borderRadius: '12px' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div className="ptm-card">
                  <div className="ptm-section-title">Event Requisition Dossier</div>
                  <p style={{ whiteSpace: 'pre-line', color: '#1F2937', marginBottom: '14px', lineHeight: 1.55 }}>
                    {selectedEvent.description}
                  </p>

                  {(() => {
                    const audit = checkTimeClash(selectedEvent);
                    return (
                      <div
                        style={{
                          background: audit.clash ? '#FEF3C7' : '#DCFCE7',
                          border: `1px solid ${audit.clash ? '#FCD34D' : '#86EFAC'}`,
                          color: audit.clash ? '#92400E' : '#166534',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '13px',
                          marginBottom: '16px'
                        }}
                      >
                        {audit.text}
                      </div>
                    );
                  })()}

                  <div className="ptm-list">
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">📍 Venue</div>
                        <div className="ptm-list-sub">{selectedEvent.venue}</div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">🗓️ Date & Timing</div>
                        <div className="ptm-list-sub">
                          {selectedEvent.date} ({selectedEvent.start_time} to {selectedEvent.end_time})
                        </div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">💰 Estimated Budget & Funding</div>
                        <div className="ptm-list-sub">
                          Budget: {selectedEvent.budget || 'Not Specified'} • Source: {selectedEvent.funding_source || 'Institute / Self'}
                        </div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">🎙️ Chief Guest / Speakers</div>
                        <div className="ptm-list-sub">{selectedEvent.chief_guest || 'None'}</div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">👥 Expected Crowd & Live RSVPs</div>
                        <div className="ptm-list-sub">
                          Expected: {selectedEvent.expected_attendance || '100+'} • Confirmed Student RSVPs: {selectedEvent.rsvps?.length || 0}
                        </div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">🛠️ Logistics & Permissions Needed</div>
                        <div className="ptm-list-sub">{selectedEvent.logistics_needs || selectedEvent.logistics || 'Standard Venue Setup'}</div>
                      </div>
                    </div>
                  </div>

                  <div className="ptm-form-stack" style={{ marginTop: '14px' }}>
                    {selectedEvent.image_url && (
                      <a
                        href={selectedEvent.image_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ptm-btn-secondary"
                        style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                      >
                        🖼️ Open Event Poster / Google Drive Attachment ↗
                      </a>
                    )}
                    {selectedEvent.registration_link && (
                      <a
                        href={selectedEvent.registration_link}
                        target="_blank"
                        rel="noreferrer"
                        className="ptm-btn-secondary"
                        style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
                      >
                        📝 View Registration / Google Form Link ↗
                      </a>
                    )}
                  </div>

                  <div className="ptm-grid-2" style={{ marginTop: '18px' }}>
                    <button
                      className="ptm-btn-primary"
                      onClick={() => handleApproveEvent(selectedEvent.event_id, 'Approved')}
                    >
                      ✓ Approve Event Proposal
                    </button>
                    <button
                      className="ptm-btn-danger"
                      onClick={() => handleApproveEvent(selectedEvent.event_id, 'Disapproved')}
                    >
                      ✕ Disapprove Request
                    </button>
                  </div>

                  <button
                    type="button"
                    className="ptm-btn-danger"
                    style={{ marginTop: '10px' }}
                    onClick={(e) => handleDeleteEvent(selectedEvent.event_id, e)}
                  >
                    🗑️ Permanently Delete Event from Portal
                  </button>
                </div>
              </div>
            )}

            {/* ==========================================
                6. APPROVE NOTICES QUEUE & DETAIL VIEW
                ========================================== */}
            {page === 'notice_approvals' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Campus Notice Approvals ({pendingNotices.length} Pending)</h1>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Pending Dean Approval</div>
                  {pendingNotices.length === 0 ? (
                    <div className="ptm-list-sub">No pending notices waiting for approval.</div>
                  ) : (
                    <div className="ptm-list">
                      {pendingNotices.map((n) => (
                        <div
                          key={n.notice_id}
                          className="ptm-list-row"
                          onClick={() => {
                            setSelectedNotice(n);
                            setPage('notice_detail');
                          }}
                        >
                          <div className="ptm-avatar-pastel">📢</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{n.title}</div>
                            <div className="ptm-list-sub">
                              {n.club_id} • Target: {n.target_year} ({n.target_branch})
                            </div>
                          </div>
                          <button
                            type="button"
                            className="ptm-btn-primary"
                            style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApproveNotice(n.notice_id, 'Approved');
                            }}
                          >
                            ✓ Approve
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Published Campus Notices ({notices.length})</div>
                  <div className="ptm-list">
                    {notices.map((n) => (
                      <div
                        key={n.notice_id}
                        className="ptm-list-row"
                        onClick={() => {
                          setSelectedNotice(n);
                          setPage('notice_detail');
                        }}
                      >
                        <div className="ptm-avatar-pastel">📢</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{n.title}</div>
                          <div className="ptm-list-sub">
                            {n.club_id} • {n.status} • {n.created_at}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ptm-btn-danger"
                          style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                          onClick={(e) => handleDeleteNotice(n.notice_id, e)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {page === 'notice_detail' && selectedNotice && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('notice_approvals')}>←</button>
                  <span className="ptm-tag-pill">{selectedNotice.club_id} • {selectedNotice.status}</span>
                  <h1 className="ptm-page-title">{selectedNotice.title}</h1>
                </div>
                <div className="ptm-card">
                  <p style={{ whiteSpace: 'pre-line', marginBottom: '14px' }}>{selectedNotice.message}</p>
                  <div className="ptm-list-sub" style={{ marginBottom: '14px' }}>
                    🎯 <strong>Target Audience:</strong> {selectedNotice.target_year} • {selectedNotice.target_branch}
                  </div>
                  <div className="ptm-grid-2">
                    <button className="ptm-btn-primary" onClick={() => handleApproveNotice(selectedNotice.notice_id, 'Approved')}>
                      ✓ Approve Notice
                    </button>
                    <button className="ptm-btn-danger" onClick={() => handleApproveNotice(selectedNotice.notice_id, 'Disapproved')}>
                      ✕ Disapprove
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                7. CREATE NEW OFFICIAL SAC CLUB
                ========================================== */}
            {page === 'create_club' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Register New Official SVNIT Club</h1>
                  <p className="ptm-page-sub">Creates an official club login & directory listing immediately.</p>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleCreateClub} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Club Short Code / Login ID</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. CHRD, CES, ACM, DRISHTI"
                        value={clubForm.club_id}
                        onChange={(e) => setClubForm({ ...clubForm, club_id: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Full Official Club Name</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. Center for Human Resource Development"
                        value={clubForm.name}
                        onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Faculty Advisor Name</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. Dr. Shweta Shah"
                        value={clubForm.faculty_advisor}
                        onChange={(e) => setClubForm({ ...clubForm, faculty_advisor: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Student Head Coordinator</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. Student Secretary Name"
                        value={clubForm.head_coordinator}
                        onChange={(e) => setClubForm({ ...clubForm, head_coordinator: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Official Club Email</label>
                      <input
                        type="email"
                        className="ptm-input"
                        placeholder="club@svnit.ac.in"
                        value={clubForm.email}
                        onChange={(e) => setClubForm({ ...clubForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Club Mission / Description</label>
                      <textarea
                        rows="2"
                        className="ptm-input"
                        placeholder="Short description of club activities..."
                        value={clubForm.mission}
                        onChange={(e) => setClubForm({ ...clubForm, mission: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="ptm-btn-primary">+ Create Official Club</button>
                  </form>
                </div>
              </div>
            )}

            {/* ==========================================
                8. CENTRAL MAINTENANCE DEPARTMENTS
                ========================================== */}
            {page === 'central_depts' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Central Institute Maintenance Wings</h1>
                  <p className="ptm-page-sub">Central wings (Electrical, Plumbing, LAN, Estate) serve all 9 SVNIT Bhawans.</p>
                </div>

                <div className="ptm-card">
                  <form onSubmit={handleCreateCentralDept} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Department Code / Staff Login ID</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. ELECTRICITY, PLUMBING, LAN_WIFI"
                        value={deptForm.dept_id}
                        onChange={(e) => setDeptForm({ ...deptForm, dept_id: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Department Title</label>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="e.g. Electrical Maintenance (Central)"
                        value={deptForm.name}
                        onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Engineer / Supervisor Email</label>
                      <input
                        type="email"
                        className="ptm-input"
                        placeholder="estate.electrical@svnit.ac.in"
                        value={deptForm.email}
                        onChange={(e) => setDeptForm({ ...deptForm, email: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="ptm-btn-primary">+ Add Central Maintenance Wing</button>
                  </form>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Active Central Departments ({centralDepts.length})</div>
                  <div className="ptm-list">
                    {centralDepts.map((d) => (
                      <div key={d.id} className="ptm-list-row">
                        <div className="ptm-avatar-pastel">{d.icon || '⚡'}</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{d.title}</div>
                          <div className="ptm-list-sub">ID: {d.id} • Scope: All 9 SVNIT Hostels</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ==========================================
                9. HOSTEL WARDENS MANAGEMENT (9 BHAWANS)
                ========================================== */}
            {page === 'wardens' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Hostels, Wings & Wardens</h1>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Add a Hostel or Configure Its Wings</div>
                  <form onSubmit={handleSaveHostel} className="ptm-form-stack">
                    <label className="ptm-label">Hostel name
                      <input className="ptm-input" value={hostelForm.name} onChange={(event) => setHostelForm({ ...hostelForm, name: event.target.value })} maxLength={100} required />
                    </label>
                    <label className="ptm-label">Wings (comma-separated)
                      <input className="ptm-input" value={hostelForm.wings} onChange={(event) => setHostelForm({ ...hostelForm, wings: event.target.value })} placeholder="North, South, East" required />
                    </label>
                    <button type="submit" className="ptm-btn-primary">Save Hostel Configuration</button>
                  </form>
                  <div className="ptm-list" style={{ marginTop: '14px' }}>
                    {hostels.map((hostel) => (
                      <div className="ptm-list-row" key={hostel.hostel_id}>
                        <div className="ptm-avatar-pastel">🏢</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{hostel.name}</div>
                          <div className="ptm-list-sub">Wings: {(hostel.wings || []).join(', ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Assign a Warden to a Configured Hostel</div>
                  <form onSubmit={handleUpdateWarden} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Select hostel</label>
                      <select
                        className="ptm-input"
                        value={wardenForm.hostel_id}
                        required
                        onChange={(e) => {
                          const found = hostels.find((h) => h.hostel_id === e.target.value);
                          if (found) {
                            setWardenForm({
                              user_id: found.warden_id || `CW_${found.hostel_id}`,
                              hostel_id: found.hostel_id,
                              hostel_block: found.name,
                              phone: found.warden_phone || '',
                              email: found.warden_email || ''
                            });
                          }
                        }}
                      >
                        <option value="">Choose a hostel</option>
                        {hostels.map((hostel) => (
                          <option key={hostel.hostel_id} value={hostel.hostel_id}>
                            {hostel.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="ptm-label">Warden account ID
                      <input className="ptm-input" value={wardenForm.user_id} onChange={(e) => setWardenForm({ ...wardenForm, user_id: e.target.value.toUpperCase() })} required />
                    </label>
                    <div>
                      <label className="ptm-label">Work email (optional)</label>
                      <input
                        type="email"
                        className="ptm-input"
                        value={wardenForm.email}
                        onChange={(e) => setWardenForm({ ...wardenForm, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="ptm-label">Hostel Office Phone</label>
                      <input
                        type="text"
                        className="ptm-input"
                        value={wardenForm.phone}
                        onChange={(e) => setWardenForm({ ...wardenForm, phone: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="ptm-btn-primary">Save Warden Assignment</button>
                  </form>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Configured Hostels</div>
                  <div className="ptm-list">
                    {hostels.map((h) => (
                      <div key={h.hostel_id} className="ptm-list-row">
                        <div className="ptm-avatar-pastel">🏢</div>
                        <div className="ptm-list-main">
                          <div className="ptm-list-title">{h.name}</div>
                          <div className="ptm-list-sub">
                            {(h.wings || []).length} wings
                            {h.warden_id && <> • Warden account: <strong>{h.warden_id}</strong></>}
                            {h.warden_email && <> • ✉️ {h.warden_email}</>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {page === 'staff_accounts' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Staff account passwords</h1>
                </div>
                <StaffAccountAccess apiUrl={apiUrl} user={user} />
              </div>
            )}

            {page === 'gate_security' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Gate Security Accounts</h1>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Add authorized gate staff</div>
                  <p className="ptm-list-sub">Only listed security accounts can validate student outpass QR codes. Set the account password in Staff account access after adding it.</p>
                  <form onSubmit={handleSaveGateSecurity} className="ptm-form-stack">
                    <div className="ptm-grid-2">
                      <label className="ptm-label">Staff account ID
                        <input className="ptm-input" value={gateSecurityForm.user_id} onChange={(event) => setGateSecurityForm({ ...gateSecurityForm, user_id: event.target.value.toUpperCase() })} maxLength={40} required />
                      </label>
                      <label className="ptm-label">Full name
                        <input className="ptm-input" value={gateSecurityForm.full_name} onChange={(event) => setGateSecurityForm({ ...gateSecurityForm, full_name: event.target.value })} maxLength={160} required />
                      </label>
                    </div>
                    <div className="ptm-grid-2">
                      <label className="ptm-label">Work email (optional)
                        <input type="email" className="ptm-input" value={gateSecurityForm.email} onChange={(event) => setGateSecurityForm({ ...gateSecurityForm, email: event.target.value.trim().toLowerCase() })} />
                      </label>
                      <label className="ptm-label">Phone (optional)
                        <input type="tel" className="ptm-input" value={gateSecurityForm.phone} onChange={(event) => setGateSecurityForm({ ...gateSecurityForm, phone: event.target.value })} />
                      </label>
                    </div>
                    <button type="submit" className="ptm-btn-primary">Save Gate Security Account</button>
                  </form>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Authorized staff ({gateSecurityStaff.length})</div>
                  {gateSecurityStaff.length === 0 ? (
                    <div className="ptm-list-sub">No gate security accounts configured.</div>
                  ) : (
                    <div className="ptm-list">
                      {gateSecurityStaff.map((staff) => (
                        <div className="ptm-list-row" key={staff.user_id}>
                          <div className="ptm-avatar-pastel">🛂</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{staff.full_name} ({staff.user_id})</div>
                            <div className="ptm-list-sub">{staff.email}{staff.phone ? ` · ${staff.phone}` : ''}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==========================================
                10. INTERACTIVE EVENT CALENDAR
                ========================================== */}
            {page === 'calendar' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Campus Master Event Calendar</h1>
                </div>

                <div className="ptm-card">
                  <div className="ptm-row-between" style={{ marginBottom: '14px' }}>
                    <button className="ptm-btn-secondary" onClick={() => changeMonth(-1)}>◀ Prev</button>
                    <h3 style={{ margin: 0 }}>{monthNames[calMonth]} {calYear}</h3>
                    <button className="ptm-btn-secondary" onClick={() => changeMonth(1)}>Next ▶</button>
                  </div>

                  <div className="ptm-cal-grid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="ptm-cal-weekday">{d}</div>
                    ))}
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`e-${i}`} className="ptm-cal-cell empty" />
                    ))}
                    {Array.from({ length: daysNum }).map((_, i) => {
                      const dayNum = i + 1;
                      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const dayEvents = events.filter((e) => e.date === dateStr);
                      return (
                        <div
                          key={dateStr}
                          className={`ptm-cal-cell ${selectedDateStr === dateStr ? 'selected' : ''}`}
                          onClick={() => setSelectedDateStr(dateStr)}
                        >
                          <span className="ptm-cal-daynum">{dayNum}</span>
                          {dayEvents.length > 0 && (
                            <div className="ptm-cal-event-chip">{dayEvents[0].title}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Scheduled Events on {selectedDateStr}</div>
                  {events.filter((e) => e.date === selectedDateStr).length === 0 ? (
                    <div className="ptm-list-sub">No events scheduled on this date.</div>
                  ) : (
                    <div className="ptm-list">
                      {events
                        .filter((e) => e.date === selectedDateStr)
                        .map((ev) => (
                          <div key={ev.event_id} className="ptm-list-row" onClick={() => openEventPage(ev, 'calendar')}>
                            <div className="ptm-avatar-pastel">🎪</div>
                            <div className="ptm-list-main">
                              <div className="ptm-list-title">{ev.title} ({ev.club_id})</div>
                              <div className="ptm-list-sub">
                                📍 {ev.venue} • ⏰ {ev.start_time} - {ev.end_time} • {ev.status}
                              </div>
                            </div>
                            <span>›</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==========================================
                11. REPORTS & CUSTOM LANDSCAPE PDF EXPORT
                ========================================== */}
            {page === 'reports' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Institute Audit Reports & Landscape PDF Export</h1>
                  <p className="ptm-page-sub">Filter across SAC clubs, date ranges, and hostel grievances to generate official print-ready reports.</p>
                </div>

                <div className="ptm-card">
                  <div className="ptm-grid-2" style={{ marginBottom: '12px' }}>
                    <div>
                      <label className="ptm-label">Report Scope</label>
                      <select className="ptm-input" value={pdfScope} onChange={(e) => setPdfScope(e.target.value)}>
                        <option value="All">Complete Audit (Events + Hostel Grievances)</option>
                        <option value="Events">SAC Club Events Only</option>
                        <option value="Grievances">Hostel Grievances Register Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="ptm-label">Filter by Club</label>
                      <select className="ptm-input" value={reportClub} onChange={(e) => setReportClub(e.target.value)}>
                        <option value="All">All 16 SVNIT Clubs</option>
                        {clubs.map((c) => (
                          <option key={c.club_id} value={c.club_id}>
                            {c.name} ({c.club_id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="ptm-grid-2" style={{ marginBottom: '14px' }}>
                    <div>
                      <label className="ptm-label">From Date (Optional)</label>
                      <input type="date" className="ptm-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="ptm-label">To Date (Optional)</label>
                      <input type="date" className="ptm-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                    </div>
                  </div>

                  <button className="ptm-btn-primary" onClick={handleGenerateAuditPdf}>
                    🖨️ Generate & Print Landscape Audit PDF
                  </button>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">Live Campus Telemetry Summary</div>
                  <div className="ptm-list">
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">Verified Students Onboarded</div>
                        <div className="ptm-list-sub">{studentsCount} Active Student Profiles (@svnit.ac.in)</div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">Hostel Maintenance Grievances</div>
                        <div className="ptm-list-sub">{complaints.length} Total Tickets Logged Across 9 Bhawans</div>
                      </div>
                    </div>
                    <div className="ptm-list-row">
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">Official SAC Clubs & Events</div>
                        <div className="ptm-list-sub">{clubs.length} Clubs • {events.length} Events Managed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>
          <span>🏠</span>
          <span>Home</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'clubs_list' || page === 'club_detail' ? 'active' : ''}`} onClick={() => setPage('clubs_list')}>
          <span>🎭</span>
          <span>Clubs</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'event_approvals' ? 'active' : ''}`} onClick={() => setPage('event_approvals')}>
          <span>⚡</span>
          <span>Approvals</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'calendar' ? 'active' : ''}`} onClick={() => setPage('calendar')}>
          <span>🗓️</span>
          <span>Calendar</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}>
          <span>🖨️</span>
          <span>Reports</span>
        </button>
        <button className={`ptm-bnav-btn ${page === 'staff_accounts' ? 'active' : ''}`} onClick={() => setPage('staff_accounts')}>
          <span>🔐</span>
          <span>Staff passwords</span>
        </button>
      </nav>
    </div>
  );
}