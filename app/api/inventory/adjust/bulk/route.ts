import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, query } from '@/lib/mysql';
import { checkApprovalRequired, submitToApprovalQueue } from '@/lib/approvals';
import { deductFamilyStock, addFamilyStock, findUltimateRoot } from '@/lib/family-sync';

/**
 * Mga column nga DILI kopyahon kung mo-clone ug product row paingon sa laing
 * warehouse: ang identity/location sa row mismo, ug ang stock (ang bag-ong row
 * mosugod sa 0 — ang transfer mismo ang mo-increment).
 */
const CLONE_EXCLUDED_COLUMNS = new Set([
  'id',
  'warehouse_id',
  'stock',
  'created_at',
  'updated_at',
]);

/**
 * Pangitaa (o himoa) ang katugbang sa `product` sulod sa `targetWarehouseId`.
 *
 * Gi-mirror ang kinaiya sa canonical nga TransferStockService: resolve pinaagi
 * sa SKU → barcode → name, ug kung wala gyud, i-clone ang source row paingon sa
 * target warehouse nga 0 ang stock imbes mo-throw.
 *
 * Ang SKU ug barcode lookups gi-guard batok sa NULL: pareho sila optional sa
 * product form, ug sa SQL ang `col = NULL` dili gyud mo-match — mao nga kung
 * i-pass ang NULL, mo-fall through siya sa name (dili mo-match ug sayop nga row).
 */
