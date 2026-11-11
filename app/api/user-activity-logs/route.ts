import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';

async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_uid VARCHAR(255) NOT NULL,
      user_name VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      module VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      reference_id VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_uid (user_uid),
      INDEX idx_module (module),
      INDEX idx_action (action),
      INDEX idx_created_at (created_at)
    )
  `);
}

export async function GET(request: NextRequest) {
  try {
    await ensureTableExists();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');
    const moduleFilter = searchParams.get('module');
    const action = searchParams.get('action');
    const userUid = searchParams.get('userUid');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const conditions: string[] = [];
    const params: any[] = [];

    if (moduleFilter && moduleFilter !== 'ALL') {
      conditions.push('module = ?');
      params.push(moduleFilter);
    }
    if (action && action !== 'ALL') {
      conditions.push('action = ?');
      params.push(action);
    }
    if (userUid && userUid !== 'ALL') {
      conditions.push('user_uid = ?');
      params.push(userUid);
    }
    if (search) {
      conditions.push('(description LIKE ? OR user_name LIKE ? OR reference_id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (dateFrom) {
      conditions.push('created_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('created_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [logs, countResult] = await Promise.all([
      query(
        `SELECT id, user_uid, user_name, action, module, description, reference_id, created_at
         FROM user_activity_logs ${where}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM user_activity_logs ${where}`,
        params
      ),
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      total: countResult[0]?.total ?? 0,
    });
  } catch (error: any) {
    console.error('Error fetching activity logs:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTableExists();

    const body = await request.json();
    const { userUid, userName, action, module, description, referenceId } = body;

    if (!userUid || !action || !module || !description) {
      return NextResponse.json(
        { success: false, error: 'userUid, action, module, and description are required' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    await query(
      `INSERT INTO user_activity_logs (id, user_uid, user_name, action, module, description, reference_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userUid, userName || 'Unknown', action, module, description, referenceId || null]
    );

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating activity log:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
