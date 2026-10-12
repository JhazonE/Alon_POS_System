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
    const limit = parseInt(searchParams.get('limit') || '5');

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
    
    // Query to get top selling products by quantity
    const sql = `
      SELECT
        sii.product_name as name,
        SUM(sii.quantity) as quantity,
        SUM(sii.quantity * sii.price) as total_revenue
      FROM sales_invoice_items sii
      JOIN sales_invoices si ON sii.sales_invoice_id = si.id
      JOIN products p ON sii.product_id = p.id
      WHERE si.status != 'Voided'
      ${branchWarehouseIds !== null ? `AND p.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})` : ''}
      GROUP BY sii.product_id, sii.product_name
      ORDER BY quantity DESC
      LIMIT ?
    `;

    const rows = await query(sql, [...params, limit]);

    // Assign colors dynamically for the chart
    const data = rows.map((row: any, index: number) => ({
      name: row.name,
      quantity: parseInt(row.quantity),
      totalRevenue: parseFloat(row.total_revenue),
      fill: `var(--chart-${index + 1})`, // cycle through chart-1 to chart-5
    }));

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error) {
    console.error('Error fetching top products:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch top products' },
      { status: 500 }
    );
  }
}
