import { useEffect, useState } from 'react';
import './CompanyLandingPage.css';

const navigation = [
  ['Platform', '#platform'],
  ['How it works', '#how-it-works'],
  ['Security', '#security'],
  ['About the pilot', '#current-stage']
];

type ModuleIconName = 'institute' | 'student' | 'events' | 'hostel' | 'attendance' | 'gate' | 'family' | 'safety';

const platformModules: Array<{ icon: ModuleIconName; title: string; description: string }> = [
  {
    icon: 'institute',
    title: 'Institute administration',
    description: 'Manage institute setup, staff access, and tenant-specific controls from one place.'
  },
  {
    icon: 'student',
    title: 'Student services',
    description: 'Route student support and maintenance requests to the right campus team.'
  },
  {
    icon: 'events',
    title: 'Events & clubs',
    description: 'Coordinate campus events and keep student organization work moving.'
  },
  {
    icon: 'hostel',
    title: 'Hostel operations',
    description: 'Support resident workflows, wing roll calls, room rosters, and Warden tools.'
  },
  {
    icon: 'attendance',
    title: 'Class attendance',
    description: 'Run timed sessions, review attendance, record overrides, and export reports.'
  },
  {
    icon: 'gate',
    title: 'Leave & gate',
    description: 'Review digital leave requests and verify signed QR-based gate checks.'
  },
  {
    icon: 'family',
    title: 'Family alerts',
    description: 'Support consent-based guardian alerts for outpasses with institute-configured delivery.'
  },
  {
    icon: 'safety',
    title: 'Campus safety',
    description: 'Give authorized staff access to campus safety workflows alongside student services.'
  }
];

const iconPaths: Record<ModuleIconName, string[]> = {
  institute: ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 10h.01', 'M15 10h.01', 'M9 14h.01', 'M15 14h.01', 'M10 21v-4h4v4'],
  student: ['M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M20 21v-2a4 4 0 0 0-3-3.87', 'M17 3.13a4 4 0 0 1 0 7.75'],
  events: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z', 'm9 16 2 2 4-4'],
  hostel: ['M3 21V8l9-5 9 5v13', 'M9 21v-6h6v6', 'M7 10h.01', 'M17 10h.01'],
  attendance: ['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'],
  gate: ['M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16', 'M2 21h20', 'M12 7v.01', 'M12 12v.01', 'M12 17v.01'],
  family: ['M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M19 8v6', 'M16 11h6'],
  safety: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm9 12 2 2 4-4']
};

const tracks = [
  {
    name: 'Student onboarding',
    description: 'A short, guided setup that binds an approved device to the student account.',
    steps: ['Start onboarding', 'Open a timed window', 'Verify passkey and reference frame', 'Activate single-device binding']
  },
  {
    name: 'Class attendance',
    description: 'Faculty start a timed session and review an auditable, room-level attendance record.',
    steps: ['Start a class session', 'Confirm room beacon proximity', 'Verify passkey, BLE, and face', 'Review and export the report']
  },
  {
    name: 'Hostel roll call',
    description: 'Wardens can run an in-person wing roll call with a live room-wise audit view.',
    steps: ['Start a wing roll call', 'Confirm corridor beacon proximity', 'Verify the student in-session', 'Review the room-wise audit']
  }
];

const pillars = [
  ['01', 'Ephemeral verification', 'Enrollment references are encrypted. Live attendance frames are processed for verification and discarded.'],
  ['02', 'Device-bound passkeys', 'WebAuthn passkeys help bind access to an approved student device.'],
  ['03', 'Room-level proximity', 'BLE supports room-level verification without invasive GPS tracking.'],
  ['04', 'Institute data isolation', 'PostgreSQL row-level security isolates institute records.']
];

const currentYear = new Date().getFullYear();

function ModuleIcon({ name }: { name: ModuleIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name].map((path) => <path d={path} key={path} />)}
    </svg>
  );
}

