import {
  renderSalesReceiptText, renderVoidSlipText, renderCreditSlipText, renderReadingText,
} from './text-receipt';
import type { EJournalData } from './types';

export const SEP = '\n\n' + '='.repeat(32) + '\n\n';

export function section(title: string, blocks: string[], emptyLabel: string): string {
  if (blocks.length === 0) return `${title}\n\nNo ${emptyLabel} for this date.\n`;
  return `${title}\n\n${blocks.join(SEP)}\n`;
}

export function buildFiles(data: EJournalData): Record<string, string> {
  const { settings } = data;
  return {
    'sales-invoices': section(
      'SALES INVOICES',
      data.salesInvoices.map((s) => renderSalesReceiptText(s, settings)),
      'sales invoices'
    ),
    'voided': section(
      'VOIDED TRANSACTIONS',
      data.voided.map((v) => renderVoidSlipText(v, settings)),
      'voided transactions'
    ),
    'merchandise-credits': section(
      'RETURN SALES',
      data.merchandiseCredits.map((c) => renderCreditSlipText(c, settings)),
      'return sales'
    ),
    'x-readings': section(
      'X-READINGS',
      data.xReadings.map((r) => renderReadingText(r, settings)),
      'X-readings'
    ),
    'z-reading': section(
      'Z-READING',
      data.zReadings.map((r) => renderReadingText(r, settings)),
      'Z-reading'
    ),
  };
}
