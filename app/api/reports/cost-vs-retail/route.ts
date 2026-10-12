import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';

const COST_VALUE_EXPR = `COALESCE(
  (SELECT SUM(quantity_remaining * unit_cost) FROM inventory_batches WHERE product_id = p.id AND quantity_remaining > 0),
  (p.stock * COALESCE(p.cost, 0))
)`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    let baseSql = `
      FROM products p
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    // Services are excluded: they carry no stock, so they would otherwise pad
    // this valuation report with zero-value rows and inflate totalItems.
    conditions.push("p.type = 'standard'");

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
    if (branchWarehouseIds !== null) {
      if (branchWarehouseIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          pagination: { page, limit, totalItems: 0, totalPages: 0 },
          summary: {
            totalItems: 0,
            totalCostValue: 0,
            totalRetailValue: 0,
            totalProfit: 0,
            marginPct: 0,
          },
        });
      }
      conditions.push(
        `p.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})`
      );
      params.push(...branchWarehouseIds);
    }

    if (category && category !== 'all') {
      conditions.push('p.category = ?');
      params.push(category);
    }

    if (conditions.length > 0) {
      baseSql += ' WHERE ' + conditions.join(' AND ');
    }

    // Total count for pagination
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const [countResult] = await query(countSql, params);
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / limit);

    // Paginated rows
    const sql = `
      SELECT
        p.id, p.name, p.sku, p.barcode, p.category, p.brand,
        p.stock, p.unit_of_measure, p.cost, p.price,
        ${COST_VALUE_EXPR} as cost_value,
        (p.stock * COALESCE(p.price, 0)) as retail_value,
        (p.stock * COALESCE(p.price, 0)) - ${COST_VALUE_EXPR} as profit
      ${baseSql}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `;
    const products = await query(sql, [...params, limit, offset]);

    // Grand totals over the whole filtered set
    const sumSql = `
      SELECT
        COUNT(*) as totalItems,
        SUM(${COST_VALUE_EXPR}) as totalCostValue,
        SUM(p.stock * COALESCE(p.price, 0)) as totalRetailValue
      ${baseSql}
    `;
    const [summaryResult] = await query(sumSql, params);

    const totalCostValue = Number(summaryResult.totalCostValue) || 0;
    const totalRetailValue = Number(summaryResult.totalRetailValue) || 0;
    const totalProfit = totalRetailValue - totalCostValue;
    const marginPct = totalRetailValue > 0 ? (totalProfit / totalRetailValue) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: products,
      pagination: { page, limit, totalItems, totalPages },
      summary: {
        totalItems: summaryResult.totalItems || 0,
        totalCostValue,
        totalRetailValue,
        totalProfit,
        marginPct,
      },
    });
  } catch (error: any) {
    console.error('Error fetching cost vs retail report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cost vs retail report' },
      { status: 500 }
    );
  }
}
