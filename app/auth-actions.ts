
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/session-cookie';


export async function handleSignOut() {
    // For the mock auth, this will trigger the client-side logic to clear storage.
    // In a real scenario, this would also call Firebase sign out.
    try {
        (await cookies()).delete(SESSION_COOKIE_NAME);
    } catch {
        // Clearing the cookie is best-effort; sign-out must still complete.
    }
    revalidatePath('/', 'layout');
    redirect('/login');
}
