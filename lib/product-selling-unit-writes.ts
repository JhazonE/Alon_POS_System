import { v4 as uuidv4 } from 'uuid';
import { baseUnitPriceLevelRows } from '@/lib/base-unit-price-level-rows';
import { defaultLevelFlatPrice, resolveBaseUnitPrice } from '@/lib/base-price-resolution';
import type { ProductFormData } from '@/app/(app)/products/actions';

/**
 * Selling-unit write helpers shared by addProduct and updateProduct.
 *
 * Moved verbatim out of app/(app)/products/actions.ts so that the non-action
 * addProductWithScope (lib/product-create.ts) can use them. This module has NO
 * 'use server' directive, so none of these are HTTP endpoints.
 */

/**
 * A selling-unit save that must be refused with a specific message rather
 * than the generic one: it rolls back the transaction like any other throw,
 * and updateProduct returns `message` to the user.
 */
export class SellingUnitConflictError extends Error {}

/**
 * Writes one product's selling units and their per-price-level prices.
 *
 * Upsert, not delete-then-reinsert: a unit that carries an `id` is UPDATEd in
 * place (scoped to this product), and that UPDATE must match a row — an id
 * that is stale (removed by a concurrent edit) or belongs to another product
 * throws SellingUnitConflictError, rolling back the caller's transaction,
 * rather than silently dropping the unit. A unit with no `id` is INSERTed
 * under a freshly minted id. This is required, not stylistic — MySQL/
 * InnoDB does not defer foreign-key checks to transaction commit the way
 * Postgres can, so `DELETE FROM product_selling_units` immediately fires the
 * `ON DELETE SET NULL` FKs from sale_items / inventory_batches /
 * sales_invoice_items / pos_transaction_items / etc., and a later re-INSERT
 * of a row with the same id does NOT undo that: those historical references
 * stay NULL forever. Callers that want to remove units the user dropped must
 * delete only those specific rows themselves (by id) before calling this.
 *
 * Before the per-unit writes, kept rows (those with an `id`) are first
 * renamed to a unique `__tmp_<id>` placeholder for `unit_name`/`barcode`.
 * This avoids transiently tripping `unique_selling_unit_barcode` or
 * `unique_product_unit_name` when the submission swaps names/barcodes
 * between two kept units (e.g. renaming unit A to what used to be unit B's
 * name) — row-by-row UPDATEs in submission order could otherwise collide
 * mid-way through.
 *
 * Returns the base row so the caller can sync products.price/cost/barcode/
 * unit_of_measure from it — that sync is what keeps the ~100+ call sites that
 * read products.* directly working unmodified.
 */
