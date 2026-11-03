import React from 'react';
import './SkeletonLoader.css';

export function Skeleton({ width = '100%', height = 16, radius = 8, className = '' }) {
  return (
    <span
      className={`ptm-skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function DashboardCardSkeleton() {
  return (
    <div className="ptm-skeleton-dashboard" role="status" aria-label="Loading portal">
      <Skeleton height={128} radius={16} />
      <Skeleton width="58%" height={20} />
      <Skeleton width="82%" height={14} />
      <Skeleton width={132} height={38} radius={999} />
    </div>
  );
}

export function ListRowSkeleton({ count = 5 }) {
  return (
    <div className="ptm-skeleton-list" role="status" aria-label="Loading list">
      {Array.from({ length: count }, (_, index) => (
        <div className="ptm-skeleton-list-row" key={index}>
          <Skeleton width={42} height={42} radius={999} />
          <div className="ptm-skeleton-row-copy">
            <Skeleton width="54%" height={15} />
            <Skeleton width="76%" height={12} />
          </div>
          <Skeleton width={72} height={24} radius={999} />
        </div>
      ))}
    </div>
  );
}

export function GridCardSkeleton({ count = 4 }) {
  return (
    <div className="ptm-skeleton-grid" role="status" aria-label="Loading cards">
      {Array.from({ length: count }, (_, index) => (
        <div className="ptm-skeleton-grid-card" key={index}>
          <Skeleton height={112} radius={12} />
          <Skeleton width="68%" height={14} />
          <Skeleton width="88%" height={11} />
          <Skeleton width="52%" height={11} />
        </div>
      ))}
    </div>
  );
}
