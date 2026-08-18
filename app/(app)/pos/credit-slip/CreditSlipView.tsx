import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { formatQuantity } from '@/lib/utils';
import type { CreditSlipViewProps } from './credit-slip-types';

export const CreditSlipView = forwardRef<HTMLDivElement, CreditSlipViewProps>(({ creditDetails, settings }, ref) => {
  const { items, customerName, totalAmount, originalSoNumber, date, cashierName, creditSlipId, expiryDate } = creditDetails;
  const formatCurrency = (amount: number) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currentDate = date ? new Date(date) : new Date();

  return (
    <div ref={ref} className="printable-area bg-white text-black p-4 text-[10px] font-mono font-bold w-[58mm] mx-auto print:w-auto print:ml-1 print:mr-6 leading-tight">
      <div className="text-center mb-4">
        <div className="font-bold text-lg mb-1">{settings?.businessName || 'ALON POS SYSTEM'}</div>
        <div>{settings?.address || 'General Merchandise'}</div>
        {settings?.contactNumber && <div>{settings.contactNumber}</div>}
        {settings?.tin && <div>VAT REG TIN: {settings.tin}</div>}
        <div>MIN: {settings?.minNumber || '1234567890'}</div>
        <div>S/N: {settings?.serialNumber || '0987654321-11'}</div>
        <div className="text-[10px]">{format(currentDate, 'PP p')}</div>
      </div>

      <div className="mb-2 border-b border-dashed border-black pb-2">
        <div className="font-bold text-center border-y border-black py-1 mb-1 uppercase">
          Merchandise Credit Slip
        </div>
        <div className="font-bold text-xs">MC NO.: {creditSlipId}</div>
        <div className="mt-1">Ref SO#: {originalSoNumber}</div>
        <div>Cust: {customerName}</div>
        <div>Cashier: {cashierName}</div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between font-bold border-b border-black mb-1 text-[10px]">
          <span className="w-10 text-left">Qty</span>
          <span className="flex-1 text-left px-1">Item</span>
          <span className="w-12 text-right">Amt</span>
        </div>
        {items.map((item, index) => (
          <div key={index} className="flex justify-between mb-1 items-start text-[10px]">
            <span className="w-10 text-left">{formatQuantity(item.quantity)} {item.product?.unitOfMeasure || 'pc'}</span>
            <span className="flex-1 text-left px-1">
              <div>{item.product?.name || 'Unknown Item'}</div>
              <div className="text-black">@ {formatCurrency(item.price)}</div>
            </span>
            <span className="w-12 text-right">{formatCurrency(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-black pt-2 space-y-1">
        <div className="flex justify-between font-bold text-sm mt-2 border-b border-black pb-1">
          <span>TOTAL CREDIT:</span>
          <span>₱{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      <div className="mt-10 space-y-10">
        <div className="text-center">
          <div className="border-t border-black w-3/4 mx-auto pt-1">Customer Signature</div>
        </div>
        <div className="text-center">
          <div className="border-t border-black w-3/4 mx-auto pt-1">Authorized Signature</div>
        </div>
      </div>

      <div className="text-center mt-6">
        <div style={{ fontSize: '9px' }}>Printed: {format(new Date(), 'PP p')}</div>
        <div style={{ fontSize: '9px' }}>Pos System by Bhagoh</div>
      </div>
    </div>
  );
});

CreditSlipView.displayName = 'CreditSlipView';
