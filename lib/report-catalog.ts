import {
  Package, ArrowLeftRight, AlertTriangle, TrendingUp, ClipboardList, Receipt,
  Package2, Percent, Undo, Users, BarChart, LineChart, PhilippinePeso,
  ShoppingCart, Layers, CreditCard, ShieldCheck, Landmark, Calendar,
  CalendarClock, CalendarDays, Activity, Store, ListOrdered, Banknote, Ban,
  FileText, FileCheck2, Sigma, History,
  type LucideIcon,
} from 'lucide-react';

/**
 * Every report in the system, in one place.
 *
 * This is the single source of truth for two consumers: the /reports page
 * renders its sections from it, and the sidebar's Ctrl+K search indexes it via
 * `reportSearchItems`. Keeping one list is the point -- most reports are not
 * sidebar nav items, so a separate search list would silently drift and leave
 * new reports unsearchable.
 *
 * Adding a report means adding one entry here. Nothing else.
 *
 * Note that some `href`s point outside /reports (e.g. /sales/voids,
 * /inventory/history). Those pages live in their feature folders but are
 * reached only from this catalog; their routes were deliberately left in place
 * so existing bookmarks and the page-registry visibility toggles keep working.
 */
export type ReportCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind colour for the icon, on top of the shared `h-5 w-5`. */
  iconClassName?: string;
  /** Optional accent border, appended to the shared card classes. */
  cardClassName?: string;
};

export type ReportSection = {
  title: string;
  blurb: string;
  cards: ReportCard[];
};

