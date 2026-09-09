'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { MATTE_SURFACE, MATTE_LABEL, MATTE_VALUE, MATTE_ICON_BOX, MATTE_SKELETON } from './tokens';

/**
 * A signed percentage with direction. `null` renders nothing at all: a card
 * with no prior period to compare against must not show "0%", which reads as
 * "flat" rather than "unknown".
 */
function Delta({ value, label }: { value: number; label?: string }) {
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const tone = flat
    ? 'text-[rgb(var(--matte-label))]'
    : up
      ? 'text-[rgb(var(--matte-up))]'
      : 'text-[rgb(var(--matte-down))]';
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <div className={`mt-2 flex items-center gap-1 text-[12px] font-medium ${tone}`}>
      {flat ? null : <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span className="tabular-nums">
        {flat ? '0' : `${Math.abs(value).toFixed(1)}`}%
      </span>
      {label ? (
        <span className="font-normal text-[rgb(var(--matte-label))]">{label}</span>
      ) : null}
    </div>
  );
}

export function StatCard({
  statKey, label, value, delta, deltaLabel, note, noteTone = 'muted', icon: Icon, loading = false,
}: {
  statKey: string;
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  note?: string;
  noteTone?: 'muted' | 'warn';
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div data-matte="stat" data-stat={statKey} className={`${MATTE_SURFACE} px-5 py-4`}>
      <div className="flex items-start justify-between gap-2">
        <span className={MATTE_LABEL}>{label}</span>
        {Icon ? (
          <span className={MATTE_ICON_BOX}>
            <Icon className="h-[13px] w-[13px]" />
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className={`${MATTE_SKELETON} mt-2 h-8 w-32`} />
      ) : (
        <div data-stat-value className={`${MATTE_VALUE} mt-2 text-3xl leading-none`}>
          {value}
        </div>
      )}

      {!loading && delta !== null && delta !== undefined ? (
        <Delta value={delta} label={deltaLabel} />
      ) : null}

      {!loading && note ? (
        <p
          className={`mt-1.5 text-[12px] ${
            noteTone === 'warn'
              ? 'text-[rgb(var(--matte-warn))]'
              : 'text-[rgb(var(--matte-label))]'
          }`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The dense secondary row: one card, four tiles, divided by --matte-line. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-matte="strip"
      className={`${MATTE_SURFACE} grid grid-cols-2 divide-[rgb(var(--matte-line))] sm:grid-cols-4 sm:divide-x`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  statKey, label, value, href, tone = 'default', icon: Icon, loading = false,
}: {
  statKey: string;
  label: string;
  value: string;
  href?: string;
  tone?: 'default' | 'down';
  icon?: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  const valueTone =
    tone === 'down' ? 'text-[rgb(var(--matte-down))]' : 'text-[rgb(var(--matte-value))]';

  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {Icon ? (
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${
              tone === 'down'
                ? 'text-[rgb(var(--matte-down))]'
                : 'text-[rgb(var(--matte-label))]'
            }`}
          />
        ) : null}
        <span className={MATTE_LABEL}>{label}</span>
      </div>
      {loading ? (
        <div className={`${MATTE_SKELETON} mt-1.5 h-6 w-16`} />
      ) : (
        <div data-stat-value className={`mt-1.5 text-lg font-semibold tabular-nums ${valueTone}`}>
          {value}
        </div>
      )}
    </>
  );

  const className = 'px-5 py-4 transition-colors';

  if (href) {
    return (
      <Link
        href={href}
        data-matte="tile"
        data-stat={statKey}
        className={`${className} hover:bg-[rgb(var(--matte-inset))]`}
      >
        {body}
      </Link>
    );
  }

  return (
    <div data-matte="tile" data-stat={statKey} className={className}>
      {body}
    </div>
  );
}
