import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Branch isolation. The scope comes from the database via uid, never
    // from a branch the caller claims. A warehouseId that belongs to
    // another branch is refused outright rather than quietly ignored.
    let branchWarehouseIds: string[] | null;
    try {
      const scope = await resolveScopeFromRequest(searchParams);
      const requestedWarehouseId =
        searchParams.get('warehouseId') || searchParams.get('warehouse_id');
      if (requestedWarehouseId) {
        await assertWarehouseInBranch(requestedWarehouseId, scope);
      }
      branchWarehouseIds = await warehouseIdsForBranch(scope);
    } catch (error) {
      const mapped = branchErrorResponse(error);
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
      throw error;
    }

    // null means head office — apply no warehouse filter. An empty array
    // means a branch with no warehouses, which must return nothing rather
    // than everything.
    if (branchWarehouseIds !== null && branchWarehouseIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    const params: any[] = branchWarehouseIds ?? [];

    const sql = `
      SELECT
        COALESCE(p.category, 'Uncategorized') as category,
        SUM(sii.quantity * sii.price) as total_sales
      FROM sales_invoice_items sii
      JOIN products p ON sii.product_id = p.id
      JOIN sales_invoices si ON sii.sales_invoice_id = si.id
      WHERE MONTH(si.invoice_date) = MONTH(CURRENT_DATE())
      AND YEAR(si.invoice_date) = YEAR(CURRENT_DATE())
      AND si.status != 'Voided'
      ${branchWarehouseIds !== null ? `AND p.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})` : ''}
      GROUP BY p.category
      ORDER BY total_sales DESC
    `;

    const rows = await query(sql, params);

    const data = rows.map((row: any, index: number) => ({
      category: row.category,
      sales: parseFloat(row.total_sales),
      fill: `var(--chart-${(index % 5) + 1})`,
    }));

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('Error fetching monthly sales by category:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch monthly sales data' },
      { status: 500 }
    );
  }
}
