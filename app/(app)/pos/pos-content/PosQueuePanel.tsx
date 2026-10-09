'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Inbox, User, Clock, ShoppingCart, FileText, RotateCcw, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import type { QueuedOrder } from './pos-types';
import { Spinner } from '@/components/ui/spinner';

type QueueConfig = {
  currentNumber: number;
  maxNumber: number;
  autoResetDaily: boolean;
  lastResetAt: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queuedOrders: QueuedOrder[];
  onClaimOrder: (orderId: string) => void;
  currencySymbol?: string;
};

export function PosQueuePanel({ open, onOpenChange, queuedOrders, onClaimOrder, currencySymbol = '₱' }: Props) {
  const { toast } = useToast();
  const [config, setConfig] = useState<QueueConfig | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [maxInput, setMaxInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/pos/queue/config'));
      const result = await res.json();
      if (result.success) {
        setConfig(result.data);
        setMaxInput(String(result.data.maxNumber));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (open) fetchConfig();
  }, [open, fetchConfig]);

  const handleReset = async () => {
    if (!confirm('Reset queue number back to 001?')) return;
    setIsResetting(true);
    try {
      const res = await fetch(getApiUrl('/pos/queue/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Queue Reset', description: 'Queue number will start from 001 on next order.' });
        fetchConfig();
      }
    } catch {}
    setIsResetting(false);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(getApiUrl('/pos/queue/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxNumber: parseInt(maxInput) || 999,
          autoResetDaily: config?.autoResetDaily ?? true,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: 'Settings Saved' });
        fetchConfig();
        setShowSettings(false);
      }
    } catch {}
    setIsSaving(false);
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  const getOrderTotal = (order: QueuedOrder) =>
    order.items.reduce((acc, item) => {
      const line = item.price * item.quantity;
      return acc + (line - (line * item.discount) / 100);
    }, 0);

  const progressPct = config
    ? Math.min(100, (config.currentNumber / config.maxNumber) * 100)
    : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] sm:w-[420px] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-violet-600" />
              Frontliner Queue
              {queuedOrders.length > 0 && (
                <Badge className="bg-violet-600 text-white ml-1">{queuedOrders.length}</Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSettings(v => !v)}
                title="Queue Settings"
              >
                {showSettings ? <ChevronUp className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring px-[13px] rounded-lg h-8 gap-1.5 text-xs"
                onClick={handleReset}
                disabled={isResetting}
              >
                {isResetting
                  ? <Spinner className="h-3.5 w-3.5" />
                  : <RotateCcw className="h-3.5 w-3.5" />
                }
                Reset
              </button>
            </div>
          </div>

          {/* Counter progress bar */}
          {config && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Current: <strong className="text-violet-600 font-bold">
                  {String(config.currentNumber).padStart(3, '0')}
                </strong></span>
                <span>Max: <strong>{String(config.maxNumber).padStart(3, '0')}</strong></span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressPct >= 90 ? 'bg-rose-500' : progressPct >= 70 ? 'bg-amber-500' : 'bg-violet-500'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {config.autoResetDaily && (
                <p className="text-[10px] text-muted-foreground">Auto-resets daily</p>
              )}
            </div>
          )}

          {/* Settings panel */}
          {showSettings && (
            <div className="mt-3 rounded-xl border bg-muted/30 p-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="q-max" className="text-xs font-semibold">Max Queue Number</Label>
                <p className="text-xs text-muted-foreground">Resets back to 001 after reaching this number.</p>
                <Input
                  id="q-max"
                  type="number"
                  min={1}
                  max={9999}
                  value={maxInput}
                  onChange={e => setMaxInput(e.target.value)}
                  className="h-9 w-32"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold">Auto-Reset Daily</Label>
                  <p className="text-xs text-muted-foreground">Reset to 001 every start of day.</p>
                </div>
                <Switch
                  checked={!!config?.autoResetDaily}
                  onCheckedChange={v => setConfig(c => c ? { ...c, autoResetDaily: v } : c)}
                />
              </div>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5 w-full" onClick={handleSaveSettings} disabled={isSaving}>
                {isSaving ? <Spinner className="h-3.5 w-3.5 mr-1.5" /> : null}
                Save Settings
              </button>
            </div>
          )}
        </SheetHeader>

        {/* Orders list */}
        {queuedOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3 px-5">
            <Inbox className="h-12 w-12 opacity-20" />
            <p className="text-sm font-medium">No pending orders</p>
            <p className="text-xs text-center">Orders tagged by frontliners will appear here.</p>
          </div>
        ) : (
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {queuedOrders.map(order => (
                <div
                  key={order.id}
                  className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3 hover:border-violet-400/50 hover:bg-violet-50/30 dark:hover:bg-violet-950/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-violet-600 tabular-nums leading-none">
                          {String(order.dailyQueueNumber).padStart(3, '0')}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {order.customerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {order.frontlinerName || 'Frontliner'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(order.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 text-xs rounded-lg gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700 text-white h-8 px-3"
                      onClick={() => onClaimOrder(order.id)}
                    >
                      <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                      Load
                    </button>
                  </div>

                  {order.queueNotes && (
                    <div className="flex items-start gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                      <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{order.queueNotes}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span className="truncate max-w-[220px]">
                          {item.quantity}x {item.name}
                        </span>
                        <span className="shrink-0 font-medium text-foreground">
                          {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end border-t pt-2">
                    <span className="text-sm font-bold text-foreground">
                      Total: {currencySymbol}{getOrderTotal(order).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
