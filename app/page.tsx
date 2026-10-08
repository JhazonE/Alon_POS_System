
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/spinner';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check for a mock session first.
    const userSession = localStorage.getItem('mock-user-session');
    if (userSession) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
    
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Spinner className="h-32 w-32 text-primary" />
    </div>
  );
}
