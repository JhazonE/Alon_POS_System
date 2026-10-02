'use client';
import { ShoppingCart, User, X, ChevronRight, SendToBack } from 'lucide-react';
import { WALK_IN_CUSTOMER } from '../customer-account/CustomerAccountDialog';
import type { SaleItem } from './pos-types';
import type { Customer, SystemSettings } from '@/lib/types';

type TaxDetails = {
  vatSales: number;
  vatAmount: number;
  nonVatSales: number;
  zeroRatedSales: number;
  vatExemptSales: number;
  subTotal: number;
};

type Props = {
  businessSettings: SystemSettings | null;
  currentTerminalName: string;
  currentUser: any;
  selectedCustomer: Customer | null;
  handleSelectCustomer: (c: Customer | null) => void;
  setIsCustomerSelectOpen: (v: boolean) => void;
  totalDue: number;
  numberOfItems: number;
  subTotal: number;
  vatSales: number;
  vatAmount: number;
  taxDetails: TaxDetails;
  items: SaleItem[];
  handleDefaultTender: () => void;
  isFrontliner?: boolean;
  handleSendToQueue?: () => void;
  posMode?: 'default' | 'pharmacy';
};

const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

// The total sits beside the TENDER button in a fixed-width panel, so step the font down as the figure grows.
const totalFontSize = (chars: number) =>
  chars <= 6 ? 'text-5xl' : chars <= 8 ? 'text-4xl' : chars <= 10 ? 'text-3xl' : 'text-2xl';

export function PosSummaryFooter({
  businessSettings, currentTerminalName, currentUser,
  selectedCustomer, handleSelectCustomer, setIsCustomerSelectOpen,
  totalDue, numberOfItems, subTotal, vatSales, vatAmount, taxDetails,
  items, handleDefaultTender, isFrontliner, handleSendToQueue, posMode,
}: Props) {
  const discount = items.reduce((acc, item) => acc + item.price * item.quantity, 0) - totalDue;
  const totalText = totalDue.toLocaleString('en-PH', { minimumFractionDigits: 2 });

  return (
    <footer className="flex shrink-0 items-stretch border-t bg-background shadow-[0_-10px_25px_-15px_rgba(0,0,0,0.3)] z-20">
      {/* Brand, cashier, customer */}
      <div className="flex w-[17rem] shrink-0 flex-col border-r">
        <div className={`flex items-center gap-2.5 px-4 py-2 text-white ${isFrontliner ? 'bg-gradient-to-br from-violet-700 to-violet-600' : 'bg-gradient-to-br from-primary to-primary/85'}`}>
          {businessSettings?.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={businessSettings.logoPath} alt="Business Logo" className="h-9 w-9 shrink-0 rounded-lg bg-white/15 object-contain p-1" />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
              <ShoppingCart className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black uppercase leading-none tracking-wide drop-shadow-sm">
              {businessSettings?.businessName || 'Alon POS System'}
            </p>
            <p className="mt-1 truncate font-mono text-[10px] leading-none text-white/70">{currentTerminalName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {posMode === 'pharmacy' && (
              <span className="rounded-md bg-cyan-500/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                Rx
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-1.5 bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase leading-none tracking-wider text-muted-foreground">
                {isFrontliner ? 'Frontliner' : 'Cashier'}
              </p>
              <p className="mt-0.5 truncate text-xs font-bold leading-none text-foreground">
                {currentUser?.displayName || (isFrontliner ? 'Frontliner' : 'Cashier Terminal')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsCustomerSelectOpen(true)}
            className="group flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase leading-none tracking-wider text-muted-foreground">Customer</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{selectedCustomer?.name || 'Walk-in Customer'}</p>
            </div>
            {selectedCustomer?.id !== 'walk-in' ? (
              <span
                role="button"
                tabIndex={0}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Reset to Walk-in"
                onClick={(e) => { e.stopPropagation(); handleSelectCustomer(WALK_IN_CUSTOMER); }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            ) : (
              <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground">Ctrl+3</kbd>
            )}
          </button>
        </div>
      </div>

      {/* Subtotal / Discount / Amount Due */}
      <div className="flex w-56 shrink-0 flex-col justify-center gap-2 border-r px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-mono font-semibold tabular-nums">{peso(subTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Discount</span>
          <span className="font-mono font-semibold tabular-nums text-rose-600">−{peso(discount)}</span>
        </div>
        <div className="h-px bg-border" />
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-foreground">Amount Due</span>
          <span className="font-mono text-base font-black tabular-nums text-primary">{peso(totalDue)}</span>
        </div>
      </div>

      {/* Tax breakdown */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 border-r px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tax Breakdown</p>
        {/* Five across needs ~1000px; below that the labels truncate to noise, so wrap to three. */}
        <div className="grid grid-cols-3 gap-2 2xl:grid-cols-5">
          {[
            { label: 'VATable Sales', value: vatSales },
            { label: 'VAT Amount', value: vatAmount },
            { label: 'VAT-Exempt', value: taxDetails.vatExemptSales },
            { label: 'Zero-Rated', value: taxDetails.zeroRatedSales },
            { label: 'Non-VAT Sales', value: taxDetails.nonVatSales },
          ].map(stat => (
            <div key={stat.label} className="min-w-0 rounded-lg border border-border/50 bg-muted/50 px-2.5 py-1.5">
              <p className="truncate text-[9px] uppercase leading-none tracking-wide text-muted-foreground">{stat.label}</p>
              <p className="mt-1 truncate font-mono text-xs font-semibold tabular-nums text-foreground">{peso(stat.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Total + action */}
      <div className="flex w-[26rem] shrink-0 items-center gap-4 bg-muted/20 px-5 py-3">
        <div className="min-w-0 flex-1 text-right">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total Amount</span>
          <div className="flex items-start justify-end">
            <span className="mr-1 mt-1.5 text-xl font-bold text-primary">₱</span>
            <span className={`whitespace-nowrap font-black leading-none tracking-tighter tabular-nums text-primary ${totalFontSize(totalText.length)}`}>
              {totalText}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
            {numberOfItems} {numberOfItems === 1 ? 'item' : 'items'} in cart
          </p>
        </div>

        {isFrontliner ? (
          <button
            className="inline-flex h-[5.5rem] w-40 shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-xl font-bold tracking-[-0.005em] whitespace-nowrap text-primary-foreground shadow-lg shadow-violet-400/20 transition-all hover:-translate-y-1 hover:bg-violet-700 hover:shadow-violet-400/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={handleSendToQueue}
            disabled={items.length === 0}
          >
            <span className="flex-1 text-left leading-tight">SEND TO QUEUE</span>
            <div className="rounded-lg bg-white/20 p-1.5">
              <SendToBack className="h-6 w-6" />
            </div>
          </button>
        ) : (
          <button
            className="inline-flex h-[5.5rem] w-40 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-2xl font-bold tracking-[-0.005em] whitespace-nowrap text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-1 hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={handleDefaultTender}
            disabled={items.length === 0}
          >
            <span className="flex-1 text-left">TENDER</span>
            <div className="rounded-lg bg-white/20 p-1.5">
              <ChevronRight className="h-7 w-7" />
            </div>
          </button>
        )}
      </div>
    </footer>
  );
}
