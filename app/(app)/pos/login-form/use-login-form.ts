'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginFormValues } from './login-form-types';

type Options = {
  onLoginSuccess: (user: any) => void;
};

export function useLoginForm({ onLoginSuccess }: Options) {
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const { getApiUrl, setStoredToken } = await import('@/lib/api-config');
      const response = await fetch(getApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (response.ok) {
        // The POS has its own login (it never passes through /login), so this
        // is a token storage site too — without it every POS call 401s.
        if (result.token) setStoredToken(result.token);
        onLoginSuccess(result);
      } else {
        setError(result.error || 'Invalid credentials');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    form, error, showPassword, setShowPassword,
    isSubmitting, isSettingsOpen, setIsSettingsOpen,
    onSubmit,
  };
}
