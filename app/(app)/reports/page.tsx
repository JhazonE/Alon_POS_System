
'use client';

import { WaveLinkCard } from '@/components/reports/WaveLinkCard';
import { reportSections } from '@/lib/report-catalog';
import { cn } from '@/lib/utils';

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
              <WaveLinkCard
                key={card.href}
                href={card.href}
                title={card.title}
                description={card.description}
                icon={card.icon}
                iconClassName={card.iconClassName}
                className={card.cardClassName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
