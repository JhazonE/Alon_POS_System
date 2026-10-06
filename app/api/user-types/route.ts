import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';
import { requirePermission } from '@/lib/auth/require-permission';

export async function GET() {
  try {
    const userTypes = await query('SELECT * FROM user_types ORDER BY name ASC');
    const permissions = await query('SELECT * FROM user_type_permissions');

    const permissionsByType = (permissions || []).reduce((acc: any, curr: any) => {
      if (!acc[curr.user_type_id]) acc[curr.user_type_id] = [];
      acc[curr.user_type_id].push(curr.permission);
      return acc;
    }, {});

    const userTypesWithPermissions = (userTypes || []).map((type: any) => ({
      ...type,
      permissions: permissionsByType[type.id] || [],
    }));

    return NextResponse.json(userTypesWithPermissions);
  } catch (error: any) {
    console.error('Error fetching user types:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { name, description, permissions } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const id = uuidv4();

    await withTransaction(async (connection) => {
      await connection.execute(
        'INSERT INTO user_types (id, name, description) VALUES (?, ?, ?)',
        [id, name, description || '']
      );

      if (permissions && permissions.length > 0) {
        for (const permission of permissions) {
          await connection.execute(
            'INSERT INTO user_type_permissions (id, user_type_id, permission) VALUES (?, ?, ?)',
            [uuidv4(), id, permission]
          );
        }
      }
    });

    return NextResponse.json({ id, name, description, permissions: permissions || [] });
  } catch (error: any) {
    console.error('Error creating user type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
