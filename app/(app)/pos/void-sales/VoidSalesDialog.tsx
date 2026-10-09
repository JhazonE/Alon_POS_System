
'use client';

import { useRef, useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ban, ArrowLeft, AlertTriangle, Clock, User, Calendar, CreditCard, ShoppingBag, ChevronRight } from 'lucide-react';
import type { Sale } from '@/lib/types';
import { format } from 'date-fns';
import { formatQuantity } from '@/lib/utils';
import { formatSINumber } from '@/lib/si-number';
import { AdminAuthDialog } from '../admin-auth/AdminAuthDialog';
import { useVoidSales } from './use-void-sales';
import type { VoidSalesDialogProps } from './void-sales-types';
import { TransactionSearchBar } from '../transaction-search/TransactionSearchBar';
import { Spinner } from '@/components/ui/spinner';

const peso = (n: number) => `₱${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;




function ConfirmVoidView({ sale, voidReason, onVoidReasonChange, onVoidTransaction, onBack, isVoiding, voidError }: { sale: Sale, voidReason: string, onVoidReasonChange: (v: string) => void, onVoidTransaction: () => void, onBack: () => void, isVoiding: boolean, voidError?: string }) {
    const itemCount = sale.items.reduce((a, i) => a + i.quantity, 0);
    const canVoid = voidReason.trim().length > 0;

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (isVoiding) return;
        // Don't hijack typing in the reason field.
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;

        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            if (canVoid) onVoidTransaction();
            break;
          case 'Backspace':
          case 'Escape':
            e.preventDefault();
            onBack();
            break;
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isVoiding, canVoid, onVoidTransaction, onBack]);

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b pb-3 shrink-0">
                <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8" onClick={onBack} disabled={isVoiding}>
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                    <h2 className="text-base font-semibold">Confirm Void</h2>
                    <p className="text-xs text-muted-foreground">Review the transaction before voiding</p>
                </div>
            </div>

            {/* Warning banner */}
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300 shrink-0">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="text-sm">
                    <p className="font-semibold">This voids the entire transaction.</p>
                    <p className="text-rose-600/80 dark:text-rose-300/70">Stock for all items will be restored. This action cannot be undone.</p>
                </div>
            </div>

            {/* Summary card */}
            <div className="mt-4 rounded-xl border bg-gradient-to-br from-rose-500/5 to-transparent p-4 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SI No.</p>
                        <p className="truncate font-mono text-lg font-bold leading-tight">{sale.siNumber ? formatSINumber(sale.siNumber) : (sale.orderNumber || sale.id)}</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
                        <p className="font-mono text-xl font-black tabular-nums text-rose-600 leading-tight">{peso(sale.total)}</p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {[
                        { icon: User, label: 'Customer', value: sale.customer?.name || 'Walk-in' },
                        { icon: CreditCard, label: 'Payment', value: sale.paymentMethod || '-' },
                        { icon: Calendar, label: 'Date', value: format(new Date(sale.date || new Date()), 'MMM d, yyyy • p') },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-2 min-w-0">
                            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">{label}</p>
                                <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Items */}
            <div className="mt-4 flex items-center gap-2 shrink-0">
                <ShoppingBag className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-semibold">Items</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{sale.items.length} {sale.items.length === 1 ? 'line' : 'lines'} · {itemCount} pcs</span>
            </div>
            <div className="mt-2 flex-1 overflow-hidden rounded-xl border">
                <ScrollArea className="h-full">
                    <Table>
                        <TableHeader className="sticky top-0 z-10 bg-muted">
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-xs font-semibold uppercase tracking-wide">Product</TableHead>
                                <TableHead className="text-center text-xs font-semibold uppercase tracking-wide">Qty</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide">Price</TableHead>
                                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sale.items.map((item, index) => (
                                <TableRow key={index} className="border-b-border/50">
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium text-sm leading-tight">{item.product.name}</span>
                                            {item.product.unitOfMeasure && <span className="text-[11px] text-muted-foreground">{item.product.unitOfMeasure}</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center font-mono text-sm">{formatQuantity(item.quantity)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm">{peso(item.price)}</TableCell>
                                    <TableCell className="text-right font-mono text-sm font-semibold">{peso(item.price * item.quantity)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            </div>

            {/* Void reason (required for BIR audit trail) */}
            <div className="mt-4 shrink-0">
                <label htmlFor="void-reason" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reason for Void <span className="text-rose-600">*</span>
                </label>
                <textarea
                    id="void-reason"
                    value={voidReason}
                    onChange={(e) => onVoidReasonChange(e.target.value)}
                    disabled={isVoiding}
                    rows={2}
                    placeholder="e.g. Wrong item, customer cancelled, pricing error…"
                    className="mt-1.5 w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/40"
                />
            </div>

            {voidError && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive shrink-0">
                    <AlertTriangle className="h-4 w-4" /> {voidError}
                </p>
            )}

            <SheetFooter className="mt-4 shrink-0">
                <button onClick={onBack} disabled={isVoiding} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                    Cancel
                </button>
                <button onClick={onVoidTransaction} disabled={isVoiding || !canVoid} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-destructive text-destructive-foreground shadow-[0_1px_3px_hsl(var(--destructive)/0.25)] hover:bg-destructive/90 hover:shadow-[0_6px_18px_hsl(var(--destructive)/0.28)] focus-visible:ring-destructive/55 h-10 px-[18px]">
                    {isVoiding ? <Spinner className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                    {isVoiding ? 'Voiding...' : 'Void Transaction'}
                </button>
            </SheetFooter>
        </div>
    );
}

// Compact selectable row used in the "recent transactions" quick-pick lists
function TransactionPickRow({ sale, onPick, accent = 'primary', isHighlighted = false }: { sale: any, onPick: (s: any) => void, accent?: 'primary' | 'rose', isHighlighted?: boolean }) {
    const hover = accent === 'rose' ? 'hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'hover:bg-primary/5';
    const highlightClass = isHighlighted ? 'bg-rose-100/50 dark:bg-rose-950/50 ring-2 ring-rose-500' : '';
    return (
        <button
            onClick={() => onPick(sale)}
            className={`group flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left transition-colors ${hover} ${highlightClass}`}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold">{sale.siNumber ? formatSINumber(sale.siNumber) : (sale.orderNumber ? sale.orderNumber : sale.id?.substring(0, 7))}</span>
                    <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{sale.paymentMethod || '-'}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{sale.customer?.name || 'Walk-in'}</span>
                    <span>·</span>
                    <span className="shrink-0">{format(new Date(sale.date || new Date()), 'MMM d, p')}</span>
                </div>
            </div>
            <span className="shrink-0 font-mono text-sm font-bold">{peso(sale.total)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
    );
}


export function VoidSalesDialog(props: VoidSalesDialogProps) {
  const { isOpen, onOpenChange } = props;
  const {
    step,
    isLoading,
    searchText,
    setSearchText,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    clearSearch,
    searchError,
    selectedSale,
    recentSales,
    isRecentLoading,
    isVoiding,
    voidError,
    voidReason,
    setVoidReason,
    handlePickSale,
    handleAuthSuccess,
    handleAuthClose,
    handleVoidTransaction,
    handleBackToSearch,
  } = useVoidSales({ isOpen, onOpenChange });

  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || step !== 'input_so' || isRecentLoading || selectedSale) return;

      switch (e.key) {
        case 'ArrowDown':
          if (recentSales.length === 0) return;
          e.preventDefault();
          setHighlightedIndex(prev => (prev === null ? 0 : (prev + 1) % recentSales.length));
          break;
        case 'ArrowUp':
          if (recentSales.length === 0) return;
          e.preventDefault();
          setHighlightedIndex(prev => (prev === null ? recentSales.length - 1 : (prev - 1 + recentSales.length) % recentSales.length));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex !== null) {
            handlePickSale(recentSales[highlightedIndex]);
          }
          break;
      }
    };

    if (isOpen && step === 'input_so') {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, step, recentSales, highlightedIndex, isRecentLoading, selectedSale, handlePickSale]);

  useEffect(() => {
    if (!isOpen || step !== 'input_so') {
      setHighlightedIndex(null);
    }
  }, [isOpen, step]);

  return (
    <>
      <Sheet open={isOpen && (step === 'input_so' || step === 'select_items')} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col">
            {step === 'select_items' && selectedSale ? (
                 <ConfirmVoidView
                    sale={selectedSale}
                    voidReason={voidReason}
                    onVoidReasonChange={setVoidReason}
                    onVoidTransaction={handleVoidTransaction}
                    onBack={handleBackToSearch}
                    isVoiding={isVoiding}
                    voidError={voidError}
                />
            ) : (
                <div className="flex h-full flex-col">
                    <SheetHeader className="shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950">
                                <Ban className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle>Void Transaction</SheetTitle>
                                <SheetDescription>Search by SI number or pick a recent transaction</SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>

                    <div className="mt-4 shrink-0">
                        <TransactionSearchBar
                          searchText={searchText}
                          onSearchTextChange={(v) => { setSearchText(v); setHighlightedIndex(null); }}
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          onDateFromChange={setDateFrom}
                          onDateToChange={setDateTo}
                          onClear={clearSearch}
                          autoFocus
                        />
                    </div>

                    <div className="mt-5 flex items-center gap-2 shrink-0">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">Recent Transactions</span>
                    </div>
                    <div className="mt-2 flex-1 overflow-hidden rounded-xl border">
                        <ScrollArea className="h-full">
                            {isRecentLoading ? (
                                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                                    <Spinner className="h-4 w-4" /> Loading…
                                </div>
                            ) : recentSales.length > 0 ? (
                                recentSales.map((sale: any, index: number) => (
                                    <TransactionPickRow key={sale.id} sale={sale} onPick={handlePickSale} accent="rose" isHighlighted={highlightedIndex === index} />
                                ))
                            ) : (
                                <div className="p-6 text-center text-sm text-muted-foreground">No recent transactions.</div>
                            )}
                        </ScrollArea>
                    </div>

                    <SheetFooter className="mt-4 shrink-0">
                        <button onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
                            Cancel
                        </button>
                    </SheetFooter>
                </div>
            )}
        </SheetContent>
      </Sheet>
      
      <AdminAuthDialog
        isOpen={isOpen && step === 'auth'}
        onOpenChange={handleAuthClose}
        onSuccess={handleAuthSuccess}
        requiredCredentials={null}
        title="Void Authorization"
        description="Enter admin credentials to access void functions."
      />
    </>
  );
}

