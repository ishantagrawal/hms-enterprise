import React from 'react';
import './DesignSystem.css';

const iconPaths = {
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  attendance: ['M3 12a9 9 0 0 1 18 0', 'M7 12a5 5 0 0 1 10 0', 'M11 12a1 1 0 1 1 2 0', 'M12 12v8'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  building: ['M3 21h18', 'M5 21V5l7-3 7 3v16', 'M9 8h1', 'M14 8h1', 'M9 12h1', 'M14 12h1', 'M9 16h1', 'M14 16h1'],
  calendar: ['M8 3v4', 'M16 3v4', 'M4 9h16', 'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1z'],
  check: ['m5 12 4 4L19 6'],
  chevron: ['m8 10 4 4 4-4'],
  clock: ['M12 8v4l3 2', 'M21 12a9 9 0 1 1-2.64-6.36'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['m3 3 18 18', 'M10.6 10.6a2 2 0 0 0 2.8 2.8', 'M9.9 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.2 4.1', 'M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7c1.4 0 2.6-.3 3.7-.8'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8'],
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-7h6v7'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  map: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'm21 21-4.35-4.35'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z', 'm9 12 2 2 4-4'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75']
};

export function Icon({ name, size = 20, className = '', ...props }) {
  const paths = iconPaths[name] || iconPaths.file;
  return (
    <svg
      aria-hidden="true"
      className={`v-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button className={`v-button v-button--${variant} ${className}`.trim()} {...props} />;
}

export function TextField({ label, id, icon, className = '', ...props }) {
  return (
    <label className={`v-field ${className}`.trim()} htmlFor={id}>
      <span className="v-field__label">{label}</span>
      <span className="v-field__control">
        {icon && <Icon name={icon} className="v-field__icon" />}
        <input id={id} className="v-input" {...props} />
      </span>
    </label>
  );
}

export function Card({ className = '', as: Element = 'section', ...props }) {
  return <Element className={`v-card ${className}`.trim()} {...props} />;
}

export function StatTile({ label, value, detail, tone = 'default', className = '' }) {
  return (
    <Card className={`v-stat-tile v-stat-tile--${tone} ${className}`.trim()}>
      <span className="v-stat-tile__label">{label}</span>
      <strong className="v-stat-tile__value">{value}</strong>
      {detail && <span className="v-stat-tile__detail">{detail}</span>}
    </Card>
  );
}

export function StatusPill({ tone = 'neutral', children, className = '' }) {
  return <span className={`v-status v-status--${tone} ${className}`.trim()}>{children}</span>;
}

export function Chip({ active = false, className = '', ...props }) {
  return <button className={`v-chip${active ? ' is-active' : ''} ${className}`.trim()} {...props} />;
}

export function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      className={`v-toggle${checked ? ' is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function ProgressBar({ value, label, className = '' }) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className={`v-progress ${className}`.trim()}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <span style={{ width: `${progress}%` }} />
    </div>
  );
}

export function Skeleton({ className = '', style = {} }) {
  return <span className={`v-skeleton ${className}`.trim()} aria-hidden="true" style={style} />;
}

export function TabBar({ items, active, onChange, className = '' }) {
  return (
    <nav className={`v-tab-bar ${className}`.trim()} aria-label="Primary navigation">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`v-tab${active === item.id ? ' is-active' : ''}`}
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.icon && <Icon name={item.icon} size={22} />}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function Sidebar({ title, brand, items, active, onChange, className = '' }) {
  return (
    <aside className={`v-sidebar ${className}`.trim()}>
      <div className="v-sidebar__brand">
        <span className="v-sidebar__mark">
          {brand?.logo
            ? <img src={brand.logo} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            : brand?.initials || 'V'}
        </span>
        <span><strong>{brand?.name || 'Vidyut OS'}</strong><small>{title}</small></span>
      </div>
      <nav className="v-sidebar__nav" aria-label={`${title} navigation`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`v-sidebar__item${active === item.id ? ' is-active' : ''}`}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => onChange(item.id)}
          >
            {item.icon && <Icon name={item.icon} />}
            <span>{item.label}</span>
            {item.count > 0 && <span className="v-sidebar__count">{item.count}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
