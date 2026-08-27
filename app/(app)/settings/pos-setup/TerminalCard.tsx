'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Monitor } from 'lucide-react';
import Link from 'next/link';
import { TerminalSettingsDialog } from './terminal-settings-dialog';
import type { PosSettings } from './pos-setup-types';

type SetFn = <K extends keyof PosSettings>(key: K, value: PosSettings[K]) => void;

interface Props {
  currentTerminalId: string | null | undefined;
  currentTerminalName: string | null | undefined;
  set: SetFn;
}

export function TerminalCard({ currentTerminalId, currentTerminalName, set }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">POS Terminals</CardTitle>
        <Monitor className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-4">Configure which terminal this computer represents.</CardDescription>
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-slate-700">
            {currentTerminalId ? (
              <span className="flex items-center gap-2 text-green-600">
                <Monitor className="h-4 w-4" />
                {currentTerminalName || 'Linked (Loading...)'}
              </span>
            ) : (
              <span className="text-slate-500 italic">Not Linked to any Terminal</span>
            )}
          </div>
          {!currentTerminalId && (
            <TerminalSettingsDialog
              currentTerminalId={currentTerminalId || null}
              onTerminalChanged={(id) => {
                set('currentTerminalId', id);
                set('currentTerminalName', id ? 'Updated' : null);
                if (id) window.location.reload();
              }}
            />
          )}
          <div className="pt-2 border-t border-slate-100 flex justify-end">
            <Link href="/settings/pos-terminals">
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring text-xs rounded-lg gap-1.5 h-8 px-2 text-primary hover:text-primary/80">
                <span className="text-xs font-medium">Manage All Terminals</span>
              </button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
