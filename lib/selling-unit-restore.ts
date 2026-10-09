import { safeQtyBase } from './selling-unit-qty';

/**
 * Base-stock units to restore for one voided or returned line.
 *
 * `sale_items.quantity` (and `sales_invoice_items.quantity`) holds UNITS SOLD,
 * not base units, so a void that restores `quantity` directly gives back 1 base
 * unit for a voided Case of 24 — destroying 23 units of real inventory on an
 * operation cashiers perform routinely.
 *
 * Every row written before this feature has `selling_unit_qty_base IS NULL`,
 * which normalises to a multiplier of 1 and restores exactly as it does today.
 * The sign is preserved, so a negative return line stays negative.
 */
export function restoreBaseQty(row: { quantity: unknown; selling_unit_qty_base?: unknown }): number {
  const qty = typeof row.quantity === 'number' ? row.quantity : parseFloat(String(row.quantity ?? ''));
  if (!Number.isFinite(qty)) return 0;
  return qty * safeQtyBase(row.selling_unit_qty_base);
}
