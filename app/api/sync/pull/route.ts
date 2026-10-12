import { NextResponse } from 'next/server';
import { query } from '@/lib/mysql';

export async function GET(request: Request) {
  try {
    // No branch filter: this is the machine-to-machine sync feed that
    // lib/scheduler.ts calls without any user session, so there is no uid to
    // resolve a branch from, and a per-branch cut would break replication of
    // the shared catalogue. Authenticating this endpoint belongs to the API
    // authentication phase (docs/superpowers/specs/2026-10-05-api-authentication-design.md).
    const { searchParams } = new URL(request.url);
    const lastSync = searchParams.get('last_sync');

    let sql = 'SELECT * FROM products';
    const params: any[] = [];

    if (lastSync) {
      sql += ' WHERE updated_at > ?';
      params.push(lastSync);
    }

    const products = await query(sql, params);
    const categories = await query('SELECT * FROM categories');
    const brands = await query('SELECT * FROM brands');
    const users = await query('SELECT uid, username, password, user_type, display_name, disabled, creation_time FROM users');
    const userPermissions = await query('SELECT * FROM user_permissions');

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: {
        products,
        categories,
        brands,
        users,
        userPermissions
      }
    });
  } catch (error: any) {
    console.error('Failed to pull sync data:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to pull sync data'
    }, { status: 500 });
  }
}
