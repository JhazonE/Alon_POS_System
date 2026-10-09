import {
  Database, Bell, Key, Palette, Globe, RefreshCw, Settings as SettingsIcon,
  Percent, Monitor, Store,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every settings page in the system, grouped the way people look for them.
 *
 * Mirrors `lib/report-catalog.ts` deliberately: the /settings hub renders its
 * sections from this list, so adding a settings page means adding one entry
 * here and nothing else.
 *
 * The grouping is by task, not by alphabet -- someone setting up a lane cares
 * about terminals and tax together, and nobody looking for a backup expects to
 * find it next to Tax Rates.
 */
export type SettingsCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind colour for the icon, on top of the shared `h-5 w-5`. */
  iconClassName?: string;
  /**
   * Renders the card as inert text rather than a link -- for pages that exist
   * in the nav but are not built yet. Pair it with `badge` to say why.
   */
  disabled?: boolean;
  /** Short status pill shown next to the title, e.g. 'Feature Unavailable'. */
  badge?: string;
};

export type SettingsSection = {
  title: string;
  blurb: string;
  cards: SettingsCard[];
};

export const settingsSections: SettingsSection[] = [
  {
    title: 'Store & Sales',
    blurb: 'How the counter behaves: terminals, pricing, and the taxes applied at checkout.',
    cards: [
      {
        href: '/settings/pos-setup',
        title: 'POS Setup',
        description: 'Business info, terminals, payment terms, and sales setup.',
        icon: Store,
        iconClassName: 'text-blue-600',
      },
      {
        href: '/settings/pos-terminals',
        title: 'POS Terminals',
        description: 'Manage your POS terminal devices and their configurations.',
        icon: Monitor,
        iconClassName: 'text-sky-600',
      },
      {
        href: '/settings/pricing',
        title: 'Pricing Configuration',
        description: 'Auto-markup rules, default percentages, and priority.',
        icon: Percent,
        iconClassName: 'text-emerald-600',
      },
      {
        href: '/settings/tax-rates',
        title: 'Tax Rates',
        description: 'VAT, sales tax, and other system-wide levies.',
        icon: SettingsIcon,
        iconClassName: 'text-amber-600',
      },
    ],
  },
  {
    title: 'System',
    blurb: 'Application-wide preferences that follow you across every page.',
    cards: [
      {
        href: '/settings/system',
        title: 'System Preferences',
        description: 'Currency, timezone, language, and core behaviours.',
        icon: Database,
        iconClassName: 'text-teal-600',
      },
      {
        href: '/settings/appearance',
        title: 'Appearance',
        description: 'Themes, colours, and layout preferences.',
        icon: Palette,
        iconClassName: 'text-violet-600',
      },
      {
        href: '/settings/notifications',
        title: 'Notifications',
        description: 'Email alerts, push notifications, and scheduled reports.',
        icon: Bell,
        iconClassName: 'text-orange-500',
      },
    ],
  },
  {
    title: 'Data & Integrations',
    blurb: 'Where your data is kept, where it is sent, and how to refresh it.',
    cards: [
      {
        href: '/settings/data-management',
        title: 'Data Management',
        description: 'Backups, exports, and data cleanup tools.',
        icon: Database,
        iconClassName: 'text-indigo-600',
      },
      {
        href: '/settings/external-api',
        title: 'External API Integration',
        description: 'Configure endpoints, sync logs, and monitoring.',
        icon: Globe,
        iconClassName: 'text-cyan-600',
      },
      {
        href: '/settings/cache',
        title: 'Cache & Refresh',
        description: 'Reload fresh data from the database. Safe — deletes nothing.',
        icon: RefreshCw,
        iconClassName: 'text-slate-500',
      },
    ],
  },
  {
    title: 'Access & Security',
    blurb: 'Who can sign in, and what they are allowed to do once they are in.',
    cards: [
      {
        href: '/settings/security',
        title: 'Security',
        description: 'Password policies, 2FA, and session timeouts.',
        icon: Key,
        iconClassName: 'text-rose-600',
        disabled: true,
        badge: 'Feature Unavailable',
      },
    ],
  },
];