export const reportSections: ReportSection[] = [
  {
    title: 'Inventory Reports',
    blurb: 'Comprehensive inventory tracking, stock levels, and movement analysis.',
    cards: [
      {
        href: '/reports/inventory',
        title: 'Stock on Hand & Valuation',
        description: 'Current inventory levels and total value (Avg Cost).',
        icon: Package,
      },
      {
        href: '/reports/cost-vs-retail',
        title: 'Cost vs Retail Valuation',
        description: 'Stock value at cost vs selling price, with potential profit and margin.',
        icon: Percent,
        iconClassName: 'text-emerald-600',
      },
      {
        href: '/reports/movements',
        title: 'Stock Movement',
        description: 'History of stock changes with date filtering.',
        icon: ArrowLeftRight,
      },
      {
        href: '/reports/low-stock',
        title: 'Low Stock Report',
        description: 'Products below reorder point.',
        icon: AlertTriangle,
        iconClassName: 'text-red-500',
      },
      {
        href: '/reports/velocity',
        title: 'Fast & Slow Moving',
        description: 'Product sales velocity analysis.',
        icon: TrendingUp,
      },
      {
        href: '/reports/adjustments',
        title: 'Adjustment Report',
        description: 'Completed adjustments for damaged, lost, or corrected stock, with barcode and printing.',
        icon: ClipboardList,
      },
      {
        href: '/inventory/history',
        title: 'Adjustment History',
        description: 'Every adjustment including those still awaiting approval, each tagged Pending or Completed.',
        icon: History,
        iconClassName: 'text-amber-600',
      },
      {
        href: '/reports/expiring-soon',
        title: 'Expiring Soon',
        description: 'Stock on hand approaching its expiration date.',
        icon: CalendarClock,
        iconClassName: 'text-red-500',
      },
    ],
  },
  {
    title: 'Sales Reports',
    blurb: 'Comprehensive sales analysis, revenue tracking, and customer insights.',
    cards: [
      {
        href: '/reports/sales/summary',
        title: 'Sales Summary',
        description: 'Overall sales transactions with revenue, profit, and tax analysis.',
        icon: PhilippinePeso,
        iconClassName: 'text-blue-600',
      },
      {
        href: '/sales/by-date',
        title: 'Sales by Date',
        description: 'Daily sales totals across a date range, for spotting trends and slow days.',
        icon: CalendarDays,
        iconClassName: 'text-sky-600',
      },
      {
        href: '/sales/analysis',
        title: 'Sales Analysis',
        description: 'Cross-cutting analysis of sales performance with configurable filters.',
        icon: Activity,
        iconClassName: 'text-teal-600',
      },
      {
        href: '/reports/sales/by-product',
        title: 'Sales by Product',
        description: 'Product performance analysis with units sold and revenue breakdown.',
        icon: Package2,
        iconClassName: 'text-green-600',
      },
      {
        href: '/sales/by-product',
        title: 'Sales by Product/Service',
        description: 'Per-product drill-down into the individual transactions behind each line.',
        icon: Receipt,
        iconClassName: 'text-green-700',
      },
      {
        href: '/reports/sales/top-volume',
        title: 'Top by Volume',
        description: 'Highest selling items based on quantity sold.',
        icon: BarChart,
        iconClassName: 'text-indigo-500',
      },
      {
        href: '/reports/sales/top-sales',
        title: 'Top by Sales',
        description: 'Highest revenue generating items.',
        icon: LineChart,
        iconClassName: 'text-rose-500',
      },
      {
        href: '/reports/sales/profit-margin',
        title: 'Profit Margin Report',
        description: 'Profitability analysis with margin percentages and ROI metrics.',
        icon: Percent,
        iconClassName: 'text-purple-600',
      },
      {
        href: '/reports/sales/batch-profit',
        title: 'Batch Profit Analysis',
        description: 'Granular profit analysis per inventory batch with FIFO cost tracking.',
        icon: Layers,
        iconClassName: 'text-amber-600',
        cardClassName: 'border-amber-200',
      },
      {
        href: '/reports/sales/by-customer',
        title: 'Sales by Customer',
        description: 'Customer purchase history with credit sales and outstanding balances.',
        icon: Users,
        iconClassName: 'text-indigo-600',
      },
      {
        href: '/reports/sales/split-payments',
        title: 'Split Payments Report',
        description: 'Breakdown of sales transactions paid with multiple payment methods.',
        icon: CreditCard,
        iconClassName: 'text-blue-500',
        cardClassName: 'border-blue-100 shadow-sm',
      },
      {
        href: '/reports/sales/discounts',
        title: 'Discount Report',
        description: 'Senior Citizen, PWD, NAAC, and Solo Parent discounts with cardholder name and ID number (BIR).',
        icon: ShieldCheck,
        iconClassName: 'text-blue-600',
      },
      {
        href: '/reports/sales/bir-summary',
        title: 'BIR Sales Summary',
        description: 'Daily sales summary with VAT breakdown, deductions, and SC/PWD/NAAC/Solo Parent sales books (RR 16-2018).',
        icon: Landmark,
        iconClassName: 'text-blue-700',
        cardClassName: 'border-blue-200',
      },
      {
        href: '/reports/membership',
        title: 'Membership Report',
        description: 'Membership activations and renewals with cashier, amount, and validity.',
        icon: CreditCard,
        iconClassName: 'text-amber-600',
        cardClassName: 'border-amber-200',
      },
      {
        href: '/reports/fiscal-year',
        title: 'Fiscal Year Report',
        description: 'Revenue, transactions, and profit for a chosen fiscal year with monthly breakdown.',
        icon: Calendar,
        iconClassName: 'text-blue-600',
        cardClassName: 'border-blue-200',
      },
    ],
  },
  {
    title: 'POS Reports',
    blurb: 'Terminal-level transaction records, merchandise credits, voids, and shift readings.',
    cards: [
      {
        href: '/sales',
        title: 'POS Sales Transaction',
        description: 'Every POS sale to a customer, expandable into its cost, profit, and VAT breakdown.',
        icon: Store,
        iconClassName: 'text-blue-600',
      },
      {
        href: '/sales/details',
        title: 'POS Sales Detail',
        description: 'Line-item view of POS sales, one row per product sold.',
        icon: ListOrdered,
        iconClassName: 'text-indigo-600',
      },
      {
        href: '/sales/cash-transfer',
        title: 'POS Cash Transfer',
        description: 'Cash moved in and out of terminal drawers during a shift.',
        icon: Banknote,
        iconClassName: 'text-emerald-600',
      },
      {
        href: '/sales/returns',
        title: 'Merchandise Credits',
        description: 'Returned items with the original SI, who processed the return, and the refund amount.',
        icon: Undo,
        iconClassName: 'text-orange-600',
      },
      {
        href: '/sales/voids',
        title: 'Post Void',
        description: 'Transactions voided after the sale closed, with the authorizing user.',
        icon: Ban,
        iconClassName: 'text-red-600',
      },
      {
        href: '/sales/x-reading',
        title: 'POS X-Reading',
        description: 'Mid-shift terminal readings, taken without closing the shift.',
        icon: FileText,
        iconClassName: 'text-sky-600',
      },
      {
        href: '/sales/z-reading',
        title: 'POS Z-Reading',
        description: 'End-of-day locked readings required for BIR tax filing.',
        icon: FileCheck2,
        iconClassName: 'text-blue-700',
        cardClassName: 'border-blue-200',
      },
      {
        href: '/sales/overall-reading',
        title: 'POS Overall Reading',
        description: 'Accumulated totals across shifts and terminals for a chosen period.',
        icon: Sigma,
        iconClassName: 'text-purple-600',
      },
    ],
  },
  {
    title: 'Purchases Reports',
    blurb: 'Analyze procurement activity, supplier spending, and product costs.',
    cards: [
      {
        href: '/reports/purchases/summary',
        title: 'Purchases Summary',
        description: 'Overview of all purchase orders with status and payment tracking.',
        icon: ShoppingCart,
        iconClassName: 'text-blue-600',
      },
      {
        href: '/reports/purchases/by-supplier',
        title: 'Purchases by Supplier',
        description: 'Spending analysis per supplier with order frequency and last purchase.',
        icon: Users,
        iconClassName: 'text-indigo-600',
      },
      {
        href: '/reports/purchases/by-product',
        title: 'Purchases by Product',
        description: 'Detailed breakdown of item procurement with cost and quantity analysis.',
        icon: Package2,
        iconClassName: 'text-green-600',
      },
    ],
  },
];

/**
 * Flat href/label list for the sidebar's Ctrl+K index. Derived from the
 * sections above so a new report is searchable the moment it is carded.
 */
export const reportSearchItems: { href: string; label: string }[] =
  reportSections.flatMap(section =>
    section.cards.map(card => ({ href: card.href, label: card.title })),
  );
