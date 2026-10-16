import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { resolveScopeFromRequest, branchErrorResponse } from '@/lib/branch-context';
import { getDefaultWarehouseId, productInBranchClause } from './branch-scope';

// Legacy multipart CSV import, kept for backward compatibility. The wizard uses the JSON path.
export async function legacyProductCsvImport(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // Branch isolation (spec D6), same as the JSON path. A multipart upload has
    // no JSON body, so the uid comes from the query string or a `uid` form field.
    const formUid = formData.get('uid');
    const scope = await resolveScopeFromRequest(
      new URL(request.url).searchParams,
      typeof formUid === 'string' ? formUid : undefined,
    );
    const inBranch = productInBranchClause(scope);

    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const text = await file.text();
    const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (errors.length > 0) return NextResponse.json({ success: false, error: 'Invalid CSV format', details: errors }, { status: 400 });

    const productsData: any[] = data as any[];
    let successCount = 0, updateCount = 0, errorCount = 0;

    // New products are assigned to the default STORE warehouse automatically.
    const defaultWarehouseId = await getDefaultWarehouseId(scope);

    for (const p of productsData) {
      if (!p.name || !p.sku) { errorCount++; continue; }
      try {
        const [existing]: any = await query(`SELECT id FROM products WHERE sku = ?${inBranch.sql}`, [p.sku, ...inBranch.params]);
        if (existing) {
          await query(
            `UPDATE products SET name=?, barcode=?, description=?, category=?, brand=?, subcategory=?, unit_of_measure=?,
               cost=?, price=?, stock=?, reorder_point=?, parent_id=?, image_url=?, conversion_factor=?, updated_at=NOW() WHERE sku=?`,
            [p.name, p.barcode || null, p.description || '', p.category || 'General', p.brand || null, p.subcategory || null,
              p.unit || 'pcs', parseFloat(p.cost_price) || 0, parseFloat(p.selling_price) || 0, parseFloat(p.stock_quantity) || 0,
              parseFloat(p.reorder_point) || 0, p.parent_id || null, p.image_url || null, parseFloat(p.conversion_factor) || 1, p.sku],
          );
          updateCount++;
        } else {
          await query(
            `INSERT INTO products (id, name, sku, barcode, description, category, brand, subcategory, unit_of_measure,
               cost, price, stock, reorder_point, parent_id, image_url, conversion_factor, warehouse_id, type, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [uuidv4(), p.name, p.sku, p.barcode || null, p.description || '', p.category || 'General', p.brand || null,
              p.subcategory || null, p.unit || 'pcs', parseFloat(p.cost_price) || 0, parseFloat(p.selling_price) || 0,
              parseFloat(p.stock_quantity) || 0, parseFloat(p.reorder_point) || 0, p.parent_id || null, p.image_url || null,
              parseFloat(p.conversion_factor) || 1, defaultWarehouseId,
              // Explicit ternary rather than passing the raw cell through: an
              // unrecognised value would be rejected by MySQL in strict mode.
              // Matches addProduct() and the JSON import path.
              String(p.type || '').toLowerCase() === 'service' ? 'service' : 'standard'],
          );
          successCount++;
        }
      } catch (err) { console.error(`Failed to import product ${p.sku}:`, err); errorCount++; }
    }
    return NextResponse.json({ success: true, message: `Import processed. Added: ${successCount}, Updated: ${updateCount}, Errors: ${errorCount}` });
  } catch (error: any) {
    const mapped = branchErrorResponse(error);
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status });
    console.error('Error importing products (legacy):', error);
    return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 });
  }
}
