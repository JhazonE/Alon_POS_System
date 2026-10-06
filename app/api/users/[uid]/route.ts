import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/mysql';
import { v4 as uuidv4 } from 'uuid';
import { hash } from 'bcryptjs';
import { requirePermission } from '@/lib/auth/require-permission';

// PUT /api/users/[uid] - Update user details and permissions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
    const { uid } = await params;
    const body = await request.json();
    const { username, password, userType, permissions, displayName } = body;

    if (!uid) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    await withTransaction(async (connection) => {
      // Update user basic info
      let updateFields = ['username = ?', 'display_name = ?', 'user_type = ?'];
      let queryParams = [username, displayName || username.split('@')[0], userType || 'User'];

      if (password) {
        const hashedPassword = await hash(password, 10);
        updateFields.push('password = ?');
        queryParams.push(hashedPassword);
      }

      queryParams.push(uid);
      await connection.execute(
        `UPDATE users SET ${updateFields.join(', ')} WHERE uid = ?`,
        queryParams
      );

      // Update permissions
      // Delete existing permissions for this user
      await connection.execute('DELETE FROM user_permissions WHERE user_uid = ?', [uid]);

      // Insert new permissions
      if (permissions && permissions.length > 0) {
        for (const permission of permissions) {
          await connection.execute(
            'INSERT INTO user_permissions (id, user_uid, permission) VALUES (?, ?, ?)',
            [uuidv4(), uid, permission]
          );
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
}
