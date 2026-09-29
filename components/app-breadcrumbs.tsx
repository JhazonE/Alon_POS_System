'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Fragment } from 'react';

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean).filter(segment => segment !== 'sales' && segment !== 'purchases');

  // 12.5px is the nav-row text size from components/sidebar/nav-card.tsx --
  // the trail reads as the horizontal continuation of the row you clicked.
  const linkClass = 'text-[#4a6690] transition-colors hover:text-[#0a2145] dark:text-[rgba(196,218,245,0.6)] dark:hover:text-[#dce9f8]';

  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1.5 text-[12.5px] sm:gap-1.5 [&>li>svg]:text-[#9db4d6] dark:[&>li>svg]:text-[rgba(196,218,245,0.35)]">
        <BreadcrumbItem>
          <BreadcrumbLink href="/" className={linkClass}>Home</BreadcrumbLink>
        </BreadcrumbItem>
        {segments.map((segment, index) => {
          const hrefArr = pathname.split('/').filter(Boolean);
          const segmentIndexInPath = hrefArr.lastIndexOf(segment);
          const href = `/${hrefArr.slice(0, segmentIndexInPath + 1).join('/')}`;
          const isLast = index === segments.length - 1;
          const isPurchases = pathname.includes('/purchases/');
          
          // Custom label mappings
          const labelMap: Record<string, string> = {
            'returns': 'Return Sales',
            'voids': 'Void Sales',
            'by-product': isPurchases ? 'Purchases by Product' : 'Sales by Product',
            'by-supplier': 'Purchases by Supplier',
            'profit-margin': 'Profit Margin',
            'by-customer': 'Sales by Customer',
            'summary': isPurchases ? 'Purchases Summary' : 'Sales Summary',
          };
          
          const defaultLabel = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
          const label = labelMap[segment] || defaultLabel;

          return (
            <Fragment key={href}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="font-semibold text-[#0a2145] dark:text-[#dce9f8]">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href} className={linkClass}>{label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
