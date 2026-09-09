'use client';

import * as React from 'react';
import { MATTE_SURFACE, MATTE_ICON_BOX } from './tokens';

export function MatteCard({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-matte="card" className={`${MATTE_SURFACE} ${className}`}>
      {children}
    </div>
  );
}

/**
 * `action` is a right-aligned slot for a control that belongs to the card --
 * the fiscal-year select, a refresh button. It exists so controls stop being
 * nested inside metric readouts the way the old dashboard nested them.
 */
export function MatteCardHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className={MATTE_ICON_BOX}>
              <Icon className="h-[13px] w-[13px]" />
            </span>
          ) : null}
          <h3 className="truncate text-[15px] font-semibold text-[rgb(var(--matte-value))]">
            {title}
          </h3>
        </div>
        {description ? (
          <p className="mt-1 text-[12.5px] text-[rgb(var(--matte-label))]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MatteCardBody({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}
