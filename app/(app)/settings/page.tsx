'use client';

import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon } from 'lucide-react';
import { WaveLinkCard } from '@/components/reports/WaveLinkCard';
import { settingsSections } from '@/lib/settings-catalog';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <Badge variant="secondary" className="text-sm">
          <SettingsIcon className="mr-1 h-4 w-4" />
          Manage Application
        </Badge>
      </div>

      <div className="grid gap-6 auto-rows-max">
        {settingsSections.map((section, index) => (
          <div key={section.title} className="contents">
            <div className={cn('space-y-2', index > 0 && 'mt-8')}>
              <h3 className="text-2xl font-bold tracking-tight">{section.title}</h3>
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
                  disabled={card.disabled}
                  badge={card.badge}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
