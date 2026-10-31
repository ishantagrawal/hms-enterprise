import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';
import { getCached, setCached } from '../cache';

export default function ClubPortal({ user, apiUrl }) {
  const safeUser = user || {};
  const cid = safeUser.user_id || safeUser.club_id || 'ACM';
  const cKey = `club_data_${cid}`;

  const [page, setPage] = useState('home');
  const [dataLoading, setDataLoading] = useState(false);
  const [clubInfo, setClubInfo] = useState(() => getCached(cKey) || {});
  const [events, setEvents] = useState(() => getCached('club_events') || []);
  const [notices, setNotices] = useState(() => getCached('club_notices') || []);
  const [msg, setMsg] = useState(null);

  const [mission, setMission] = useState('');
  const [deanInfo, setDeanInfo] = useState('');
  const [facultyAdvisor, setFacultyAdvisor] = useState('');
  const [headCoordinator, setHeadCoordinator] = useState('');

  const [mName, setMName] = useState('');
  const [mRoll, setMRoll] = useState('');
  const [mPos, setMPos] = useState('');
  const [mPhone, setMPhone] = useState('');
  const [mYear, setMYear] = useState('');
  const [mDept, setMDept] = useState('');

  const [gType, setGType] = useState('Drive Folder');
  const [gUrl, setGUrl] = useState('');
  const [gCap, setGCap] = useState('');
  const [selectedPhotoEvent, setSelectedPhotoEvent] = useState(null);
  const [eventAlbumUrl, setEventAlbumUrl] = useState('');
  const [eventAlbumCaption, setEventAlbumCaption] = useState('');
  const [albumSubmitting, setAlbumSubmitting] = useState(false);

  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState('2026-10-28');
  const [evStart, setEvStart] = useState('17:00');
  const [evEnd, setEvEnd] = useState('20:00');
  const [evVenue, setEvVenue] = useState('Old CRC, SVNIT');
  const [evDesc, setEvDesc] = useState('');
  const [evBudget, setEvBudget] = useState('₹10,000');
  const [evSource, setEvSource] = useState('SAC Grant / Self');
  const [evGuest, setEvGuest] = useState('');
  const [evAttend, setEvAttend] = useState('150+');
  const [evLogistics, setEvLogistics] = useState('Projector, Mic, Sound Setup');
  const [evImg, setEvImg] = useState('');
  const [evReg, setEvReg] = useState('');

  const [notTitle, setNotTitle] = useState('');
  const [notMsg, setNotMsg] = useState('');
  const [notBranch, setNotBranch] = useState('All Branches');
  const [notYear, setNotYear] = useState('All Years');
  const [notImg, setNotImg] = useState('');
  const [notReg, setNotReg] = useState('');

  const loadClubData = useCallback(async () => {
    const hasCache = Boolean(getCached(cKey) || getCached('club_events'));
    if (!hasCache) setDataLoading(true);

    try {
      const res = await apiFetch(`${apiUrl}/api/portal/bootstrap?role=ClubOrganizer&user_id=${encodeURIComponent(cid)}&hostel_block=All`);
      if (res.ok) {
        const d = await res.json();
        const foundClub = (d.clubs || []).find((c) => c.club_id.toUpperCase() === cid.toUpperCase()) || {};
        setClubInfo(foundClub);
        setCached(cKey, foundClub);
        setMission(foundClub.mission || '');
        setDeanInfo(foundClub.extra_dean_info || '');
        setFacultyAdvisor(foundClub.faculty_advisor || '');
        setHeadCoordinator(foundClub.head_coordinator || '');

        const evs = (d.events || []).filter((e) => e.club_id.toUpperCase() === cid.toUpperCase());
        setEvents(evs);
        setCached('club_events', evs);

        const nts = (d.notices || []).filter((n) => n.club_id.toUpperCase() === cid.toUpperCase());
        setNotices(nts);
        setCached('club_notices', nts);
      }
    } catch (e) {
      console.error('Club bootstrap sync error:', e);
    } finally {
      setDataLoading(false);
    }
  }, [apiUrl, cid, cKey]);

  useEffect(() => {
    loadClubData();
  }, [loadClubData]);

  const handleUpdateInfo = async (e) => {
    e.preventDefault();
    const updated = { ...clubInfo, mission, extra_dean_info: deanInfo, faculty_advisor: facultyAdvisor, head_coordinator: headCoordinator };
    setClubInfo(updated);
    setCached(cKey, updated);
    setMsg('✅ Club profile updated!');

    try {
      await apiFetch(`${apiUrl}/api/unicore/clubs/update-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_id: cid, mission, extra_dean_info: deanInfo, faculty_advisor: facultyAdvisor, head_coordinator: headCoordinator })
      });
      loadClubData();
    } catch (err) {
      setMsg('❌ Error syncing profile.');
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    const newMember = { name: mName, roll: mRoll.toUpperCase(), position: mPos, phone: mPhone, year: mYear, department: mDept };
    const updatedMembers = [...(clubInfo.members || []), newMember];
    const updatedClub = { ...clubInfo, members: updatedMembers };
    setClubInfo(updatedClub);
    setCached(cKey, updatedClub);
    setMsg(`✅ Added ${mName} to committee!`);
    setMName(''); setMRoll(''); setMPos(''); setMPhone(''); setMYear(''); setMDept('');

    try {
      await apiFetch(`${apiUrl}/api/unicore/clubs/add-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_id: cid, ...newMember })
      });
      loadClubData();
    } catch (err) {
      setMsg('❌ Error adding member.');
    }
  };

  const handleRemoveMember = async (idx) => {
    if (!window.confirm('Remove this committee member?')) return;
    const updatedMembers = (clubInfo.members || []).filter((_, i) => i !== idx);
    const updatedClub = { ...clubInfo, members: updatedMembers };
    setClubInfo(updatedClub);
    setCached(cKey, updatedClub);
    setMsg('🗑️ Member removed.');

    try {
      await apiFetch(`${apiUrl}/api/unicore/clubs/remove-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_id: cid, index: idx })
      });
      loadClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddGallery = async (e) => {
    e.preventDefault();
    const newMedia = { media_type: gType, media_url: gUrl, caption: gCap, timestamp: new Date().toISOString().split('T')[0] };
    const updatedGallery = [newMedia, ...(clubInfo.gallery || [])];
    const updatedClub = { ...clubInfo, gallery: updatedGallery };
    setClubInfo(updatedClub);
    setCached(cKey, updatedClub);
    setMsg('✅ Media link added to gallery!');
    setGUrl(''); setGCap('');

    try {
      await apiFetch(`${apiUrl}/api/unicore/clubs/add-gallery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_id: cid, media_type: gType, media_url: gUrl, caption: gCap })
      });
      loadClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleProposeEvent = async (e) => {
    e.preventDefault();
    setMsg('⚡ Event requisition submitted to Dean SW!');
    const payload = {
      club_id: cid, title: evTitle, date: evDate, start_time: evStart, end_time: evEnd, venue: evVenue,
      submitted_by: safeUser.full_name || cid, description: evDesc, budget: evBudget, funding_source: evSource,
      chief_guest: evGuest || 'None', expected_attendance: evAttend, logistics_needs: evLogistics, image_url: evImg, registration_link: evReg
    };
    setEvTitle(''); setEvDesc(''); setEvGuest(''); setEvImg(''); setEvReg('');
    setPage('events');

    try {
      await apiFetch(`${apiUrl}/api/unicore/events/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadClubData();
    } catch (err) {
      setMsg('❌ Error proposing event.');
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('Delete this event?')) return;
    const updated = events.filter((ev) => ev.event_id !== eventId);
    setEvents(updated);
    setCached('club_events', updated);
    setMsg('🗑️ Event deleted!');

    try {
      await apiFetch(`${apiUrl}/api/unicore/events/delete?event_id=${encodeURIComponent(eventId)}`, { method: 'POST' });
      loadClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEventPhotos = (event) => {
    setSelectedPhotoEvent(event);
    setEventAlbumUrl('');
    setEventAlbumCaption('');
    setPage('event_photos');
  };

  const handleAddEventPhotoAlbum = async (e) => {
    e.preventDefault();
    if (!selectedPhotoEvent || albumSubmitting) return;
    setAlbumSubmitting(true);
    try {
      const res = await apiFetch(`${apiUrl}/api/unicore/events/photo-albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedPhotoEvent.event_id,
          album_url: eventAlbumUrl,
          caption: eventAlbumCaption
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.detail || 'Could not publish this photo album.');
      const updatedEvent = {
        ...selectedPhotoEvent,
        photo_albums: [data.album, ...(selectedPhotoEvent.photo_albums || [])]
      };
      setSelectedPhotoEvent(updatedEvent);
      setEvents((current) => current.map((event) => event.event_id === updatedEvent.event_id ? updatedEvent : event));
      setCached('club_events', events.map((event) => event.event_id === updatedEvent.event_id ? updatedEvent : event));
      setEventAlbumUrl('');
      setEventAlbumCaption('');
      setMsg('Event photo album published for students.');
    } catch (error) {
      setMsg(error.message || 'Could not publish this photo album.');
    } finally {
      setAlbumSubmitting(false);
    }
  };

  const summarizeFeedback = (event) => {
    const feedbacks = event.feedbacks || [];
    if (feedbacks.length === 0) return null;
    const average = (feedbacks.reduce((total, item) => total + Number(item.rating || 0), 0) / feedbacks.length).toFixed(1);
    return { feedbacks, average };
  };

  const handleProposeNotice = async (e) => {
    e.preventDefault();
    setMsg('📢 Notice submitted to Dean SW!');
    const payload = { club_id: cid, title: notTitle, message: notMsg, target_branch: notBranch, target_year: notYear, image_url: notImg, registration_link: notReg };
    setNotTitle(''); setNotMsg(''); setNotImg(''); setNotReg('');
    setPage('notices');

    try {
      await apiFetch(`${apiUrl}/api/notices/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadClubData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotice = async (noticeId) => {
    if (!window.confirm('Delete this notice?')) return;
    const updated = notices.filter((n) => n.notice_id !== noticeId);
    setNotices(updated);
    setCached('club_notices', updated);
    setMsg('🗑️ Notice deleted!');

    try {
      await apiFetch(`${apiUrl}/api/notices/delete?notice_id=${encodeURIComponent(noticeId)}`, { method: 'POST' });
      loadClubData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="ptm-shell-layout">
      <aside className="ptm-sidebar-desktop">
        <button className={`ptm-side-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}>🏠 Club Home</button>
        <button className={`ptm-side-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>✏️ Club Profile & Info</button>
        <button className={`ptm-side-btn ${page === 'members' ? 'active' : ''}`} onClick={() => setPage('members')}>👥 Committee ({clubInfo.members?.length || 0})</button>
        <button className={`ptm-side-btn ${page === 'gallery' ? 'active' : ''}`} onClick={() => setPage('gallery')}>📸 Media & Drive Links</button>
        <button className={`ptm-side-btn ${page === 'events' ? 'active' : ''}`} onClick={() => setPage('events')}>🎪 Events ({events.length})</button>
        <button className={`ptm-side-btn ${page === 'notices' ? 'active' : ''}`} onClick={() => setPage('notices')}>📢 Notice Board ({notices.length})</button>
      </aside>

      <div className="ptm-page-wrap">
        {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}

        {dataLoading ? (
          <div className="ptm-wheel-box">
            <div className="ptm-spinner-wheel" />
            <div style={{ fontWeight: 700, color: '#002970', fontSize: '14px', marginTop: '12px' }}>Loading {cid} Portal...</div>
          </div>
        ) : (
          <>
            {page === 'home' && (
              <div>
                <div className="ptm-mini-grid">
                  <div className="ptm-mini-card" onClick={() => setPage('events')}>
                    <div className="ptm-row-between"><span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Events Proposed</span><span>🎪</span></div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#002970', marginTop: '4px' }}>{events.length}</div>
                    <button className="ptm-mini-btn">Manage Events →</button>
                  </div>
                  <div className="ptm-mini-card" onClick={() => setPage('members')}>
                    <div className="ptm-row-between"><span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Committee</span><span>👥</span></div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#111827', marginTop: '4px' }}>{clubInfo.members?.length || 0} Members</div>
                    <button className="ptm-mini-btn">View Roster →</button>
                  </div>
                  <div className="ptm-mini-card" onClick={() => setPage('notices')}>
                    <div className="ptm-row-between"><span style={{ fontWeight: 700, color: '#6B7280', fontSize: '12px' }}>Notices Sent</span><span>📢</span></div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#0284C7', marginTop: '4px' }}>{notices.length}</div>
                    <button className="ptm-mini-btn">View Notices →</button>
                  </div>
                </div>

                <div className="ptm-card">
                  <div className="ptm-section-title">{clubInfo.name || cid} — Quick Actions</div>
                  <div className="ptm-icon-grid">
                    <button className="ptm-icon-tile" onClick={() => setPage('new_event')}><div className="ptm-icon-circle">⚡</div><span className="ptm-icon-label">Propose Event</span></button>
                    <button className="ptm-icon-tile" onClick={() => setPage('new_notice')}><div className="ptm-icon-circle">📢</div><span className="ptm-icon-label">Publish Notice</span></button>
                    <button className="ptm-icon-tile" onClick={() => setPage('members')}><div className="ptm-icon-circle">👥</div><span className="ptm-icon-label">Add Member</span></button>
                    <button className="ptm-icon-tile" onClick={() => setPage('gallery')}><div className="ptm-icon-circle">📸</div><span className="ptm-icon-label">Add Drive Link</span></button>
                  </div>
                </div>
              </div>
            )}

            {page === 'profile' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Edit Club Profile & Dean Info</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleUpdateInfo} className="ptm-form-stack">
                    <div>
                      <label className="ptm-label">Faculty Advisor</label>
                      <input type="text" className="ptm-input" value={facultyAdvisor} onChange={(e) => setFacultyAdvisor(e.target.value)} />
                    </div>
                    <div>
                      <label className="ptm-label">Head Student Coordinator</label>
                      <input type="text" className="ptm-input" value={headCoordinator} onChange={(e) => setHeadCoordinator(e.target.value)} />
                    </div>
                    <div>
                      <label className="ptm-label">Club Mission & Description</label>
                      <textarea rows="3" className="ptm-input" value={mission} onChange={(e) => setMission(e.target.value)} required />
                    </div>
                    <div>
                      <label className="ptm-label">Extra Notes for Dean SW Office</label>
                      <textarea rows="3" className="ptm-input" placeholder="Achievements, upcoming fests, requirements..." value={deanInfo} onChange={(e) => setDeanInfo(e.target.value)} />
                    </div>
                    <button type="submit" className="ptm-btn-primary">💾 Save Profile</button>
                  </form>
                </div>
              </div>
            )}

            {page === 'members' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Committee Members Roster</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleAddMember} className="ptm-form-stack" style={{ marginBottom: '20px' }}>
                    <div className="ptm-section-title">+ Add Committee Member</div>
                    <input type="text" className="ptm-input" placeholder="Full Name" value={mName} onChange={(e) => setMName(e.target.value)} required />
                    <input type="text" className="ptm-input" placeholder="Roll No (e.g. U26CE011)" value={mRoll} onChange={(e) => setMRoll(e.target.value)} required />
                    <input type="text" className="ptm-input" placeholder="Position (e.g. Secretary, Convener)" value={mPos} onChange={(e) => setMPos(e.target.value)} required />
                    <input type="text" className="ptm-input" placeholder="Mobile Number" value={mPhone} onChange={(e) => setMPhone(e.target.value)} />
                    <button type="submit" className="ptm-btn-primary">Add Member</button>
                  </form>

                  <div className="ptm-section-title">Current Roster ({clubInfo.members?.length || 0})</div>
                  <div className="ptm-list">
                    {(!clubInfo.members || clubInfo.members.length === 0) ? (
                      <div className="ptm-list-sub">No committee members added yet.</div>
                    ) : (
                      clubInfo.members.map((m, idx) => (
                        <div key={idx} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">{(m.name || 'MB').slice(0, 2)}</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{m.name} ({m.roll})</div>
                            <div className="ptm-list-sub">{m.position} • 📞 {m.phone || 'N/A'}</div>
                          </div>
                          <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }} onClick={() => handleRemoveMember(idx)}>
                            🗑️ Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {page === 'gallery' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Club Media & Drive Archives</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleAddGallery} className="ptm-form-stack" style={{ marginBottom: '20px' }}>
                    <div className="ptm-section-title">+ Add Google Drive / Media Link</div>
                    <select className="ptm-input" value={gType} onChange={(e) => setGType(e.target.value)}>
                      <option value="Drive Folder">Google Drive Folder</option>
                      <option value="Event Photos">Event Photos Link</option>
                      <option value="YouTube Video">YouTube Highlights Video</option>
                    </select>
                    <input type="url" className="ptm-input" placeholder="https://drive.google.com/..." value={gUrl} onChange={(e) => setGUrl(e.target.value)} required />
                    <input type="text" className="ptm-input" placeholder="Caption (e.g. DotSlash 2026 Hackathon Gallery)" value={gCap} onChange={(e) => setGCap(e.target.value)} required />
                    <button type="submit" className="ptm-btn-primary">Add Link</button>
                  </form>

                  <div className="ptm-section-title">Saved Media Links</div>
                  <div className="ptm-list">
                    {(!clubInfo.gallery || clubInfo.gallery.length === 0) ? (
                      <div className="ptm-list-sub">No media links uploaded yet.</div>
                    ) : (
                      clubInfo.gallery.map((g, idx) => (
                        <div key={idx} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">📸</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{g.caption}</div>
                            <div className="ptm-list-sub">{g.media_type} • {g.timestamp}</div>
                          </div>
                          <a href={g.media_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ textDecoration: 'none', width: 'auto', padding: '6px 12px' }}>
                            Open ↗
                          </a>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {page === 'events' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <div className="ptm-row-between">
                    <h1 className="ptm-page-title">Event Requisitions ({events.length})</h1>
                    <button className="ptm-btn-secondary" onClick={() => setPage('new_event')}>+ Propose Event</button>
                  </div>
                </div>
                <div className="ptm-card">
                  {events.length === 0 ? (
                    <div className="ptm-list-sub">No events proposed yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {events.map((ev) => {
                        const feedbackSummary = summarizeFeedback(ev);
                        return (
                        <div key={ev.event_id} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">🎪</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{ev.title}</div>
                            <div className="ptm-list-sub">📍 {ev.venue} • 📅 {ev.date} ({ev.start_time} - {ev.end_time})</div>
                            <span className="ptm-tag-pill">👥 {ev.rsvps?.length || 0} RSVPs • {ev.status}</span>
                            {feedbackSummary ? (
                              <div className="ptm-event-feedback-summary">
                                <strong>⭐ {feedbackSummary.average}/5</strong>
                                <span>{feedbackSummary.feedbacks.length} anonymous reviews</span>
                                {feedbackSummary.feedbacks.map((feedback, index) => (
                                  <p key={`${ev.event_id}-review-${index}`}>“{feedback.review}”</p>
                                ))}
                              </div>
                            ) : (
                              <div className="ptm-list-sub">Feedback summary will appear after students submit reviews.</div>
                            )}
                          </div>
                          <div className="ptm-event-organizer-actions">
                            <button
                              type="button"
                              className="ptm-btn-secondary"
                              style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }}
                              onClick={() => handleOpenEventPhotos(ev)}
                              disabled={ev.status !== 'Completed'}
                            >
                              📸 {ev.status === 'Completed' ? 'Manage photos' : 'Photos after event'}
                            </button>
                            <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }} onClick={() => handleDeleteEvent(ev.event_id)}>
                              🗑️ Delete
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'event_photos' && selectedPhotoEvent && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('events')}>←</button>
                  <h1 className="ptm-page-title">{selectedPhotoEvent.title} photos</h1>
                  <p className="ptm-page-sub">Publish a Google Drive album link for students who attended or viewed this event.</p>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleAddEventPhotoAlbum} className="ptm-form-stack">
                    <label className="ptm-label">Google Drive album URL
                      <input
                        type="url"
                        className="ptm-input"
                        placeholder="https://drive.google.com/drive/folders/..."
                        value={eventAlbumUrl}
                        onChange={(e) => setEventAlbumUrl(e.target.value)}
                        required
                      />
                    </label>
                    <label className="ptm-label">Album caption
                      <input
                        type="text"
                        className="ptm-input"
                        placeholder="Event highlights"
                        maxLength={120}
                        value={eventAlbumCaption}
                        onChange={(e) => setEventAlbumCaption(e.target.value)}
                        required
                      />
                    </label>
                    <button type="submit" className="ptm-btn-primary" disabled={albumSubmitting}>
                      {albumSubmitting ? 'Publishing…' : 'Publish photo album'}
                    </button>
                  </form>
                </div>
                <div className="ptm-card">
                  <div className="ptm-section-title">Published event albums</div>
                  {!selectedPhotoEvent.photo_albums?.length ? (
                    <div className="ptm-list-sub">No photo albums are shared for this event yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {selectedPhotoEvent.photo_albums.map((album) => (
                        <div className="ptm-list-row" key={album.album_id}>
                          <div className="ptm-avatar-pastel">📸</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{album.caption}</div>
                            <div className="ptm-list-sub">{new Date(album.created_at).toLocaleDateString()}</div>
                          </div>
                          <a href={album.album_url} target="_blank" rel="noreferrer" className="ptm-btn-secondary" style={{ textDecoration: 'none' }}>Open ↗</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'new_event' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Propose Event to Dean SW</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleProposeEvent} className="ptm-form-stack">
                    <div><label className="ptm-label">Event Title</label><input type="text" className="ptm-input" placeholder="e.g. TRIVENTURE 2026" value={evTitle} onChange={(e) => setEvTitle(e.target.value)} required /></div>
                    <div className="ptm-grid-2">
                      <div><label className="ptm-label">Date</label><input type="date" className="ptm-input" value={evDate} onChange={(e) => setEvDate(e.target.value)} required /></div>
                      <div><label className="ptm-label">Venue</label><input type="text" className="ptm-input" value={evVenue} onChange={(e) => setEvVenue(e.target.value)} required /></div>
                    </div>
                    <div className="ptm-grid-2">
                      <div><label className="ptm-label">Start Time</label><input type="text" className="ptm-input" value={evStart} onChange={(e) => setEvStart(e.target.value)} required /></div>
                      <div><label className="ptm-label">End Time</label><input type="text" className="ptm-input" value={evEnd} onChange={(e) => setEvEnd(e.target.value)} required /></div>
                    </div>
                    <div><label className="ptm-label">Description & Agenda</label><textarea rows="3" className="ptm-input" placeholder="Event details..." value={evDesc} onChange={(e) => setEvDesc(e.target.value)} required /></div>
                    <div className="ptm-grid-2">
                      <div><label className="ptm-label">Estimated Budget</label><input type="text" className="ptm-input" value={evBudget} onChange={(e) => setEvBudget(e.target.value)} /></div>
                      <div><label className="ptm-label">Expected Attendance</label><input type="text" className="ptm-input" value={evAttend} onChange={(e) => setEvAttend(e.target.value)} /></div>
                    </div>
                    <div><label className="ptm-label">Poster Image / Drive URL (Optional)</label><input type="url" className="ptm-input" placeholder="https://..." value={evImg} onChange={(e) => setEvImg(e.target.value)} /></div>
                    <div><label className="ptm-label">Registration Form Link (Optional)</label><input type="url" className="ptm-input" placeholder="https://forms.gle/..." value={evReg} onChange={(e) => setEvReg(e.target.value)} /></div>
                    <button type="submit" className="ptm-btn-primary">Submit Requisition to Dean SW</button>
                  </form>
                </div>
              </div>
            )}

            {page === 'notices' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <div className="ptm-row-between">
                    <h1 className="ptm-page-title">Notice Board ({notices.length})</h1>
                    <button className="ptm-btn-secondary" onClick={() => setPage('new_notice')}>+ Publish Notice</button>
                  </div>
                </div>
                <div className="ptm-card">
                  {notices.length === 0 ? (
                    <div className="ptm-list-sub">No notices published yet.</div>
                  ) : (
                    <div className="ptm-list">
                      {notices.map((n) => (
                        <div key={n.notice_id} className="ptm-list-row">
                          <div className="ptm-avatar-pastel">📢</div>
                          <div className="ptm-list-main">
                            <div className="ptm-list-title">{n.title}</div>
                            <div className="ptm-list-sub">{n.message}</div>
                            <span className="ptm-tag-pill">{n.status} • {n.target_year} ({n.target_branch})</span>
                          </div>
                          <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '6px 12px', fontSize: '11px' }} onClick={() => handleDeleteNotice(n.notice_id)}>
                            🗑️ Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {page === 'new_notice' && (
              <div>
                <div className="ptm-drill-header">
                  <button className="ptm-back-btn" onClick={() => setPage('home')}>←</button>
                  <h1 className="ptm-page-title">Publish Notice to Students</h1>
                </div>
                <div className="ptm-card">
                  <form onSubmit={handleProposeNotice} className="ptm-form-stack">
                    <div><label className="ptm-label">Notice Title</label><input type="text" className="ptm-input" placeholder="e.g. Hackathon Registrations Open" value={notTitle} onChange={(e) => setNotTitle(e.target.value)} required /></div>
                    <div><label className="ptm-label">Notice Message</label><textarea rows="3" className="ptm-input" placeholder="Detailed announcement..." value={notMsg} onChange={(e) => setNotMsg(e.target.value)} required /></div>
                    <div className="ptm-grid-2">
                      <div><label className="ptm-label">Target Year</label><input type="text" className="ptm-input" value={notYear} onChange={(e) => setNotYear(e.target.value)} /></div>
                      <div><label className="ptm-label">Target Branch</label><input type="text" className="ptm-input" value={notBranch} onChange={(e) => setNotBranch(e.target.value)} /></div>
                    </div>
                    <div><label className="ptm-label">Poster Image / Drive Link (Optional)</label><input type="url" className="ptm-input" placeholder="https://..." value={notImg} onChange={(e) => setNotImg(e.target.value)} /></div>
                    <div><label className="ptm-label">Registration / Form Link (Optional)</label><input type="url" className="ptm-input" placeholder="https://..." value={notReg} onChange={(e) => setNotReg(e.target.value)} /></div>
                    <button type="submit" className="ptm-btn-primary">Submit Notice for Approval</button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <nav className="ptm-bottom-nav">
        <button className={`ptm-bnav-btn ${page === 'home' ? 'active' : ''}`} onClick={() => setPage('home')}><span>🏠</span><span>Home</span></button>
        <button className={`ptm-bnav-btn ${page === 'events' ? 'active' : ''}`} onClick={() => setPage('events')}><span>🎪</span><span>Events</span></button>
        <button className={`ptm-bnav-btn ${page === 'notices' ? 'active' : ''}`} onClick={() => setPage('notices')}><span>📢</span><span>Notices</span></button>
        <button className={`ptm-bnav-btn ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}><span>✏️</span><span>Profile</span></button>
      </nav>
    </div>
  );
}