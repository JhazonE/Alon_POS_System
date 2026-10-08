'use client';


import { SheetFooter } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Supplier } from '@/lib/types';

import { useSupplierForm, type SupplierSaveHandler } from './use-supplier-form';
import { Spinner } from '@/components/ui/spinner';

const SCHEDULE_OPTIONS = [
  "Daily",
  "Every Monday",
  "Every Tuesday",
  "Every Wednesday",
  "Every Thursday",
  "Every Friday",
  "Every Saturday",
  "Every Sunday",
  "Every 2 Weeks",
  ...Array.from({ length: 31 }, (_, i) => `Monthly (Day ${i + 1})`),
  "Monthly (End of Month)",
];

/**
 * The add/edit supplier form fields + footer, without any Sheet wrapper. Driven
 * by `useSupplierForm`. Used both by the standalone `SupplierFormDialog` (inside
 * its own Sheet) and embedded directly in the single Manage Suppliers drawer.
 *
 * `open`/`onOpenChange` are the controlled open state: the hook fires
 * `onOpenChange(false)` after a successful save and when Cancel is pressed, so
 * the parent decides what "close" means (close the sheet, or return to the list).
 */
export function SupplierFormBody({
  supplier,
  onSave,
  open,
  onOpenChange,
  cancelLabel = 'Cancel',
}: {
  supplier?: Supplier;
  onSave: SupplierSaveHandler;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cancelLabel?: string;
}) {
  const {
    name, setName,
    telephone, setTelephone,
    mobilePhone, setMobilePhone,
    email, setEmail,
    address, setAddress,
    company, setCompany,
    tin, setTin,
    paymentTerms, setPaymentTerms,
    orderSchedule, setOrderSchedule,
    availablePaymentTerms,
    isSaving,
    handleSave,
    setIsOpen,
  } = useSupplierForm({ supplier, onSave, open, onOpenChange });

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Supplier Name"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Company Name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tin">TIN</Label>
            <Input
              id="tin"
              value={tin}
              onChange={e => setTin(e.target.value)}
              placeholder="TIN"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telephone">Telephone</Label>
            <Input
              id="telephone"
              value={telephone}
              onChange={e => setTelephone(e.target.value)}
              placeholder="Landline"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mobilePhone">Mobile Phone</Label>
            <Input
              id="mobilePhone"
              value={mobilePhone}
              onChange={e => setMobilePhone(e.target.value)}
              placeholder="Mobile"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentTerms">Payment Terms</Label>
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger>
                <SelectValue placeholder="Terms" />
              </SelectTrigger>
              <SelectContent>
                {availablePaymentTerms.length > 0 ? (
                  availablePaymentTerms.map(term => (
                    <SelectItem key={term.id} value={term.name}>{term.name}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="7 Days">7 Days</SelectItem>
                    <SelectItem value="15 Days">15 Days</SelectItem>
                    <SelectItem value="30 Days">30 Days</SelectItem>
                    <SelectItem value="60 Days">60 Days</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="orderSchedule">Order Schedule</Label>
          <Select value={orderSchedule} onValueChange={setOrderSchedule}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select schedule" />
            </SelectTrigger>
            <SelectContent>
              {SCHEDULE_OPTIONS.map(option => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea
            id="address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            className="resize-none"
            rows={3}
            placeholder="Full Address"
          />
        </div>
      </div>

      <SheetFooter className="px-6 py-4 border-t">
        <button onClick={() => setIsOpen(false)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">
          {cancelLabel}
        </button>
        <button onClick={handleSave} disabled={isSaving || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
          {isSaving && <Spinner className="mr-2 h-4 w-4" />}
          {isSaving ? 'Saving...' : 'Save Supplier'}
        </button>
      </SheetFooter>
    </>
  );
}
