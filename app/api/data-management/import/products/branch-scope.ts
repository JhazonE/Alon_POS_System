import { query } from '@/lib/mysql';
import { BranchResolutionError, type BranchScope } from '@/lib/branch-context';

/**
 * Resolve the warehouse that newly imported products are assigned to: the one
 * flagged is_main, else the seeded 'wh_main', else the oldest active warehouse.
 *
 * Head office (`scope: 'all'`) keeps the global behaviour. It returns null if
 * no warehouse exists at all, so the import still succeeds and the products
 * simply stay unassigned.
 *
 * A single-branch scope is limited to that branch's warehouses (spec D6): the
 * destination is derived from the importing user, so a branch user's products
 * can never land in another branch. If that branch has no active warehouse the
 * import is REFUSED (409) rather than silently leaving products unassigned. An
 * unassigned product belongs to no branch, so it would be invisible to the
 * importer and every other branch user while still sitting in the catalogue,
 * and the importer would see "Import successful". Database errors also
 * propagate for a branch user instead of degrading to "unassigned".
 */
export async function getDefaultWarehouseId(scope: BranchScope): Promise<string | null> {
  if (scope.scope === 'all') {
    try {
      const [wh] = (await query(
        `SELECT id FROM warehouses
         WHERE is_active = 1
         ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
         LIMIT 1`,
      )) as any[];
      return wh?.id ?? null;
    } catch (err) {
      console.warn('[Import] Could not resolve default warehouse:', err);
      return null;
    }
  }

  const [wh] = (await query(
    `SELECT id FROM warehouses
     WHERE is_active = 1 AND branch_id = ?
     ORDER BY is_main DESC, (id = 'wh_main') DESC, created_at ASC
     LIMIT 1`,
    [scope.branchId],
  )) as any[];
  if (!wh?.id) {
    throw new BranchResolutionError(
      `Branch ${scope.branchId} has no active warehouse to import products into`,
      409,
    );
  }
  return wh.id;
}

/**
 * A SQL fragment limiting an existing-product match to the importer's branch,
 * so a row whose barcode, name or SKU happens to match another branch's product
 * cannot overwrite it. Empty for head office. Append it to a `WHERE ...` that
 * already has a condition.
 */
export function productInBranchClause(scope: BranchScope): { sql: string; params: string[] } {
  if (scope.scope === 'all') return { sql: '', params: [] };
  return {
    sql: ' AND warehouse_id IN (SELECT id FROM warehouses WHERE branch_id = ?)',
    params: [scope.branchId],
  };
}
