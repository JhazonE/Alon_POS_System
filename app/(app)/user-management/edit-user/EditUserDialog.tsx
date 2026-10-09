'use client';
import {
  Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AddUserTypeDialog } from '../add-user-type/AddUserTypeDialog';
import { UserTypeSelectField } from '../UserTypeSelectField';
import { UserPermissionsGrid } from '../UserPermissionsGrid';
import { useEditUser } from './use-edit-user';
import { User } from './edit-user-types';
import { Spinner } from '@/components/ui/spinner';

type Props = {
  user: User;
  onUserUpdated: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditUserDialog({ user, onUserUpdated, open, onOpenChange }: Props) {
  const {
    form, onSubmit,
    userTypes, fetchUserTypes,
    isUserTypeDialogOpen, setIsUserTypeDialogOpen,
  } = useEditUser({ user, onUserUpdated, open, onOpenChange });

  const { isSubmitting } = form.formState;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b bg-muted/30 px-6 py-5">
          <SheetTitle className="text-xl font-bold">Edit User</SheetTitle>
          <SheetDescription>
            Modify details and permissions for {user.username}.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
              <section className="space-y-5">
                <h3 className="border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  User Details
                </h3>
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Full name" {...field} value={field.value ?? ''} />
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
                      <FormLabel>Password (leave blank to keep current)</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} value={field.value ?? ''} placeholder="New password" className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <section className="space-y-4">
                <div className="space-y-1">
                  <h3 className="border-b pb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Permissions &amp; Access
                  </h3>
                  <p className="text-sm text-muted-foreground">Select individual access rights for this user.</p>
                </div>
                <UserPermissionsGrid form={form} />
                <FormField
                  control={form.control}
                  name="permissions"
                  render={() => (
                    <FormItem>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            </div>

            <SheetFooter className="shrink-0 gap-2 border-t bg-muted/30 px-6 py-4">
              <button type="button" onClick={() => onOpenChange(false)} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input bg-background hover:bg-accent hover:border-primary/40 focus-visible:ring-ring h-10 px-[18px]">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow-[0_1px_3px_hsl(var(--primary)/0.12)] hover:bg-primary/90 hover:shadow-[0_6px_20px_hsl(var(--primary)/0.16)] focus-visible:ring-primary/55 h-10 px-[18px]">
                {isSubmitting ? <><Spinner className="mr-2 h-4 w-4" /> Saving...</> : 'Save Changes'}
              </button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>

      <AddUserTypeDialog
        open={isUserTypeDialogOpen}
        onOpenChange={setIsUserTypeDialogOpen}
        onUserTypeUpdated={fetchUserTypes}
      />
    </Sheet>
  );
}
