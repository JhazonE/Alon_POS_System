
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Star, Wallet, History, ArrowLeft, TrendingUp, TrendingDown, ScanBarcode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Customer } from '@/lib/types';
import { cn } from '@/lib/utils';
import { getApiUrl } from '@/lib/api-config';
import { Spinner } from '@/components/ui/spinner';

interface CustomerWithLoyalty extends Customer {
  loyaltyPoints: number;
  isExpired?: boolean;
}

const pointsSchema = z.object({
  points: z.coerce.number().int().positive('Points must be a positive number.'),
  reason: z.string().min(3, 'A reason is required (min. 3 characters).'),
});

const cardInputSchema = z.object({
  cardNumber: z.string().min(1, 'Card number is required'),
});

type PointsFormValues = z.infer<typeof pointsSchema>;
type CardInputFormValues = z.infer<typeof cardInputSchema>;
type LoyaltyView = 'menu' | 'add' | 'withdraw' | 'balance' | 'input-card';

export function AdjustPointsForm({
  customer: initialCustomer,
  onFinished,
  hideAdjustments,
}: {
  customer: CustomerWithLoyalty | null;
  onFinished: () => void;
  hideAdjustments?: boolean;
}) {
  const [view, setView] = useState<LoyaltyView>('menu');
  const [customer, setCustomer] = useState<CustomerWithLoyalty | null>(initialCustomer);
  const [targetAction, setTargetAction] = useState<'add' | 'withdraw' | 'balance' | null>(null);
  const { toast } = useToast();

  const pointsForm = useForm<PointsFormValues>({
    resolver: zodResolver(pointsSchema),
    defaultValues: {
      points: undefined,
      reason: '',
    },
  });

  const cardForm = useForm<CardInputFormValues>({
    resolver: zodResolver(cardInputSchema),
    defaultValues: {
      cardNumber: '',
    },
  });

  const { isSubmitting: isPointsSubmitting } = pointsForm.formState;
  const { isSubmitting: isCardSubmitting } = cardForm.formState;

  // If initial customer changes (e.g. from parent prop), update local state
  useEffect(() => {
    if (initialCustomer) {
      setCustomer(initialCustomer);
    }
  }, [initialCustomer]);

  const handleActionClick = (action: 'add' | 'withdraw' | 'balance') => {
    if (customer) {
      setView(action);
    } else {
      setTargetAction(action);
      setView('input-card');
    }
  };

  async function onCardSubmit(values: CardInputFormValues) {
    try {
      // Search for customer by RFID/Card code
      // Note: This assumes an API endpoint exists or we use the general search
      // For now, let's try to use the customer-loyalty API with a query param if available,
      // or we might need to implement a specific lookup.
      // Let's assume there's an endpoint /api/customer-loyalty?rfid=... or similar.
      // If not, we might need to rely on the main customer search.
      
      const response = await fetch(getApiUrl(`/customer-loyalty/lookup?rfid=${encodeURIComponent(values.cardNumber)}`));
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
           setCustomer(result.data);
           toast({
             title: "Customer Identified",
             description: `Loyalty account found for ${result.data.name}`,
           });
           
           if (targetAction) {
             setView(targetAction);
           } else {
             setView('menu');
           }
        } else {
           toast({
            variant: 'destructive',
            title: "Not Found",
            description: "No customer found with this loyalty card number.",
          });
        }
      } else {
        // Fallback or error handling
        toast({
          variant: 'destructive',
          title: "Error",
          description: "Failed to look up customer. Please try again.",
        });
      }
    } catch (error) {
       console.error(error);
       toast({
        variant: 'destructive',
        title: "Error",
        description: "An unexpected error occurred.",
      });
    }
  }

  async function onPointsSubmit(values: PointsFormValues) {
    if (!customer) return;

    const adjustmentType = view === 'add' ? 'add' : 'remove';
    try {
      const response = await fetch(getApiUrl('/customer-loyalty/adjust-points'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customer.id,
          adjustmentType,
          points: values.points,
          reason: values.reason,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const currentPoints = Number(customer.loyaltyPoints || 0);
        const newPoints =
          adjustmentType === 'add'
            ? currentPoints + values.points
            : currentPoints - values.points;

        // Update local customer state to reflect new points
        setCustomer({ ...customer, loyaltyPoints: newPoints });

        toast({
          title: 'Points Adjusted',
          description: `${customer.name}'s new balance is ${newPoints} points.`,
        });

        // Trigger parent update if available
        if (onFinished) {
          onFinished();
        }

        // Optional: Stay on view or go back to menu? 
        // Usually better to go back to menu or close.
        // Let's go back to menu to see the updated balance or perform another action.
        setView('menu');
        pointsForm.reset();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to adjust points.',
        });
      }
    } catch (error) {
      console.error('Error adjusting points:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to adjust points. Please try again.',
      });
    }
  }

  if (view === 'menu') {
    return (
      <div className="space-y-6">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Loyalty Rewards
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500 dark:text-slate-400">
            {customer ? (
              <>Managing rewards for <span className="text-slate-900 dark:text-slate-100 font-bold">{customer.name}</span></>
            ) : (
              "Identify a customer to manage rewards"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-4">
          {!hideAdjustments && (
            <>
              {customer?.isExpired && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl mb-4 font-bold flex items-center gap-3">
                  <div className="bg-red-500 text-white p-1 rounded-full">
                    <Minus className="w-4 h-4" />
                  </div>
                  <span>THIS LOYALTY CARD IS EXPIRED. ACTIONS DISABLED.</span>
                </div>
              )}
              <button 
                className="inline-flex items-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-16 justify-between px-6 text-base font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-900 group transition-all"
                onClick={() => handleActionClick('add')}
                disabled={customer?.isExpired}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-500 rounded-full text-white group-hover:scale-110 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span>Add Points</span>
                </div>
                <TrendingUp className="w-5 h-5 opacity-40" />
              </button>

              <button 
                className="inline-flex items-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-16 justify-between px-6 text-base font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:text-amber-300 dark:border-amber-900 group transition-all"
                onClick={() => handleActionClick('withdraw')}
                disabled={customer?.isExpired}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-amber-500 rounded-full text-white group-hover:scale-110 transition-transform">
                    <Minus className="w-5 h-5" />
                  </div>
                  <span>Withdraw Points</span>
                </div>
                <TrendingDown className="w-5 h-5 opacity-40" />
              </button>
            </>
          )}

          <button 
            className="inline-flex items-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-16 justify-between px-6 text-base font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 dark:text-blue-300 dark:border-blue-900 group transition-all"
            onClick={() => handleActionClick('balance')}
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-500 rounded-full text-white group-hover:scale-110 transition-transform">
                <Wallet className="w-5 h-5" />
              </div>
              <span>Check Points Balance</span>
            </div>
            <History className="w-5 h-5 opacity-40" />
          </button>
        </div>

        <DialogFooter className="sm:justify-center">
          <button onClick={onFinished} className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 px-[18px] text-slate-400 text-xs">
            Close Rewards
          </button>
        </DialogFooter>
      </div>
    );
  }

  if (view === 'input-card') {
    return (
      <div className="space-y-6">
         <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setView('menu')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <DialogTitle>Identify Customer</DialogTitle>
          </div>
          <DialogDescription>
            Enter the customer's loyalty card number/RFID to proceed.
          </DialogDescription>
        </DialogHeader>

        <Form {...cardForm}>
          <form onSubmit={cardForm.handleSubmit(onCardSubmit)} className="space-y-4">
            <FormField
              control={cardForm.control}
              name="cardNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Card Number / RFID</FormLabel>
                   <FormControl>
                    <div className="relative">
                      <Input 
                        placeholder="Scan card or enter number" 
                        className="h-14 pl-12 text-lg" 
                        {...field} 
                        autoFocus
                      />
                      <ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] w-full h-12 text-lg" disabled={isCardSubmitting}>
              {isCardSubmitting ? <Spinner className="w-5 h-5" /> : "Verify Customer"}
            </button>
          </form>
        </Form>
      </div>
    );
  }

  if (view === 'balance' && customer) {
    return (
      <div className="space-y-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setView('menu')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <DialogTitle>Point Balance</DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Star className="w-24 h-24 rotate-12" />
          </div>
          <div className="relative z-10 text-center space-y-2">
            <div className="text-sm font-medium text-slate-400 uppercase tracking-widest">Available Balance</div>
            <div className="text-6xl font-black tracking-tighter">
              {customer.loyaltyPoints}
            </div>
            <div className="text-sm text-blue-400 font-bold">LOYALTY POINTS</div>
            <div className="text-xs text-slate-500 mt-2 font-mono italic">
              {customer.name} {customer.isExpired && "(EXPIRED)"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px] w-full" onClick={() => setView('menu')}>Back to Menu</button>
        </DialogFooter>
      </div>
    );
  }

  // Add or Withdraw View
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setView('menu')} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <DialogTitle>{view === 'add' ? 'Add' : 'Withdraw'} Points</DialogTitle>
        </div>
        <DialogDescription>
          {view === 'add' ? 'Grant bonus points to this customer.' : 'Deduct points from this customer for rewards.'}
        </DialogDescription>
        {customer && (
          <div className="mt-2 flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border">
            <span className="font-semibold text-primary">{customer.name}</span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Current Balance: <span className="text-slate-900 dark:text-slate-100 font-bold">{customer.loyaltyPoints}</span></span>
          </div>
        )}
      </DialogHeader>

      <Form {...pointsForm}>
        <form
          onSubmit={pointsForm.handleSubmit(onPointsSubmit)}
          className={cn(
            'space-y-4 rounded-2xl border p-6 mt-4 transition-all',
            view === 'add' ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900' : 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900'
          )}
        >
          <FormField
            control={pointsForm.control}
            name="points"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-600 dark:text-slate-300 font-bold">Amount of Points</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="Enter amount"
                      className="text-2xl h-16 font-black pl-12 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-200 dark:placeholder:text-slate-600 placeholder:font-normal"
                      {...field} 
                      value={field.value === undefined ? '' : field.value}
                      autoFocus
                    />
                    <Star className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-yellow-500 fill-yellow-500" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={pointsForm.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-slate-600 dark:text-slate-300 font-bold">Reason / Notes</FormLabel>
                <FormControl>
                  <Input
                    placeholder={view === 'add' ? 'e.g. Purchase Bonus' : 'e.g. Item Redemption'}
                    className="h-12 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="pt-2">
            <button
              type="submit"
              className={cn("inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]", "w-full h-14 text-lg font-black shadow-lg", view === 'add' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-amber-600 hover:bg-amber-700 shadow-amber-200')}
              disabled={isPointsSubmitting}
            >
              {isPointsSubmitting ? (
                <>
                  <Spinner className="mr-2 h-5 w-5" />
                  Processing...
                </>
              ) : (
                `Confirm ${view === 'add' ? 'Addition' : 'Withdrawal'}`
              )}
            </button>
          </div>
        </form>
      </Form>
    </>
  );
}


export function AdjustPointsDialog({
  customer,
  onFinished,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: {
  customer: CustomerWithLoyalty;
  onFinished?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;
  const setIsOpen = isControlled ? (onOpenChangeProp ?? setInternalOpen) : setInternalOpen;
  
  const handleDialogFinished = () => {
    if (onFinished) {
      onFinished();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-3xl p-6 rounded-[2rem]">
        <AdjustPointsForm customer={customer} onFinished={handleDialogFinished} />
      </DialogContent>
    </Dialog>
  );
}

export function AdjustPointsDialogContent({ customer, onFinished, hideAdjustments }: { customer: CustomerWithLoyalty | null; onFinished: () => void; hideAdjustments?: boolean; }) {
  return (
    <DialogContent className="sm:max-w-3xl p-6 rounded-[32px] overflow-hidden border-none shadow-2xl">
       <AdjustPointsForm customer={customer} onFinished={onFinished} hideAdjustments={hideAdjustments} />
    </DialogContent>
  );
}
