import { useState } from 'react';
import './CompanyLandingPage.css';

const tracks = [
  {
    name: 'Student Onboarding',
    steps: ['Report to Warden', 'Open 120s Window', 'WebAuthn Passkey + Reference Frame', 'Single-Device Lock Active']
  },
  {
    name: '150-Student Lecture Check-In',
    steps: ['Start Timed Class Session', 'Room Beacon Proximity Lock', 'Triple-Lock Passkey + BLE + 1:1 Face', 'Instant 1-Page A4 PDF Email']
  },
  {
    name: 'Hostel Wing Roll Call',
    steps: ['Trigger Wing Roll Call', 'Detect Wing Corridor Beacon', 'Ephemeral Face Verification', 'Live Room-Wise Audit Grid']
  }
];

const pillars = [
  ['01', 'Zero Raw Selfie Retention', 'RAM-only 1:1 comparison; live frames are discarded after verification.'],
  ['02', 'Hardware Secure Enclave Binding', 'A single approved device is bound with a W3C WebAuthn passkey.'],
  ['03', 'Room-Level BLE', 'Proximity verification without invasive GPS tracking.'],
  ['04', 'Row-Level Database Isolation', 'PostgreSQL row-level security isolates institute records.']
];

export default function CompanyLandingPage() {
  const [track, setTrack] = useState(0);
  const [modal, setModal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function submitDeletionRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = encodeURIComponent('Biometric and account data deletion request');
    const body = encodeURIComponent(
      `Roll No: ${form.get('rollNo')}\nInstitute Email: ${form.get('email')}\n\nPlease verify my identity and process my data deletion request.`
    );
    window.location.href = `mailto:compliance@svnitcampus.in?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  return (
    <main className="cv-landing">
      <header className="cv-header">
        <a className="cv-brand" href="/" aria-label="CampusVerify home">
          <span className="cv-mark">CV</span>
          <span>CampusVerify Infrastructure</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How It Works</a>
          <a href="#current-stage">Current Stage</a>
          <a href="#security">Security</a>
          <a href="#compliance">Compliance</a>
        </nav>
        <a className="cv-button cv-button-small" href="/app">Open Live App</a>
      </header>

      <section className="cv-hero">
        <div className="cv-container">
          <div className="cv-eyebrow"><span className="cv-live-dot" /> PHASE 1 CAMPUS PILOT</div>
          <h1>Zero-Proxy Campus Attendance Infrastructure.</h1>
          <p className="cv-hero-copy">
            Hardware-bound biometric and BLE proximity verification for lecture halls and residential hostels - built to verify 150 students in under 15 seconds.
          </p>
          <div className="cv-actions">
            <a className="cv-button" href="/app">Open Live App <span aria-hidden="true">-&gt;</span></a>
            <a className="cv-button cv-button-secondary" href="#how-it-works">View How It Works</a>
          </div>
          <div className="cv-metrics" aria-label="Infrastructure metrics">
            <div><strong>150 <span>/ 15s</span></strong><small>BURST CAPACITY</small></div>
            <div><strong className="cv-tabular">-78 dBm</strong><small>BLE ROOM LOCK</small></div>
            <div><strong>0 Bytes</strong><small>RAM-ONLY FRAME RETENTION</small></div>
            <div><strong>1-Page</strong><small>A4 PDF AUTO-EMAIL</small></div>
          </div>
        </div>
      </section>

      <section className="cv-section" id="how-it-works">
        <div className="cv-container">
          <div className="cv-section-heading">
            <span className="cv-eyebrow">VERIFICATION WORKFLOWS</span>
            <h2>Three tracks. One auditable system.</h2>
          </div>
          <div className="cv-track-tabs" role="tablist" aria-label="Verification workflow">
            {tracks.map((item, index) => (
              <button key={item.name} role="tab" aria-selected={track === index} onClick={() => setTrack(index)}>
                {item.name}
              </button>
            ))}
          </div>
          <div className="cv-steps">
            {tracks[track].steps.map((step, index) => (
              <article className="cv-step" key={step}>
                <span className="cv-step-number">0{index + 1}</span>
                <span className="cv-step-rule" />
                <h3>{step}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cv-section cv-section-muted" id="current-stage">
        <div className="cv-container">
          <div className="cv-section-heading">
            <span className="cv-eyebrow">CURRENT STAGE</span>
            <h2>Where we are right now.</h2>
          </div>
          <div className="cv-card-grid">
            <article className="cv-card">
              <span className="cv-card-kicker">01 / PILOT</span>
              <h3>Phase 1 Live Campus Pilot</h3>
              <p>One lecture hall and one hostel wing, with no GPS geofencing.</p>
            </article>
            <article className="cv-card">
              <span className="cv-card-kicker">02 / CORE STACK</span>
              <h3>Built for verifiable presence</h3>
              <p>WebAuthn device binding, BLE iBeacon RSSI proximity, ephemeral 1:1 face comparison, and automated 1-page faculty PDF reporting.</p>
            </article>
            <article className="cv-card">
              <span className="cv-card-kicker">03 / NEXT MILESTONE</span>
              <h3>Department-wide rollout</h3>
              <p>Expand the pilot and integrate automated mess-rebate workflows.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="cv-section" id="security">
        <div className="cv-container">
          <div className="cv-section-heading">
            <span className="cv-eyebrow">SECURITY &amp; PRIVACY ARCHITECTURE</span>
            <h2>Verification without surveillance.</h2>
          </div>
          <div className="cv-pillar-grid">
            {pillars.map(([number, title, description]) => (
              <article className="cv-pillar" key={number}>
                <span>{number}</span><h3>{title}</h3><p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="cv-footer" id="compliance">
        <div className="cv-container cv-footer-inner">
          <div><strong>CampusVerify Infrastructure</strong><p>Privacy-first campus attendance operations.</p></div>
          <div className="cv-footer-links">
            <button onClick={() => setModal('privacy')}>Privacy Policy</button>
            <button onClick={() => setModal('terms')}>Terms of Use</button>
            <button onClick={() => { setSubmitted(false); setModal('deletion'); }}>Request Data Deletion</button>
            <a href="mailto:compliance@svnitcampus.in">compliance@svnitcampus.in</a>
          </div>
          <small>DPDP Act 2023 aligned · AWS Mumbai (ap-south-1) residency</small>
        </div>
      </footer>

      {modal && (
        <div className="cv-modal-backdrop" role="presentation" onClick={() => setModal('')}>
          <section className="cv-modal" role="dialog" aria-modal="true" aria-labelledby="cv-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="cv-modal-close" aria-label="Close dialog" onClick={() => setModal('')}>×</button>
            {modal === 'deletion' ? (
              <>
                <span className="cv-eyebrow">DATA RIGHTS</span>
                <h2 id="cv-modal-title">Biometric &amp; Account Data Deletion</h2>
                {submitted ? (
                  <p>Your email application has been prepared. Send it to compliance@svnitcampus.in to submit the verified request.</p>
                ) : (
                  <form className="cv-form" onSubmit={submitDeletionRequest}>
                    <label>Roll number<input name="rollNo" required autoComplete="off" /></label>
                    <label>Institute email<input name="email" type="email" required autoComplete="email" /></label>
                    <p>We will verify your identity before processing the request.</p>
                    <button className="cv-button" type="submit">Prepare deletion request</button>
                  </form>
                )}
              </>
            ) : (
              <>
                <span className="cv-eyebrow">CAMPUSVERIFY</span>
                <h2 id="cv-modal-title">{modal === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}</h2>
                <p>
                  {modal === 'privacy'
                    ? 'Attendance verification uses a device-bound passkey, room-level BLE proximity, and a 1:1 face comparison. Live camera frames are processed for verification and are not retained. Account and attendance records are handled under institute policy and applicable law.'
                    : 'CampusVerify is provided for authorized institute attendance operations. Users must use assigned accounts and approved devices, and must not attempt to falsify proximity or attendance records.'}
                </p>
                <p>Data residency: AWS Mumbai (ap-south-1). Privacy requests: <a href="mailto:compliance@svnitcampus.in">compliance@svnitcampus.in</a>.</p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
