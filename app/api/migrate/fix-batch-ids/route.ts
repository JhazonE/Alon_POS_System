import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { generateBatchId } from '@/lib/batch-utils';

/**
 * GET /api/migrate/fix-batch-ids
 * 
 * Standardizes non-conformant batch IDs to the 6-digit numeric format.
 * Updates both the inventory_batches table and the sale_items JSON records.
 */
export async function GET(request: NextRequest) {
  const results: any[] = [];
  
  try {
    // No branch filter: this is a one-shot maintenance migration that renames
    // non-conformant inventory_batches ids (and the sale_items references to
    // them) across the whole table. Run per branch it would leave other
    // branches' batch ids non-conformant and make the migration unrepeatable;
    // it has no user-facing read, and no uid to resolve a branch from.
    // 1. Find all batches that don't match the 6-digit pattern
    // Note: We use a LIKE check or simple length/regexp if MySQL permits
    const batches: any[] = await query(`
      SELECT id, product_id 
      FROM inventory_batches 
      WHERE id NOT REGEXP '^[0-9]{6}$'
    `);

    if (batches.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No non-conformant batch IDs found. Everything is already standardized.',
        convertedCount: 0
      });
    }

    await withTransaction(async (connection) => {
      for (const batch of batches) {
        const oldId = batch.id;
        let newId = generateBatchId();
        
        // Ensure newId is unique (unlikely collision, but safe)
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
          const [existing]: any = await connection.query('SELECT id FROM inventory_batches WHERE id = ?', [newId]);
          if (!existing || existing.length === 0) {
            isUnique = true;
          } else {
            newId = generateBatchId();
            attempts++;
          }
        }

        // A. Update inventory_batches.id (Primary Key)
        // We use a temporary update to avoid PK constraint issues if we had complex RELATIONS, 
        // but here it's straightforward.
        await connection.query('UPDATE inventory_batches SET id = ? WHERE id = ?', [newId, oldId]);

        // B. Update sale_items.batch_source (JSON field)
        // We look for sale items that reference this old batch ID
        const [saleItems]: any = await connection.query(
          'SELECT id, batch_source FROM sale_items WHERE batch_source LIKE ?',
          [`%"batchId":"${oldId}"%`]
        );

        let updatedSalesCount = 0;
        for (const item of saleItems) {
            let source = item.batch_source;
            if (typeof source === 'string') {
                source = JSON.parse(source);
            }
            
            // source is an array of splits: [{batchId, qty, ...}]
            const updatedSplits = source.map((split: any) => {
                if (split.batchId === oldId) {
                    return { ...split, batchId: newId };
                }
                return split;
            });

            await connection.query(
                'UPDATE sale_items SET batch_source = ? WHERE id = ?',
                [JSON.stringify(updatedSplits), item.id]
            );
            updatedSalesCount++;
        }

        results.push({
          oldId,
          newId,
          updatedSalesCount,
          productId: batch.product_id
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `Standardization complete. Converted ${batches.length} batches.`,
      results
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error during migration'
    }, { status: 500 });
  }
}
