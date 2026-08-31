'use client';

import { useState } from 'react';
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
import { Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';

interface CustomerWithLoyalty {
  id: string;
  customer_id: string;
  name: string;
  contact_number: string;
  payment_terms: string | null;
  rfid_code: string | null;
  expiry_date: string | null;
  point_setting: string | null;
  loyaltyPoints: number;
  last_transaction: string | null;
  created_at: string;
  updated_at: string;
}

export function DeleteLoyaltyCardDialog({
  customer,
  onSuccess,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  customer: CustomerWithLoyalty;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const setIsOpen = isControlled ? (onOpenChangeProp ?? setInternalOpen) : setInternalOpen;

  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  async function handleDelete() {
    try {
      setIsDeleting(true);
      const response = await fetch(getApiUrl(`/customer-loyalty/${customer.id}`), {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Loyalty Card Deleted',
          description: `Loyalty card for ${customer.name} has been deleted successfully.`,
        });
        setIsOpen(false);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to delete loyalty card.',
        });
      }
    } catch (error) {
      console.error('Error deleting loyalty card:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete loyalty card. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Loyalty Card</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the loyalty card for <strong>{customer.name}</strong>?
            This action cannot be undone and will permanently remove:
            <br />
            • All loyalty points ({customer.loyaltyPoints} points)
            <br />
            • RFID card information ({customer.rfid_code || 'No RFID code'})
            <br />
            • Point history and transactions
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {customer.last_transaction && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mt-4">
            <h4 className="text-amber-800 font-bold text-sm mb-1 uppercase tracking-wider">Deletion Restricted</h4>
            <p className="text-amber-700 text-sm leading-relaxed font-medium">
              This loyalty card has existing transaction history (last active on {new Date(customer.last_transaction).toLocaleDateString()}). 
              For data integrity, cards with point history cannot be deleted.
            </p>
          </div>
        )}

        <AlertDialogFooter className="mt-6">
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting || !!customer.last_transaction}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all font-bold"
          >
            {isDeleting ? 'Deleting...' : 'Delete Loyalty Card'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
