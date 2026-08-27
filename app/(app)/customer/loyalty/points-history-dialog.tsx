'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, ArrowUp, ArrowDown, ShoppingCart, Gift, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getApiUrl } from '@/lib/api-config';

interface PointHistoryEntry {
  id: string;
  transaction_type: 'add' | 'remove' | 'purchase' | 'redemption' | 'expiration' | 'adjustment';
  points: number;
  reason: string | null;
  transaction_reference: string | null;
  created_by: string | null;
  created_at: string;
  customer_name: string;
}

interface PointsHistoryDialogProps {
  customerLoyaltyId: string;
  customerName: string;
}

export function PointsHistoryDialog({
  customerLoyaltyId,
  customerName,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: PointsHistoryDialogProps & { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const setIsOpen = isControlled ? (onOpenChangeProp ?? setInternalOpen) : setInternalOpen;

  const [history, setHistory] = useState<PointHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(getApiUrl(`/customer-loyalty/point-history?customerLoyaltyId=${customerLoyaltyId}`));
      if (response.ok) {
        const result = await response.json();
        setHistory(result.data || []);
      } else {
        console.error('Failed to fetch point history');
        setHistory([]);
      }
    } catch (error) {
      console.error('Error fetching point history:', error);
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, customerLoyaltyId]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'add':
        return <ArrowUp className="h-4 w-4 text-green-500" />;
      case 'remove':
        return <ArrowDown className="h-4 w-4 text-red-500" />;
      case 'purchase':
        return <ShoppingCart className="h-4 w-4 text-blue-500" />;
      case 'redemption':
        return <Gift className="h-4 w-4 text-purple-500" />;
      case 'expiration':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'adjustment':
        return <History className="h-4 w-4 text-gray-500" />;
      default:
        return <History className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTransactionBadgeVariant = (type: string) => {
    switch (type) {
      case 'add':
        return 'default';
      case 'remove':
        return 'destructive';
      case 'purchase':
        return 'secondary';
      case 'redemption':
        return 'outline';
      case 'expiration':
        return 'destructive';
      case 'adjustment':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const formatTransactionType = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Points History - {customerName}</DialogTitle>
          <DialogDescription>
            Transaction history for loyalty points.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-4 bg-gray-200 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-gray-200 rounded animate-pulse" /></TableCell>
                    <TableCell className="text-right"><div className="h-4 w-12 bg-gray-200 rounded animate-pulse ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-32 bg-gray-200 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-20 bg-gray-200 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="h-4 w-24 bg-gray-200 rounded animate-pulse" /></TableCell>
                  </TableRow>
                ))
              ) : history.length > 0 ? (
                history.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{getTransactionIcon(entry.transaction_type)}</TableCell>
                    <TableCell>
                      <Badge variant={getTransactionBadgeVariant(entry.transaction_type)}>
                        {formatTransactionType(entry.transaction_type)}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${
                      entry.transaction_type === 'add' ? 'text-green-600' :
                      entry.transaction_type === 'remove' || entry.transaction_type === 'redemption' || entry.transaction_type === 'expiration' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {entry.transaction_type === 'add' ? '+' : entry.transaction_type === 'remove' || entry.transaction_type === 'redemption' || entry.transaction_type === 'expiration' ? '-' : ''}
                      {entry.points}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={entry.reason || 'No reason provided'}>
                      {entry.reason || 'No reason provided'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.transaction_reference || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(entry.created_at), 'PPp')}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No point history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <button onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
