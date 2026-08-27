'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, XCircle } from 'lucide-react';
import { useAdminAuth } from './use-admin-auth';
import type { AdminAuthDialogProps } from './admin-auth-types';

export function AdminAuthDialog({
  isOpen, onOpenChange, onSuccess, requiredCredentials,
  title, description, preventCloseAutoFocus,
}: AdminAuthDialogProps) {
  const { username, setUsername, password, setPassword, isProcessing, error, handleAuthenticate } =
    useAdminAuth({ isOpen, onSuccess, onOpenChange, requiredCredentials });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md z-[120]"
        overlayClassName="z-[120]"
        onCloseAutoFocus={preventCloseAutoFocus ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title || 'Admin Authentication Required'}
            {error && (
              <Badge variant="destructive" className="px-2 py-0.5 animate-in zoom-in-95 duration-300">
                <XCircle className="w-3 h-3 mr-1" />
                Invalid
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {description || 'Enter admin credentials to authorize this action.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          {error && (
            <div className="p-2 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="admin-username">Username</Label>
            <Input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Admin username"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuthenticate()}
              placeholder="Admin password"
            />
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
          <button type="button" onClick={handleAuthenticate} disabled={isProcessing || !password} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Authenticating...</>
            ) : 'Authenticate'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
