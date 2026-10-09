import type { Product } from '@/lib/types';

/**
 * Ang sentinel para sa stock nga wala pa ma-assign sa bisan unsang shelf.
 * Pareho sa gi-gamit sa `updateProductShelfLocations`, nga mo-translate niini
 * ngadto sa NULL sa wala pa ang write.
 */
export const UNASSIGNED_SHELF_ID = 'unassigned';

/**
 * Pila ka unit ang nahimutang sa `shelfId` para niini nga product.
 *
 * Para sa UNASSIGNED_SHELF_ID, gi-derive siya: total stock olos sa tanan nga
 * naka-assign sa shelves. Mao ni ang ceiling para sa shelf transfer — DILI ang
 * `product.stock`. Usa ka product nga 100 ang total apan 3 ra sa Aisle A1 kay
 * 3 ra ang mahimong ibalhin gikan sa A1.
 */
export function shelfQuantityOf(product: Product, shelfId: string): number {
  const assignments = product.shelfQuantities || {};

  if (shelfId === UNASSIGNED_SHELF_ID) {
    const assigned = Object.values(assignments).reduce((sum, q) => sum + (q || 0), 0);
    // Mo-clamp sa 0: ang drifted nga data mahimong mo-assign ug sobra sa stock,
    // ug ang negative nga ceiling mo-guba sa quantity input.
    return Math.max(0, (product.stock || 0) - assigned);
  }

  return assignments[shelfId] || 0;
}

/**
 * Ang mga product nga naa gyuy mabalhin gikan sa `shelfId`.
 *
 * Gi-filter ang search sa shelf mode pinaagi niini aron dili maka-stage ang
 * user ug item nga dili diay ma-transfer.
 */
export function productsOnShelf(products: Product[], shelfId: string): Product[] {
  return products.filter(p => shelfQuantityOf(p, shelfId) > 0);
}
