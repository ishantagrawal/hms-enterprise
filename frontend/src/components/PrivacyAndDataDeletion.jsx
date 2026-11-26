import React from 'react';

export default function PrivacyAndDataDeletion() {
  return (
    <main className="ptm-root" style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      <h1>Privacy and Data Deletion</h1>
      <p>Vidyut OS processes personal data on behalf of your college to provide administration, attendance, safety, and student-support services.</p>
      <h2>Biometric data</h2>
      <p>Face verification is used for hostel attendance and approved-leave return checks. The enrollment frame and its 128D reference are stored encrypted only while enrollment is active and are deleted at hostel checkout or when consent is withdrawn. Attendance frames stay on the device; return frames are sent securely for verification and are not retained.</p>
      <h2>Your rights</h2>
      <p>You may withdraw biometric consent in the Student Profile &amp; Security tab. For account deletion or other DPDP Act 2023 requests, email the privacy contact at <a href="mailto:compliance@svnitcampus.in">compliance@svnitcampus.in</a> with your registered student ID. Requests are verified before processing.</p>
      <h2>Deletion flow</h2>
      <ol>
        <li>Submit a request using the email above.</li>
        <li>Complete identity verification if requested.</li>
        <li>Receive confirmation when account data and encrypted biometric references are deleted or legally retained data is identified.</li>
      </ol>
      <p>Last updated: 2026-11-24</p>
    </main>
  );
}
