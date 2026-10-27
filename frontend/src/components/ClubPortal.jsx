import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

export default function ClubPortal({ user, apiUrl }) {
  const [page, setPage] = useState('home');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [msg, setMsg] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [facultyAdvisor, setFacultyAdvisor] = useState('');
  const [headCoordinator, setHeadCoordinator] = useState('');
  const [missionInput, setMissionInput] = useState('');
  const [extraInfoInput, setExtraInfoInput] = useState('');

  const [memberForm, setMemberForm] = useState({ name: '', roll: '', position: '', phone: '' });

  const [eventForm, setEventForm] = useState({
    title: '',
    date: '2026-10-29',
    start_time: '10:00',
    end_time: '13:00',
    venue: '',
    description: '',
    budget: '',
    funding_source: '',
    chief_guest: '',
    expected_attendance: '',
    logistics_needs: '',
    image_url: '',
    registration_link: ''
  });
  const [eventCustomFields, setEventCustomFields] = useState([]);

  const [noticeForm, setNoticeForm] = useState({
    title: '',
    message: '',
    target_branch: 'All Branches',
    target_year: 'All Years',
    image_url: '',
    registration_link: ''
  });
  const [noticeCustomFields, setNoticeCustomFields] = useState([]);

  const [galleryCaption, setGalleryCaption] = useState('');
  const [galleryUrl, setGalleryUrl] = useState('');

  const loadClubData = useCallback(async () => {
    try {
      const [cRes, eRes] = await Promise.all([
        apiFetch(`${apiUrl}/api/unicore/clubs`),
        apiFetch(`${apiUrl}/api/unicore/events`)
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClubs(cData);
        const myC = cData.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase());
        if (myC) {
          setFacultyAdvisor(myC.faculty_advisor || '');
          setHeadCoordinator(myC.head_coordinator || '');
          setMissionInput(myC.mission || '');
          setExtraInfoInput(myC.extra_dean_info || '');
        }
      }
      if (eRes.ok) setEvents(await eRes.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl, user.user_id]);

  useEffect(() => { loadClubData(); }, [loadClubData]);

  const handleSaveInfo = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/unicore/clubs/update-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        club_id: user.user_id,
        faculty_advisor: facultyAdvisor,
        head_coordinator: headCoordinator,
        mission: missionInput,
        extra_dean_info: extraInfoInput
      })
    });
    if (res.ok) {
      setMsg('✅ Club profile saved!');
      loadClubData();
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/unicore/clubs/add-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, ...memberForm })
    });
    if (res.ok) {
      setMsg(`✅ Added ${memberForm.name} as ${memberForm.position}!`);
      setMemberForm({ name: '', roll: '', position: memberForm.position, phone: '' });
      loadClubData();
    }
  };

  const handleRemoveMember = async (index) => {
    const res = await apiFetch(`${apiUrl}/api/unicore/clubs/remove-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, index })
    });
    if (res.ok) loadClubData();
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/unicore/events/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...eventForm,
        club_id: user.user_id,
        submitted_by: headCoordinator || user.full_name,
        custom_fields: eventCustomFields.filter((f) => f.label.trim() !== '')
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setEventCustomFields([]);
      loadClubData();
      setPage('my_events');
    }
  };

  const handleProposeNotice = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/notices/propose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...noticeForm,
        club_id: user.user_id,
        custom_fields: noticeCustomFields.filter((f) => f.label.trim() !== '')
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`📢 ${data.message}`);
      setNoticeForm({ title: '', message: '', target_branch: 'All Branches', target_year: 'All Years', image_url: '', registration_link: '' });
      setNoticeCustomFields([]);
      setPage('home');
    }
  };

  const handleAddGallery = async (e) => {
    e.preventDefault();
    if (!galleryUrl) return;
    const res = await apiFetch(`${apiUrl}/api/unicore/clubs/add-gallery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, media_type: 'link', media_url: galleryUrl, caption: galleryCaption })
    });
    if (res.ok) {
      setMsg('📸 Photo / Drive Link added to gallery!');
      setGalleryCaption('');
      setGalleryUrl('');
      loadClubData();
    }
  };

  const myClub = clubs.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || {};
  const myEvents = events.filter((e) => e.club_id.toUpperCase() === (user.user_id || '').toUpperCase());

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Club Hub</button>
        <button className={`ptm-side-btn ${page === 'info' ? 'active' : ''}`} onClick={() => setPage('info')}>ℹ️ Club Info & Advisor</button>
        <button className={`ptm-side-btn ${page === 'members' ? 'active' : ''}`} onClick={() => setPage('members')}>👥 Custom Positions ({myClub.members?.length || 0})</button>
        <button className={`ptm-side-btn ${page === 'propose_event' ? 'active' : ''}`} onClick={() => setPage('propose_event')}>🚀 Request Event to Dean</button>
        <button className={`ptm-side-btn ${page === 'propose_notice' ? 'active' : ''}`} onClick={() => setPage('propose_notice')}>📢 Post Student Notice</button>
        <button className={`ptm-side-btn ${page === 'my_events' ? 'active' : ''}`} onClick={() => setPage('my_events')}>🎪 My Events ({myEvents.length})</button>
        <button className={`ptm-side-btn ${page === 'gallery' ? 'active' : ''}`} onClick={() => setPage('gallery')}>📸 Media Links</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {page === 'home' && (
          <div>
            <div className="ptm-card">
              <span className="ptm-tag-pill">OFFICIAL CLUB PORTAL • {user.user_id}</span>
              <h2 style={{ margin: '8px 0 4px 0' }}>{myClub.name || user.full_name}</h2>
              <p className="ptm-list-sub">{myClub.mission}</p>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Manage {user.user_id} Club</div>
              <div className="ptm-icon-grid">
                <button className="ptm-icon-tile" onClick={() => setPage('info')}>
                  <div className="ptm-icon-circle">ℹ️</div>
                  <span className="ptm-icon-label">Club Info & Advisor</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('members')}>
                  <div className="ptm-icon-circle">👥</div>
                  <span className="ptm-icon-label">Positions & Members</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('propose_event')}>
                  <div className="ptm-icon-circle">🚀</div>
                  <span className="ptm-icon-label">Request Event to Dean</span>
                </button>
                <button className="ptm-icon-tile" onClick={() => setPage('propose_notice')}>
                  <div className="ptm-icon-circle">📢</div>
                  <span className="ptm-icon-label">Send Notice to Students</span>
                </button>
              </div>
            </div>

            <div className="ptm-card">
              <div className="ptm-row-between" style={{ marginBottom: '10px' }}>
                <div className="ptm-section-title" style={{ margin: 0 }}>Recent Events ({myEvents.length})</div>
                <button className="ptm-btn-secondary" onClick={() => setPage('gallery')}>📸 Add Drive Photos</button>
              </div>
              {myEvents.length === 0 ? (
                <div className="ptm-list-sub">No events proposed yet.</div>
              ) : (
                <div className="ptm-list">
                  {myEvents.map((ev) => (
                    <div key={ev.event_id} className="ptm-list-row" onClick={() => { setSelectedEvent(ev); setPage('event_detail'); }}>
                      <div className="ptm-avatar-pastel">🎪</div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{ev.title}</div>
                        <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date} • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                      </div>
                      <span className="ptm-status-badge" style={{ background: '#E0F2FE', color: '#002970' }}>{ev.status} ›</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'info' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Club Info & Faculty Advisor</h1>
            </div>
            <div className="ptm-card">
              <form onSubmit={handleSaveInfo} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Faculty Advisor Name & Department</label>
                  <input type="text" className="ptm-input" placeholder="e.g. Dr. R. K. Gupta (Comp. Engg.)" value={facultyAdvisor} onChange={(e) => setFacultyAdvisor(e.target.value)} required />
                </div>
                <div>
                  <label className="ptm-label">Head Student Coordinator / Convener</label>
                  <input type="text" className="ptm-input" placeholder="Full Name" value={headCoordinator} onChange={(e) => setHeadCoordinator(e.target.value)} required />
                </div>
                <div>
                  <label className="ptm-label">Club Bio & Mission</label>
                  <textarea rows="3" className="ptm-input" value={missionInput} onChange={(e) => setMissionInput(e.target.value)} required />
                </div>
                <div>
                  <label className="ptm-label">Additional Information for Dean</label>
                  <textarea rows="2" className="ptm-input" value={extraInfoInput} onChange={(e) => setExtraInfoInput(e.target.value)} />
                </div>
                <button type="submit" className="ptm-btn-primary">Save Club Profile</button>
              </form>
            </div>
          </div>
        )}

        {page === 'members' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Custom Positions & Members</h1>
              <p className="ptm-page-sub">Type any custom position name and add one or multiple students to that position.</p>
            </div>
            <div className="ptm-card">
              <form onSubmit={handleAddMember} className="ptm-form-stack">
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Custom Position / Role Title</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Convener, Tech Head, PR Team" value={memberForm.position} onChange={(e) => setMemberForm({ ...memberForm, position: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Student Full Name</label>
                    <input type="text" className="ptm-input" placeholder="Full Name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Roll Number</label>
                    <input type="text" className="ptm-input" placeholder="e.g. U24CS011" value={memberForm.roll} onChange={(e) => setMemberForm({ ...memberForm, roll: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Phone Number</label>
                    <input type="text" className="ptm-input" placeholder="+91 9876543210" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary">+ Add Member to Position</button>
              </form>
            </div>

            <div className="ptm-card">
              <div className="ptm-section-title">Current Club Roster ({myClub.members?.length || 0})</div>
              {(!myClub.members || myClub.members.length === 0) ? (
                <div className="ptm-list-sub">No members added yet.</div>
              ) : (
                <div className="ptm-list">
                  {myClub.members.map((m, idx) => (
                    <div key={idx} className="ptm-list-row">
                      <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>
                        {(m.name || 'MB').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="ptm-list-main">
                        <div className="ptm-list-title">{m.name} ({m.roll})</div>
                        <div className="ptm-list-sub">Position: <strong>{m.position}</strong> {m.phone && `• 📞 ${m.phone}`}</div>
                      </div>
                      <button className="ptm-btn-secondary" onClick={() => handleRemoveMember(idx)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {page === 'propose_event' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Request Event Permission from Dean</h1>
              <p className="ptm-page-sub">Write important event details above and attach your Google Drive poster / registration links below.</p>
            </div>

            <div className="ptm-card">
              <form onSubmit={handleProposeEvent} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Event Name / Title</label>
                  <input type="text" className="ptm-input" placeholder="e.g. Algothon 2026" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Manual Venue (Type Any Campus Location)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. SAC Amphitheatre, Old CRC Lawn" value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} required />
                  </div>
                  <div>
                    <label className="ptm-label">Event Date</label>
                    <input type="date" className="ptm-input" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required />
                  </div>
                </div>
                <div className="ptm-grid-2">
                  <div><label className="ptm-label">Start Time</label><input type="time" className="ptm-input" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} required /></div>
                  <div><label className="ptm-label">End Time</label><input type="time" className="ptm-input" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} required /></div>
                </div>

                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Estimated Budget (₹)</label>
                    <input type="text" className="ptm-input" placeholder="e.g. ₹45,000" value={eventForm.budget} onChange={(e) => setEventForm({ ...eventForm, budget: e.target.value })} />
                  </div>
                  <div>
                    <label className="ptm-label">Funding Source / Sponsors</label>
                    <input type="text" className="ptm-input" placeholder="e.g. Institute SAC Grant + Sponsors" value={eventForm.funding_source} onChange={(e) => setEventForm({ ...eventForm, funding_source: e.target.value })} />
                  </div>
                </div>

                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Chief Guest / External Speakers</label>
                    <input type="text" className="ptm-input" placeholder="Names & Designations" value={eventForm.chief_guest} onChange={(e) => setEventForm({ ...eventForm, chief_guest: e.target.value })} />
                  </div>
                  <div>
                    <label className="ptm-label">Expected Student Attendance</label>
                    <input type="text" className="ptm-input" placeholder="e.g. 400+ Students" value={eventForm.expected_attendance} onChange={(e) => setEventForm({ ...eventForm, expected_attendance: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="ptm-label">Logistics, Sound, Security & Permission Details</label>
                  <input type="text" className="ptm-input" placeholder="e.g. 4 Wireless Mics, Projector, Late Night Hostel Entry Permission" value={eventForm.logistics_needs} onChange={(e) => setEventForm({ ...eventForm, logistics_needs: e.target.value })} />
                </div>

                <div>
                  <label className="ptm-label">Important Event Description (Shown Above Links)</label>
                  <textarea rows="4" className="ptm-input" placeholder="Write all important event rules, schedule, and instructions..." value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />
                </div>

                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Poster / Google Drive / Brochure Link (Shown Below Description)</label>
                    <input type="url" className="ptm-input" placeholder="https://drive.google.com/..." value={eventForm.image_url} onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })} />
                  </div>
                  <div>
                    <label className="ptm-label">Google Form / Registration Link (Optional)</label>
                    <input type="url" className="ptm-input" placeholder="https://docs.google.com/forms/..." value={eventForm.registration_link} onChange={(e) => setEventForm({ ...eventForm, registration_link: e.target.value })} />
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  <div className="ptm-row-between" style={{ marginBottom: '10px' }}>
                    <span className="ptm-label" style={{ margin: 0 }}>📌 Additional Custom Fields for Dean</span>
                    <button
                      type="button"
                      className="ptm-btn-secondary"
                      onClick={() => setEventCustomFields([...eventCustomFields, { label: '', value: '' }])}
                    >
                      + Add Custom Field
                    </button>
                  </div>
                  {eventCustomFields.map((cf, idx) => (
                    <div key={idx} className="ptm-grid-2" style={{ marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="Field Name (e.g. Guest Room)"
                        value={cf.label}
                        onChange={(e) => {
                          const copy = [...eventCustomFields];
                          copy[idx].label = e.target.value;
                          setEventCustomFields(copy);
                        }}
                      />
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="Details"
                        value={cf.value}
                        onChange={(e) => {
                          const copy = [...eventCustomFields];
                          copy[idx].value = e.target.value;
                          setEventCustomFields(copy);
                        }}
                      />
                    </div>
                  ))}
                </div>

                <button type="submit" className="ptm-btn-primary">Submit Complete Event Dossier to Dean</button>
              </form>
            </div>
          </div>
        )}

        {page === 'propose_notice' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Send Notice / Announcement</h1>
              <p className="ptm-page-sub">Write important notice details first, then attach the Google Drive poster/image link and form link below.</p>
            </div>
            <div className="ptm-card">
              <form onSubmit={handleProposeNotice} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Notice Headline</label>
                  <input type="text" className="ptm-input" placeholder="e.g. Recruitment & Auditions Open for 1st Year" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} required />
                </div>
                <div>
                  <label className="ptm-label">Important Written Notice Details (Shown First)</label>
                  <textarea rows="4" className="ptm-input" placeholder="Write venue, timings, eligibility, and key instructions..." value={noticeForm.message} onChange={(e) => setNoticeForm({ ...noticeForm, message: e.target.value })} required />
                </div>
                <div className="ptm-grid-2">
                  <div><label className="ptm-label">Target Year</label><input type="text" className="ptm-input" value={noticeForm.target_year} onChange={(e) => setNoticeForm({ ...noticeForm, target_year: e.target.value })} required /></div>
                  <div><label className="ptm-label">Target Department / Branch</label><input type="text" className="ptm-input" value={noticeForm.target_branch} onChange={(e) => setNoticeForm({ ...noticeForm, target_branch: e.target.value })} required /></div>
                </div>
                <div className="ptm-grid-2">
                  <div>
                    <label className="ptm-label">Poster / Google Drive Image Link (Shown Below Description)</label>
                    <input type="url" className="ptm-input" placeholder="https://drive.google.com/..." value={noticeForm.image_url} onChange={(e) => setNoticeForm({ ...noticeForm, image_url: e.target.value })} />
                  </div>
                  <div>
                    <label className="ptm-label">Google Form / Registration Link (Optional)</label>
                    <input type="url" className="ptm-input" placeholder="https://docs.google.com/forms/..." value={noticeForm.registration_link} onChange={(e) => setNoticeForm({ ...noticeForm, registration_link: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="ptm-btn-primary">Submit Notice for Dean Approval</button>
              </form>
            </div>
          </div>
        )}

        {page === 'my_events' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">My Club Events</h1>
            </div>
            <div className="ptm-card">
              <div className="ptm-list">
                {myEvents.map((ev) => (
                  <div key={ev.event_id} className="ptm-list-row" onClick={() => { setSelectedEvent(ev); setPage('event_detail'); }}>
                    <div className="ptm-avatar-pastel">🎪</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{ev.title}</div>
                      <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date} • 👥 {ev.rsvps?.length || 0} RSVPs</div>
                    </div>
                    <span className="ptm-status-badge" style={{ background: '#E0F2FE', color: '#002970' }}>{ev.status} ›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {page === 'event_detail' && selectedEvent && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('my_events')}>←</button>
              <h1 className="ptm-page-title">{selectedEvent.title}</h1>
            </div>
            <div className="ptm-card">
              <p style={{ whiteSpace: 'pre-line' }}>{selectedEvent.description}</p>
              <div className="ptm-list">
                <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Status</div><div className="ptm-list-sub">{selectedEvent.status}</div></div></div>
                <div className="ptm-list-row"><div className="ptm-list-main"><div className="ptm-list-title">Confirmed Student RSVPs</div><div className="ptm-list-sub">{selectedEvent.rsvps?.length || 0} Students Attending</div></div></div>
              </div>
            </div>
          </div>
        )}

        {page === 'gallery' && (
          <div>
            <div className="ptm-drill-header">
              <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
              <h1 className="ptm-page-title">Club Photo & Drive Gallery</h1>
            </div>
            <div className="ptm-card">
              <form onSubmit={handleAddGallery} className="ptm-form-stack">
                <div>
                  <label className="ptm-label">Google Drive Photo / Album Link</label>
                  <input type="url" className="ptm-input" placeholder="https://drive.google.com/..." value={galleryUrl} onChange={(e) => setGalleryUrl(e.target.value)} required />
                </div>
                <div>
                  <label className="ptm-label">Caption / Event Name</label>
                  <input type="text" className="ptm-input" placeholder="e.g. Orientation Day 2026 Photos" value={galleryCaption} onChange={(e) => setGalleryCaption(e.target.value)} required />
                </div>
                <button type="submit" className="ptm-btn-primary">Save Gallery Link</button>
              </form>
            </div>
            <div className="ptm-card">
              <div className="ptm-list">
                {myClub.gallery?.map((g, i) => (
                  <div key={i} className="ptm-list-row">
                    <div className="ptm-avatar-pastel">📸</div>
                    <div className="ptm-list-main">
                      <div className="ptm-list-title">{g.caption}</div>
                      <div className="ptm-list-sub">{g.timestamp}</div>
                    </div>
                    <a href={g.media_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ textDecoration: 'none' }}>
                      Open ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        <button className={`ptm-bnav-btn ${page === 'members' ? 'active' : ''}`} onClick={() => setPage('members')}><span>👥</span><span>Members</span></button>
        <button className={`ptm-bnav-btn ${page === 'propose_event' ? 'active' : ''}`} onClick={() => setPage('propose_event')}><span>🚀</span><span>Propose</span></button>
        <button className={`ptm-bnav-btn ${page === 'propose_notice' ? 'active' : ''}`} onClick={() => setPage('propose_notice')}><span>📢</span><span>Notice</span></button>
      </nav>
    </div>
  );
}