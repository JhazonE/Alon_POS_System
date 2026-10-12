import { NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

export async function GET() {
  try {
    // No branch filter: these barcode/name keys exist so the product importer can
    // detect duplicates, and the import write path is not branch-aware until
    // Phase 2. Filtering the keys now would let an import create a duplicate of
    // another branch's product. Revisit together with the import write path.
    const rows = await query('SELECT barcode, name FROM products') as any[];
    const keys = rows.map((r) => {
      const barcode = String(r.barcode ?? '').trim().toLowerCase();
      if (barcode) return barcode;
      return String(r.name ?? '').trim().toLowerCase();
    }).filter(Boolean);
    return NextResponse.json({ keys });
  } catch (error: any) {
    console.error('Error loading product keys:', error);
    return NextResponse.json({ error: 'Failed to load keys' }, { status: 500 });
  }
}
