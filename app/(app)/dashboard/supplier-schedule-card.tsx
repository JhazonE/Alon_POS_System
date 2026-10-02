'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MatteCard, MatteCardHeader, MatteCardBody } from '@/components/matte/card';
import { Calendar, ShoppingCart, CheckCircle2, Loader2 } from 'lucide-react';
import { getSuppliers } from '../products/actions';
import { Supplier } from '@/lib/types';

export function SupplierScheduleCard() {
  const [scheduledSuppliers, setScheduledSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchAndFilter = async () => {
      try {
        const suppliers = await getSuppliers();
        
        const today = new Date();
        const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }); // e.g. Monday
        const dayOfMonth = today.getDate(); // 1-31
        
        // Check for last day of month
        const nextDay = new Date(today);
        nextDay.setDate(today.getDate() + 1);
        const isLastDay = nextDay.getDate() === 1;

        const due = suppliers.filter((s: Supplier) => {
           const sched = s.orderSchedule;
           if (!sched) return false;
           
           if (sched === 'Daily') return true;
           if (sched === `Every ${dayOfWeek}`) return true;
           if (sched === `Monthly (Day ${dayOfMonth})`) return true;
           if (sched === 'Monthly (End of Month)' && isLastDay) return true;
           
           // Simple "Every 2 Weeks" check: If it matches weekday, show it as "Potential"
           // For now, let's treat it as a match on the weekday but maybe mark it differently?
           // The user just asked to put in dashboard. Simplicity first.
           if (sched === 'Every 2 Weeks') {
               // We don't know the phase of the 2 weeks without order history.
               // Ignoring for now to avoid false positives.
               return false;
           }

           return false;
        });

        setScheduledSuppliers(due);
      } catch (err) {
        console.error("Failed to fetch suppliers for schedule", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAndFilter();
  }, []);

  if (loading) {
    return (
      <MatteCard className="flex min-h-[150px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[rgb(var(--matte-accent))]" />
      </MatteCard>
    );
  }

  // if (scheduledSuppliers.length === 0) return null; // Removed early return


  return (
    <>
    <MatteCard>
      <MatteCardHeader
        icon={Calendar}
        title="Order Reminders"
        description={`You have ${scheduledSuppliers.length} supplier${scheduledSuppliers.length !== 1 ? 's' : ''} scheduled for today.`}
      />
      <MatteCardBody>
        <div className="mt-1 space-y-2">
          {scheduledSuppliers.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-6 text-center text-[rgb(var(--matte-label))]">
                <CheckCircle2 className="mb-2 h-10 w-10 text-[rgb(var(--matte-up))]" />
                <p className="text-sm">No supplier orders scheduled for today.</p>
                <p className="text-xs">You&apos;re all caught up!</p>
             </div>
          ) : (
            scheduledSuppliers.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-xl bg-[rgb(var(--matte-inset))] p-3">
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[rgb(var(--matte-value))]">{s.name}</span>
                    <span className="text-xs text-[rgb(var(--matte-label))]">{s.orderSchedule}</span>
                </div>
                <button
                    className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring px-[13px] rounded-lg gap-1.5 h-8 text-xs"
                    onClick={() => router.push(`/purchases/new?supplierId=${encodeURIComponent(s.id)}`)}
                >
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    Order
                </button>
                </div>
            ))
          )}
        </div>
      </MatteCardBody>
    </MatteCard>
    </>
  );
}
