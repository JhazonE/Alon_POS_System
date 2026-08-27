'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Eye, EyeOff, Settings, User, Lock, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { ConnectionSettingsDialog } from '../connection-settings/ConnectionSettingsDialog';
import { useLoginForm } from './use-login-form';
import type { PosLoginFormProps } from './login-form-types';

export function PosLoginForm({ onLoginSuccess }: PosLoginFormProps) {
  const {
    form, error, showPassword, setShowPassword,
    isSubmitting, isSettingsOpen, setIsSettingsOpen,
    onSubmit,
  } = useLoginForm({ onLoginSuccess });

  return (
    <>
      <Card className="mx-auto w-full max-w-md overflow-hidden border-0 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* Brand Banner */}
        <div className="relative bg-gradient-to-br from-primary via-primary to-primary/80 px-8 py-9 text-center text-white">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-3 top-3 h-9 w-9 text-white/70 hover:bg-white/15 hover:text-white"
            onClick={() => setIsSettingsOpen(true)}
            title="Connection Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-2xl shadow-lg ring-1 ring-white/25">
            <Image src="/alon-icon.svg" alt="Alon POS System" width={64} height={64} className="h-full w-full object-contain" priority />
          </div>
          <h1 className="text-2xl font-black tracking-tight drop-shadow-sm">ALON POS SYSTEM</h1>
          <p className="mt-1 text-sm text-white/70">Point of Sale Terminal</p>
        </div>

        <CardContent className="px-8 py-7">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold text-foreground">Cashier Login</h2>
            <p className="text-sm text-muted-foreground">Enter your credentials to start your shift</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Login Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  className="h-11 pl-10"
                  {...form.register('username')}
                />
              </div>
              {form.formState.errors.username && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="h-11 pl-10 pr-10"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring p-0 absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(prev => !prev)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  <span className="sr-only">{showPassword ? 'Hide password' : 'Show password'}</span>
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <button
              className="inline-flex items-center justify-center gap-2 rounded-xl tracking-[-0.005em] whitespace-nowrap active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 px-[18px] h-12 w-full text-base font-bold shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99]"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging In...</>
              ) : 'Login to POS'}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-2">
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Secure cashier access
            </p>
            {process.env.NEXT_PUBLIC_APP_VERSION && (
              <Badge variant="secondary" className="text-xs font-medium text-muted-foreground">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <ConnectionSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}
