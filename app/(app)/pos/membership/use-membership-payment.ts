'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Customer } from '@/lib/types';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { useToast } from '@/hooks/use-toast';
import type { MembershipResult } from './membership-types';

export interface ExistingCard {
  id: string;
  rfid_code: string | null;
  expiry_date: string | null;
  isExpired?: boolean;
}

interface Options {
  isOpen: boolean;
  initialCustomer?: Customer | null;
  userId: string;
  shiftId?: string | null;
  terminalId?: string | null;
}

export function useMembershipPayment({ isOpen, initialCustomer, userId, shiftId, terminalId }: Options) {
  const { toast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [existingCard, setExistingCard] = useState<ExistingCard | null>(null);
  const [isCardLoading, setIsCardLoading] = useState(false);

  const [fee, setFee] = useState(0);
  const [durationMonths, setDurationMonths] = useState(12);

  const [rfidCode, setRfidCode] = useState('');
  const [pointSetting, setPointSetting] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Read the latest customer object without making it an effect dependency —
  // parent call sites pass a fresh { id, name } literal each render, and depending
  // on the object identity would re-run the reset effect and wipe the inputs mid-typing.
  const initialCustomerRef = useRef(initialCustomer);
  initialCustomerRef.current = initialCustomer;

  const fetchSettings = useCallback(async () => {
    try {
      const res = await authFetch(getApiUrl('/pos-settings'));
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) {
        setFee(parseFloat(result.data.membershipFee ?? 0) || 0);
        setDurationMonths(parseInt(result.data.membershipDurationMonths ?? 12) || 12);
      }
    } catch (e) {
      console.error('Failed to load membership settings:', e);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await authFetch(getApiUrl('/customers?limit=100'));
      if (!res.ok) return;
      const result = await res.json();
      if (result.success) setCustomers(result.data);
    } catch (e) {
      console.error('Failed to load customers:', e);
    }
  }, []);

  // On open: load settings + customers, reset the form, pre-select initial customer.
  useEffect(() => {
    if (!isOpen) return;
    fetchSettings();
    fetchCustomers();
    setRfidCode('');
    setPointSetting('');
    setPaymentMethod('cash');
    setAmountTendered('');
    setSelectedCustomerId(initialCustomerRef.current?.id ?? '');
  }, [isOpen, fetchSettings, fetchCustomers]);

  // When the selected customer changes, look up their loyalty card.
  useEffect(() => {
    if (!isOpen || !selectedCustomerId) {
      setExistingCard(null);
      return;
    }
    let cancelled = false;
    setIsCardLoading(true);
    (async () => {
      try {
        const res = await authFetch(getApiUrl(`/customer-loyalty?customerId=${encodeURIComponent(selectedCustomerId)}&limit=1`));
        const result = await res.json();
        if (cancelled) return;
        if (result.success && result.data.length > 0) {
          const c = result.data[0];
          setExistingCard({ id: c.id, rfid_code: c.rfid_code, expiry_date: c.expiry_date, isExpired: c.isExpired });
        } else {
          setExistingCard(null);
        }
      } catch (e) {
        if (!cancelled) setExistingCard(null);
      } finally {
        if (!cancelled) setIsCardLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, selectedCustomerId]);

  const submit = useCallback(async (): Promise<MembershipResult | null> => {
    if (!selectedCustomerId) {
      toast({ variant: 'destructive', title: 'No customer selected', description: 'Choose a customer to pay membership for.' });
      return null;
    }
    setIsSubmitting(true);
    try {
      const res = await authFetch(getApiUrl('/pos/membership-payment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          rfidCode: rfidCode || undefined,
          pointSetting: pointSetting || undefined,
          paymentMethod,
          amountTendered: paymentMethod === 'cash' ? parseFloat(amountTendered) || 0 : undefined,
          userId,
          shiftId,
          terminalId,
        }),
      });
      const result = await res.json();
      if (!result.success) {
        toast({ variant: 'destructive', title: 'Payment failed', description: result.error || 'Could not process membership payment.' });
        return null;
      }
      return result.data as MembershipResult;
    } catch (e) {
      toast({ variant: 'destructive', title: 'Payment failed', description: 'Network or server error while processing the payment.' });
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedCustomerId, rfidCode, pointSetting, paymentMethod, amountTendered, userId, shiftId, terminalId, toast]);

  return {
    customers,
    selectedCustomerId, setSelectedCustomerId,
    existingCard, isCardLoading,
    fee, durationMonths,
    rfidCode, setRfidCode,
    pointSetting, setPointSetting,
    paymentMethod, setPaymentMethod,
    amountTendered, setAmountTendered,
    isSubmitting,
    submit,
  };
}
