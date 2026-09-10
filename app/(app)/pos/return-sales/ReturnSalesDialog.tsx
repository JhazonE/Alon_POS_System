'use client';

import { useRef, useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Undo, Clock, Loader2 } from 'lucide-react';
import { AdminAuthDialog } from '../admin-auth/AdminAuthDialog';
import { TransactionPickRow } from './TransactionPickRow';
import { SelectItemsView } from './SelectItemsView';
import { ReturnSuccessView } from './ReturnSuccessView';
import { CreditSlipView } from '../credit-slip/CreditSlipView';
import { useReturnSales } from './use-return-sales';
import type { ReturnSalesDialogProps } from './return-sales-types';
import { format } from 'date-fns';
import { TransactionSearchBar } from '../transaction-search/TransactionSearchBar';

export function ReturnSalesDialog({
  isOpen,
  onOpenChange,
  currentUser,
  terminalId,
  printMode
}: ReturnSalesDialogProps) {
  const creditSlipRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

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
    returnedItems,
    returnedTotal,
    mcNumber,
    recentSales,
    isRecentLoading,
    posSettings,
    handlePickSale,
    handleAuthSuccess,
    handleAuthClose,
    handleReturnItems,
    handleBackToSearch,
    handleCloseSuccess,
    handlePrintCredit,
  } = useReturnSales({
    isOpen,
    onOpenChange,
    currentUser,
    terminalId,
    printMode,
    creditSlipRef,
  });

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
      <Sheet open={isOpen && (step === 'input_so' || step === 'select_items' || step === 'success')} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-xl w-full flex flex-col">
          {step === 'success' ? (
            <ReturnSuccessView
              returnedTotal={returnedTotal}
              saleId={String(selectedSale?.orderNumber || selectedSale?.id || '')}
              onClose={handleCloseSuccess}
              onPrint={handlePrintCredit}
            />
          ) : step === 'select_items' && selectedSale ? (
            <SelectItemsView
              sale={selectedSale}
              onReturnItems={handleReturnItems}
              onBack={handleBackToSearch}
            />
          ) : (
            <div className="flex h-full flex-col">
              <SheetHeader className="shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950">
                    <Undo className="h-5 w-5" />
                  </div>
                  <div>
                    <SheetTitle>Return Sales</SheetTitle>
                    <SheetDescription>Search by SO number or pick a recent transaction</SheetDescription>
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
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                  ) : recentSales.length > 0 ? (
                    recentSales.map((sale: any, index: number) => (
                      <TransactionPickRow key={sale.id} sale={sale} onPick={handlePickSale} isHighlighted={highlightedIndex === index} />
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
        requiredCredentials={posSettings?.enableReturnAuth ? {
          username: posSettings.returnAuthUsername,
          password: posSettings.returnAuthPassword
        } : null}
        title="Return Authorization"
        description="Enter authorized credentials to access return functions."
      />

      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        {selectedSale && returnedItems.length > 0 && (
          <CreditSlipView
            ref={creditSlipRef}
            creditDetails={{
              // Server-issued MC number; legacy timestamp format only as fallback.
              creditSlipId: mcNumber
                || `MC-${selectedSale.orderNumber || selectedSale.id.slice(-6)}-${format(new Date(), 'yyMMddHHmm')}`.toUpperCase(),
              originalSoNumber: String(selectedSale.orderNumber || selectedSale.id),
              customerName: selectedSale.customer?.name || 'Walk-in Customer',
              date: new Date().toISOString(),
              expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              cashierName: currentUser?.name || currentUser?.displayName || currentUser?.username || 'Cashier',
              items: returnedItems,
              totalAmount: returnedTotal
            }}
            settings={posSettings}
          />
        )}
      </div>
    </>
  );
}
