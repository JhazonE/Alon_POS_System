'use client';

import { useLeavePage } from '@/components/form-page/use-leave-page';
import { BadOrderForm } from '../record-bad-order/bad-order-form';

export default function NewBadOrderPageRoute() {
  const leave = useLeavePage('/purchases/bad-orders');
  return <BadOrderForm onLeave={leave} />;
}
