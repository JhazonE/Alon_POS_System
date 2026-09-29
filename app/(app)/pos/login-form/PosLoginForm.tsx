'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2, Eye, EyeOff, Settings, User, Lock, ShieldCheck, Monitor } from 'lucide-react';
import Image from 'next/image';
import { ConnectionSettingsDialog } from '../connection-settings/ConnectionSettingsDialog';
import { useLoginForm } from './use-login-form';
import type { PosLoginFormProps } from './login-form-types';

export function PosLoginForm({
  onLoginSuccess, terminalName, businessName, currentTime,
}: PosLoginFormProps) {
  const {
    form, error, showPassword, setShowPassword,
    isSubmitting, isSettingsOpen, setIsSettingsOpen,
    onSubmit,
  } = useLoginForm({ onLoginSuccess });

  return (
    <>
      {/* Settings sits on the ground, not the card — it configures the terminal, not the login. */}
      <button
        type="button"
        onClick={() => setIsSettingsOpen(true)}
        title="Connection Settings"
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <Settings className="h-5 w-5" />
      </button>

      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-card shadow-[0_24px_60px_-15px_rgba(0,0,0,0.45)] animate-in fade-in zoom-in-95 duration-300 dark:border-white/10">
        {/* Teal accent rule — the card's only piece of brand colour */}
        <div className="h-1 bg-primary" />

        <div className="px-8 pt-7">
          <div className="flex items-center gap-3.5">
            {/* The login screen is the product's front door, so it carries the
                product brand, not the store's. Which store this terminal
                belongs to is shown in the footer alongside the terminal. */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 ring-1 ring-primary/15">
              <Image src="/alon-logo.png" alt="Alon POS System" width={48} height={48} className="h-full w-full object-contain p-1.5" priority />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold uppercase tracking-wide text-foreground">Alon POS System</h1>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">Point of Sale Terminal</p>
            </div>
          </div>

          <div className="mt-7">
            <h2 className="text-base font-bold text-foreground">Cashier Login</h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to start your shift</p>
          </div>
        </div>

        <div className="px-8 pb-7 pt-5">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2 duration-300">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Login Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</Label>
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
              <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
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
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-[18px] text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Logging In…</>
              ) : 'Login to POS'}
            </button>
          </form>
        </div>

        {/* Terminal identity strip — says which register you are signing into */}
        <div className="border-t bg-muted/40 px-8 py-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Monitor className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-medium">
                {[businessName, terminalName].filter(Boolean).join(' · ') || 'Terminal not assigned'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium">Secure</span>
              {process.env.NEXT_PUBLIC_APP_VERSION && (
                <span className="font-mono text-[11px] opacity-70">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
              )}
            </div>
          </div>
          {/* The clock is a full long-form date ("Thursday, September 10, 2026
              at 11:16:04 PM") — around 260px. It cannot share a row with the
              Secure badge inside a max-w-md card, so it gets its own line. */}
          {currentTime && (
            <p className="mt-1.5 truncate font-mono text-[11px] opacity-70">{currentTime}</p>
          )}
        </div>
      </div>

      <ConnectionSettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </>
  );
}
