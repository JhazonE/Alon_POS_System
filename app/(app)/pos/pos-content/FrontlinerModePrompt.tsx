'use client';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { FlaskConical, SendToBack, ShoppingCart, Ban, Store, ShieldX } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blocked?: boolean;
  userName?: string;
};

export function FrontlinerModePrompt({ open, onOpenChange, blocked = false, userName }: Props) {
  if (blocked) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-sm p-0 overflow-hidden gap-0"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          {/* Top accent banner — red/destructive */}
          <div className="bg-gradient-to-br from-rose-600 to-rose-800 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <ShieldX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-rose-200">Access Restricted</p>
                <p className="text-base font-bold leading-tight">Cannot Login</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-sm font-semibold">
                {userName ? `Sorry, ${userName}` : 'Login Not Allowed'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                This is a <span className="font-semibold text-violet-600 dark:text-violet-400">Pharmacy Frontliner</span> account.
                It can only be used when the POS is set to <span className="font-semibold">Pharmacy Mode</span>.
              </DialogDescription>
            </DialogHeader>

            {/* Explanation */}
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2.5">
                <Store className="h-4 w-4 text-rose-500 shrink-0 mt-px" />
                <div>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">POS is in Default Mode</p>
                  <p className="text-[11px] text-rose-500/80 dark:text-rose-500 mt-0.5">
                    Frontliner accounts are only allowed when Pharmacy Mode is enabled in POS Settings.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 border px-3 py-2.5">
                <Ban className="h-4 w-4 text-muted-foreground shrink-0 mt-px" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Please contact your administrator to switch the POS to Pharmacy Mode, or log in with a regular cashier account.
                </p>
              </div>
            </div>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] w-full"
              onClick={() => onOpenChange(false)}
            >
              Back to Login
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Pharmacy welcome prompt ──
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-violet-200">Pharmacy Mode</p>
              <p className="text-base font-bold leading-tight">Frontliner Account</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm font-semibold">
              {userName ? `Welcome, ${userName}!` : 'Welcome!'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This account is set up for <span className="font-semibold text-violet-600 dark:text-violet-400">Pharmacy Frontliner</span> mode only.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5">
              <SendToBack className="h-4 w-4 text-emerald-600 shrink-0 mt-px" />
              <div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">You can tag orders</p>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-500 mt-0.5">Add items to cart and send them to the cashier queue.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2.5">
              <Ban className="h-4 w-4 text-rose-500 shrink-0 mt-px" />
              <div>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Payment is restricted</p>
                <p className="text-[11px] text-rose-500/80 dark:text-rose-500 mt-0.5">Tender / payment processing is handled by the cashier terminal.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2.5">
              <ShoppingCart className="h-4 w-4 text-violet-600 shrink-0 mt-px" />
              <div>
                <p className="text-xs font-semibold text-violet-700 dark:text-violet-400">Cashier handles checkout</p>
                <p className="text-[11px] text-violet-600/80 dark:text-violet-500 mt-0.5">Your queued orders will appear on the cashier screen to be tendered.</p>
              </div>
            </div>
          </div>

          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px] w-full bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => onOpenChange(false)}
          >
            Got it, start tagging
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
