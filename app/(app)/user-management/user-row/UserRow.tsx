'use client';

import { TableCell, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { MoreHorizontal, Pencil, Trash2, Ban, UserCheck } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { User } from './user-row-types';
import { useUserRow } from './use-user-row';

export type { User };

function getInitials(name?: string | null, username?: string | null) {
  if (name) return name.split(' ').map(n => n[0]).join('').toUpperCase();
  if (username) return username.substring(0, 2).toUpperCase();
  return '??';
}

const MAX_VISIBLE_PERMISSIONS = 3;

function formatPermission(permission: string) {
  return permission.replace(/_/g, ' ');
}

function PermissionsCell({ permissions }: { permissions?: string[] | null }) {
  if (!permissions || permissions.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const visible = permissions.slice(0, MAX_VISIBLE_PERMISSIONS);
  const hidden = permissions.slice(MAX_VISIBLE_PERMISSIONS);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(permission => (
        <Badge key={permission} variant="secondary" className="font-normal capitalize">
          {formatPermission(permission)}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="font-normal cursor-default">
                +{hidden.length} more
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] capitalize">
              {hidden.map(formatPermission).join(', ')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

type Props = {
  user: User;
  onUserUpdated: () => void;
  onEdit: (user: User) => void;
};

export function UserRow({ user, onUserUpdated, onEdit }: Props) {
  const {
    isDeleteDialogOpen, setIsDeleteDialogOpen,
    isDeleting, handleToggleStatus, handleDeleteConfirm,
  } = useUserRow(user, onUserUpdated);

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarImage src={user.photoURL || undefined} alt={user.displayName || undefined} />
              <AvatarFallback>{getInitials(user.displayName, user.username)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium leading-tight">{user.displayName || 'No Name'}</span>
              {user.userType && (
                <span className="text-xs text-muted-foreground leading-tight">{user.userType}</span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="text-sm font-medium text-muted-foreground">{user.username}</div>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <PermissionsCell permissions={user.permissions} />
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          {format(new Date(user.creationTime), 'PP')}
        </TableCell>
        <TableCell>
          <Badge variant={user.disabled ? 'destructive' : 'outline'}>
            {user.disabled ? 'Disabled' : 'Active'}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring h-10 w-10 p-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">User Actions</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onEdit(user)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleStatus}>
                {user.disabled
                  ? <><UserCheck className="mr-2 h-4 w-4" /> Enable User</>
                  : <><Ban className="mr-2 h-4 w-4" /> Disable User</>
                }
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete User
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user "{user.displayName || user.username}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function UserSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-6 w-48 rounded-full" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
    </TableRow>
  );
}
