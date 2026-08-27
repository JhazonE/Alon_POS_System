'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Monitor } from 'lucide-react';
import type { PosSettings } from './pos-setup-types';

type SetFn = <K extends keyof PosSettings>(key: K, value: PosSettings[K]) => void;

interface Props { settings: PosSettings; set: SetFn; }

export function CustomerDisplayCard({ settings, set }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Customer Display</CardTitle>
        <Monitor className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription>Show a secondary screen for customers with cart and payment information.</CardDescription>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enableCustomerDisplay">Enable Customer Display</Label>
            <p className="text-sm text-muted-foreground">Automatically open on a second monitor when POS starts</p>
          </div>
          <Switch id="enableCustomerDisplay" checked={!!settings.enableCustomerDisplay} onCheckedChange={v => set('enableCustomerDisplay', v)} />
        </div>

        {settings.enableCustomerDisplay && (
          <div className="space-y-4 pl-4 border-l-2 border-muted">
            <div className="space-y-2">
              <Label htmlFor="customerDisplayMessage">Idle Screen Message</Label>
              <Input id="customerDisplayMessage" value={settings.customerDisplayMessage || ''} onChange={e => set('customerDisplayMessage', e.target.value)} placeholder="Welcome! Thank you for shopping." />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="customerDisplayShowLogo">Show Logo on Idle</Label>
                <p className="text-sm text-muted-foreground">Display business logo on the idle screen</p>
              </div>
              <Switch id="customerDisplayShowLogo" checked={settings.customerDisplayShowLogo !== false} onCheckedChange={v => set('customerDisplayShowLogo', v)} />
            </div>

            <div className="pt-1">
              <button onClick={() => window.open('/pos/customer-display', 'customer-display', 'width=1024,height=768,menubar=no,toolbar=no,location=no,status=no')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5">
                <Monitor className="h-4 w-4 mr-2" />
                Open Customer Display Window
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
