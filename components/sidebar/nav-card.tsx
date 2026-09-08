'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

const ROW_BASE =
  'flex h-8 items-center gap-[9px] rounded-lg px-2 text-[12.5px] transition-colors';
const ROW_REST = 'text-[rgba(192,232,230,0.66)] hover:bg-[#143A3D]';
const ROW_ACTIVE = 'bg-[#0E7C86] font-semibold text-white';
const ICON_BOX =
  'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md';

export function NavCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      data-sidebar="card"
      data-label={label}
      className="flex flex-col gap-0.5 rounded-xl border border-[#17403F] bg-[#0F3336] px-2 py-[9px]"
    >
      <div className="px-2 pb-1.5 pt-0.5 text-[8px] font-bold tracking-[0.15em] text-[rgba(192,232,230,0.34)]">
        {label}
      </div>
      {children}
    </div>
  );
}

export function NavRow({
  href, icon: Icon, label, active, badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      data-sidebar="row"
      data-href={href}
      data-active={active}
      className={`${ROW_BASE} ${active ? ROW_ACTIVE : ROW_REST}`}
    >
      <span className={`${ICON_BOX} ${active ? 'bg-white/20' : 'bg-[rgba(45,165,176,0.13)]'}`}>
        <Icon className="h-[13px] w-[13px]" />
      </span>
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full bg-[#F2A93A] px-1.5 py-0.5 text-[9px] font-bold text-[#0B2A2D]">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function NavAccordion({
  label, icon: Icon, items, pathname, isActive, openSection, onOpenChange,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: { href: string; label: string }[];
  pathname: string;
  isActive: boolean;
  openSection: string | null;
  onOpenChange: (section: string | null) => void;
}) {
  const open = openSection === label;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-sidebar="accordion"
        data-label={label}
        data-state={open ? 'open' : 'closed'}
        aria-expanded={open}
        onClick={() => onOpenChange(open ? null : label)}
        className={`${ROW_BASE} w-full ${open || isActive ? 'bg-[#143A3D] font-medium text-[#DCF2F0]' : ROW_REST}`}
      >
        <span className={`${ICON_BOX} ${open ? 'bg-[rgba(45,165,176,0.2)]' : 'bg-[rgba(45,165,176,0.13)]'}`}>
          <Icon className={`h-[13px] w-[13px] ${open ? 'text-[#4FC3C9]' : ''}`} />
        </span>
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[rgba(192,232,230,0.35)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="my-[3px] ml-[19px] flex flex-col gap-px border-l border-[#1F5155] pl-3">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              data-sidebar="row"
              data-href={item.href}
              data-active={pathname === item.href}
              className={`flex h-7 items-center rounded-md px-2 text-[12px] transition-colors ${
                pathname === item.href
                  ? 'bg-[#0E7C86] font-semibold text-white'
                  : 'text-[rgba(192,232,230,0.6)] hover:bg-[#143A3D]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
