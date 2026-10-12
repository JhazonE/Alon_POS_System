import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '@/lib/branch-context';
import { ENTITY_SCHEMAS } from '@/lib/import/entity-schemas';
import { buildEntityExportCsv } from '@/lib/import/csv-out';

// Columns are aliased to the import field keys so the export matches the import
// template exactly (plus a trailing `sku` for reference). See lib/import/entity-schemas.ts.
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
    // means a branch with no warehouses, which must export nothing (a CSV
    // with only its header row) rather than everything.
    const params: any[] = [];
    let branchCondition = '';
    if (branchWarehouseIds !== null && branchWarehouseIds.length > 0) {
      branchCondition = `WHERE warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})`;
      params.push(...branchWarehouseIds);
    }

    const products = branchWarehouseIds !== null && branchWarehouseIds.length === 0 ? [] : await query(`
      SELECT
        name,
        type,
        barcode,
        description,
        category,
        brand,
        subcategory,
        unit_of_measure AS unit,
        cost AS cost_price,
        price AS selling_price,
        stock AS stock_quantity,
        reorder_point,
        image_url,
        conversion_factor,
        sku
      FROM products
      ${branchCondition}
    `, params);

    const plain = JSON.parse(JSON.stringify(products));
    const csv = buildEntityExportCsv(ENTITY_SCHEMAS.products, plain, ['sku']);
    const csvWithBOM = '﻿' + csv;

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="products.csv"',
      },
    });
  } catch (error: any) {
    console.error('Error exporting products:', error);
    return NextResponse.json({ success: false, error: 'Failed to export products' }, { status: 500 });
  }
}
