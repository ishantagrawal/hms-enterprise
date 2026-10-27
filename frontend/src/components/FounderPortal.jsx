import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api';

export default function FounderPortal({ apiUrl, onLogout }) {
  const [ads, setAds] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({
    sponsor_tag: 'SVNIT CAMPUS PARTNER',
    title: '',
    subtitle: '',
    badge_text: 'LIMITED TIME OFFER',
    cta_text: 'Apply Now →',
    target_url: '',
    image_url: '',
    bg_gradient: 'linear-gradient(135deg, #002970 0%, #0284C7 100%)',
    days_valid: 15
  });

  const loadAds = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/api/ads`);
      if (res.ok) setAds(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [apiUrl]);

  useEffect(() => { loadAds(); }, [loadAds]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await apiFetch(`${apiUrl}/api/ads/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setMsg(`✅ ${data.message}`);
      setForm({
        sponsor_tag: 'SVNIT CAMPUS PARTNER',
        title: '',
        subtitle: '',
        badge_text: 'LIMITED TIME OFFER',
        cta_text: 'Apply Now →',
        target_url: '',
        image_url: '',
        bg_gradient: 'linear-gradient(135deg, #002970 0%, #0284C7 100%)',
        days_valid: 15
      });
      loadAds();
    }
  };

  const handleDelete = async (id) => {
    await apiFetch(`${apiUrl}/api/ads/delete?ad_id=${id}`, { method: 'POST' });
    loadAds();
  };

  return (
    <div
      className="ptm-founder-screen"
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 60px)',
        padding: '16px 0',
        color: '#111827',
        backgroundColor: '#F5F7FA'
      }}
    >
      <div className="ptm-page-wrap">
      {msg && <div className="ptm-toast" onClick={() => setMsg(null)}>{msg}</div>}
      
      <div className="ptm-drill-header">
        <div className="ptm-row-between">
          <span className="ptm-tag-pill">FOUNDER & MASTER ADMIN PORTAL</span>
          <button type="button" className="ptm-btn-danger" style={{ width: 'auto', padding: '8px 14px' }} onClick={onLogout}>
            Sign Out
          </button>
        </div>
        <h1 className="ptm-page-title">Campus Ad & Sponsor Studio</h1>
        <p className="ptm-page-sub">Publish 15-day promotional banners (Paytm/Jio IPO style) directly to all Student & Warden home screens.</p>
      </div>

      <div className="ptm-card">
        <div className="ptm-section-title">Publish New 15-Day Sponsor Ad</div>
        <form onSubmit={handleCreate} className="ptm-form-stack">
          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Sponsor / Brand Tag</label>
              <input type="text" className="ptm-input" placeholder="e.g. UNACADEMY • CAMPUS PARTNER" value={form.sponsor_tag} onChange={(e) => setForm({ ...form, sponsor_tag: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Duration (Auto-Expires After Days)</label>
              <input type="number" className="ptm-input" value={form.days_valid} onChange={(e) => setForm({ ...form, days_valid: Number(e.target.value) })} required />
            </div>
          </div>

          <div>
            <label className="ptm-label">Main Headline (Paytm IPO Style)</label>
            <input type="text" className="ptm-input" placeholder="e.g. Jio Platforms IPO is open!" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Subtitle / Description / Dates</label>
              <input type="text" className="ptm-input" placeholder="e.g. Price Band ₹1065 - ₹1119 | Apply Now" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Badge Text (Right Highlight)</label>
              <input type="text" className="ptm-input" placeholder="e.g. 21 - 23 OCT 2026" value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} />
            </div>
          </div>

          <div className="ptm-grid-2">
            <div>
              <label className="ptm-label">Click Destination URL (Website / WhatsApp / Form)</label>
              <input type="url" className="ptm-input" placeholder="https://..." value={form.target_url} onChange={(e) => setForm({ ...form, target_url: e.target.value })} required />
            </div>
            <div>
              <label className="ptm-label">Action Button Text</label>
              <input type="text" className="ptm-input" placeholder="Apply Now →" value={form.cta_text} onChange={(e) => setForm({ ...form, cta_text: e.target.value })} required />
            </div>
          </div>

          <div>
            <label className="ptm-label">Banner Gradient Theme</label>
            <select className="ptm-input" value={form.bg_gradient} onChange={(e) => setForm({ ...form, bg_gradient: e.target.value })}>
              <option value="linear-gradient(135deg, #002970 0%, #0284C7 100%)">Paytm Royal Blue (Default)</option>
              <option value="linear-gradient(135deg, #0F172A 0%, #1E40AF 100%)">Midnight Tech Navy</option>
              <option value="linear-gradient(135deg, #065F46 0%, #059669 100%)">Emerald Cashback Green</option>
              <option value="linear-gradient(135deg, #7C2D12 0%, #EA580C 100%)">Sunset Fest Orange</option>
            </select>
          </div>

          <button type="submit" className="ptm-btn-primary">🚀 Publish Live Sponsor Ad Banner</button>
        </form>
      </div>

      <div className="ptm-card">
        <div className="ptm-section-title">Active Live Banners ({ads.length})</div>
        {ads.length === 0 ? (
          <div className="ptm-list-sub">No active sponsor ads running right now.</div>
        ) : (
          <div className="ptm-list">
            {ads.map((ad) => (
              <div key={ad.ad_id} className="ptm-list-row">
                <div className="ptm-avatar-pastel" style={{ background: '#E0F2FE', color: '#002970' }}>📢</div>
                <div className="ptm-list-main">
                  <div className="ptm-list-title">{ad.title}</div>
                  <div className="ptm-list-sub">{ad.sponsor_tag} • Expires: {ad.expires_at}</div>
                </div>
                <button className="ptm-btn-danger" style={{ width: 'auto', padding: '6px 12px' }} onClick={() => handleDelete(ad.ad_id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}