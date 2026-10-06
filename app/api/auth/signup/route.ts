import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import { hash } from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { requirePermission } from '@/lib/auth/require-permission';

export async function POST(request: NextRequest) {
  const denied = requirePermission(request, 'manage_users');
  if (denied) return denied;

  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUsers = await query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [email, email]
    ) as any[];

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 10);
    const uid = uuidv4();
    const id = uuidv4(); // id for the table primary key

    // Create user
    // Defaulting role to 'cashier' for now as per schema default, or make it configurable if needed.
    // Also mapping email to username as the login page expects username
    await query(
      `INSERT INTO users (id, uid, username, email, password, full_name, role, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, 'cashier', TRUE)`,
      [id, uid, email, email, hashedPassword, email.split('@')[0]] 
    );

    // Add default permissions if needed (optional for now, can be expanded)
    
    return NextResponse.json({
      success: true,
      message: 'Account created successfully'
    });

  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
