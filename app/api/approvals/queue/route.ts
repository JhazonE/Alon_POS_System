import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const txType = searchParams.get('txType');

    // Fetch queue items with requester info
    let sql = `
      SELECT 
        aq.*,
        COALESCE(u.display_name, 'System') as requester_name,
        COALESCE(u.username, 'system@alonpos.com') as requester_email
      FROM approval_queue aq
      LEFT JOIN users u ON aq.created_by = u.uid
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'ALL') {
      sql += ' AND aq.status = ?';
      params.push(status);
    }
    if (txType) {
      sql += ' AND aq.transaction_type = ?';
      params.push(txType);
    }

    sql += ' ORDER BY aq.created_at DESC';

    const queueItems: any[] = await query(sql, params);

    if (queueItems.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const itemIds = queueItems.map(i => i.id);

    // Fetch history ONLY for these items
    const history: any = await query(
      `SELECT * FROM approval_history WHERE approval_queue_id IN (?) ORDER BY created_at ASC`,
      [itemIds]
    );

    // Fetch workflows for the specific transaction types in the queue
    const txTypes = Array.from(new Set(queueItems.map(i => i.transaction_type)));
    const workflows: any = await query(`
      SELECT aw.*, ut.name as role_name 
      FROM approval_workflows aw 
      JOIN user_types ut ON aw.user_type_id = ut.id
      WHERE aw.transaction_type IN (?)
      ORDER BY aw.step_order ASC
    `, [txTypes]);

    // Group history and add workflow info
    const enrichedItems = queueItems.map(item => {
      const itemHistory = (history || []).filter((h: any) => h.approval_queue_id === item.id);
      const itemWorkflow = (workflows || []).filter((w: any) => w.transaction_type === item.transaction_type);

      const currentStepInfo = itemWorkflow.find((w: any) => w.step_order === item.current_step);

      let parsedData: any = {};
      try {
        parsedData = typeof item.transaction_data === 'string' ? JSON.parse(item.transaction_data) : item.transaction_data;
      } catch (e) {
        console.error(`Failed to parse transaction_data for item ${item.id}:`, e);
      }

      return {
        ...item,
        transaction_data: parsedData,
        history: itemHistory,
        workflow: itemWorkflow,
        currentStepRole: currentStepInfo?.role_name || 'Unknown',
        currentStepRoleId: currentStepInfo?.user_type_id || null
      };
    });

    // ── Enrich missing warehouse / shelf names ─────────────────────────────
    // Collect IDs that need resolution
    const warehouseIdSet = new Set<string>();
    const shelfIdSet = new Set<string>();
    const productIdSet = new Set<string>(); // for STOCK_ADJUSTMENT missing warehouse

    for (const item of enrichedItems) {
      const d = item.transaction_data as any;
      if (!d) continue;
      if (!d.warehouseName && d.warehouseId)       warehouseIdSet.add(d.warehouseId);
      if (!d.fromWarehouseName && d.sourceWarehouseId) warehouseIdSet.add(d.sourceWarehouseId);
      if (!d.toWarehouseName && d.targetWarehouseId)   warehouseIdSet.add(d.targetWarehouseId);
      if (!d.shelfName && d.shelfId)                shelfIdSet.add(d.shelfId);
      // For STOCK_ADJUSTMENT with productId but no warehouseName/shelfName
      if (item.transaction_type === 'STOCK_ADJUSTMENT' && d.productId && !d.warehouseName) {
        productIdSet.add(d.productId);
      }
    }

    // Batch fetch warehouse names
    const warehouseMap: Record<string, string> = {};
    if (warehouseIdSet.size > 0) {
      const whRows: any[] = await query(
        'SELECT id, name FROM warehouses WHERE id IN (?)',
        [[...warehouseIdSet]]
      );
      for (const r of whRows) warehouseMap[r.id] = r.name;
    }

    // Batch fetch shelf names
    const shelfMap: Record<string, string> = {};
    if (shelfIdSet.size > 0) {
      const shRows: any[] = await query(
        'SELECT id, name FROM shelf_locations WHERE id IN (?)',
        [[...shelfIdSet]]
      );
      for (const r of shRows) shelfMap[r.id] = r.name;
    }

    // Batch fetch warehouse+shelf for products missing that info (STOCK_ADJUSTMENT)
    const productWarehouseMap: Record<string, { warehouseName: string | null; shelfName: string | null }> = {};
    if (productIdSet.size > 0) {
      const pRows: any[] = await query(`
        SELECT p.id, w.name as warehouse_name, sl.name as shelf_name
        FROM products p
        LEFT JOIN warehouses w ON p.warehouse_id = w.id
        LEFT JOIN shelf_locations sl ON p.shelf_location_id = sl.id
        WHERE p.id IN (?)
      `, [[...productIdSet]]);
      for (const r of pRows) {
        productWarehouseMap[r.id] = {
          warehouseName: r.warehouse_name || null,
          shelfName: r.shelf_name || null,
        };
      }
    }

    // Apply enrichment to each item
    for (const item of enrichedItems) {
      const d = item.transaction_data as any;
      if (!d) continue;

      if (!d.warehouseName && d.warehouseId && warehouseMap[d.warehouseId]) {
        d.warehouseName = warehouseMap[d.warehouseId];
      }
      if (!d.fromWarehouseName && d.sourceWarehouseId && warehouseMap[d.sourceWarehouseId]) {
        d.fromWarehouseName = warehouseMap[d.sourceWarehouseId];
      }
      if (!d.toWarehouseName && d.targetWarehouseId && warehouseMap[d.targetWarehouseId]) {
        d.toWarehouseName = warehouseMap[d.targetWarehouseId];
      }
      if (!d.shelfName && d.shelfId && shelfMap[d.shelfId]) {
        d.shelfName = shelfMap[d.shelfId];
      }

      // For STOCK_ADJUSTMENT: fill from product lookup if still missing
      if (item.transaction_type === 'STOCK_ADJUSTMENT' && d.productId) {
        const pw = productWarehouseMap[d.productId];
        if (pw) {
          if (!d.warehouseName && pw.warehouseName) d.warehouseName = pw.warehouseName;
          if (!d.shelfName && pw.shelfName) d.shelfName = pw.shelfName;
        }
      }
    }
    // ── Enrich missing barcode / SKU in item arrays ───────────────────────
    const itemProductIdSet = new Set<string>();

    for (const item of enrichedItems) {
      const d = item.transaction_data as any;
      if (!d) continue;
      for (const arr of [d.items, d.receivedItems]) {
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          if (!it || typeof it !== 'object') continue;
          // Normalise legacy field names first (barcode → productBarcode, sku → productSku)
          if (!it.productBarcode && it.barcode) it.productBarcode = it.barcode;
          if (!it.productSku    && it.sku)     it.productSku    = it.sku;
          // Queue for DB lookup if still missing
          if (it.productId && (!it.productBarcode || !it.productSku)) {
            itemProductIdSet.add(it.productId);
          }
        }
      }
    }

    const productInfoMap: Record<string, { barcode: string | null; sku: string | null }> = {};
    if (itemProductIdSet.size > 0) {
      const piRows: any[] = await query(
        'SELECT id, barcode, sku FROM products WHERE id IN (?)',
        [[...itemProductIdSet]]
      );
      for (const r of piRows) productInfoMap[r.id] = { barcode: r.barcode || null, sku: r.sku || null };
    }

    for (const item of enrichedItems) {
      const d = item.transaction_data as any;
      if (!d) continue;
      for (const arr of [d.items, d.receivedItems]) {
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          if (!it?.productId || !productInfoMap[it.productId]) continue;
          const pi = productInfoMap[it.productId];
          if (!it.productBarcode && pi.barcode) it.productBarcode = pi.barcode;
          if (!it.productSku    && pi.sku)     it.productSku    = pi.sku;
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      data: enrichedItems,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching approval queue:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
