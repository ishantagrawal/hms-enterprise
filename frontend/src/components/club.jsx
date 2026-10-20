import React, { useState, useEffect, useCallback } from 'react';

export default function ClubPortal({ user, apiUrl }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [clubs, setClubs] = useState([]);
  const [events, setEvents] = useState([]);
  const [notices, setNotices] = useState([]);
  const [selectedEventFeedback, setSelectedEventFeedback] = useState(null);
  const [msg, setMsg] = useState(null);

  // 1. Manual Club Profile & Dossier State
  const [dossier, setDossier] = useState({
    name: '', tagline: '', mission: '', faculty_advisor: '',
    head_coordinator: '', banner_url: '', avatar_url: '', extra_dean_info: ''
  });

  // 2. Manual Member Roster Form
  const [memberForm, setMemberForm] = useState({ name: '', roll: '', position: '', phone: '' });

  // 3. Gallery Upload Form (Device File OR URL)
  const [galleryForm, setGalleryForm] = useState({ media_type: 'image', media_url: '', caption: '' });

  // 4. Manual Event Requisition Form (100% Free-Text Manual Venue)
  const [eventForm, setEventForm] = useState({
    title: '', date: '2026-10-29', start_time: '16:00', end_time: '19:00',
    venue: '', description: '', image_url: '', registration_link: ''
  });

  // 5. Targeted Notice Form
  const [noticeForm, setNoticeForm] = useState({
    title: '', message: '', target_branch: 'All', target_year: 'All', attachment_link: ''
  });

  const loadClubData = useCallback(async () => {
    try {
      const [cRes, eRes, nRes] = await Promise.all([
        fetch(`${apiUrl}/api/unicore/clubs`),
        fetch(`${apiUrl}/api/unicore/events`),
        fetch(`${apiUrl}/api/unicore/notices`)
      ]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setClubs(cData);
        const myC = cData.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase());
        if (myC) {
          setDossier({
            name: myC.name || '',
            tagline: myC.tagline || '',
            mission: myC.mission || '',
            faculty_advisor: myC.faculty_advisor || '',
            head_coordinator: myC.head_coordinator || '',
            banner_url: myC.banner_url || '',
            avatar_url: myC.avatar_url || '',
            extra_dean_info: myC.extra_dean_info || ''
          });
        }
      }
      if (eRes.ok) setEvents(await eRes.json());
      if (nRes.ok) setNotices(await nRes.json());
    } catch (e) { console.error(e); }
  }, [apiUrl, user.user_id]);

  useEffect(() => { loadClubData(); }, [loadClubData]);

  // Helper to read local file from Device Gallery into Base64 Data URL
  const handleFileUpload = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => callback(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveDossier = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/clubs/update-dossier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, ...dossier })
    });
    if (res.ok) {
      setMsg('✅ Club profile, photos & dossier updated live!');
      loadClubData();
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/clubs/add-member`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, ...memberForm })
    });
    if (res.ok) {
      setMsg(`✅ Added ${memberForm.name} (${memberForm.position}) to club roster!`);
      setMemberForm({ name: '', roll: '', position: '', phone: '' });
      loadClubData();
    }
  };

  const handleRemoveMember = async (memberId) => {
    const res = await fetch(`${apiUrl}/api/unicore/clubs/remove-member`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, member_id: memberId })
    });
    if (res.ok) {
      setMsg('🗑️ Member removed from roster.');
      loadClubData();
    }
  };

  const handleAddGalleryItem = async (e) => {
    e.preventDefault();
    if (!galleryForm.media_url) {
      setMsg('❌ Please select a photo/video from your gallery or paste a URL.');
      return;
    }
    const res = await fetch(`${apiUrl}/api/unicore/clubs/add-gallery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ club_id: user.user_id, ...galleryForm })
    });
    if (res.ok) {
      setMsg('📸 Media added to Club Gallery!');
      setGalleryForm({ media_type: 'image', media_url: '', caption: '' });
      loadClubData();
    }
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/events/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...eventForm, club_id: user.user_id, submitted_by: dossier.name || user.user_id })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setEventForm({ title: '', date: '2026-10-29', start_time: '16:00', end_time: '19:00', venue: '', description: '', image_url: '', registration_link: '' });
      loadClubData();
    }
  };

  const handleMarkEventCompleted = async (eventId) => {
    const res = await fetch(`${apiUrl}/api/unicore/events/approve?event_id=${eventId}&action=Completed`, { method: 'POST' });
    if (res.ok) {
      setMsg('🏁 Event marked as Completed! Students can now submit ratings and reviews.');
      loadClubData();
    }
  };

  const handleSendNotice = async (e) => {
    e.preventDefault();
    const res = await fetch(`${apiUrl}/api/unicore/notices/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...noticeForm, club_id: user.user_id })
    });
    if (res.ok) {
      setMsg('📢 Notice submitted to Dean for approval!');
      setNoticeForm({ title: '', message: '', target_branch: 'All', target_year: 'All', attachment_link: '' });
      loadClubData();
    }
  };

  const myClub = clubs.find((c) => c.club_id.toUpperCase() === user.user_id.toUpperCase()) || {};
  const myEvents = events.filter((e) => e.club_id.toUpperCase() === user.user_id.toUpperCase());
  const myNotices = notices.filter((n) => n.club_id.toUpperCase() === user.user_id.toUpperCase());

  return (
    <div className="hms-container">
      {msg && <div className="hms-toast" onClick={() => setMsg(null)}>{msg}</div>}

      {/* Instagram-Style Live Club Header Preview */}
      <div className="hms-ig-banner" style={{ backgroundImage: `url(${dossier.banner_url || 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?w=1000&q=80'})` }}>
        <div className="hms-ig-avatar">
          {dossier.avatar_url ? <img src={dossier.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user.user_id.slice(0, 3)}
        </div>
      </div>

      <div className="hms-desktop-tabs">
        <button className={`hms-dtab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          🎨 Club Profile & Roster ({myClub.members?.length || 0})
        </button>
        <button className={`hms-dtab ${activeTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveTab('gallery')}>
          📸 Media Gallery ({myClub.gallery?.length || 0})
        </button>
        <button className={`hms-dtab ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>
          🎪 Propose Events & Feedbacks ({myEvents.length})
        </button>
        <button className={`hms-dtab ${activeTab === 'notices' ? 'active' : ''}`} onClick={() => setActiveTab('notices')}>
          📢 Student Notices ({myNotices.length})
        </button>
      </div>

      {/* TAB 1: 100% MANUAL CLUB PROFILE & MEMBER ROSTER */}
      {activeTab === 'profile' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">✏️ Customize Club Identity, Photos & Dossier</div>
            <form onSubmit={handleSaveDossier} className="hms-stack">
              <div>
                <label className="hms-label">Official Club Name</label>
                <input type="text" className="hms-input" placeholder="Enter Full Club Name" value={dossier.name} onChange={(e) => setDossier({ ...dossier, name: e.target.value })} required />
              </div>
              <div>
                <label className="hms-label">Short Tagline</label>
                <input type="text" className="hms-input" placeholder="e.g. Official Robotics & AI Society of SVNIT" value={dossier.tagline} onChange={(e) => setDossier({ ...dossier, tagline: e.target.value })} />
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Faculty Advisor</label>
                  <input type="text" className="hms-input" placeholder="e.g. Dr. R. K. Gupta" value={dossier.faculty_advisor} onChange={(e) => setDossier({ ...dossier, faculty_advisor: e.target.value })} />
                </div>
                <div>
                  <label className="hms-label">Head Coordinator</label>
                  <input type="text" className="hms-input" placeholder="Student Head Name" value={dossier.head_coordinator} onChange={(e) => setDossier({ ...dossier, head_coordinator: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="hms-label">Club Mission & Complete Description</label>
                <textarea rows="3" className="hms-input" placeholder="Describe what your club does..." value={dossier.mission} onChange={(e) => setDossier({ ...dossier, mission: e.target.value })} />
              </div>

              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Profile Photo (Gallery or URL)</label>
                  <label className="hms-file-label">
                    📁 Upload Avatar from Device
                    <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e.target.files[0], (res) => setDossier({ ...dossier, avatar_url: res }))} />
                  </label>
                  <input type="text" className="hms-input" style={{ marginTop: '6px' }} placeholder="Or paste Avatar Image URL" value={dossier.avatar_url} onChange={(e) => setDossier({ ...dossier, avatar_url: e.target.value })} />
                </div>
                <div>
                  <label className="hms-label">Cover Banner (Gallery or URL)</label>
                  <label className="hms-file-label">
                    🖼️ Upload Banner from Device
                    <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e.target.files[0], (res) => setDossier({ ...dossier, banner_url: res }))} />
                  </label>
                  <input type="text" className="hms-input" style={{ marginTop: '6px' }} placeholder="Or paste Banner Image URL" value={dossier.banner_url} onChange={(e) => setDossier({ ...dossier, banner_url: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="hms-label">Additional Notes / Achievements for Dean</label>
                <textarea rows="2" className="hms-input" placeholder="Budget notes, equipment list, competition wins..." value={dossier.extra_dean_info} onChange={(e) => setDossier({ ...dossier, extra_dean_info: e.target.value })} />
              </div>
              <button type="submit" className="hms-btn-primary">💾 Save All Club Details</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">➕ Manually Add Club Members & Positions</div>
            <p className="hms-muted" style={{ marginBottom: '12px' }}>
              Add your Head Member, Technical Head, Stage & Logistics Head, Promotional Members, etc.
            </p>
            <form onSubmit={handleAddMember} className="hms-stack" style={{ marginBottom: '20px' }}>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Member Full Name" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Roll No (e.g. U24CS011)" value={memberForm.roll} onChange={(e) => setMemberForm({ ...memberForm, roll: e.target.value })} required />
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <input type="text" className="hms-input" placeholder="Role (e.g. Stage & Logistics Head)" value={memberForm.position} onChange={(e) => setMemberForm({ ...memberForm, position: e.target.value })} required />
                <input type="text" className="hms-input" placeholder="Contact Phone" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} required />
              </div>
              <button type="submit" className="hms-btn-primary">+ Add Member to Club Roster</button>
            </form>

            <div className="hms-section-label">👥 Current Club Roster ({myClub.members?.length || 0})</div>
            <div className="hms-stack" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {myClub.members?.map((m) => (
                <div key={m.id || m.roll} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{m.name}</div>
                    <div className="hms-item-sub">{m.roll} • {m.phone}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="hms-pill-badge">{m.position}</span>
                    {m.id && <button className="hms-btn-ghost-sm" onClick={() => handleRemoveMember(m.id)}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GALLERY UPLOADS (FROM DEVICE GALLERY OR URL) */}
      {activeTab === 'gallery' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">📸 Upload Photos & Videos to Club Gallery</div>
            <form onSubmit={handleAddGalleryItem} className="hms-stack">
              <select className="hms-input" value={galleryForm.media_type} onChange={(e) => setGalleryForm({ ...galleryForm, media_type: e.target.value })}>
                <option value="image">🖼️ Photo / Image</option>
                <option value="video">🎥 Video Clip</option>
              </select>

              <label className="hms-file-label">
                📂 Choose Photo / Video from Device Gallery
                <input
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const isVid = file.type.startsWith('video');
                      handleFileUpload(file, (base64) => setGalleryForm({ ...galleryForm, media_type: isVid ? 'video' : 'image', media_url: base64 }));
                    }
                  }}
                />
              </label>

              <input type="text" className="hms-input" placeholder="Or paste Image / Video URL" value={galleryForm.media_url} onChange={(e) => setGalleryForm({ ...galleryForm, media_url: e.target.value })} />
              <input type="text" className="hms-input" placeholder="Caption / Event Moment Description" value={galleryForm.caption} onChange={(e) => setGalleryForm({ ...galleryForm, caption: e.target.value })} required />
              <button type="submit" className="hms-btn-primary">✨ Publish to Club Gallery</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">🖼️ Published Club Gallery ({myClub.gallery?.length || 0})</div>
            <div className="hms-gallery-grid">
              {myClub.gallery?.map((g, i) => (
                <div key={i} className="hms-gallery-item">
                  {g.media_type === 'video' ? <video src={g.media_url} controls /> : <img src={g.media_url} alt={g.caption} />}
                  <div style={{ padding: '10px', fontSize: '12px' }}>{g.caption}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MANUAL VENUE EVENT PROPOSALS & EVENT-WISE STUDENT FEEDBACKS */}
      {activeTab === 'events' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">🚀 Propose Event to Dean (100% Manual Venue & Media)</div>
            <form onSubmit={handleProposeEvent} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Event Title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} required />
              <div>
                <label className="hms-label">Manual Event Venue (Type Any Campus Location)</label>
                <input type="text" className="hms-input" placeholder="e.g. SAC Open Lawn, Mechanical Seminar Hall, Main Ground..." value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} required />
              </div>
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div><label className="hms-label">Event Date</label><input type="date" className="hms-input" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} required /></div>
                <div><label className="hms-label">Start & End Time</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="time" className="hms-input" value={eventForm.start_time} onChange={(e) => setEventForm({ ...eventForm, start_time: e.target.value })} required />
                    <input type="time" className="hms-input" value={eventForm.end_time} onChange={(e) => setEventForm({ ...eventForm, end_time: e.target.value })} required />
                  </div>
                </div>
              </div>
              <textarea rows="3" className="hms-input" placeholder="Complete Event Description for Students & Dean..." value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} required />

              <label className="hms-file-label">
                🖼️ Upload Event Poster from Device Gallery
                <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e.target.files[0], (res) => setEventForm({ ...eventForm, image_url: res }))} />
              </label>
              <input type="text" className="hms-input" placeholder="Or paste Poster Image URL" value={eventForm.image_url} onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })} />
              <input type="url" className="hms-input" placeholder="Google Form Registration / Audition Link (Optional)" value={eventForm.registration_link} onChange={(e) => setEventForm({ ...eventForm, registration_link: e.target.value })} />
              <button type="submit" className="hms-btn-primary">⚡ Request Dean Permission</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📊 My Club Events — Click to View Student Feedbacks ({myEvents.length})</div>
            <div className="hms-stack">
              {myEvents.map((ev) => (
                <div key={ev.event_id} className="hms-card" style={{ background: '#090d16', cursor: 'pointer' }} onClick={() => setSelectedEventFeedback(ev)}>
                  <div className="hms-row-between">
                    <span className="hms-item-title">{ev.title}</span>
                    <span className="hms-pill-badge">{ev.status}</span>
                  </div>
                  <div className="hms-item-sub" style={{ marginTop: '4px' }}>📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                  <div className="hms-row-between" style={{ marginTop: '10px' }}>
                    <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 800 }}>
                      👥 {ev.rsvps?.length || 0} Attending • ⭐ {ev.feedbacks?.length || 0} Feedbacks
                    </span>
                    {ev.status === 'Approved' && (
                      <button
                        className="hms-btn-ghost-sm"
                        onClick={(e) => { e.stopPropagation(); handleMarkEventCompleted(ev.event_id); }}
                      >
                        🏁 Mark Event Completed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TARGETED STUDENT NOTICES (BRANCH & YEAR WISE) */}
      {activeTab === 'notices' && (
        <div className="hms-grid-2">
          <div className="hms-card">
            <div className="hms-section-label">📢 Send Targeted Notice to Students (Requires Dean Approval)</div>
            <form onSubmit={handleSendNotice} className="hms-stack">
              <input type="text" className="hms-input" placeholder="Notice Title (e.g. 1st Year Civil Workshop / Audition Notice)" value={noticeForm.title} onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })} required />
              <div className="hms-grid-2" style={{ gap: '8px' }}>
                <div>
                  <label className="hms-label">Target Branch / Dept</label>
                  <select className="hms-input" value={noticeForm.target_branch} onChange={(e) => setNoticeForm({ ...noticeForm, target_branch: e.target.value })}>
                    <option value="All">All Branches</option>
                    <option value="Civil Engineering">Civil Engineering</option>
                    <option value="Computer Engineering">Computer Engineering</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Electrical Engineering">Electrical Engineering</option>
                    <option value="Electronics Engineering">Electronics Engineering</option>
                    <option value="Artificial Intelligence">Artificial Intelligence</option>
                  </select>
                </div>
                <div>
                  <label className="hms-label">Target Year</label>
                  <select className="hms-input" value={noticeForm.target_year} onChange={(e) => setNoticeForm({ ...noticeForm, target_year: e.target.value })}>
                    <option value="All">All Years</option>
                    <option value="1st Year">1st Year Only</option>
                    <option value="2nd Year">2nd Year Only</option>
                    <option value="3rd Year">3rd Year Only</option>
                    <option value="4th Year">4th Year Only</option>
                  </select>
                </div>
              </div>
              <textarea rows="3" className="hms-input" placeholder="Notice message & instructions..." value={noticeForm.message} onChange={(e) => setNoticeForm({ ...noticeForm, message: e.target.value })} required />
              <input type="url" className="hms-input" placeholder="Optional Google Form / Audition Link" value={noticeForm.attachment_link} onChange={(e) => setNoticeForm({ ...noticeForm, attachment_link: e.target.value })} />
              <button type="submit" className="hms-btn-primary">🚀 Send Notice to Dean for Approval</button>
            </form>
          </div>

          <div className="hms-card">
            <div className="hms-section-label">📋 Sent Notices Status ({myNotices.length})</div>
            <div className="hms-stack">
              {myNotices.map((n) => (
                <div key={n.notice_id} className="hms-row-item">
                  <div>
                    <div className="hms-item-title">{n.title}</div>
                    <div className="hms-item-sub">Target: {n.target_branch} ({n.target_year}) • {n.message}</div>
                  </div>
                  <span className="hms-pill-badge">{n.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EVENT-WISE FEEDBACK & ATTENDANCE DETAILS */}
      {selectedEventFeedback && (
        <div className="hms-modal-backdrop" onClick={() => setSelectedEventFeedback(null)}>
          <div className="hms-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="hms-row-between" style={{ marginBottom: '12px' }}>
              <span className="hms-pill-badge">EVENT ANALYTICS • {selectedEventFeedback.event_id}</span>
              <button className="hms-close-btn" onClick={() => setSelectedEventFeedback(null)}>✕</button>
            </div>
            <h3>{selectedEventFeedback.title}</h3>
            <div className="hms-detail-box" style={{ marginBottom: '14px' }}>
              <div>📍 <strong>Venue:</strong> {selectedEventFeedback.venue}</div>
              <div style={{ marginTop: '4px' }}>👥 <strong>Students Attended / RSVP'd ({selectedEventFeedback.rsvps?.length || 0}):</strong> {selectedEventFeedback.rsvps?.join(', ') || 'None yet'}</div>
            </div>
            <div className="hms-section-label">⭐ Student Feedbacks ({selectedEventFeedback.feedbacks?.length || 0})</div>
            {(!selectedEventFeedback.feedbacks || selectedEventFeedback.feedbacks.length === 0) ? (
              <div className="hms-empty-card" style={{ padding: '18px' }}>No student feedbacks yet.</div>
            ) : (
              <div className="hms-stack">
                {selectedEventFeedback.feedbacks.map((f, i) => (
                  <div key={i} className="hms-row-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div className="hms-row-between" style={{ width: '100%' }}>
                      <strong>{f.student_name} ({f.student_id})</strong>
                      <span style={{ color: '#fbbf24' }}>{'⭐'.repeat(f.rating)}</span>
                    </div>
                    <div className="hms-item-sub" style={{ color: '#e2e8f0', marginTop: '4px' }}>{f.review}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="hms-bottom-nav">
        <button onClick={() => setActiveTab('profile')} className={`hms-bnav-item ${activeTab === 'profile' ? 'active' : ''}`}><span>🎨</span><span>Profile</span></button>
        <button onClick={() => setActiveTab('gallery')} className={`hms-bnav-item ${activeTab === 'gallery' ? 'active' : ''}`}><span>📸</span><span>Gallery</span></button>
        <button onClick={() => setActiveTab('events')} className={`hms-bnav-item ${activeTab === 'events' ? 'active' : ''}`}><span>🎪</span><span>Events</span></button>
        <button onClick={() => setActiveTab('notices')} className={`hms-bnav-item ${activeTab === 'notices' ? 'active' : ''}`}><span>📢</span><span>Notices</span></button>
      </nav>
    </div>
  );
}