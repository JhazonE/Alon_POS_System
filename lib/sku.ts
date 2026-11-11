// Supplier SKU generator. Format: {BRAND3}-{NAME3}-{RANDOM6}.
// This fills supplier_product_mapping.supplier_sku, which is a supplier's own
// code for a product. It is NOT a products.sku generator: that column is gone,
// and products are identified by barcode. The two remaining callers are the
// add-product form and the supplier-mappings hook, both for a supplier SKU.
export function generateSku(brand?: string | null, name?: string | null): string {
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  const brandPart = (brand ?? '').substring(0, 3).toUpperCase() || 'BRD';
  const namePart = (name ?? '').substring(0, 3).toUpperCase() || 'PRO';
  return `${brandPart}-${namePart}-${randomPart}`;
}
