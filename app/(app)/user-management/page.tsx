'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, X } from 'lucide-react';
import { DataTablePagination } from '@/components/ui/data-table-pagination';
import { AddUserDialog } from './add-user/AddUserDialog';
import { EditUserDialog } from './edit-user/EditUserDialog';
import { ManageUserTypesDialog } from './manage-user-types/ManageUserTypesDialog';
import { UserRow, UserSkeleton } from './user-row/UserRow';
import { UserLogsTab } from './user-logs-tab/UserLogsTab';
import { useUserManagement } from './use-user-management';

export default function UserManagementPage() {
  const {
    isLoading, error,
    editingUser, isEditDialogOpen,
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    searchQuery, setSearchQuery,
    paginatedUsers, totalItems, totalPages, users,
    fetchUsers, handleEdit, handleOpenChange, handleSearch, clearSearch,
  } = useUserManagement();

  return (
    <div className="space-y-4">
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="logs">Activity Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>A list of all users in your application.</CardDescription>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-[300px]">
                    <Input
                      placeholder="Search name or username..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      className="pr-10"
                    />
                    {searchQuery && (
                      <button
                        className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent focus-visible:ring-ring w-10 p-0 absolute right-0 top-0 h-full px-2 hover:bg-transparent"
                        onClick={clearSearch}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                  <button onClick={handleSearch} className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background-color,box-shadow,transform] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/70 focus-visible:ring-ring h-10 w-10 p-0">
                    <Search className="h-4 w-4" />
                  </button>
                  <ManageUserTypesDialog />
                  <AddUserDialog onUserAdded={fetchUsers} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6">
              <div className="max-h-[600px] overflow-y-auto relative border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-white z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[250px]">Full Name</TableHead>
                      <TableHead className="w-[150px]">Username</TableHead>
                      <TableHead className="hidden md:table-cell">Permissions</TableHead>
                      <TableHead className="hidden sm:table-cell">Created On</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && Array.from({ length: pageSize }).map((_, i) => <UserSkeleton key={i} />)}
                    {!isLoading && paginatedUsers.map(user => (
                      <UserRow key={user.uid} user={user} onUserUpdated={fetchUsers} onEdit={handleEdit} />
                    ))}
                    {!isLoading && paginatedUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center">
                          {error || 'No users found.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isLoading && users.length > 0 && (
                <div className="py-4 px-2 border-t">
                  <DataTablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={totalItems}
                    setPage={setCurrentPage}
                    setPageSize={setPageSize}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>
                Audit trail of all user actions across Inventory, Sales, Customers, Purchases, Suppliers, Products, and more.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UserLogsTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          open={isEditDialogOpen}
          onOpenChange={handleOpenChange}
          onUserUpdated={fetchUsers}
        />
      )}
    </div>
  );
}
