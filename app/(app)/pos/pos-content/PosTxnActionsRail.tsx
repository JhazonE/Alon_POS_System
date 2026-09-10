'use client';

import { Printer, User, Clock, Ban, Undo, Search, Banknote, ArrowRight, Inbox } from 'lucide-react';
import { PosActionRail, type RailAction } from './PosActionRail';

function CashTransferIcon({ className }: { className?: string }) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className ?? ''}`}>
      <Banknote className="h-full w-full" />
      <ArrowRight className="absolute -bottom-1 -right-1 h-3 w-3 stroke-[3]" />
    </span>
  );
}

type Props = {
  handleOpenEndShift: () => void;
  handleOpenCashTransfer: () => void;
  setIsCustomerSelectOpen: (v: boolean) => void;
  handleOpenLoyalty: () => void;
  setIsRecentSalesOpen: (v: boolean) => void;
  setIsVoidSalesOpen: (v: boolean) => void;
  setIsReturnSalesOpen: (v: boolean) => void;
  setIsPriceInquiryOpen: (v: boolean) => void;
  isFrontliner?: boolean;
  posMode?: 'default' | 'pharmacy';
  queuedOrdersCount?: number;
  setIsQueuePanelOpen?: (v: boolean) => void;
};

/** Right rail: the Ctrl-key actions that operate on the shift and past transactions. */
export function PosTxnActionsRail({
  handleOpenEndShift, handleOpenCashTransfer, setIsCustomerSelectOpen, handleOpenLoyalty,
  setIsRecentSalesOpen, setIsVoidSalesOpen, setIsReturnSalesOpen,
  setIsPriceInquiryOpen, isFrontliner, posMode, queuedOrdersCount = 0, setIsQueuePanelOpen,
}: Props) {

  const allActions = [
    { icon: Printer, label: 'Cash count', shortcut: 'Ctrl+1', action: handleOpenEndShift, tint: 'text-emerald-600', cashierOnly: true },
    { icon: CashTransferIcon, label: 'Cash transfer', shortcut: 'Ctrl+2', action: handleOpenCashTransfer, tint: 'text-emerald-600', cashierOnly: true },
    { icon: User, label: 'Customer', shortcut: 'Ctrl+3', action: () => setIsCustomerSelectOpen(true), tint: 'text-sky-600', cashierOnly: false },
    { icon: User, label: 'Loyalty', shortcut: 'Ctrl+4', action: handleOpenLoyalty, tint: 'text-sky-600', cashierOnly: true },
    { icon: Clock, label: 'Recent Sales', shortcut: 'Ctrl+5', action: () => setIsRecentSalesOpen(true), tint: 'text-amber-600', cashierOnly: true },
    { icon: Ban, label: 'Void Sales', shortcut: 'Ctrl+6', action: () => setIsVoidSalesOpen(true), tint: 'text-rose-600', cashierOnly: true },
    { icon: Undo, label: 'Return Sales', shortcut: 'Ctrl+7', action: () => setIsReturnSalesOpen(true), tint: 'text-amber-600', cashierOnly: true },
    { icon: Search, label: 'Price Inquiry', shortcut: 'Ctrl+P', action: () => setIsPriceInquiryOpen(true), tint: 'text-fuchsia-600', cashierOnly: false },
  ];

  const actions: RailAction[] = isFrontliner
    ? allActions.filter(a => !a.cashierOnly)
    : [...allActions];

  // Cashier: queue button — only visible in pharmacy mode
  if (!isFrontliner && posMode === 'pharmacy' && setIsQueuePanelOpen) {
    actions.push({
      icon: Inbox,
      label: 'Queue',
      shortcut: 'Ctrl+Q',
      action: () => setIsQueuePanelOpen(true),
      tint: 'text-violet-600',
      badge: queuedOrdersCount,
      badgeTint: 'bg-violet-600',
      highlight: true,
    });
  }

  return <PosActionRail actions={actions} side="right" />;
}
