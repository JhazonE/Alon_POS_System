
'use client';

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { reportSections } from '@/lib/report-catalog';

export default function ReportsPage() {
  return (
    <div className="grid gap-6 auto-rows-max">
      {reportSections.map((section, index) => (
        <div key={section.title} className="contents">
          <div className={cn('space-y-2', index > 0 && 'mt-8')}>
            <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
            <p className="text-muted-foreground">{section.blurb}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {section.cards.map(card => (
              <Link key={card.href} href={card.href}>
                <Card
                  className={cn(
                    'hover:bg-muted/50 transition-colors cursor-pointer h-full',
                    card.cardClassName,
                  )}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <card.icon className={cn('h-5 w-5', card.iconClassName)} />
                      {card.title}
                    </CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
