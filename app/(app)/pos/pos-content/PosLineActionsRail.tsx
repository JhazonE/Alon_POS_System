'use client';

import { Pencil, X, Percent, Tag, ListOrdered, Plus, FilePenLine, Power } from 'lucide-react';
import { PosActionRail, type RailAction } from './PosActionRail';
import type { SuspendedTransaction } from './pos-types';

type Props = {
  selectedItemId: string | null;
  shiftActive: boolean;
  heldTransactions: SuspendedTransaction[];
  handleOpenEditDialog: () => void;
  handleVoidLine: (id: string | null) => void;
  handleOpenDiscountDialog: () => void;
  handleHold: () => void;
  handleOpenSuspended: () => void;
  focusInlineQuantity: (id: string | null) => void;
  handleRequestPriceEdit: () => void;
  handleShutdown: () => void;
};

/** Left rail: the F-key actions that operate on the cart and the current line. */
export function PosLineActionsRail({
  selectedItemId, shiftActive, heldTransactions,
  handleOpenEditDialog, handleVoidLine, handleOpenDiscountDialog, handleHold,
  handleOpenSuspended, focusInlineQuantity, handleRequestPriceEdit, handleShutdown,
}: Props) {
  const actions: RailAction[] = [
    { icon: Pencil, label: 'Edit Item', shortcut: 'F1', action: handleOpenEditDialog, tint: 'text-blue-600' },
    { icon: X, label: 'Line Void', shortcut: 'F2', action: () => handleVoidLine(selectedItemId), tint: 'text-rose-600' },
    { icon: Percent, label: 'Discount', shortcut: 'F3', action: handleOpenDiscountDialog, tint: 'text-emerald-600' },
    { icon: Tag, label: 'Hold', shortcut: 'F4', action: handleHold, tint: 'text-orange-600' },
    { icon: ListOrdered, label: 'Recall', shortcut: 'F5', action: handleOpenSuspended, tint: 'text-amber-600', badge: heldTransactions.length },
    { icon: Plus, label: 'Quantity', shortcut: 'F6', action: () => focusInlineQuantity(selectedItemId), tint: 'text-indigo-600' },
    { icon: FilePenLine, label: 'Edit Price', shortcut: 'F7', action: handleRequestPriceEdit, tint: 'text-purple-600' },
    { icon: Power, label: shiftActive ? 'Endorse/Out' : 'Shutdown', shortcut: 'F8', action: handleShutdown, tint: 'text-slate-600' },
  ];

  return <PosActionRail actions={actions} side="left" />;
}
