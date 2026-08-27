'use client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle, Loader2 } from 'lucide-react';
import { AddUserTypeDialog } from '../add-user-type/AddUserTypeDialog';
import { UserTypeSelectField } from '../UserTypeSelectField';
import { UserPermissionsGrid } from '../UserPermissionsGrid';
import { useAddUser } from './use-add-user';

export function AddUserDialog({ onUserAdded }: { onUserAdded: () => void }) {
  const {
    isOpen, setIsOpen, form, onSubmit,
    userTypes, fetchUserTypes,
    isUserTypeDialogOpen, setIsUserTypeDialogOpen,
  } = useAddUser({ onUserAdded });

  const { isSubmitting } = form.formState;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-8 px-[13px] text-xs rounded-lg gap-1.5">
          <PlusCircle className="mr-2 h-4 w-4" /> Add User
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] p-0 overflow-hidden flex flex-col max-h-[95vh] border-none shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-muted/30">
          <DialogTitle className="text-2xl font-bold">Add New User</DialogTitle>
          <DialogDescription className="text-base">
            Enter the details for the new user and assign specific permissions.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Left: User Details */}
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold border-b pb-2">User Details</h3>
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username</FormLabel>
                        <FormControl>
                          <Input placeholder="username" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <UserTypeSelectField form={form} userTypes={userTypes} onCreateNew={() => setIsUserTypeDialogOpen(true)} />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} value={field.value ?? ''} className="h-11" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right: Permissions */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold border-b pb-2">Permissions & Access</h3>
                    <p className="text-sm text-muted-foreground">Select individual access rights for this user.</p>
                  </div>
                  <UserPermissionsGrid form={form} disabledForCashier />
                  <FormField
                    control={form.control}
                    name="permissions"
                    render={() => (
                      <FormItem>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter className="p-8 pt-4 bg-muted/30 border-t">
              <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : 'Create User'}
              </button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>

      <AddUserTypeDialog
        open={isUserTypeDialogOpen}
        onOpenChange={setIsUserTypeDialogOpen}
        onUserTypeUpdated={fetchUserTypes}
      />
    </Dialog>
  );
}
