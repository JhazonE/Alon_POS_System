import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const lowStock = searchParams.get('lowStock');
    const search = searchParams.get('search');

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;

    let baseSql = `
      FROM products p
    `;

    const conditions = [];
    const params = [];

    // Services are excluded: they have no stock, so they would otherwise appear
    // permanently out-of-stock and drag inventory valuation totals to zero.
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
          pagination: { total: 0, page, limit, hasMore: false },
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

    if (lowStock === 'true') {
      conditions.push('p.stock > 0 AND (p.stock < p.reorder_point OR p.stock < (SELECT COALESCE(low_stock_threshold, 0) FROM pos_settings LIMIT 1))');
    }

    if (search) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)');
      const searchVal = `%${search}%`;
      params.push(searchVal, searchVal, searchVal);
    }

    if (conditions.length > 0) {
      baseSql += ' WHERE ' + conditions.join(' AND ');
    }

    // Get Total Count for Pagination
    const countSql = `SELECT COUNT(*) as total ${baseSql}`;
    const [countResult] = await query(countSql, params);
    const totalItems = countResult.total;
    const totalPages = Math.ceil(totalItems / limit);

    // Get Data with Pagination
    let sql = `
      SELECT 
        p.id,
        p.name,
        p.sku,
        p.barcode,
        p.category,
        p.brand,
        p.stock,
        p.unit_of_measure,
        p.cost,
        p.price,
        p.reorder_point,
        COALESCE(
          (SELECT SUM(quantity_remaining * unit_cost) FROM inventory_batches WHERE product_id = p.id AND quantity_remaining > 0),
          (p.stock * COALESCE(p.cost, 0))
        ) as total_value
      ${baseSql}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `;

    const products = await query(sql, [...params, limit, offset]);

    // Calculate Global Totals (need separate query without pagination if we want accurate totals for ALL items, not just current page)
    // However, usually detailed reports want totals for EVERYTHING.
    // So we effectively need to run a sum query over the filtered set.
    
    let sumSql = `
      SELECT 
        COUNT(*) as totalItems,
        SUM(p.stock) as totalStock,
        SUM(
          COALESCE(
            (SELECT SUM(quantity_remaining * unit_cost) FROM inventory_batches WHERE product_id = p.id AND quantity_remaining > 0),
            (p.stock * COALESCE(p.cost, 0))
          )
        ) as totalValue
      ${baseSql}
    `;
    const [summaryResult] = await query(sumSql, params);
    
    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages
      },
      summary: {
        totalItems: summaryResult.totalItems || 0,
        totalStock: Number(summaryResult.totalStock) || 0,
        totalValue: Number(summaryResult.totalValue) || 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching inventory report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inventory report' },
      { status: 500 }
    );
  }
}