export async function writeSellingUnits(
  connection: any,
  productId: string,
  units: NonNullable<ProductFormData['sellingUnits']>,
  defaultPriceLevelId: string | null,
) {
  const baseUnit = units.find((u) => u.isBase) ?? units[0];

  // Two-phase rename: blank out kept rows' unit_name/barcode to a unique
  // placeholder before writing real values below, so two kept units can
  // swap names/barcodes with each other without tripping the unique
  // constraints mid-update.
  for (const u of units) {
    if (!u.id) continue;
    await connection.query(
      'UPDATE product_selling_units SET unit_name = ?, barcode = ? WHERE id = ? AND product_id = ?',
      [`__tmp_${u.id}`, `__tmp_${u.id}`, u.id, productId],
    );
  }

  let basePrice: number | undefined;

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const unitId = u.id || `psu_${uuidv4()}`;

    // product_selling_units.price is the unit's base price. Resolve it from,
    // in order: the submitted default-level entry, if it has no minimum; for a
    // kept unit, the price already stored on the row; any other submitted
    // level's entry that has no minimum; the lowest tier if every entry is
    // tiered; 0 only when there is no entry at all. A quantity tier is never a
    // base price (see lib/base-price-resolution.ts) — the lowest-tier fallback
    // exists because a 0 in a price column is a free sale on a payments path,
    // whereas a tier is at worst a discount the shopkeeper already authorised.
    //
    // The stored-price step matters: units written by the parent/child data
    // migration (120) have a real `price` but no product_selling_unit_prices
    // rows, and a form session that never renders the Selling Units tab
    // (Radix unmounts inactive tabs) submits an empty `prices` map for them.
    // Without this step such a save silently zeroed the unit's price.
    const defaultLevelPrice = defaultLevelFlatPrice(u.prices, defaultPriceLevelId);
    let storedPrice: number | undefined;
    if (u.id && defaultLevelPrice === undefined) {
      const [storedRows]: any = await connection.query(
        'SELECT price FROM product_selling_units WHERE id = ? AND product_id = ?',
        [u.id, productId],
      );
      const stored = Number(storedRows?.[0]?.price);
      if (Number.isFinite(stored) && stored > 0) storedPrice = stored;
    }
    const resolvedPrice = resolveBaseUnitPrice(u.prices, defaultPriceLevelId, storedPrice);
    const unitPrice = resolvedPrice ?? 0;
    if (u === baseUnit) basePrice = resolvedPrice;

    if (u.id) {
      // Existing row — UPDATE in place. MySQL applies ON DELETE SET NULL
      // immediately when a referenced row is deleted, even inside a
      // transaction (InnoDB has no deferred constraint checking), so
      // sale_items / inventory_batches / sales_invoice_items / etc. FK
      // references to this row must never go through a delete+reinsert.
      const [updateResult]: any = await connection.query(
        `UPDATE product_selling_units
           SET unit_name = ?, qty_base = ?, barcode = ?, cost = ?, price = ?, is_base = ?, sort_order = ?
         WHERE id = ? AND product_id = ?`,
        [
          u.unitName,
          Number(u.qtyBase),
          u.barcode,
          u.cost == null ? null : Number(u.cost),
          unitPrice,
          u.isBase ? 1 : 0,
          i,
          u.id,
          productId,
        ],
      );
      // No match means the id is stale or not this product's. Fail loudly
      // (rolls back the whole save) instead of silently dropping the unit.
      // mysql2 reports matched rows here (CLIENT_FOUND_ROWS is on by
      // default), and the placeholder rename above guarantees a real change
      // anyway, so 0 can only mean "no such row for this product".
      if (!updateResult || updateResult.affectedRows === 0) {
        throw new SellingUnitConflictError(
          'One of this product\'s selling units was changed or removed by someone else. Reload the product and try again.',
        );
      }
    } else {
      // New row — nothing to preserve.
      await connection.query(
        `INSERT INTO product_selling_units
           (id, product_id, unit_name, qty_base, barcode, cost, price, is_base, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          unitId,
          productId,
          u.unitName,
          Number(u.qtyBase),
          u.barcode,
          u.cost == null ? null : Number(u.cost),
          unitPrice,
          u.isBase ? 1 : 0,
          i,
        ],
      );
    }

    // Prices are always rewritten wholesale per unit (delete then reinsert).
    // This is safe even for a kept unit: nothing else references
    // product_selling_unit_prices rows individually — it has a composite
    // PK (selling_unit_id, price_level_id), no surrogate id, no dependents.
    // Scoped through product_selling_units to this product as defense in
    // depth, so a wrong unitId can never touch another product's prices.
    await connection.query(
      `DELETE psup FROM product_selling_unit_prices psup
         JOIN product_selling_units psu ON psu.id = psup.selling_unit_id
        WHERE psup.selling_unit_id = ? AND psu.product_id = ?`,
      [unitId, productId],
    );
    for (const [levelId, entry] of Object.entries(u.prices || {})) {
      const price = validPrice(entry);
      if (price === undefined) continue;
      await connection.query(
        `INSERT INTO product_selling_unit_prices
           (selling_unit_id, price_level_id, price, min_quantity)
         VALUES (?, ?, ?, ?)`,
        [
          unitId,
          levelId,
          price,
          entry.minQuantity == null ? null : Number(entry.minQuantity),
        ],
      );
    }
  }

  // basePrice is undefined when nothing resolved it (no valid submitted price
  // and no stored price) — callers then fall back to the form's own price.
  return { baseUnit, basePrice };
}

/**
 * A submitted price entry's price as a finite number, or undefined when the
 * entry is absent or its field was left blank (the tab's inputs write
 * `undefined` for an empty field).
 */
export function validPrice(entry: { price?: unknown } | null | undefined): number | undefined {
  if (entry == null || entry.price == null || entry.price === '') return undefined;
  const n = Number(entry.price);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Dual-write bridge: mirrors the BASE selling unit's per-level prices into the
 * legacy `product_price_levels` table, which POS checkout
 * (lib/pricing.ts calculateEffectivePrice, level-scoped resolution: active level,
 * then default level, then base price) and the products list (getProducts' effectivePrice) still read.
 * Without it a price entered in the Selling Units tab never reaches the POS,
 * and a stale row for the wrong level could incorrectly apply.
 *
 * Upserts on the table's real PRIMARY KEY (product_id, price_level_id), the
 * same way PO receiving and bulk price update do — a check filtered on
 * min_quantity can miss an existing tiered row and then collide on INSERT.
 * On conflict both `price` and `min_quantity` are written, so clearing a
 * minimum in the tab clears the stored tier. A level with no minimum stores 0,
 * which the POS reads as "no minimum".
 *
 * `removedLevelIds` are deleted: levels the caller established the user
 * explicitly removed (see updateProduct). Nothing else is ever deleted here —
 * a row for a level the tab never showed (e.g. a Wholesale override that
 * predates selling units) is left alone.
 */
export async function writeBaseUnitPriceLevels(
  connection: any,
  productId: string,
  baseUnit: NonNullable<ProductFormData['sellingUnits']>[number],
  removedLevelIds: string[] = [],
) {
  for (const row of baseUnitPriceLevelRows(baseUnit.prices)) {
    await connection.query(
      `INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE price = VALUES(price), min_quantity = VALUES(min_quantity)`,
      [productId, row.levelId, row.price, row.minQuantity],
    );
  }
  for (const levelId of removedLevelIds) {
    await connection.query(
      'DELETE FROM product_price_levels WHERE product_id = ? AND price_level_id = ?',
      [productId, levelId],
    );
  }
}

/** The default price level's id, or the first one, or null if none exist. */
export async function resolveDefaultPriceLevelId(connection: any): Promise<string | null> {
  const [rows]: any = await connection.query(
    'SELECT id FROM price_levels ORDER BY is_default DESC, name ASC LIMIT 1',
  );
  return rows?.[0]?.id ?? null;
}
