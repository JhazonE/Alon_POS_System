import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/mysql';
import {
  resolveScopeFromRequest,
  warehouseIdsForBranch,
  assertWarehouseInBranch,
  branchErrorResponse,
} from '../../../lib/branch-context';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const productId = searchParams.get('productId') || '';
    const status = searchParams.get('status') || 'all'; // all | active | exhausted
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const offset = (page - 1) * pageSize;

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
      return NextResponse.json({ success: true, data: [], total: 0, page, pageSize });
    }

    let whereClauses: string[] = [];
    let params: any[] = [];

    // Batches carry no warehouse column of their own; a batch belongs to the
    // warehouse of its product.
    if (branchWarehouseIds !== null) {
      whereClauses.push(
        `p.warehouse_id IN (${branchWarehouseIds.map(() => '?').join(',')})`
      );
      params.push(...branchWarehouseIds);
    }

    if (productId) {
      whereClauses.push('ib.product_id = ?');
      params.push(productId);
    }

    if (search) {
      whereClauses.push('(p.name LIKE ? OR ib.id LIKE ? OR ib.purchase_order_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status === 'active') {
      whereClauses.push('ib.quantity_remaining > 0');
    } else if (status === 'exhausted') {
      whereClauses.push('ib.quantity_remaining <= 0');
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult: any[] = await query(
      `SELECT COUNT(*) as total FROM inventory_batches ib
       LEFT JOIN products p ON ib.product_id = p.id
       ${whereStr}`,
      params
    );
    const total = countResult[0]?.total ?? 0;

    const rows: any[] = await query(
      `SELECT
         ib.id,
         ib.product_id,
         p.name as product_name,
         p.barcode as product_barcode,
         ib.purchase_order_id,
         po.reference_number as po_reference,
         ib.received_date,
         ib.quantity_in,
         ib.quantity_remaining,
         ib.unit_cost,
         ib.selling_price,
         ib.source_type,
         ib.notes,
         ib.created_at,
         DATE_FORMAT(ib.expiration_date, '%Y-%m-%d') as expirationDate
       FROM inventory_batches ib
       LEFT JOIN products p ON ib.product_id = p.id
       LEFT JOIN purchase_orders po ON ib.purchase_order_id = po.id
       ${whereStr}
       ORDER BY ib.received_date DESC, ib.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      total,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error('Error fetching inventory batches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inventory batches' },
      { status: 500 }
    );
  }
}
