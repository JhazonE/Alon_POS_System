import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import { compare } from 'bcryptjs';
import { signSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
    try {
        // Parse the body once: a Request body can only be read a single time, so
        // the dev-preview flag below must come from this same object.
        const body = await request.json();
        const { username, password } = body;

        // Dev-only: app/(app)/use-app-layout.ts previews the back office
        // without credentials. It used to fabricate a client-side session;
        // now it must get a REAL signed token, through this same path, so
        // there is no separate trust mechanism. Compiled out in production.
        if (process.env.NODE_ENV !== 'production' && body?.devPreview === true) {
            const devPermissions = [
                'access_pos', 'view_dashboard', 'manage_products', 'manage_inventory',
                'view_sales', 'manage_purchases', 'manage_customers', 'manage_suppliers',
                'view_reports', 'manage_users', 'manage_settings', 'view_approvals',
                'manage_approval_settings',
            ];
            const devUser = {
                uid: 'dev-preview',
                username: 'dev-preview',
                userType: 'Super Admin',
                roleId: null,
                permissions: devPermissions,
            };
            return NextResponse.json({
                token: signSession(devUser),
                ...devUser,
                email: 'dev-preview',
                displayName: 'Dev Preview (no login)',
                photoURL: null,
            });
        }

        if (!username || !password) {
            return NextResponse.json(
                { error: 'Username and password are required' },
                { status: 400 }
            );
        }

        // Fetch user and their role category from database
        const users = await query(`
            SELECT 
                u.uid, u.username, u.password, u.user_type as userType, 
                u.display_name as displayName, u.photo_url as photoURL, u.disabled,
                ut.id as roleId
            FROM users u
            LEFT JOIN user_types ut ON u.user_type = ut.name OR u.user_type = ut.id
            WHERE u.username = ?
        `, [username]) as any[];

        const user = users[0];

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        if (user.disabled) {
            return NextResponse.json(
                { error: 'Account is disabled' },
                { status: 403 }
            );
        }

        // Verify password
        const isValid = await compare(password, user.password);

        if (!isValid) {
            return NextResponse.json(
                { error: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Fetch permissions
        const permissions = await query(
            'SELECT permission FROM user_permissions WHERE user_uid = ?',
            [user.uid]
        ) as any[];

        const userPermissions = permissions.map((p: any) => p.permission);

        // The token is what the server will actually trust on later requests;
        // the rest of this object is kept for the 18 client files that read
        // the `mock-user-session` shape.
        const token = signSession({
            uid: user.uid,
            username: user.username,
            userType: user.userType,
            roleId: user.roleId ?? null,
            permissions: userPermissions,
        });

        return NextResponse.json({
            token,
            uid: user.uid,
            username: user.username, // using "username" as the field
            email: user.username, // keeping "email" for compatibility if frontend expects it, or we can just use username
            userType: user.userType,
            roleId: user.roleId,
            displayName: user.displayName,
            photoURL: user.photoURL,
            permissions: userPermissions,
        });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
