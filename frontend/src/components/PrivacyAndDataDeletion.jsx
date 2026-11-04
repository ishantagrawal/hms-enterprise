import React from 'react';

export default function PrivacyAndDataDeletion() {
  return (
    <main className="ptm-root" style={{ padding: '24px', maxWidth: 760, margin: '0 auto' }}>
      <h1>Privacy and Data Deletion</h1>
      <p>svnitcampus uses personal data only to provide hostel administration, attendance, safety, and grievance services.</p>
      <h2>Biometric data</h2>
      <p>Face verification is limited to 1:1 attendance liveness checks. One encrypted face reference is retained only while enrollment is active and is deleted at hostel checkout or when consent is withdrawn.</p>
      <h2>Your rights</h2>
      <p>You may withdraw biometric consent in the Student Profile &amp; Security tab. For account deletion or other DPDP Act 2023 requests, email the Grievance Officer at <a href="mailto:privacy@svnitcampus.in">privacy@svnitcampus.in</a> with your registered student ID. Requests are verified before processing.</p>
      <h2>Deletion flow</h2>
      <ol>
        <li>Submit a request using the email above.</li>
        <li>Complete identity verification if requested.</li>
        <li>Receive confirmation when account data and encrypted biometric references are deleted or legally retained data is identified.</li>
      </ol>
      <p>Last updated: 2025-02-01</p>
    </main>
  );
}
