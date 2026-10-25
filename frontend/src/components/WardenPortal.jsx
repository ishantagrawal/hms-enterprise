<div className="ptm-card">
  <div className="ptm-section-title">Active {hostelName} Wings ({hostelDepts.length})</div>
  <div className="ptm-list">
    {hostelDepts.map((d) => (
      <div key={d.id} className="ptm-list-row">
        <div className="ptm-avatar-pastel">{d.icon}</div>
        <div className="ptm-list-main">
          <div className="ptm-list-title">{d.title}</div>
          <div className="ptm-list-sub">Login ID: <strong>{d.id}</strong></div>
        </div>
        <button
          className="ptm-btn-secondary"
          onClick={() => {
            setDeptForm({
              dept_id: d.id,
              name: d.title.replace(` (${hostelName})`, ''),
              password: '123',
              icon: d.icon || '🛠️'
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          ✏️ Edit
        </button>
      </div>
    ))}
  </div>
</div>