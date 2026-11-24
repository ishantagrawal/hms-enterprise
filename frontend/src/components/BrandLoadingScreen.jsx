import React from 'react';

export default function BrandLoadingScreen({ label = 'Opening Campus OS' }) {
  return (
    <main className="cv-loader-screen" role="status" aria-label={label}>
      <div className="cv-loader-mark">OS</div>
      <strong>Campus OS</strong>
      <span>{label}</span>
      <i />
      <style>{`
        .cv-loader-screen { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; background: #FAFAFB; color: #111827; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .cv-loader-mark { display: grid; width: 52px; height: 52px; place-items: center; border: 1px solid #E5E7EB; border-radius: 15px; background: #FFFFFF; color: #0F62FE; font-size: 15px; font-weight: 800; letter-spacing: -.05em; }
        .cv-loader-screen strong { font-size: 16px; letter-spacing: -.03em; }
        .cv-loader-screen span { color: #64748B; font-size: 12px; }
        .cv-loader-screen i { width: 48px; height: 2px; margin-top: 6px; overflow: hidden; background: #E5E7EB; }
        .cv-loader-screen i::after { display: block; width: 24px; height: 2px; background: #0F62FE; content: ""; animation: cv-load 1.1s ease-in-out infinite; }
        @keyframes cv-load { from { transform: translateX(-24px); } to { transform: translateX(48px); } }
      `}</style>
    </main>
  );
}
