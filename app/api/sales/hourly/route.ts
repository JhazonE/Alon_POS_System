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
    // Optional: Allow filtering by a specific date. Defaults to CURDATE() in SQL.
    // date format: YYYY-MM-DD
    const dateParam = searchParams.get('date');

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

    // sales_invoices has no warehouse column; an invoice belongs to a branch
    // through the warehouses of the products it sold. null means head
    // office — apply no filter. An empty array means a branch with no
    // warehouses, which must match nothing rather than everything.
    const params: any[] = dateParam ? [dateParam] : [];
    let branchCondition = '';
    if (branchWarehouseIds !== null && branchWarehouseIds.length > 0) {
      branchCondition = `AND EXISTS (
        SELECT 1 FROM sales_invoice_items bii
        JOIN products bp ON bp.id = bii.product_id
        WHERE bii.sales_invoice_id = sales_invoices.id
          AND bp.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})
      )`;
      params.push(...branchWarehouseIds);
    }

    let sql = `
      SELECT
        HOUR(created_at) as hour,
        SUM(total) as sales,
        COUNT(*) as count
      FROM sales_invoices
      WHERE DATE(created_at) = ${dateParam ? '?' : 'CURDATE()'}
      ${branchCondition}
      GROUP BY HOUR(created_at)
      ORDER BY hour ASC
    `;

    const rows =
      branchWarehouseIds !== null && branchWarehouseIds.length === 0
        ? []
        : await query(sql, params);

    // Fill in missing hours with 0
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const chartData = hours.map((hour) => {
      const found = rows.find((row: any) => row.hour === hour);
      return {
        hour: `${hour.toString().padStart(2, '0')}:00`,
        sales: found ? parseFloat(found.sales) : 0,
        count: found ? parseInt(found.count) : 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: chartData,
    });
  } catch (error) {
    console.error('Error fetching hourly sales:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch hourly sales' },
      { status: 500 }
    );
  }
}