async function resolveTransferTarget(
  product: any,
  targetWarehouseId: string,
  connection: any
): Promise<string> {
  const lookups: Array<[string, any]> = [
    ['sku', product.sku],
    ['barcode', product.barcode],
    ['name', product.name],
  ];

  for (const [column, value] of lookups) {
    if (value === null || value === undefined || value === '') continue;
    const [rows]: any = await connection.query(
      `SELECT id FROM products WHERE ${column} = ? AND warehouse_id = ? LIMIT 1`,
      [value, targetWarehouseId]
    );
    if (rows && rows.length > 0) return rows[0].id;
  }

  // Wala gyud — i-clone ang source row paingon sa target warehouse.
  // Gi-derive ang column list gikan sa source row mismo (SELECT *) aron dili
  // siya ma-stale kada dugang ug bag-ong column ang migrations.
  const newId = `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const columns = Object.keys(product).filter((c) => !CLONE_EXCLUDED_COLUMNS.has(c));
  const assignments = ['id', 'warehouse_id', 'stock', ...columns];
  const values = [newId, targetWarehouseId, 0, ...columns.map((c) => product[c])];

  await connection.query(
    `INSERT INTO products (${assignments.map((c) => `\`${c}\``).join(', ')})
     VALUES (${assignments.map(() => '?').join(', ')})`,
    values
  );

  // I-kopya ang price levels aron parehas ang pricing sa bag-ong warehouse.
  const [priceLevels]: any = await connection.query(
    'SELECT price_level_id, price, min_quantity FROM product_price_levels WHERE product_id = ?',
    [product.id]
  );
  for (const pl of priceLevels || []) {
    await connection.query(
      'INSERT INTO product_price_levels (product_id, price_level_id, price, min_quantity) VALUES (?, ?, ?, ?)',
      [newId, pl.price_level_id, pl.price, pl.min_quantity]
    );
  }

  return newId;
}

/**
 * Bulk Stock Adjustment API
 * Handles adjusting stock for multiple products in a single operation.
 * Supports multi-level approval and family stock synchronization.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      adjustments, 
      notes: batchNotes, 
      userId = 'system',
      warehouseId,
      targetWarehouseId,
      referenceNo,
      supplierId,
      adjustmentType = 'add'
    } = body;

    if (!adjustments || !Array.isArray(adjustments) || adjustments.length === 0) {
      return NextResponse.json({ success: false, error: 'No adjustments provided' }, { status: 400 });
    }

    const results: any[] = [];
    const queuedItems: any[] = [];

    // 2. Process each adjustment
    await withTransaction(async (connection) => {
      for (const adj of adjustments) {
        const { productId, quantity, reason, targetProductId: itemTargetProductId, expirationDate } = adj;

        if (!productId || quantity === undefined) {
          throw new Error(`Invalid adjustment details for product ${productId}`);
        }

        if (quantity === 0) continue;

        // Fetch product info. SELECT * kay ang transfer nga auto-create path
        // nagkinahanglan sa tanan identity/pricing columns sa source row aron
        // makopya sila sa bag-ong row sa target warehouse.
        const [productResult]: any = await connection.query(
          'SELECT * FROM products WHERE id = ?',
          [productId]
        );

        if (!productResult || productResult.length === 0) {
          throw new Error(`Product not found: ${productId}`);
        }

        const product = productResult[0];
        const currentStock = parseInt(product.stock);
        const finalReason = reason || batchNotes || (adjustmentType === 'transfer' ? 'Bulk Transfer' : 'Bulk Adjustment');

        const isTransfer = adjustmentType === 'transfer';
        const finalQuantity = (adjustmentType === 'remove' || isTransfer) ? -Math.abs(quantity) : Math.abs(quantity);
        const approvalType = isTransfer ? 'STOCK_TRANSFER' : 'STOCK_ADJUSTMENT';
        const isApprovalRequiredForItem = await checkApprovalRequired(approvalType);

        if (isApprovalRequiredForItem) {
          // Resolve warehouse name if warehouseId is provided
          let resolvedWarehouseName: string | null = null;
          if (warehouseId) {
            const [whRow]: any = await connection.query('SELECT name FROM warehouses WHERE id = ?', [warehouseId]);
            resolvedWarehouseName = whRow?.[0]?.name || null;
          }

          // Submit to approval queue with enriched metadata
          const approvalData: any = {
            productId,
            quantity: finalQuantity, // Correctly signed quantity
            reason: finalReason,
            productName: product.name,
            productSku: product.sku,
            productBarcode: product.barcode,
            currentStock: currentStock,
            warehouseId,
            warehouseName: resolvedWarehouseName,
            referenceNo,
            supplierId,
            adjustmentType,
            expirationDate: expirationDate || null
          };

          if (isTransfer) {
            // Match TransferStockRequest structure for compatibility
            approvalData.sourceWarehouseId = warehouseId;
            approvalData.targetWarehouseId = targetWarehouseId;
            approvalData.transferDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
            approvalData.reference = referenceNo;
            approvalData.notes = finalReason;
            approvalData.items = [{
              productId,
              productName: product.name,
              quantity: Math.abs(quantity), // Transfers use positive quantities for the item list
              unitOfMeasure: product.unit_of_measure
            }];

            // Add warehouse names for better UI in Approval Center
            const [sourceResult, targetResult]: any = await Promise.all([
              connection.query(`SELECT name FROM warehouses WHERE id = ?`, [warehouseId]),
              connection.query(`SELECT name FROM warehouses WHERE id = ?`, [targetWarehouseId])
            ]);
            
            // connection.query returns [rows, fields]
            const sourceRows = sourceResult[0];
            const targetRows = targetResult[0];
            
            approvalData.fromWarehouseName = sourceRows[0]?.name || 'Unknown';
            approvalData.toWarehouseName = targetRows[0]?.name || 'Unknown';
          }

          const { queueId, pendingApproval } = await submitToApprovalQueue(approvalType, approvalData, userId);

          if (pendingApproval) {
            queuedItems.push({ productId, productName: product.name, queueId, type: approvalType });
            continue;
          }
        }

        // Immediate Execution
        const newStock = currentStock + finalQuantity;
        
        if (newStock < 0 && (adjustmentType === 'remove' || isTransfer)) {
          throw new Error(`Adjustment would result in negative stock for ${product.name} at source`);
        }

        // For transfers, we need to find the target product.
        //
        // Ang resolution order parehas sa canonical nga TransferStockService:
        // SKU → barcode → name, dayon auto-create. Ang SKU guard importante kay
        // ang SKU optional sa product form (`sku: formData.sku || null`) ug ang
        // SQL `sku = NULL` dili gyud mo-match — kung wala ang guard, ang matag
        // transfer sa produkto nga walay SKU mo-fail bisan tuod naa na siya sa
        // target warehouse.
        let destId = itemTargetProductId;
        if (isTransfer && !destId && targetWarehouseId) {
          destId = await resolveTransferTarget(product, targetWarehouseId, connection);
        }

        const adjustmentId = `adj_bulk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        // Create adjustment record with new metadata
        await connection.query(
          `INSERT INTO stock_adjustments 
            (id, product_id, quantity, reason, new_stock, warehouse_id, target_warehouse_id, reference_no, supplier_id, note, adj_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adjustmentId, 
            productId, 
            finalQuantity, 
            finalReason, 
            newStock, 
            warehouseId || null, 
            targetWarehouseId || null, 
            referenceNo || null, 
            supplierId || null, 
            batchNotes || null, 
            adjustmentType
          ]
        );

        // Handle Transfer Logic (Increase Target Stock)
        if (isTransfer && destId) {
          await connection.query(
            'UPDATE products SET stock = stock + ? WHERE id = ?',
            [Math.abs(quantity), destId]
          );
        }

        // Sync family stock
        const { rootId, factorToRoot } = await findUltimateRoot(productId, connection);

        const syncQty = Math.abs(finalQuantity) / factorToRoot;
        if (finalQuantity < 0) {
          await deductFamilyStock(rootId, syncQty, adjustmentId, 'adjustment', finalReason, connection);
        } else {
          await addFamilyStock(rootId, syncQty, adjustmentId, 'adjustment', finalReason, connection, 0, expirationDate, productId);
        }

        results.push({ productId, productName: product.name, newStock });
      }
    });

    return NextResponse.json({
      success: true,
      processed: results.length,
      queued: queuedItems.length,
      results,
      queuedItems,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Bulk stock adjustment error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process bulk adjustment' },
      { status: 500 }
    );
  }
}
