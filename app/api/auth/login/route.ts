import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/mysql';
import { compare } from 'bcryptjs';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, signSession, sessionSecret } from '@/lib/session-cookie';

export async function POST(request: NextRequest) {
    try {
        const { username, password, verifyOnly } = await request.json();

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

        // Return user session data
        const response = NextResponse.json({
            uid: user.uid,
            username: user.username, // using "username" as the field
            email: user.username, // keeping "email" for compatibility if frontend expects it, or we can just use username
            userType: user.userType,
            roleId: user.roleId,
            displayName: user.displayName,
            photoURL: user.photoURL,
            permissions: userPermissions,
        });

        // Additive: a signed session cookie lets 'use server' actions (which have
        // no request object) identify the caller. Never fail login over it —
        // users without a cookie keep working via the localStorage session.
        //
        // `verifyOnly: true` is sent by callers that only check a user's
        // credentials (e.g. the POS supervisor override) while someone else stays
        // logged in. Verification-only callers must not adopt the verified user's
        // session identity: the cookie is trusted server-side, so minting it here
        // would silently swap the terminal's identity to the supervisor's. The
        // default (flag absent) is to issue, so real logins can never lose it.
        try {
            if (verifyOnly !== true) {
                response.cookies.set(SESSION_COOKIE_NAME, signSession(user.uid, sessionSecret()), {
                    httpOnly: true,
                    sameSite: 'lax',
                    path: '/',
                    maxAge: SESSION_MAX_AGE_MS / 1000,
                });
            }
        } catch (cookieError) {
            console.error('Session cookie could not be issued:', cookieError);
        }

        return response;
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
