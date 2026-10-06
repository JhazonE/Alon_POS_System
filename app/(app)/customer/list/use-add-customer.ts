'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/client-activity-logger';
import { getApiUrl, authFetch } from '@/lib/api-config';

interface LoyaltySetting {
  id: string;
  description: string;
  base: string;
  amount: number;
  equivalent: number;
}

const customerSchema = z.object({
  customerId: z.string(),
  name: z.string().min(1, 'Customer name is required'),
  contactNumber: z.string().min(1, 'Contact number is required'),
  active: z.boolean().default(true),
  loyaltyPoints: z.coerce.number().min(0).default(0),
  paymentTerms: z.string().optional(),
  address: z.string().optional(),
  billingAddress: z.string().optional(),
  discount: z.coerce.number().min(0).max(100, 'Discount must be between 0 and 100'),
  creditLimit: z.coerce.number().min(0, 'Credit limit must be non-negative'),
  priceLevelId: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerSchema>;

type Options = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSave: (customerId: string, name: string, contactNumber: string, active: boolean, loyaltyPoints: number, paymentTerms: string, address: string, billingAddress: string, discount: number, creditLimit: number, priceLevelId?: string) => Promise<void>;
  customer?: any;
};

export function useAddCustomer({ open, onOpenChange, onSave, customer }: Options) {
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const [isSaving, setIsSaving] = useState(false);
  const [priceLevels, setPriceLevels] = useState<any[]>([]);
  const [isLoadingPriceLevels, setIsLoadingPriceLevels] = useState(false);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySetting[]>([]);
  const [isLoadingLoyaltySettings, setIsLoadingLoyaltySettings] = useState(false);
  const [paymentTermsList, setPaymentTermsList] = useState<any[]>([]);
  const [isLoadingPaymentTerms, setIsLoadingPaymentTerms] = useState(false);
  const [sameAsAddress, setSameAsAddress] = useState(false);
  const [isPaymentTermsSelectOpen, setIsPaymentTermsSelectOpen] = useState(false);
  const [isManagePaymentTermsOpen, setIsManagePaymentTermsOpen] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customerId: '',
      name: '',
      contactNumber: '',
      active: true,
      loyaltyPoints: 0,
      paymentTerms: '',
      address: '',
      billingAddress: '',
      discount: 0,
      creditLimit: 0,
      priceLevelId: '',
    },
  });

  const fetchLoyaltySettings = async () => {
    try {
      setIsLoadingLoyaltySettings(true);
      const response = await authFetch(getApiUrl('/loyalty-settings'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();

      if (result.success) {
        setLoyaltySettings(result.data);
      } else {
        console.error('Failed to fetch loyalty settings:', result.error);
      }
    } catch (error) {
      console.error('Error fetching loyalty settings:', error);
    } finally {
      setIsLoadingLoyaltySettings(false);
    }
  };

  const fetchPriceLevels = async () => {
    try {
      setIsLoadingPriceLevels(true);
      const levels = await import('../../products/actions').then(m => m.getPriceLevels());
      setPriceLevels(levels);
    } catch (error) {
      console.error('Error fetching price levels:', error);
    } finally {
      setIsLoadingPriceLevels(false);
    }
  };

  const fetchPaymentTerms = async () => {
    try {
      setIsLoadingPaymentTerms(true);
      const response = await authFetch(getApiUrl('/payment-terms'));
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      if (result.success) {
        setPaymentTermsList(result.data);
      }
    } catch (error) {
      console.error('Error fetching payment terms:', error);
    } finally {
      setIsLoadingPaymentTerms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPriceLevels();
      fetchLoyaltySettings();
      fetchPaymentTerms();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        form.reset({
          customerId: customer.customerId || customer.id,
          name: customer.name || '',
          contactNumber: customer.contactNumber || '',
          active: customer.active !== undefined ? customer.active : true,
          loyaltyPoints: customer.loyaltyPoints || 0,
          paymentTerms: customer.paymentTerms || '',
          address: customer.address || '',
          billingAddress: customer.billingAddress || '',
          discount: customer.discount || 0,
          creditLimit: customer.creditLimit || 0,
          priceLevelId: customer.priceLevelId || '',
        });
      } else {
        const generatedId = 'CUST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        form.reset({
          customerId: generatedId,
          name: '',
          contactNumber: '',
          active: true,
          loyaltyPoints: 0,
          paymentTerms: '',
          address: '',
          billingAddress: '',
          discount: 0,
          creditLimit: 0,
          priceLevelId: '',
        });
      }
      setSameAsAddress(false);
    }
  }, [isOpen, customer, form]);

  const handleSubmit = async (values: CustomerFormValues) => {
    setIsSaving(true);
    try {
      await onSave(
        values.customerId,
        values.name,
        values.contactNumber,
        values.active,
        values.loyaltyPoints,
        values.paymentTerms || '',
        values.address || '',
        values.billingAddress || '',
        values.discount,
        values.creditLimit,
        values.priceLevelId
      );
      await logActivity({
        action: customer ? 'UPDATE' : 'CREATE',
        module: 'CUSTOMERS',
        description: `${customer ? 'Updated' : 'Added'} customer: "${values.name}" (ID: ${values.customerId})`,
        referenceId: values.customerId,
      });
      toast({
        title: customer ? 'Customer Updated' : 'Customer Added',
        description: `Customer "${values.name}" has been successfully ${customer ? 'updated' : 'added'}.`,
      });
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to add customer', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add customer. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isOpen,
    setIsOpen,
    form,
    isSaving,
    priceLevels,
    isLoadingPriceLevels,
    loyaltySettings,
    isLoadingLoyaltySettings,
    paymentTermsList,
    isLoadingPaymentTerms,
    sameAsAddress,
    setSameAsAddress,
    isPaymentTermsSelectOpen,
    setIsPaymentTermsSelectOpen,
    isManagePaymentTermsOpen,
    setIsManagePaymentTermsOpen,
    fetchPaymentTerms,
    handleSubmit,
  };
}