export default function CompanyLandingPage() {
  const [track, setTrack] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modal, setModal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!modal) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setModal('');
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [modal]);

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
      <a className="cv-skip-link" href="#main-content">Skip to content</a>
      <header className="cv-header">
        <a className="cv-brand" href="/" aria-label="Vidyut OS home">
          <img src="/vidyut-os-mark.svg" alt="" />
          <span>Vidyut <b>OS</b></span>
        </a>
        <button
          className={`cv-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
          type="button"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="cv-main-navigation"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav id="cv-main-navigation" className={mobileMenuOpen ? 'is-open' : ''} aria-label="Main navigation">
          {navigation.map(([label, href]) => (
            <a href={href} key={href} onClick={() => setMobileMenuOpen(false)}>{label}</a>
          ))}
          <a className="cv-mobile-app-link" href="/app">Open the app <span aria-hidden="true">↗</span></a>
        </nav>
        <a className="cv-button cv-header-cta" href="/app">Open the app <span aria-hidden="true">↗</span></a>
      </header>

      <div id="main-content">
        <section className="cv-hero">
          <div className="cv-hero-glow cv-hero-glow-one" aria-hidden="true" />
          <div className="cv-hero-glow cv-hero-glow-two" aria-hidden="true" />
          <div className="cv-container cv-hero-grid">
            <div className="cv-hero-content">
              <div className="cv-eyebrow cv-hero-eyebrow"><span className="cv-live-dot" /> CAMPUS OPERATIONS, MADE CLEARER</div>
              <h1>Make campus<br /><span>work better.</span></h1>
              <p className="cv-hero-copy">
                One thoughtful platform for the people and everyday work that keep a campus moving — from institute administration to student services, hostels, and attendance.
              </p>
              <div className="cv-actions">
                <a className="cv-button cv-button-primary" href="/app">Explore Vidyut OS <span aria-hidden="true">→</span></a>
                <a className="cv-button cv-button-secondary" href="#platform">See the platform</a>
              </div>
              <div className="cv-hero-note">
                <span className="cv-note-check" aria-hidden="true">✓</span>
                <span>Designed for institute teams, students, and campus life.</span>
              </div>
            </div>

            <div className="cv-product-preview" aria-label="Illustrative preview of the Vidyut OS campus dashboard">
              <div className="cv-preview-orbit cv-preview-orbit-one" aria-hidden="true" />
              <div className="cv-preview-orbit cv-preview-orbit-two" aria-hidden="true" />
              <div className="cv-dashboard">
                <div className="cv-dashboard-topbar">
                  <div className="cv-dashboard-brand"><span className="cv-dashboard-mark">V</span><span>Vidyut <b>OS</b></span></div>
                  <span className="cv-preview-label"><i /> PRODUCT PREVIEW</span>
                </div>
                <div className="cv-dashboard-body">
                  <aside className="cv-dashboard-sidebar" aria-hidden="true">
                    <span className="is-active"><i className="cv-sidebar-icon cv-sidebar-grid" /></span>
                    <span><i className="cv-sidebar-icon cv-sidebar-users" /></span>
                    <span><i className="cv-sidebar-icon cv-sidebar-calendar" /></span>
                    <span><i className="cv-sidebar-icon cv-sidebar-settings" /></span>
                  </aside>
                  <div className="cv-dashboard-main">
                    <div className="cv-dashboard-heading">
                      <div><small>CAMPUS WORKSPACE</small><h2>One place to move work forward.</h2></div>
                      <span className="cv-avatar">V</span>
                    </div>
                    <div className="cv-dashboard-cards">
                      <article className="cv-dashboard-card cv-dashboard-card-feature">
                        <div className="cv-dash-card-top"><span className="cv-dash-icon cv-dash-icon-blue"><ModuleIcon name="attendance" /></span><span className="cv-dash-tag">ACADEMICS</span></div>
                        <h3>Class attendance</h3>
                        <p>Run a session. Review the record.</p>
                        <div className="cv-dash-card-link">Faculty workflow <span>↗</span></div>
                      </article>
                      <article className="cv-dashboard-card">
                        <div className="cv-dash-card-top"><span className="cv-dash-icon cv-dash-icon-lilac"><ModuleIcon name="hostel" /></span><span className="cv-dash-tag">RESIDENTIAL</span></div>
                        <h3>Hostel operations</h3>
                        <p>Wings, rooms, and roll calls.</p>
                      </article>
                      <article className="cv-dashboard-card">
                        <div className="cv-dash-card-top"><span className="cv-dash-icon cv-dash-icon-green"><ModuleIcon name="gate" /></span><span className="cv-dash-tag">STUDENT LIFE</span></div>
                        <h3>Leave &amp; gate</h3>
                        <p>Digital requests and signed checks.</p>
                      </article>
                    </div>
                    <div className="cv-dashboard-foot">
                      <div className="cv-dashboard-foot-mark"><span>✦</span></div>
                      <div><strong>Connected campus workflows</strong><small>One platform, with clear roles and permissions.</small></div>
                      <span className="cv-dashboard-foot-arrow" aria-hidden="true">↗</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="cv-container cv-hero-bottom">
            <span>BUILT FOR THE WHOLE CAMPUS</span>
            <div className="cv-role-list"><span>Institute leaders</span><i /> <span>Faculty</span><i /> <span>Students</span><i /> <span>Campus teams</span></div>
          </div>
        </section>

        <section className="cv-section cv-platform-section" id="platform">
          <div className="cv-container">
            <div className="cv-section-heading cv-section-heading-split">
              <div>
                <span className="cv-eyebrow"><span className="cv-eyebrow-mark">01</span> THE VIDYUT OS PLATFORM</span>
                <h2>Campus life is connected.<br /><span>Your tools should be too.</span></h2>
              </div>
              <p>Bring core campus workflows into one organized workspace — so every team can focus on the work that matters.</p>
            </div>
            <div className="cv-card-grid cv-platform-grid">
              {platformModules.map((module, index) => (
                <article className="cv-module-card" key={module.title}>
                  <div className={`cv-module-icon cv-module-icon-${index % 4}`}><ModuleIcon name={module.icon} /></div>
                  <span className="cv-card-index">0{index + 1}</span>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                  <span className="cv-card-arrow" aria-hidden="true">↗</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-section cv-workflow-section" id="how-it-works">
          <div className="cv-container">
            <div className="cv-section-heading cv-section-heading-centered">
              <span className="cv-eyebrow"><span className="cv-eyebrow-mark">02</span> DESIGNED AROUND REAL WORKFLOWS</span>
              <h2>Clear steps. <span>Confident decisions.</span></h2>
              <p>Workflows are structured so every action has context, the right people, and a clear outcome.</p>
            </div>
            <div className="cv-workflow-layout">
              <div className="cv-workflow-tabs" role="group" aria-label="Choose a workflow">
                {tracks.map((item, index) => (
                  <button
                    className={track === index ? 'is-active' : ''}
                    key={item.name}
                    type="button"
                    aria-pressed={track === index}
                    onClick={() => setTrack(index)}
                  >
                    <span className="cv-workflow-tab-number">0{index + 1}</span>
                    <span>{item.name}</span>
                    <span className="cv-workflow-tab-arrow" aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
              <div className="cv-workflow-panel" aria-live="polite">
                <div className="cv-workflow-panel-header">
                  <span className="cv-workflow-panel-label">WORKFLOW OVERVIEW</span>
                  <span className="cv-workflow-panel-count">0{track + 1} / 03</span>
                </div>
                <h3>{tracks[track].name}</h3>
                <p>{tracks[track].description}</p>
                <ol className="cv-steps">
                  {tracks[track].steps.map((step, index) => (
                    <li key={step}>
                      <span className="cv-step-number">0{index + 1}</span>
                      <span className="cv-step-line" aria-hidden="true" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="cv-security-section" id="security">
          <div className="cv-container cv-security-layout">
            <div className="cv-security-intro">
              <span className="cv-eyebrow cv-eyebrow-light"><span className="cv-eyebrow-mark">03</span> PRIVACY BY DESIGN</span>
              <h2>Useful verification.<br /><span>Not surveillance.</span></h2>
              <p>Build trust into everyday workflows with clear boundaries around identity, location, and data.</p>
              <a href="/privacy-and-data-deletion" className="cv-security-link">Read our privacy approach <span aria-hidden="true">→</span></a>
            </div>
            <div className="cv-pillar-grid">
              {pillars.map(([number, title, description]) => (
                <article className="cv-pillar" key={number}>
                  <span className="cv-pillar-number">{number}</span>
                  <div className="cv-pillar-rule" aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cv-stage-section" id="current-stage">
          <div className="cv-container cv-stage-layout">
            <div className="cv-stage-heading">
              <span className="cv-eyebrow"><span className="cv-eyebrow-mark">04</span> BUILDING WITH INTENTION</span>
              <h2>Start focused.<br /><span>Grow with confidence.</span></h2>
              <p>Vidyut OS is being introduced through a focused campus pilot, with room to expand as workflows are proven.</p>
            </div>
            <div className="cv-stage-card">
              <div className="cv-stage-track">
                <span className="cv-stage-track-dot is-current" />
                <span className="cv-stage-track-line" />
                <span className="cv-stage-track-dot" />
              </div>
              <div className="cv-stage-items">
                <article className="cv-stage-item is-current">
                  <span className="cv-stage-label"><i /> CURRENT FOCUS</span>
                  <h3>Phase 1 campus pilot</h3>
                  <p>A focused rollout for one lecture hall and one hostel wing, without GPS geofencing.</p>
                </article>
                <article className="cv-stage-item">
                  <span className="cv-stage-label">NEXT MILESTONE</span>
                  <h3>Expand what works</h3>
                  <p>Grow to more departments and explore automated mess-rebate workflows.</p>
                </article>
              </div>
              <div className="cv-stage-card-footer"><span>Built for real campus needs</span><span aria-hidden="true">✦</span></div>
            </div>
          </div>
        </section>

        <section className="cv-final-cta">
          <div className="cv-container cv-final-cta-inner">
            <span className="cv-final-spark cv-final-spark-one" aria-hidden="true">✳</span>
            <span className="cv-final-spark cv-final-spark-two" aria-hidden="true">✦</span>
            <div className="cv-final-cta-mark"><img src="/vidyut-os-mark.svg" alt="" /></div>
            <span className="cv-eyebrow">A BETTER CAMPUS WORKSPACE STARTS HERE</span>
            <h2>Bring your campus<br /><span>into one view.</span></h2>
            <p>Discover how Vidyut OS connects the people and workflows behind a thriving campus.</p>
            <a className="cv-button cv-button-primary" href="/app">Open Vidyut OS <span aria-hidden="true">→</span></a>
          </div>
        </section>
      </div>

      <footer className="cv-footer" id="compliance">
        <div className="cv-container">
          <div className="cv-footer-main">
            <div className="cv-footer-brand">
              <a className="cv-brand" href="/" aria-label="Vidyut OS home">
                <img src="/vidyut-os-mark.svg" alt="" />
                <span>Vidyut <b>OS</b></span>
              </a>
              <p>One connected platform for campus administration and everyday operations.</p>
            </div>
            <div className="cv-footer-column">
              <span>EXPLORE</span>
              <a href="#platform">Platform</a>
              <a href="#how-it-works">How it works</a>
              <a href="#security">Security</a>
            </div>
            <div className="cv-footer-column">
              <span>YOUR ACCOUNT</span>
              <a href="/app">Open the app</a>
              <a href="/privacy-and-data-deletion">Privacy &amp; data rights</a>
              <a href="mailto:compliance@svnitcampus.in">Contact compliance</a>
            </div>
          </div>
          <div className="cv-footer-bottom">
            <span>© {currentYear} Vidyut OS</span>
            <div className="cv-footer-legal">
              <button type="button" onClick={() => setModal('privacy')}>Privacy policy</button>
              <button type="button" onClick={() => setModal('terms')}>Terms of use</button>
              <button type="button" onClick={() => { setSubmitted(false); setModal('deletion'); }}>Request data deletion</button>
            </div>
            <span className="cv-footer-residency">DPDP Act 2023 aligned <i /> AWS Mumbai region</span>
          </div>
        </div>
      </footer>

      {modal && (
        <div className="cv-modal-backdrop" role="presentation" onClick={() => setModal('')}>
          <section className="cv-modal" role="dialog" aria-modal="true" aria-labelledby="cv-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="cv-modal-close" type="button" aria-label="Close dialog" onClick={() => setModal('')}>×</button>
            {modal === 'deletion' ? (
              <>
                <span className="cv-eyebrow">DATA RIGHTS</span>
                <h2 id="cv-modal-title">Biometric &amp; account data deletion</h2>
                {submitted ? (
                  <p>Your email application has been prepared. Send it to compliance@svnitcampus.in to submit the verified request.</p>
                ) : (
                  <form className="cv-form" onSubmit={submitDeletionRequest}>
                    <label>Roll number<input name="rollNo" required autoComplete="off" /></label>
                    <label>Institute email<input name="email" type="email" required autoComplete="email" /></label>
                    <p>We will verify your identity before processing the request.</p>
                    <button className="cv-button cv-button-primary" type="submit">Prepare deletion request</button>
                  </form>
                )}
              </>
            ) : (
              <>
                <span className="cv-eyebrow">VIDYUT OS</span>
                <h2 id="cv-modal-title">{modal === 'privacy' ? 'Privacy policy' : 'Terms of use'}</h2>
                <p>
                  {modal === 'privacy'
                    ? 'Attendance and approved-leave return verification use a device-bound passkey, room-level BLE proximity, and a 1:1 face comparison. The enrollment reference is encrypted; live camera frames are processed for verification and not retained. Account and attendance records are handled under institute policy and applicable law.'
                    : 'Vidyut OS is provided for authorized institute operations. Users must use assigned accounts and approved devices, follow their institute policies, and must not attempt to falsify attendance or gate records.'}
                </p>
                <p>Data residency: AWS Mumbai region. Privacy requests: <a href="mailto:compliance@svnitcampus.in">compliance@svnitcampus.in</a>.</p>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
