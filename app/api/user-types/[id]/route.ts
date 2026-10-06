import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';
import { requirePermission } from '@/lib/auth/require-permission';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, permissions } = body;

    await withTransaction(async (connection) => {
      if (name !== undefined || description !== undefined) {
        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) {
          updates.push('name = ?');
          values.push(name);
        }
        if (description !== undefined) {
          updates.push('description = ?');
          values.push(description);
        }

        values.push(id);
        await connection.execute(
          `UPDATE user_types SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      if (permissions !== undefined) {
        await connection.execute('DELETE FROM user_type_permissions WHERE user_type_id = ?', [id]);
        if (permissions.length > 0) {
          for (const permission of permissions) {
            await connection.execute(
              'INSERT INTO user_type_permissions (id, user_type_id, permission) VALUES (?, ?, ?)',
              [uuidv4(), id, permission]
            );
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating user type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
    const { id } = await params;

    // Check if any users are using this type
    const userType: any = await query('SELECT name FROM user_types WHERE id = ?', [id]);
    if (!userType || userType.length === 0) {
      return NextResponse.json({ error: 'User type not found' }, { status: 404 });
    }

    const name = userType[0].name;

    const users: any = await query('SELECT uid FROM users WHERE user_type = ? LIMIT 1', [name]);
    if (users && users.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete user type. It is currently assigned to one or more users.' },
        { status: 400 }
      );
    }

    await withTransaction(async (connection) => {
      await connection.execute('DELETE FROM user_type_permissions WHERE user_type_id = ?', [id]);
      await connection.execute('DELETE FROM user_types WHERE id = ?', [id]);
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user type:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
