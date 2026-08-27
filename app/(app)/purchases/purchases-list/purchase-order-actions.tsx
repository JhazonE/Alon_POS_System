'use client';

import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, FileText, Ban, Check, Truck, Edit, Copy, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PurchaseOrder, SystemSettings } from '@/lib/types';

interface PurchaseOrderActionsProps {
  order: PurchaseOrder;
  onUpdateOrder: (id: string, updates: Partial<PurchaseOrder>) => void;
  onReceive: (order: PurchaseOrder) => void;
  onPrint: () => void;
  onViewDetails: () => void;
  onReorder: (order: PurchaseOrder) => void;
  onEdit: (order: PurchaseOrder) => void;
  settings?: SystemSettings | null;
}

export function PurchaseOrderActions({
  order,
  onUpdateOrder,
  onReceive,
  onPrint,
  onViewDetails,
  onReorder,
  onEdit,
  settings,
}: PurchaseOrderActionsProps) {
  const { toast } = useToast();
  const [isVoidDialogOpen, setIsVoidDialogOpen] = useState(false);

  const handleApprove = () => {
    const nextStatus =
      order.status === 'Draft' && settings?.requirePurchaseOrderConfirmation
        ? 'Pending'
        : 'Approved';
    onUpdateOrder(order.id, { status: nextStatus });
    toast({
      title: nextStatus === 'Pending' ? 'Order Submitted' : 'Order Approved',
      description:
        nextStatus === 'Pending'
          ? `Order ${order.id.substring(0, 7)} has been submitted for approval.`
          : `Order ${order.id.substring(0, 7)} has been approved.`,
    });
  };

  const handleVoid = () => {
    onUpdateOrder(order.id, { status: 'Cancelled' });
    toast({ title: 'Order Voided', description: 'Purchase order has been cancelled.' });
    setIsVoidDialogOpen(false);
  };

  return (
    <>
      <AlertDialog open={isVoidDialogOpen} onOpenChange={setIsVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Purchase Order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the purchase order and mark it as voided. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Void Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>

          {order.status === 'Draft' && (
            <DropdownMenuItem onClick={handleApprove}>
              <Check className="mr-2 h-4 w-4" />
              {settings?.requirePurchaseOrderConfirmation ? 'Submit for Approval' : 'Approve'}
            </DropdownMenuItem>
          )}

          {order.status === 'Pending' && !settings?.requirePurchaseOrderConfirmation && (
            <DropdownMenuItem onClick={handleApprove}>
              <Check className="mr-2 h-4 w-4" /> Approve
            </DropdownMenuItem>
          )}

          {['Approved', 'Paid', 'Shipped'].includes(order.status) && (
            <DropdownMenuItem onClick={() => onReceive(order)}>
              <Truck className="mr-2 h-4 w-4" /> Receive Items
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={onViewDetails}>
            <FileText className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onReorder(order)}>
            <Copy className="mr-2 h-4 w-4" /> Reorder
          </DropdownMenuItem>

          {(order.status === 'Draft' || order.status === 'Pending') && (
            <DropdownMenuItem onClick={() => onEdit(order)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {(order.status === 'Draft' ||
            order.status === 'Pending' ||
            order.status === 'Approved') && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setIsVoidDialogOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Ban className="mr-2 h-4 w-4" /> Void / Cancel
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
