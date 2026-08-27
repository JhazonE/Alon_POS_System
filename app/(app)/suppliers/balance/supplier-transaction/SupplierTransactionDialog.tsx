'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { Loader2, Printer, Download, FileText } from 'lucide-react';
import { useSupplierTransaction, PAGE_SIZE } from './use-supplier-transaction';
import { TransactionSummaryCards } from './TransactionSummaryCards';
import { TransactionFilters } from './TransactionFilters';
import { TransactionItem } from './TransactionItem';
import { SOASupplierInfo } from '@/lib/print-supplier-soa';

interface Props {
  supplierId: string;
  supplierName: string;
  /** Full supplier object — used to populate the SOA header */
  supplier?: SOASupplierInfo;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SupplierTransactionDialog({
  supplierId, supplierName, supplier,
  trigger, open: controlledOpen, onOpenChange: setControlledOpen,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen ?? (() => {}) : setInternalOpen;

  const {
    transactions, loading,
    searchTerm, setSearchTerm,
    startDate, setStartDate,
    endDate, setEndDate,
    currentPage, setCurrentPage,
    filteredTransactions, totalPages, paginatedTransactions,
    summary, currentBalance,
    handleExportCSV, handlePrint, handlePrintSOA,
  } = useSupplierTransaction(supplierId, supplierName, open, supplier);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Transaction History</DialogTitle>
              <DialogDescription>
                Purchase order history and payment allocations for {supplierName}
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrintSOA}
                disabled={loading || !filteredTransactions.length}
                title="Print Statement of Account" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
              >
                <FileText className="h-4 w-4 mr-2" />Print SOA
              </button>
              <button
                onClick={handlePrint}
                disabled={loading || !transactions.length}
                title="Quick print — transaction list" className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
              >
                <Printer className="h-4 w-4 mr-2" />Print
              </button>
              <button
                onClick={handleExportCSV}
                disabled={loading || !transactions.length} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-8 px-[13px] text-xs rounded-lg gap-1.5"
              >
                <Download className="h-4 w-4 mr-2" />Export CSV
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-4 px-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading history...</p>
            </div>
          ) : (
            <div className="space-y-6">
              <TransactionSummaryCards
                totalPurchases={summary.totalPurchases}
                totalPaid={summary.totalPaid}
                currentBalance={currentBalance}
              />

              <TransactionFilters
                searchTerm={searchTerm}
                startDate={startDate}
                endDate={endDate}
                onSearch={v => { setSearchTerm(v); setCurrentPage(1); }}
                onStartDate={v => { setStartDate(v); setCurrentPage(1); }}
                onEndDate={v => { setEndDate(v); setCurrentPage(1); }}
              />

              {filteredTransactions.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
                  No transactions found matching your filters.
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedTransactions.map(txn => (
                    <TransactionItem key={`${txn.type}-${txn.id}`} txn={txn} />
                  ))}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <p className="text-xs text-muted-foreground">
                        Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
                        {Math.min(currentPage * PAGE_SIZE, filteredTransactions.length)} of{' '}
                        {filteredTransactions.length} transactions
                      </p>
                      <Pagination className="w-auto">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious
                              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                              className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                          {[...Array(totalPages)].map((_, i) => (
                            <PaginationItem key={i + 1} className="hidden md:inline-block">
                              <PaginationLink
                                onClick={() => setCurrentPage(i + 1)}
                                isActive={currentPage === i + 1}
                                className="cursor-pointer"
                              >
                                {i + 1}
                              </PaginationLink>
                            </PaginationItem>
                          ))}
                          <PaginationItem>
                            <PaginationNext
                              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                              className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
