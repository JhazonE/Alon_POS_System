'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/client-activity-logger';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { User } from './user-row-types';

export function useUserRow(user: User, onUserUpdated: () => void) {
  const { toast } = useToast();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleStatus = async () => {
    try {
      const res = await authFetch(getApiUrl('/users'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, disabled: !user.disabled }),
      });
      if (!res.ok) throw new Error('Failed to update user status');

      const action = user.disabled ? 'ENABLE' : 'DISABLE';
      await logActivity({
        action,
        module: 'USERS',
        description: `${action === 'ENABLE' ? 'Enabled' : 'Disabled'} user: ${user.displayName || user.username}`,
        referenceId: user.uid,
      });
      toast({
        title: user.disabled ? 'User enabled' : 'User disabled',
        description: `The user has been successfully ${user.disabled ? 'enabled' : 'disabled'}.`,
      });
      onUserUpdated();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update user status.' });
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setIsDeleting(true);
      const res = await authFetch(getApiUrl(`/users?uid=${user.uid}`), { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      await logActivity({
        action: 'DELETE',
        module: 'USERS',
        description: `Deleted user: ${user.displayName || user.username} (${user.username})`,
        referenceId: user.uid,
      });
      toast({ title: 'User deleted', description: 'The user has been successfully removed.' });
      onUserUpdated();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete the user.' });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  return { isDeleteDialogOpen, setIsDeleteDialogOpen, isDeleting, handleToggleStatus, handleDeleteConfirm };
}
