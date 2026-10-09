'use client';

import { usePathname } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';
import { reportSections } from '@/lib/report-catalog';

/**
 * Report leaf labels come from `lib/report-catalog.ts`, the same list that
 * titles the cards on /reports and feeds Ctrl+K. A report carded there gets a
 * correct crumb for free; a hand-maintained label map here would drift the
 * moment someone added a report, which is how /reports/velocity ended up
 * reading "Velocity" in the trail and "Fast & Slow Moving" everywhere else.
 */
const REPORT_TITLES: Record<string, string> = Object.fromEntries(
  reportSections
    .flatMap(section => section.cards)
    .map(card => [card.href, card.title]),
);

/**
 * Labels for path segments that are not reports. Two kinds live here: segments
 * whose prettified spelling is wrong ('bir-summary' -> 'Bir summary') and
 * segments that are real pages but are named for the URL rather than the user
 * ('voids' -> 'Void Sales').
 */
const SEGMENT_LABELS: Record<string, string> = {
  'bir-summary': 'BIR Summary',
  'external-api': 'External API',
  'pos': 'POS',
  'pos-setup': 'POS Setup',
  'pos-terminals': 'POS Terminals',
  'returns': 'Return Sales',
  'voids': 'Void Sales',
  'x-reading': 'X-Reading',
  'z-reading': 'Z-Reading',
};

/**
 * Prefixes with no page of their own, whose children are *not* self-describing
 * ("Home > List" would not say a list of what). The crumb stays for context
 * but renders as plain text, since linking it would 404.
 */
const NON_ROUTABLE_PREFIXES = new Set([
  '/suppliers',
  '/developer',
]);

function labelFor(segment: string) {
  return (
    SEGMENT_LABELS[segment] ??
    segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
  );
}

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // 12.5px is the nav-row text size from components/sidebar/nav-card.tsx --
  // the trail reads as the horizontal continuation of the row you clicked.
  const linkClass = 'text-[#4a6690] transition-colors hover:text-[#0a2145] dark:text-[rgba(196,218,245,0.6)] dark:hover:text-[#dce9f8]';
  const mutedClass = 'text-[#4a6690] dark:text-[rgba(196,218,245,0.6)]';
  const pageClass = 'font-semibold text-[#0a2145] dark:text-[#dce9f8]';
  const listClass = 'gap-1.5 text-[12.5px] sm:gap-1.5 [&>li>svg]:text-[#9db4d6] dark:[&>li>svg]:text-[rgba(196,218,245,0.35)]';

  // Every page carded in the report catalog belongs to the Reports module and
  // reads "Reports > <its catalogued title>", whatever its URL happens to be.
  // Many reports live outside /reports for historical reasons -- the POS
  // reports are all under /sales, Adjustment History under /inventory -- but
  // they are reached from the Reports page and are reports to the user, so the
  // trail says so rather than exposing the folder they were left in:
  //   /sales                    -> Home > Reports > POS Sales Transaction
  //   /sales/voids              -> Home > Reports > Void Sales
  //   /inventory/history        -> Home > Reports > Adjustment History
  //   /reports/sales/by-product -> Home > Reports > Sales by Product
  // The catalogued title is the whole trail below Reports: it already names
  // its own area, so no intermediate crumb is kept.
  // A page under /reports that is not carded (an orphan reachable only by
  // direct URL, like /reports/sales/returns) is still a report, so it gets the
  // same shape with its segment label standing in for a catalogued title.
  const reportTitle =
    REPORT_TITLES[pathname] ??
    (segments[0] === 'reports' && segments.length > 1
      ? labelFor(segments[segments.length - 1])
      : undefined);

  if (reportTitle) {
    return (
      <Breadcrumb>
        <BreadcrumbList className={listClass}>
          <BreadcrumbItem>
            <BreadcrumbLink href="/" className={linkClass}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/reports" className={linkClass}>Reports</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className={pageClass}>{reportTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  const crumbs = segments.map((segment, index) => {
    // Built from this segment's own position, not lastIndexOf(segment): a
    // repeated segment (/reports/sales/by-product -> /sales/by-product) used
    // to resolve the href against the wrong copy and link somewhere else.
    const href = `/${segments.slice(0, index + 1).join('/')}`;

    return {
      href,
      label: labelFor(segment),
      // Dynamic segments ([productId] etc.) resolve to an id in the
      // pathname; it is still a real page, so it stays linkable.
      routable: !NON_ROUTABLE_PREFIXES.has(href),
    };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList className={listClass}>
        <BreadcrumbItem>
          <BreadcrumbLink href="/" className={linkClass}>Home</BreadcrumbLink>
        </BreadcrumbItem>
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <Fragment key={crumb.href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className={pageClass}>
                    {crumb.label}
                  </BreadcrumbPage>
                ) : crumb.routable ? (
                  <BreadcrumbLink href={crumb.href} className={linkClass}>
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <span className={mutedClass}>{crumb.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
