import { Metadata } from 'next';
import { PricingClient } from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing | Alon POS',
  description: 'Apply a price, cost, markup%, or price-level change to many products at once.',
};

export default function PricingPage() {
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] p-3 sm:p-6 lg:p-8 space-y-3 sm:space-y-4 max-w-full lg:overflow-hidden bg-background">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0 shrink-0 w-full min-w-0">
        <div className="w-full min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight truncate leading-none">Pricing</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Apply a price, cost, markup%, or price-level change to many products at once.</p>
        </div>
      </div>
      <div className="lg:flex-1 w-full lg:min-h-0">
        <PricingClient />
      </div>
    </div>
  );
}
